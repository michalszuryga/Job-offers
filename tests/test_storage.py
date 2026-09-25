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
