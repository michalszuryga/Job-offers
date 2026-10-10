from datetime import datetime, timedelta, timezone

from job_finder.config import load_config
from job_finder.models import Job
from job_finder.scoring import recency_points, score_job


def test_good_job_scores_high():
    now = datetime.now(timezone.utc)
    job = Job(
        "Senior QA Engineer", "X", "https://x/1", "test",
        "Remote healthcare SaaS, Playwright, TypeScript, Postman, API testing, SQL, English",
        "Remote EU", True, "B2B", seniority="Senior", published_at=now - timedelta(hours=4)
    )
    assert score_job(job, load_config(), now=now).score >= 80
    assert job.recency_score == 10


def test_bad_job_is_penalized():
    job = Job("Junior QA Tester", "X", "https://x/2", "test", "Onsite internship manual tester", "Warsaw", False, "Employment", seniority="Junior")
    assert score_job(job, load_config()).score < 55


def test_recency_buckets():
    now = datetime.now(timezone.utc)
    assert recency_points(now - timedelta(hours=1), now)[0] == 10
    assert recency_points(now - timedelta(days=2), now)[0] == 8
    assert recency_points(now - timedelta(days=5), now)[0] == 6
    assert recency_points(now - timedelta(days=10), now)[0] == 3
    assert recency_points(now - timedelta(days=20), now)[0] == 1
    assert recency_points(now - timedelta(days=40), now)[0] == 0


def test_profile_exposes_current_tunable_preferences():
    config = load_config()
    assert config["filters"]["remote_only"] is True
    assert config["scoring"]["penalties"]["automation_title"] == 30
    assert config["scoring"]["penalties"]["stale_after_days"] == 10


def test_keywords_match_whole_words_only():
    cfg = {"candidate": {"target_roles": [], "technologies": {"strong": ["Git"]}, "domains": [], "ai": ["AI"]},
           "scoring": {"weights": {"technologies": 25, "ai": 5}}, "hard_exclusions": {}, "filters": {}}
    tricky = score_job(Job("QA Engineer", "X", "https://x/3", "test",
                           "Maintain digital test details", remote=True), cfg)
    assert tricky.score_breakdown["matched_ai"] == []
    assert tricky.score_breakdown["matched_technologies"] == []
    real = score_job(Job("QA Engineer", "X", "https://x/4", "test",
                         "AI-assisted testing, Git workflow", remote=True), cfg)
    assert real.score_breakdown["matched_ai"] == ["ai"]
    assert real.score_breakdown["matched_technologies"] == ["git"]
