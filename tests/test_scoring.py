from job_finder.models import Job
from job_finder.scoring import score_job
from job_finder.config import load_config

def test_good_job_scores_high():
    j=Job("Senior QA Engineer","X","https://x/1","test","Remote healthcare SaaS, Playwright, TypeScript, Postman, API testing, SQL, English","Remote EU",True,"B2B",seniority="Senior")
    assert score_job(j,load_config()).score >= 70

def test_bad_job_is_penalized():
    j=Job("Junior QA Tester","X","https://x/2","test","Onsite internship manual tester","Warsaw",False,"Employment",seniority="Junior")
    assert score_job(j,load_config()).score < 55
