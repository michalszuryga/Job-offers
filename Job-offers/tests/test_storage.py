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
