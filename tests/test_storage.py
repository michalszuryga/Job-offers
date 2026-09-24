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
