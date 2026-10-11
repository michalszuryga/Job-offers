"""Contract between the Python scorer and the web app: the web renders the
breakdown and its maxima without re-scoring, so the JSON files it reads must
match what scoring.py really produces. Rewrite them after a scoring or
profile change with:

    UPDATE_WEB_FIXTURES=1 .venv/bin/python -m pytest -q tests/test_web_contract.py
"""

import json
import os
from datetime import datetime, timedelta
from pathlib import Path

import pytest

from job_finder.config import load_config
from job_finder.models import Job
from job_finder.salary import APPROXIMATE_PLN_RATES
from job_finder.scoring import score_job

ROOT = Path(__file__).resolve().parents[1]
PROFILE = ROOT / "config" / "profile.yaml"
SCORE_DEFAULTS = ROOT / "web" / "src" / "lib" / "score-defaults.json"
BREAKDOWN = ROOT / "web" / "src" / "lib" / "__fixtures__" / "breakdown.json"
FIXED_NOW = datetime.fromisoformat("2026-05-04T16:00:00+00:00")
UPDATE = os.environ.get("UPDATE_WEB_FIXTURES") == "1"


def _ago(**delta):
    return (FIXED_NOW - timedelta(**delta)).isoformat()


# Every job is remote: the profile has remote_only, anything else is rejected.
CASES = [
    ("strong-match", {
        "title": "QA Engineer", "company": "Northwind Health",
        "description": "Remote QA Engineer for a healthcare SaaS platform. You will test the API with "
                       "Postman and SQL, and write Playwright tests in TypeScript. Fluent English required.",
        "location": "Remote, Poland", "contract": "B2B", "seniority": "mid", "remote": True,
        "salary_min": 14000, "salary_max": 18000, "salary_currency": "PLN", "salary_period": "month",
        "published_at": _ago(hours=2),
    }),
    ("capped", {
        "title": "Senior QA Engineer", "company": "Ledger Pay",
        "description": "Software Test Engineer / QA Analyst in a fintech payments team. Stack: Playwright, "
                       "TypeScript, Cypress, Postman, SQL, GitHub, CI/CD. AI-assisted testing with Claude Code "
                       "and GitHub Copilot. Fluent English.",
        "location": "Remote", "contract": "B2B", "seniority": "senior", "remote": True,
        "salary_min": 25000, "salary_max": 30000, "salary_currency": "PLN", "salary_period": "month",
        "published_at": _ago(hours=3),
    }),
    ("penalties", {
        "title": "QA Automation Engineer (Python)", "company": "Fjord Analytics",
        "description": "Build Python and Playwright test suites for a SaaS reporting product. REST API "
                       "testing, SQL, Git. English at B2 level.",
        "location": "Remote, EU", "contract": "B2B", "seniority": "senior", "remote": True,
        "salary_min": 40, "salary_max": 50, "salary_currency": "EUR", "salary_period": "hour",
        "published_at": _ago(days=12),
    }),
    ("floored", {
        "title": "Python Automation Tester", "company": "Quiet Labs",
        "description": "Manual and automated checks for a back-office tool.",
        "location": "Remote", "contract": "", "seniority": "", "remote": True,
        "salary_min": None, "salary_max": None, "salary_currency": "", "salary_period": "",
        "published_at": _ago(days=20),
    }),
    ("unknown-currency", {
        "title": "Software QA Engineer", "company": "Nordlys AB",
        "description": "Remote QA role in an e-government team. Cypress, JavaScript, SQL and API testing. "
                       "English.",
        "location": "Remote, Sweden", "contract": "contractor", "seniority": "mid", "remote": True,
        "salary_min": 45000, "salary_max": 55000, "salary_currency": "SEK", "salary_period": "month",
        "published_at": _ago(hours=26),
    }),
    ("yearly-usd", {
        "title": "QA Analyst", "company": "Brightside Software",
        "description": "Remote QA Analyst for an enterprise software suite. SQL, Postman, API testing, "
                       "GitHub Copilot for test design. English.",
        "location": "Remote, worldwide", "contract": "Contractor", "seniority": "senior", "remote": True,
        "salary_min": 96000, "salary_max": 120000, "salary_currency": "USD", "salary_period": "year",
        "published_at": _ago(days=5),
    }),
]


def _job(fields):
    return Job(url="https://board.test/fixture", source="Fixture",
               **{**fields, "published_at": datetime.fromisoformat(fields["published_at"])})


def _raw_sum(breakdown):
    return sum(v for v in breakdown.values() if isinstance(v, (int, float)) and not isinstance(v, bool))


def score_defaults():
    return load_config(PROFILE)["scoring"]


def breakdown_fixture():
    cfg = load_config(PROFILE)
    cases = []
    for name, fields in CASES:
        job = score_job(_job(fields), cfg, now=FIXED_NOW)
        assert not job.rejected, f"{name} was rejected: {job.reject_reason}"
        cases.append({"name": name, "job": fields, "score": job.score, "breakdown": job.score_breakdown})
    return {"generated_by": "tests/test_web_contract.py", "now": FIXED_NOW.isoformat(), "cases": cases}


def _check(path, expected):
    """Compare as parsed JSON (so 20000 == 20000.0), rewriting first on request."""
    if UPDATE:
        path.write_text(json.dumps(expected, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    assert path.exists(), f"{path} is missing — run with UPDATE_WEB_FIXTURES=1"
    stored = json.loads(path.read_text(encoding="utf-8"))
    assert stored == json.loads(json.dumps(expected)), (
        f"{path.relative_to(ROOT)} is out of date — run with UPDATE_WEB_FIXTURES=1"
    )


def test_score_defaults_mirror_the_profile_scoring_section():
    _check(SCORE_DEFAULTS, score_defaults())


def test_breakdown_fixture_matches_score_job():
    _check(BREAKDOWN, breakdown_fixture())


@pytest.fixture(scope="module")
def cases():
    return {case["name"]: case for case in breakdown_fixture()["cases"]}


def test_fixture_cases_cover_what_their_names_promise(cases):
    strong = cases["strong-match"]
    assert 0 < _raw_sum(strong["breakdown"]) < 100 and strong["score"] == _raw_sum(strong["breakdown"])

    assert _raw_sum(cases["capped"]["breakdown"]) > 100 and cases["capped"]["score"] == 100

    penalties = cases["penalties"]["breakdown"]
    assert penalties["title_automation_penalty"] < 0
    assert penalties["title_programming_language_penalty"] < 0
    assert penalties["stale_offer_penalty"] < 0
    assert penalties["salary_assessment"]["estimated_monthly_pln"] is not None

    assert _raw_sum(cases["floored"]["breakdown"]) < 0 and cases["floored"]["score"] == 0

    assert cases["unknown-currency"]["breakdown"]["salary_assessment"]["estimated_monthly_pln"] is None
    assert cases["unknown-currency"]["breakdown"]["salary_bonus"] == 0

    yearly = cases["yearly-usd"]["breakdown"]["salary_assessment"]
    assert yearly["estimated_monthly_pln"] == round(96000 / 12 * APPROXIMATE_PLN_RATES["USD"], 2)
