"""Greenhouse / Lever / Ashby / Recruitee adapters and company discovery (offline)."""

import requests

from job_finder import discover, notify
from job_finder.config import load_config
from job_finder.models import Job
from job_finder.scoring import score_job
from job_finder.sources import ats
from job_finder.storage import JobStore


class _Response:
    def __init__(self, data, status=200):
        self._data, self.status_code, self.ok = data, status, status == 200

    def json(self):
        return self._data

    def raise_for_status(self):
        if not self.ok:
            raise requests.HTTPError(str(self.status_code))


def _serve(monkeypatch, routes):
    def get(url, **kwargs):
        for part, data in routes.items():
            if part in url:
                return _Response(data)
        return _Response({}, 404)
    monkeypatch.setattr(requests, "get", get)


COMPANY = [{"name": "Fluxon", "slug": "fluxon"}]


def test_greenhouse_reads_qa_offers_with_their_location_mode(monkeypatch):
    _serve(monkeypatch, {
        "/jobs/1": {"content": "&lt;p&gt;Playwright and API testing&lt;/p&gt;"},
        "/jobs/2": {"content": "&lt;p&gt;Linux&lt;/p&gt;"},
        "/boards/fluxon/jobs": {"jobs": [
            {"id": 1, "title": "Senior QA Engineer (Manual)", "absolute_url": "https://job-boards.greenhouse.io/fluxon/jobs/1",
             "location": {"name": "Poland, Remote"}, "first_published": "2026-11-10T10:00:00-04:00"},
            {"id": 2, "title": "QA Engineer", "absolute_url": "https://job-boards.greenhouse.io/fluxon/jobs/2",
             "location": {"name": "Remote, United States"}},
            {"id": 3, "title": "Backend Engineer", "absolute_url": "https://x/3", "location": {"name": "Remote"}},
        ]},
    })
    jobs = ats.GreenhouseSource(companies=COMPANY).fetch()
    assert [j.title for j in jobs] == ["Senior QA Engineer (Manual)", "QA Engineer"]
    first, us = jobs
    assert first.location == "Poland, Remote · Remote" and first.remote is True and "Playwright" in first.description
    assert first.published_at.isoformat() == "2026-11-10T10:00:00-04:00"
    assert score_job(us, load_config()).reject_reason == "Region outside Europe"


def test_lever_ashby_recruitee_use_the_ats_work_mode(monkeypatch):
    _serve(monkeypatch, {
        "api.lever.co": [{"text": "QA Engineer", "hostedUrl": "https://jobs.lever.co/acme/1", "workplaceType": "hybrid",
                          "categories": {"location": "Warsaw", "commitment": "Full-time"}, "createdAt": 1794317072000,
                          "descriptionPlain": "Cypress", "lists": [{"text": "You have", "content": "<li>SQL</li>"}]}],
        "api.ashbyhq.com": {"jobs": [{"title": "Test Engineer", "jobUrl": "https://jobs.ashbyhq.com/acme/2",
                                      "workplaceType": "Remote", "location": "Poland", "isListed": True,
                                      "publishedAt": "2026-11-12T08:00:00.000+00:00", "descriptionPlain": "API"}]},
        "recruitee.com": {"offers": [{"title": "Manual QA", "careers_url": "https://acme.recruitee.com/o/qa",
                                      "remote": True, "hybrid": True, "city": "Poznań", "country": "Poland",
                                      "published_at": "2026-11-07 12:46:46 UTC", "description": "<p>QA</p>"}]},
    })
    lever, = ats.LeverSource(companies=COMPANY).fetch()
    assert (lever.location, lever.remote, lever.contract) == ("Warsaw · Hybrid", False, "employment")
    assert "SQL" in lever.description and lever.published_at.year == 2026
    ashby, = ats.AshbySource(companies=COMPANY).fetch()
    assert (ashby.location, ashby.remote) == ("Poland · Remote", True)
    recruitee, = ats.RecruiteeSource(companies=COMPANY).fetch()
    assert recruitee.location == "Poznań, Poland · Remote · Hybrid" and recruitee.remote is False
    assert score_job(recruitee, load_config()).remote_hint  # both modes: potentially remote


def test_slug_guesses_skip_short_generic_words():
    assert discover.slug_variants("Kyotu Technology") == ["kyotutechnology", "kyotu-technology", "kyotu"]
    assert discover.slug_variants("Software Mind") == ["softwaremind", "software-mind"]


def test_discovery_adds_pending_candidates_once_and_never_overrides_a_decision(tmp_path, monkeypatch):
    monkeypatch.setattr(discover, "configured_slugs", lambda: {("greenhouse", "fluxon")})
    store = JobStore(tmp_path / "jobs.db")
    store.upsert_many([Job("QA", "Kyotu Technology", "https://b/1", "JustJoin.IT"),
                       Job("QA", "Fluxon", "https://b/2", "Himalayas"),
                       Job("QA", "Other Co", "https://b/3", "JustJoin.IT")])
    boards = {("ashby", "kyotu"): (12, 2, ""), ("greenhouse", "fluxon"): (5, 1, "Fluxon"),
              ("greenhouse", "otherco"): (9, 0, "Somebody Else")}
    found = discover.discover(store, probe_fn=lambda a, s: boards.get((a, s)), workers=2)
    # Fluxon is already configured; Other Co's board names another company.
    assert [(c["ats"], c["slug"]) for c in found] == [("ashby", "kyotu")]
    store.decide_ats("ashby", "kyotu", approve=True)
    assert store.approved_ats("ashby") == [{"slug": "kyotu", "name": "Kyotu Technology"}]
    # Probed names are not looked up again.
    assert discover.discover(store, probe_fn=lambda a, s: boards.get((a, s))) == []
    store.add_ats_candidate("ashby", "kyotu", "Kyotu", 1, 1)
    assert store.ats_companies("approved")[0]["slug"] == "kyotu"


def test_candidates_email_has_board_and_one_tap_decisions():
    subject, text, html = notify.build_ats_candidates(
        [{"ats": "ashby", "slug": "kyotu", "name": "Kyotu Technology", "jobs": 12, "qa_jobs": 2, "board_name": ""}],
        "https://app.test/")
    assert subject == "JOffers: 1 nowa firma do akceptacji"
    assert "https://jobs.ashbyhq.com/kyotu" in text
    assert "Dodaj: https://app.test/?company=ashby%2Fkyotu&decision=approve" in text
    assert "decision=skip" in html and "✓ Dodaj" in html
