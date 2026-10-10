from job_finder.models import Job
from job_finder.storage import JobStore


def test_upsert_works(tmp_path):
    store = JobStore(tmp_path / "jobs.db")
    job = Job(
        title="QA Engineer",
        company="Example",
        url="https://example.com/jobs/1",
        source="test",
        description="QA API Playwright",
    )
    assert store.upsert(job) is True
    assert store.upsert(job) is False
    assert len(store.list()) == 1


def test_duplicate_tracking_urls_share_canonical_record(tmp_path):
    store = JobStore(tmp_path / "jobs.db")
    first = Job("QA Engineer", "Example", "https://EXAMPLE.com/jobs/1/?utm_source=board", "test")
    duplicate = Job("QA Engineer", "Example", "https://example.com/jobs/1", "test")
    assert store.upsert(first) is True
    assert store.upsert(duplicate) is False
    assert len(store.list()) == 1


def test_empty_database_is_valid(tmp_path):
    store = JobStore(tmp_path / "jobs.db")
    assert store.list() == []
    assert store.contains("https://example.com/jobs/missing") is False


def test_remote_only_query_hides_hybrid_and_unknown_rows(tmp_path):
    store = JobStore(tmp_path / "jobs.db")
    remote = Job("QA Engineer", "Example", "https://example.com/remote", "test", remote=True)
    hybrid = Job("QA Engineer", "Example", "https://example.com/hybrid", "test", remote=False)
    unknown = Job("QA Engineer", "Example", "https://example.com/unknown", "test")
    for job in (remote, hybrid, unknown):
        store.upsert(job)
    assert [job["url"] for job in store.list(remote_only=True)] == [remote.url]


def test_offer_with_missing_company_remains_available(tmp_path):
    store = JobStore(tmp_path / "jobs.db")
    incomplete = Job("QA Engineer", "", "https://example.com/no-company", "test", remote=True)
    complete = Job("QA Engineer", "Example", "https://example.com/company", "test", remote=True)
    store.upsert(incomplete)
    store.upsert(complete)
    listed = store.list(remote_only=True)
    assert {job["url"] for job in listed} == {incomplete.url, complete.url}
    assert next(job for job in listed if job["url"] == incomplete.url)["company"] == ""


def test_save_application_details_records_rate_and_notice_period(tmp_path):
    store = JobStore(tmp_path / "jobs.db")
    job = Job("QA Engineer", "Example", "https://example.com/jobs/1", "test")
    store.upsert(job)
    store.save_application_details(job.external_id, "120 PLN/h B2B", "1 month")
    saved = store.list()[0]
    assert saved["applied_rate"] == "120 PLN/h B2B"
    assert saved["notice_period"] == "1 month"


def test_marking_applied_sets_applied_at_once(tmp_path):
    store = JobStore(tmp_path / "jobs.db")
    job = Job("QA Engineer", "Example", "https://example.com/jobs/1", "test")
    store.upsert(job)
    store.set_status(job.external_id, "APPLIED")
    first_applied_at = store.list()[0]["applied_at"]
    assert first_applied_at is not None

    # Re-marking as APPLIED (or moving away and back) must not reset the
    # original timestamp — it's a record of when you first applied.
    store.set_status(job.external_id, "INTERVIEW")
    store.set_status(job.external_id, "APPLIED")
    assert store.list()[0]["applied_at"] == first_applied_at


def test_upsert_never_resets_application_details_on_refetch(tmp_path):
    store = JobStore(tmp_path / "jobs.db")
    job = Job("QA Engineer", "Example", "https://example.com/jobs/1", "test")
    store.upsert(job)
    store.set_status(job.external_id, "APPLIED")
    store.save_application_details(job.external_id, "120 PLN/h", "2 weeks")

    # A later fetch re-parsing the same offer must not wipe what was recorded.
    store.upsert(Job("QA Engineer (updated)", "Example", "https://example.com/jobs/1", "test"))
    saved = store.list()[0]
    assert saved["application_status"] == "APPLIED"
    assert saved["applied_rate"] == "120 PLN/h"
    assert saved["notice_period"] == "2 weeks"


def test_meta_roundtrip_and_overwrite(tmp_path):
    store = JobStore(tmp_path / "jobs.db")
    assert store.get_meta("last_fetch_at") is None
    assert store.get_meta("last_fetch_at", "never") == "never"
    store.set_meta("last_fetch_at", "2026-10-05T10:00:00+00:00")
    store.set_meta("last_fetch_at", "2026-10-05T11:00:00+00:00")
    assert store.get_meta("last_fetch_at") == "2026-10-05T11:00:00+00:00"


def _set_last_seen(db_path, external_id, value):
    import sqlite3
    with sqlite3.connect(db_path) as conn:
        conn.execute("UPDATE jobs SET last_seen_at=? WHERE external_id=?", (value, external_id))


def _last_seen(db_path, external_id):
    import sqlite3
    with sqlite3.connect(db_path) as conn:
        return conn.execute("SELECT last_seen_at FROM jobs WHERE external_id=?", (external_id,)).fetchone()[0]


def test_legacy_new_status_is_migrated_to_to_review(tmp_path):
    import sqlite3
    db = tmp_path / "jobs.db"
    store = JobStore(db)
    store.upsert(Job("QA Engineer", "Example", "https://example.com/jobs/1", "test"))
    with sqlite3.connect(db) as conn:
        conn.execute("UPDATE jobs SET application_status='NEW'")
    JobStore(db)
    assert store.list()[0]["application_status"] == "TO_REVIEW"


def test_rescore_does_not_refresh_last_seen(tmp_path):
    db = tmp_path / "jobs.db"
    store = JobStore(db)
    job = Job("QA Engineer", "Example", "https://example.com/jobs/1", "test")
    store.upsert(job)
    _set_last_seen(db, job.external_id, "2020-01-01 00:00:00")
    store.upsert_many([job], touch_last_seen=False)
    assert _last_seen(db, job.external_id) == "2020-01-01 00:00:00"
    store.upsert_many([job])
    assert _last_seen(db, job.external_id) > "2020-01-01 00:00:00"


def test_delete_expired_keeps_triaged_and_recently_seen(tmp_path):
    db = tmp_path / "jobs.db"
    store = JobStore(db)
    stale = Job("QA 1", "A", "https://example.com/jobs/1", "src")
    applied = Job("QA 2", "B", "https://example.com/jobs/2", "src")
    touched = Job("QA 3", "C", "https://example.com/jobs/3", "src")
    other_source = Job("QA 4", "D", "https://example.com/jobs/4", "other")
    for job in (stale, applied, touched, other_source):
        store.upsert(job)
        _set_last_seen(db, job.external_id, "2020-01-01 00:00:00")
    store.set_status(applied.external_id, "APPLIED")
    store.touch_seen([touched.external_id])

    assert store.delete_expired("src", older_than_days=3) == 1
    remaining = {row["external_id"] for row in store.list_all()}
    assert remaining == {applied.external_id, touched.external_id, other_source.external_id}
