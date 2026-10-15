import json
from datetime import datetime, timedelta, timezone

from job_finder.config import load_config
from job_finder.models import Job
from job_finder.rescore import config_signature, rescore, row_to_job, scoring_inputs
from job_finder.scoring import SCORING_VERSION, score_job
from job_finder.storage import JobStore

TODAY = "2026-10-11"


def _store(tmp_path, *jobs):
    store = JobStore(tmp_path / "jobs.db")
    store.upsert_many(jobs)
    return store


def _job(title="QA Engineer", url="https://board.test/1", description="Playwright", **extra):
    return Job(title, "Acme", url, "src", description=description, location="Remote", remote=True,
               contract="B2B", published_at=datetime.now(timezone.utc) - timedelta(days=9), **extra)


class _CountingStore:
    """Records what rescore() would rewrite without touching a database."""

    def __init__(self, all_rows):
        self.all_rows, self.written, self.meta = all_rows, None, {}

    def list_all(self):
        return self.all_rows

    def upsert_many(self, jobs, touch_last_seen=True):
        self.written, self.touch_last_seen = list(jobs), touch_last_seen

    def set_meta(self, key, value):
        self.meta[key] = value


def test_scoring_inputs_is_the_signature_dict():
    cfg = load_config()
    inputs = scoring_inputs(cfg)
    assert inputs == {"candidate": cfg["candidate"], "scoring": cfg["scoring"], "filters": cfg["filters"],
                      "hard_exclusions": cfg["hard_exclusions"], "scoring_version": SCORING_VERSION}
    assert json.loads(config_signature(cfg)) == inputs


def test_row_to_job_round_trips_a_stored_row(tmp_path):
    store = _store(tmp_path, score_job(_job(salary_min=100, salary_period="hour"), load_config()))
    job = row_to_job(store.list_all()[0])
    assert (job.title, job.remote, job.salary_min, job.salary_period) == ("QA Engineer", True, 100, "hour")
    assert job.published_at.tzinfo is not None


def test_same_config_and_day_is_a_no_op():
    cfg = load_config()
    store = _CountingStore([])
    meta = {"score_config_signature": config_signature(cfg), "scores_refreshed_on": TODAY}
    assert rescore(store, cfg, meta, [{"title": "x"}], today=TODAY) is False
    assert store.written is None


def test_a_new_day_rescores_only_the_visible_rows():
    cfg = load_config()
    store = _CountingStore(all_rows=[{"title": "hidden"}, {"title": "visible"}])
    meta = {"score_config_signature": config_signature(cfg), "scores_refreshed_on": "2026-10-10"}
    assert rescore(store, cfg, meta, [{"title": "visible"}], today=TODAY) is True
    assert [job.title for job in store.written] == ["visible"]
    assert store.touch_last_seen is False
    assert store.meta == {"score_config_signature": config_signature(cfg), "scores_refreshed_on": TODAY,
                          "scoring_profile": json.dumps(scoring_inputs(cfg), ensure_ascii=False)}


def test_a_config_change_rescores_every_row():
    cfg = load_config()
    store = _CountingStore(all_rows=[{"title": "hidden"}, {"title": "visible"}])
    meta = {"score_config_signature": "old", "scores_refreshed_on": TODAY}
    assert rescore(store, cfg, meta, [{"title": "visible"}], today=TODAY) is True
    assert [job.title for job in store.written] == ["hidden", "visible"]


def test_force_rescores_even_when_up_to_date():
    cfg = load_config()
    store = _CountingStore([])
    meta = {"score_config_signature": config_signature(cfg), "scores_refreshed_on": TODAY}
    assert rescore(store, cfg, meta, [{"title": "visible"}], today=TODAY, force=True) is True
    assert [job.title for job in store.written] == ["visible"]


def test_a_config_change_rewrites_the_scoring_profile_with_the_signature(tmp_path):
    # The Streamlit "Save criteria" path: new overrides, then rescore() without a fetch.
    store = _store(tmp_path, score_job(_job(), load_config()))
    rescore(store, load_config(), {}, store.list(0), today=TODAY)
    changed = load_config(overrides={"scoring": {"salary_bonus": {"points": 25},
                                                 "penalties": {"stale_after_days": 5}}})
    assert rescore(store, changed, store.get_all_meta(), store.list(0), today=TODAY) is True
    meta = store.get_all_meta()
    profile = json.loads(meta["scoring_profile"])
    assert profile == json.loads(meta["score_config_signature"]) == scoring_inputs(changed)
    assert profile["scoring"]["salary_bonus"]["points"] == 25
    assert profile["scoring"]["penalties"]["stale_after_days"] == 5


def test_row_to_job_lets_inference_override_the_stored_remote_flag():
    # Unchanged from the dashboard rescore: the current inference wins, and the
    # stored flag only counts when the text says nothing either way.
    assert row_to_job({"title": "QA", "description": "Fully remote role", "remote": 0}).remote is True
    assert row_to_job({"title": "QA", "description": "Hybrid, Warsaw", "remote": None}).remote is False
    assert row_to_job({"title": "QA", "description": "Hybrid, Warsaw", "remote": 1}).remote is False
    assert row_to_job({"title": "QA", "description": "QA role", "remote": 1}).remote is True


def test_rescore_keeps_tracking_fields(tmp_path):
    job = score_job(_job(), load_config(), now=datetime.now(timezone.utc) - timedelta(days=9))
    store = _store(tmp_path, job)
    store.set_status(job.external_id, "APPLIED")
    store.save_application_details(job.external_id, "140 PLN/h", "1 month")
    rescore(store, load_config(), {}, store.list(0), force=True)
    row = store.list_all()[0]
    assert (row["application_status"], row["applied_rate"], row["notice_period"]) == ("APPLIED", "140 PLN/h", "1 month")
    assert row["recency_score"] == 3


def test_rescore_rewrites_a_stored_impossible_salary_period(tmp_path):
    # Production had JustJoin.IT rows stored as "85–90 PLN/month" (an hourly
    # rate the employer filed as monthly). The daily fetch's forced rescore
    # must fix them in place: the corrected period goes back to the DB and
    # the estimate/bonus are computed from it.
    import sqlite3

    cfg = load_config()
    wrong = _job(url="https://justjoin.it/job-offer/jellylabs-tech-senior-qa-engineer-warszawa-testing")
    hourly_as_monthly = _job(url="https://justjoin.it/job-offer/b2b-rate-filed-as-month")
    store = _store(tmp_path, score_job(wrong, cfg), score_job(hourly_as_monthly, cfg))
    with sqlite3.connect(tmp_path / "jobs.db") as conn:  # simulate rows written before the fix
        conn.execute("UPDATE jobs SET salary_min=85, salary_max=90, salary_currency='PLN', salary_period='month' "
                     "WHERE url LIKE '%jellylabs%'")
        conn.execute("UPDATE jobs SET salary_min=110, salary_max=140, salary_currency='PLN', salary_period='month' "
                     "WHERE url LIKE '%filed-as-month%'")

    assert rescore(store, cfg, store.get_all_meta(), store.list(0), today=TODAY, force=True) is True

    rows = {row["url"].rsplit("/", 1)[-1]: row for row in store.list_all()}
    jelly, b2b = rows["jellylabs-tech-senior-qa-engineer-warszawa-testing"], rows["b2b-rate-filed-as-month"]
    assert (jelly["salary_min"], jelly["salary_max"], jelly["salary_period"]) == (85, 90, "hour")
    assert b2b["salary_period"] == "hour"
    jelly_breakdown, b2b_breakdown = json.loads(jelly["score_breakdown"]), json.loads(b2b["score_breakdown"])
    assert jelly_breakdown["salary_assessment"]["estimated_monthly_pln"] == 85 * 160
    assert jelly_breakdown["salary_bonus"] == 0  # 13 600 PLN/month is under the 15 000 threshold
    assert b2b_breakdown["salary_assessment"]["estimated_monthly_pln"] == 110 * 160
    assert b2b_breakdown["salary_bonus"] == cfg["scoring"]["salary_bonus"]["points"]


def test_a_scoring_version_bump_rescores_hidden_rows_too():
    # SCORING_VERSION is part of the signature, so the first fetch after the
    # salary fix rewrites every stored row (rejected/hidden ones included),
    # not only the visible ones.
    cfg = load_config()
    store = _CountingStore(all_rows=[{"title": "hidden"}, {"title": "visible"}])
    old_signature = json.dumps({**scoring_inputs(cfg), "scoring_version": SCORING_VERSION - 1},
                               sort_keys=True, ensure_ascii=False)
    meta = {"score_config_signature": old_signature, "scores_refreshed_on": TODAY}
    assert rescore(store, cfg, meta, [{"title": "visible"}], today=TODAY, force=True) is True
    assert [job.title for job in store.written] == ["hidden", "visible"]
