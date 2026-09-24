from job_finder.storage import JobStore
from job_finder.models import Job
from job_finder.scoring import score_job
from datetime import datetime, timezone

def cfg():
    return {"candidate":{"target_roles":["QA Engineer"],"technologies":{"strong":["Playwright","TypeScript","JavaScript","SQL"]},"domains":["healthcare"],"contracts":["B2B"],"ai":["AI"]},"scoring":{"weights":{"role":20,"technologies":25,"domain":10,"remote":15,"contract":10,"seniority":5,"ai":5,"recency_max":10}},"hard_exclusions":{"keywords":[],"seniority":[]}}

def test_javascript_not_rejected():
    j=Job("QA Engineer","X","https://x.test/1","x","JavaScript Playwright TypeScript SQL",remote=True,contract="B2B",published_at=datetime.now(timezone.utc))
    j=score_job(j,cfg())
    assert not j.rejected and j.score > 0

def test_java_rejected():
    j=Job("QA Engineer","X","https://x.test/2","x","Java Playwright",remote=True,contract="B2B")
    c=cfg(); c["hard_exclusions"]["technologies"]=["Java"]
    j=score_job(j,c)
    assert j.rejected and j.score == 0

def test_demo_can_be_deleted(tmp_path):
    store=JobStore(tmp_path/"jobs.db")
    j=Job("Demo","Demo","https://example.com/demo","demo")
    store.upsert(j)
    assert len(store.list()) == 1
    store.delete_source("demo")
    assert len(store.list()) == 0
