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
