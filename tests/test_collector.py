from job_finder import collector as collector_mod
from job_finder.models import Job
from job_finder.storage import JobStore


def _fake_source(name, jobs, sensitive=False):
    class _Fake:
        def fetch(self, known_urls=None):
            return jobs

    fake = _Fake()
    fake.name = name
    fake.sensitive = sensitive
    return fake


def test_skip_sensitive_excludes_only_flagged_sources(monkeypatch, tmp_path):
    monkeypatch.setattr(collector_mod, "NoFluffSource", lambda: _fake_source("No Fluff Jobs", [], sensitive=True))
    monkeypatch.setattr(collector_mod, "PracujSource", lambda: _fake_source("Pracuj.pl", [], sensitive=True))
    monkeypatch.setattr(collector_mod, "JustJoinSource", lambda: _fake_source("JustJoin.IT", [], sensitive=False))
    monkeypatch.setattr(collector_mod, "RemoteOKSource", lambda: _fake_source("RemoteOK", [], sensitive=False))
    monkeypatch.setattr(collector_mod, "WeWorkRemotelySource", lambda: _fake_source("We Work Remotely", [], sensitive=False))
    monkeypatch.setattr(collector_mod, "BulldogJobSource", lambda: _fake_source("Bulldogjob", [], sensitive=False))
    monkeypatch.setattr(collector_mod, "TestDevJobsSource", lambda: _fake_source("TestDevJobs", [], sensitive=False))
    monkeypatch.setattr(collector_mod, "EldoradoSource", lambda: _fake_source("CzyJestEldorado", [], sensitive=True))
    monkeypatch.setattr(collector_mod, "JobStore", lambda: JobStore(str(tmp_path / "test_jobs.db")))

    results = collector_mod.collect_live_jobs(skip_sensitive=True)
    names = {r.name for r in results}
    assert names == {"JustJoin.IT", "RemoteOK", "We Work Remotely", "Bulldogjob", "TestDevJobs"}

    results_all = collector_mod.collect_live_jobs(skip_sensitive=False)
    assert len(results_all) == 8


def test_collect_live_jobs_dedups_cross_source_by_title_and_company(monkeypatch, tmp_path):
    description = (
        "A sufficiently detailed remote QA engineering role description used "
        "purely for scoring and cross-source dedup testing purposes here."
    )
    justjoin_job = Job(
        title="Senior QA Engineer", company="Acme Sp. z o.o.",
        url="https://justjoin.it/job-offer/acme-senior-qa", source="JustJoin.IT",
        description=description, location="Remote", remote=True, contract="B2B",
    )
    # Same underlying posting, cross-posted on the aggregator: different URL,
    # slightly different title/company formatting (gender marker, no legal suffix).
    eldorado_job = Job(
        title="Senior QA Engineer (m/k)", company="Acme",
        url="https://czyjesteldorado.pl/praca/999-senior-qa-engineer-acme", source="CzyJestEldorado",
        description=description, location="Remote", remote=True, contract="B2B",
    )
    unrelated_job = Job(
        title="QA Automation Lead", company="Other Co",
        url="https://czyjesteldorado.pl/praca/1000-qa-automation-lead-other-co", source="CzyJestEldorado",
        description=description, location="Remote", remote=True, contract="B2B",
    )

    monkeypatch.setattr(collector_mod, "NoFluffSource", lambda: _fake_source("No Fluff Jobs", []))
    monkeypatch.setattr(collector_mod, "PracujSource", lambda: _fake_source("Pracuj.pl", []))
    monkeypatch.setattr(collector_mod, "JustJoinSource", lambda: _fake_source("JustJoin.IT", [justjoin_job]))
    monkeypatch.setattr(collector_mod, "RemoteOKSource", lambda: _fake_source("RemoteOK", []))
    monkeypatch.setattr(collector_mod, "WeWorkRemotelySource", lambda: _fake_source("We Work Remotely", []))
    monkeypatch.setattr(collector_mod, "BulldogJobSource", lambda: _fake_source("Bulldogjob", []))
    monkeypatch.setattr(collector_mod, "TestDevJobsSource", lambda: _fake_source("TestDevJobs", []))
    monkeypatch.setattr(
        collector_mod, "EldoradoSource",
        lambda: _fake_source("CzyJestEldorado", [eldorado_job, unrelated_job]),
    )

    db_path = str(tmp_path / "test_jobs.db")
    monkeypatch.setattr(collector_mod, "JobStore", lambda: JobStore(db_path))

    results = collector_mod.collect_live_jobs()
    by_name = {r.name: r for r in results}

    # Which of JustJoin/Eldorado "wins" the cross-source duplicate depends on
    # thread completion order (not asserted here — see the code comment in
    # collector.py), but exactly one of their two same-posting copies must be
    # kept: total inserted across both is 2 (one Acme QA job + one unrelated
    # Eldorado-only job) and total duplicate is exactly 1.
    total_inserted = by_name["JustJoin.IT"].inserted + by_name["CzyJestEldorado"].inserted
    total_duplicate = by_name["JustJoin.IT"].duplicate + by_name["CzyJestEldorado"].duplicate
    assert total_inserted == 2
    assert total_duplicate == 1

    store = JobStore(db_path)
    stored = store.list(0, remote_only=True)
    companies = {row["company"] for row in stored}
    assert "Other Co" in companies
    assert len(stored) == 2  # the Acme posting is stored exactly once, not twice


def test_collect_live_jobs_seeds_dedup_from_existing_rows(monkeypatch, tmp_path):
    description = "A sufficiently detailed description for dedup seeding tests." * 2
    db_path = str(tmp_path / "test_jobs.db")

    # Pre-populate the store as if a previous fetch already saved this posting.
    from job_finder.scoring import score_job

    store = JobStore(db_path)
    existing = Job(
        title="QA Engineer", company="Acme", url="https://justjoin.it/job-offer/acme-qa",
        source="JustJoin.IT", description=description, location="Remote", remote=True, contract="B2B",
    )
    store.upsert(score_job(existing, {"candidate": {}, "scoring": {"weights": {}}, "filters": {}, "hard_exclusions": {}}))

    duplicate_from_aggregator = Job(
        title="QA Engineer", company="Acme Sp. z o.o.",
        url="https://czyjesteldorado.pl/praca/1-qa-engineer-acme", source="CzyJestEldorado",
        description=description, location="Remote", remote=True, contract="B2B",
    )

    monkeypatch.setattr(collector_mod, "NoFluffSource", lambda: _fake_source("No Fluff Jobs", []))
    monkeypatch.setattr(collector_mod, "PracujSource", lambda: _fake_source("Pracuj.pl", []))
    monkeypatch.setattr(collector_mod, "JustJoinSource", lambda: _fake_source("JustJoin.IT", []))
    monkeypatch.setattr(collector_mod, "RemoteOKSource", lambda: _fake_source("RemoteOK", []))
    monkeypatch.setattr(collector_mod, "WeWorkRemotelySource", lambda: _fake_source("We Work Remotely", []))
    monkeypatch.setattr(collector_mod, "BulldogJobSource", lambda: _fake_source("Bulldogjob", []))
    monkeypatch.setattr(collector_mod, "TestDevJobsSource", lambda: _fake_source("TestDevJobs", []))
    monkeypatch.setattr(
        collector_mod, "EldoradoSource",
        lambda: _fake_source("CzyJestEldorado", [duplicate_from_aggregator]),
    )
    monkeypatch.setattr(collector_mod, "JobStore", lambda: JobStore(db_path))

    results = collector_mod.collect_live_jobs()
    by_name = {r.name: r for r in results}
    assert by_name["CzyJestEldorado"].inserted == 0
    assert by_name["CzyJestEldorado"].duplicate == 1


def test_fetch_expires_only_offers_gone_from_a_loaded_listing(monkeypatch, tmp_path):
    db = tmp_path / "jobs.db"
    store = JobStore(str(db))
    still_listed = Job("QA Known", "A", "https://justjoin.it/job-offer/known", "JustJoin.IT")
    gone = Job("QA Gone", "B", "https://justjoin.it/job-offer/gone", "JustJoin.IT")
    blocked_source_job = Job("QA Pracuj", "C", "https://pracuj.pl/oferta/1", "Pracuj.pl")
    for job in (still_listed, gone, blocked_source_job):
        store.upsert(job)
    import sqlite3
    with sqlite3.connect(db) as conn:
        conn.execute("UPDATE jobs SET last_seen_at='2020-01-01 00:00:00'")

    class _SkipsKnown:
        name = "JustJoin.IT"
        sensitive = False

        def fetch(self, known_urls=None):
            # Like the real boards: the known offer is on the listing but skipped.
            assert still_listed.external_id in known_urls
            self.candidates, self.parsed = 1, 0
            return []

    class _Blocked:
        name = "Pracuj.pl"
        sensitive = False

        def fetch(self, known_urls=None):
            raise RuntimeError("403")

    for attr in ("NoFluffSource", "RemoteOKSource", "WeWorkRemotelySource",
                 "BulldogJobSource", "TestDevJobsSource", "EldoradoSource"):
        monkeypatch.setattr(collector_mod, attr, lambda: _fake_source("x", []))
    monkeypatch.setattr(collector_mod, "JustJoinSource", _SkipsKnown)
    monkeypatch.setattr(collector_mod, "PracujSource", _Blocked)

    results = collector_mod.collect_live_jobs(store=store)
    remaining = {row["external_id"] for row in store.list_all()}
    assert remaining == {still_listed.external_id, blocked_source_job.external_id}
    assert next(r for r in results if r.name == "JustJoin.IT").expired == 1


def test_run_fetch_records_last_fetch_state(monkeypatch, tmp_path):
    import json
    store = JobStore(str(tmp_path / "jobs.db"))
    job = Job("QA Engineer", "Acme", "https://remoteok.com/remote-jobs/1", "RemoteOK",
              description="Remote QA role", location="Remote", remote=True, contract="B2B")
    for attr in ("NoFluffSource", "PracujSource", "JustJoinSource", "WeWorkRemotelySource",
                 "BulldogJobSource", "TestDevJobsSource", "EldoradoSource"):
        monkeypatch.setattr(collector_mod, attr, lambda: _fake_source("x", []))
    monkeypatch.setattr(collector_mod, "RemoteOKSource", lambda: _fake_source("RemoteOK", [job]))

    collector_mod.run_fetch(store, "scheduled")
    meta = store.get_all_meta()
    assert json.loads(meta["last_fetch_new_ids"]) == [job.external_id]
    assert meta["last_fetch_at"]
    run = store.last_fetch_run()
    assert run["trigger"] == "scheduled"
    assert next(r for r in run["results"] if r["name"] == "RemoteOK")["inserted"] == 1
