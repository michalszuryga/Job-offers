"""CV variant suggestion and the weekly report."""

from datetime import datetime, timedelta, timezone

from job_finder import notify
from job_finder.cv_variants import build_variants, load_variants, suggest_variant
from job_finder.tailor_cv import TailorError, TailorResult

NOW = datetime(2026, 11, 16, 10, 17, tzinfo=timezone.utc)  # not on the hour: midnight means date-only


def _iso(hours_ago):
    return (NOW - timedelta(hours=hours_ago)).isoformat()


def test_the_configured_variants_load_with_manual_api_first():
    variants = load_variants()
    assert list(variants)[:3] == ["manual-api", "automation", "public-sector"]


def test_suggest_variant_follows_the_offer():
    variants = load_variants()
    automation = {"title": "Senior QA Automation Engineer", "description": "Playwright, TypeScript, CI/CD",
                  "score_breakdown": {"matched_technologies": ["playwright", "typescript", "ci/cd"]}}
    eu = {"title": "Test Engineer - Far site", "description": "Project for the European Commission and an EU agency",
          "score_breakdown": '{"matched_domains": ["european commission", "eu agency"]}'}
    plain = {"title": "QA Engineer", "description": "We build things"}
    assert suggest_variant(automation, variants) == "automation"
    assert suggest_variant(eu, variants) == "public-sector"
    assert suggest_variant(plain, variants) == "manual-api"
    assert suggest_variant(plain, {}) is None


def test_summary_names_the_cv_to_send(monkeypatch):
    monkeypatch.delenv("APP_URL", raising=False)
    row = {"score": 70, "title": "QA Automation Engineer", "company": "Acme", "url": "https://b/1",
           "description": "Playwright and TypeScript"}
    text, html = notify.build_summary([row], None)[1:]
    assert "CV: Automation (Playwright/TS)" in text and "CV: Automation" in html


def test_build_variants_copies_each_result_and_reports_failures(tmp_path):
    (tmp_path / "cv.html").write_text("<html></html>")

    def fake_tailor(offer, base_dir=None, model=None):
        if "EU" in offer["title"]:
            raise TailorError("rejected")
        out = tmp_path / "tailored" / "x.html"
        out.parent.mkdir(exist_ok=True)
        out.write_text(offer["description"])
        return TailorResult(out, None, out.with_suffix(".md"), "notes") if out.with_suffix(".md").write_text("n") else None

    results = build_variants(base_dir=tmp_path, tailor_fn=fake_tailor)
    assert results["public-sector"] == "rejected"
    assert "Playwright" in (tmp_path / "variants" / "automation.html").read_text()
    assert (tmp_path / "variants" / "manual-api.md").exists()


def test_weekly_stats_measure_speed_and_waiting_offers():
    rows = [
        {"source": "JustJoin.IT", "published_at": _iso(10), "first_seen_at": _iso(8), "score": 75},
        {"source": "JustJoin.IT", "published_at": _iso(30), "first_seen_at": _iso(26), "score": 40,
         "application_status": "APPLIED", "applied_at": _iso(20)},
        # A first fetch's backlog and date-only boards don't count for speed.
        {"source": "Himalayas", "published_at": _iso(24 * 60), "first_seen_at": _iso(5), "score": 65,
         "application_status": "DISMISSED"},
        {"source": "Bulldogjob", "published_at": "2026-11-15T00:00:00+00:00", "first_seen_at": _iso(3), "score": 10},
        {"source": "JustJoin.IT", "first_seen_at": _iso(4), "score": 0, "rejected": 1},
        {"source": "Old", "published_at": _iso(400), "first_seen_at": _iso(300), "score": 90},
    ]
    stats = notify.weekly_stats(rows, now=NOW)
    assert (stats["new"], stats["visible"], stats["good"], stats["applied"]) == (5, 4, 2, 1)
    assert stats["lag_hours"] == 3 and stats["apply_hours"] == 6
    assert [r["score"] for r in stats["untouched_good"]] == [75]
    subject, text, _ = notify.build_weekly(stats, [{"ats": "ashby", "slug": "kyotu", "name": "Kyotu",
                                                    "jobs": 3, "qa_jobs": 1}], "https://app.test/")
    assert subject == "JOffers: tydzień — 4 ofert, 1 aplikacji · 1 firma do akceptacji"
    assert "Od publikacji do JOffers (mediana): 3.0 h" in text and "decision=approve" in text
