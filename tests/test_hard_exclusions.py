from datetime import datetime, timedelta, timezone

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


def test_remote_only_rejects_hybrid_and_unconfirmed_jobs():
    config = cfg()
    config["filters"] = {"remote_only": True}
    hybrid = job("QA Engineer", "Playwright hybrid")
    hybrid.remote = False
    unknown = job("QA Engineer", "Playwright")
    assert score_job(hybrid, config).reject_reason == "Remote-only preference"
    assert score_job(unknown, config).reject_reason == "Remote-only preference"


def test_automation_in_title_gets_configured_penalty():
    config = cfg()
    config["scoring"] = {"weights": {"technologies": 100}, "penalties": {"automation_title": 15}}
    regular = score_job(job("QA Engineer", "Remote Playwright"), config)
    automation = score_job(job("QA Automation Engineer", "Remote Playwright"), config)
    assert automation.score_breakdown["title_automation_penalty"] == -15
    assert regular.score - automation.score == 15


def test_old_offer_gets_configured_penalty():
    config = cfg()
    config["scoring"] = {"penalties": {"stale_offer": 15, "stale_after_days": 10}}
    old = job("QA Engineer", "Remote Playwright")
    old.published_at = datetime.now(timezone.utc) - timedelta(days=11)
    scored = score_job(old, config)
    assert scored.score_breakdown["stale_offer_penalty"] == -15
