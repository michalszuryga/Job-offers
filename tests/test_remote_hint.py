"""Potentially remote offers: hybrid or office in the structured data, but the text says
working fully remotely is possible. Phrases taken from real offers rejected before."""

import pytest
from bs4 import BeautifulSoup

from job_finder.config import load_config
from job_finder.models import Job
from job_finder.scoring import score_job
from job_finder.sources.ats import WorkableSearchSource, software_qa_title
from job_finder.sources.pracuj import work_modes
from job_finder.sources.web_utils import remote_hint


@pytest.mark.parametrize("text", [
    "IT Automation Tester. Hybrid in Gdańsk, Gdynia, Warsaw, or Łódź, fully remote work also possible.",
    "tryb pracy: 100% zdalnie (jednorazowy test kompetencji stacjonarnie w Warszawie)",
    "flexible working hours and approach to work: fully remotely, in the office or hybrid",
    "elastyczne warunki – hybrydowo lub w pełni zdalnie, dopasowane indywidualnie",
    "Warszawa · praca zdalna, praca hybrydowa (10 dni w mies. stacjonarnie)",
    "Kraków · home office work, hybrid work",
    "Biuro w Krakowie, praca zdalna możliwa dla osób spoza Krakowa",
])
def test_phrases_that_make_an_offer_potentially_remote(text):
    assert remote_hint(text)


@pytest.mark.parametrize("text", [
    "Hybrid, 3 days a week in our Warsaw office",
    "Benefity: możliwość pracy zdalnej, owoce w biurze",  # occasional home office
    "We are not fully remote: 2 days in the office",
    "Praca nie jest w pełni zdalna",
])
def test_phrases_that_do_not(text):
    assert remote_hint(text) == ""


def test_the_hint_quotes_the_phrase_with_some_context():
    hint = remote_hint("Lorem ipsum " * 20 + "Hybrid in Gdańsk, fully remote work also possible. " + "dolor " * 20)
    assert "fully remote work also possible" in hint and hint.startswith("… ") and hint.endswith(" …")
    assert len(hint) < 200


def _job(**extra):
    extra.setdefault("description", "Testing web apps with Playwright")
    return Job("QA Engineer", "Acme", "https://board.test/1", "test", **extra)


def test_a_potentially_remote_offer_is_kept_without_remote_points():
    cfg = load_config()
    job = score_job(_job(location="Gdańsk · praca zdalna, praca hybrydowa", remote=False), cfg)
    assert job.rejected is False and job.remote_hint
    assert job.score_breakdown["remote"] == 0


def test_plain_hybrid_is_still_rejected_and_plain_remote_has_no_hint():
    cfg = load_config()
    assert score_job(_job(location="Warszawa (hybrid)", remote=False), cfg).reject_reason == "Remote-only preference"
    remote = score_job(_job(location="Remote", remote=True, description="Fully remote QA, Playwright"), cfg)
    assert remote.rejected is False and remote.remote_hint == ""


def test_pracuj_work_modes_come_from_the_offer_badges():
    html = """
    <ul>
      <li data-test="sections-benefit-work-modes-home-office"><div data-test="offer-badge-title">praca zdalna</div></li>
      <li data-test="sections-benefit-work-modes-hybrid"><div data-test="offer-badge-title">praca hybrydowa</div></li>
      <li data-test="sections-benefit-contracts"><div data-test="offer-badge-title">B2B</div></li>
    </ul>"""
    assert work_modes(BeautifulSoup(html, "html.parser")) == "praca zdalna, praca hybrydowa"
    assert work_modes(BeautifulSoup("<p>nothing</p>", "html.parser")) == ""


def test_workable_search_keeps_software_qa_titles_only():
    assert software_qa_title("Middle QA Combi Engineer")
    assert software_qa_title("Test Automation Engineer")
    assert not software_qa_title("Physician (MD/DO) - Put Medical AI to the Test")
    assert not software_qa_title("Language Data Quality Reviewer for Finnish")


def test_workable_search_entry_becomes_a_remote_job():
    entry = {  # trimmed from jobs.workable.com/api/v1/jobs, 2026-11-15
        "title": "QA Engineer", "state": "published", "workplace": "remote", "employmentType": "Full-time",
        "created": "2026-11-11T09:08:55.799Z",
        "url": "https://jobs.workable.com/view/abc/qa-engineer-in-poland-at-itrex",
        "location": {"city": None, "countryName": "Poland"},
        "company": {"title": "ITRex Group"},
        "description": "<p>We build AI systems.</p>", "requirementsSection": "<ul><li>API testing, Postman</li></ul>",
    }
    job = WorkableSearchSource()._job(entry)
    assert (job.title, job.company, job.remote, job.contract) == ("QA Engineer", "ITRex Group", True, "employment")
    assert job.location == "Poland · Remote" and "Postman" in job.description
    assert job.published_at.isoformat().startswith("2026-11-11T09:08")
    assert WorkableSearchSource()._job({**entry, "title": "Physician - AI Test"}) is None


def test_workable_search_fails_only_when_every_query_fails(monkeypatch):
    import requests

    def boom(*args, **kwargs):
        raise requests.ConnectionError("down")

    monkeypatch.setattr(requests, "get", boom)
    with pytest.raises(RuntimeError):
        WorkableSearchSource(queries=["QA", "tester"]).fetch()


@pytest.mark.parametrize("location, remote", [
    ("Warszawa · Remote", True), ("Warszawa · Hybrid", False), ("Kraków · Office", False),
    ("Warszawa · praca zdalna", True), ("Warszawa · praca zdalna, praca hybrydowa", False),
    ("Kraków · home office work", True), ("Kraków · home office work, hybrid work", False),
    ("Thessaloniki, Greece (remote)", True), ("Remote · Poland", True),
    ("Warszawa", None), ("Remote", None), ("Hybrid Park, Kraków", None),
])
def test_the_work_mode_kept_in_the_location(location, remote):
    from job_finder.sources.web_utils import location_work_mode
    assert location_work_mode(location) is remote


def test_the_page_work_mode_beats_a_hybrid_in_the_text():
    from job_finder.rescore import row_to_job
    from job_finder.sources.web_utils import page_work_mode, with_work_mode
    assert page_work_mode('{\\"workplaceType\\":\\"remote\\"}') == "remote"
    assert page_work_mode('"workplaceType":"hybrid"') == "hybrid"
    row = {"title": "QA", "description": "We work fully remote. Benefits: hybrid office in Wrocław if you like.",
           "location": with_work_mode("Wrocław", "remote"), "remote": 0}
    assert row_to_job(row).remote is True


@pytest.mark.parametrize("location, outside", [
    ("USA Only", "USA"), ("Remote · United States", "United States"), ("Montréal, QC, Canada", "Canada"),
    ("LATAM", "LATAM"), ("Remote - US", "US"), ("Bengaluru, India", "India"),
    ("USA, Europe", ""), ("Worldwide", ""), ("Poland · Remote", ""), ("Athens, Greece (remote)", ""),
    ("United Kingdom", ""), ("Warszawa · Hybrid", ""), ("EMEA", ""), ("", ""),
])
def test_region_outside_europe_comes_from_the_location_only(location, outside):
    from job_finder.sources.web_utils import region_outside
    assert region_outside(location) == outside


def test_a_remote_offer_limited_to_the_us_is_rejected_but_not_for_its_description():
    cfg = load_config()
    us = score_job(_job(location="USA Only", remote=True), cfg)
    assert (us.rejected, us.reject_reason) == (True, "Region outside Europe")
    told = score_job(_job(location="Remote", remote=True, description="Playwright. Must be US-based."), cfg)
    assert told.rejected is False
