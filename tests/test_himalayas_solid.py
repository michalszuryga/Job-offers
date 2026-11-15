"""Himalayas and Solid.jobs adapters, on entries trimmed from their APIs (2026-11-15)."""

from job_finder.config import load_config
from job_finder.scoring import score_job
from job_finder.sources.himalayas import HimalayasSource, _location
from job_finder.sources.solidjobs import SolidJobsSource
from job_finder.sources.web_utils import location_work_mode

HIMALAYAS = {
    "title": "Senior QA Engineer", "companyName": "SwingDev", "employmentType": "Full Time",
    "guid": "https://himalayas.app/companies/swingdev/jobs/senior-qa-engineer",
    "applicationLink": "https://himalayas.app/companies/swingdev/jobs/senior-qa-engineer?utm_source=api",
    "pubDate": 1794317072, "locationRestrictions": ["Poland"], "seniority": ["Senior"],
    "minSalary": 18000, "maxSalary": 23000, "currency": "PLN", "salaryPeriod": "monthly",
    "description": "<p>Playwright and <b>API testing</b> for a SaaS product.</p>",
}

SOLID = {
    "title": "Tester Systemowy", "company": "apreel", "category": "Tester", "isRemote": True, "isHybrid": False,
    "locations": ["Warszawa"], "experienceLevel": "Regular", "url": "https://solid.jobs/o/abc/joffers",
    "validFrom": "2026-11-02T17:46:19.1942703+01:00",
    "salary": {"from": 15100.0, "to": 18500.0, "currency": "PLN", "period": "Month", "employmentType": "B2B"},
    "skills": [{"name": "SQL"}, {"name": "Postman"}], "description": "<p>Testy systemowe aplikacji bankowej.</p>",
}


def test_himalayas_entry_links_back_to_himalayas_and_reads_its_fields():
    job = HimalayasSource()._job(HIMALAYAS)
    assert job.url == HIMALAYAS["guid"] and job.source == "Himalayas"
    assert (job.remote, job.location, job.contract) == (True, "Poland · Remote", "employment")
    assert (job.salary_min, job.salary_max, job.salary_currency, job.salary_period) == (18000, 23000, "PLN", "month")
    assert job.seniority == "senior" and "API testing" in job.description
    assert job.published_at.year == 2026


def test_himalayas_location_summarises_the_country_list():
    assert _location([]) == "Worldwide"
    assert _location(["Cyprus", "Georgia", "Poland"]) == "Cyprus, Georgia, Poland"
    assert _location(["Albania", "Austria", "Poland", "Spain"]) == "Poland + 3 more countries"


def test_himalayas_skips_what_is_not_software_qa():
    for title in ("Penetration Tester (UK, PL)", "LQA Game Tester (Korean)", "Electronics Assembly Quality Engineer",
                  "Senior React Full-stack Developer"):
        assert HimalayasSource()._job({**HIMALAYAS, "title": title}) is None


def test_solid_entry_keeps_the_board_work_mode_and_salary():
    job = SolidJobsSource()._job(SOLID)
    assert (job.title, job.company, job.contract) == ("Tester Systemowy", "apreel", "B2B")
    assert job.location == "Warszawa · Remote" and job.remote is True
    assert (job.salary_min, job.salary_max, job.salary_period) == (15100.0, 18500.0, "month")
    assert "Postman" in job.description and job.seniority == "regular"


def test_solid_remote_and_hybrid_is_potentially_remote():
    job = SolidJobsSource()._job({**SOLID, "isHybrid": True})
    assert job.location == "Warszawa · Remote · Hybrid" and location_work_mode(job.location) is False
    scored = score_job(job, load_config())
    assert scored.rejected is False and scored.remote_hint


def test_solid_skips_other_categories():
    assert SolidJobsSource()._job({**SOLID, "category": "Developer", "title": "Senior API Engineer (Java)"}) is None
