from datetime import datetime, timezone

from job_finder.models import Job
from job_finder.scoring import score_job


def cfg():
    return {
        "candidate": {
            "technologies": ["Playwright", "TypeScript", "JavaScript", "SQL", "Postman"],
            "domains": ["Healthcare", "FinTech"],
            "remote": True,
            "contracts": ["B2B"],
        },
        "hard_exclusions": {
            "technologies": ["Java"],
            "keywords": ["Java developer", "Java/Selenium"],
            "seniority": ["intern", "internship", "junior"],
        },
    }


def job(title, description):
    return Job(
        title=title,
        company="Example",
        url=f"https://example.com/{title.replace(' ', '-')}",
        source="test",
        description=description,
        published_at=datetime.now(timezone.utc),
    )


def test_java_is_hard_reject():
    scored = score_job(job("QA Engineer", "Playwright TypeScript Java Selenium"), cfg())
    assert scored.rejected is True
    assert scored.reject_reason == "Java"
    assert scored.score == 0


def test_javascript_is_not_java():
    scored = score_job(job("QA Engineer", "Playwright TypeScript JavaScript SQL Postman"), cfg())
    assert scored.rejected is False
    assert scored.score > 0


def test_junior_is_hard_reject():
    scored = score_job(job("Junior QA Engineer", "Playwright TypeScript"), cfg())
    assert scored.rejected is True
    assert scored.score == 0


def test_scoring_breakdown_is_transparent():
    config = cfg()
    config["candidate"]["target_roles"] = ["QA Engineer"]
    scored = score_job(job("QA Engineer", "Remote B2B healthcare Playwright SQL English"), config)
    assert scored.rejected is False
    assert {"technology", "domain", "remote", "contract", "seniority", "freshness"} <= set(scored.score_breakdown)
