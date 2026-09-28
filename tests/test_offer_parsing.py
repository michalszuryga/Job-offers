from bs4 import BeautifulSoup

from job_finder.sources import web_utils
from job_finder.sources.nofluff import NoFluffSource
from job_finder.sources.pracuj import PracujSource
from job_finder.sources.justjoin import JustJoinSource
from job_finder.sources.web_utils import infer_remote


def test_search_listing_links_are_not_saved_as_offers(monkeypatch):
    def listing(url):
        return BeautifulSoup('<a href="' + url + '">QA Engineer</a>', "html.parser")

    nofluff = NoFluffSource(queries=["https://nofluffjobs.com/pl/qa"])
    monkeypatch.setattr("job_finder.sources.nofluff.get_soup", lambda _: listing("https://nofluffjobs.com/pl/qa"))
    pracuj = PracujSource(queries=["https://www.pracuj.pl/praca/qa%20tester%3Bkw"])
    monkeypatch.setattr("job_finder.sources.pracuj.get_soup", lambda _: listing("https://www.pracuj.pl/praca/qa%20tester%3Bkw"))
    justjoin = JustJoinSource(queries=["https://justjoin.it/job-offers/all-locations/testing"])
    monkeypatch.setattr("job_finder.sources.justjoin.get_soup", lambda _: listing("https://justjoin.it/job-offers/all-locations/testing"))

    assert nofluff.fetch() == []
    assert pracuj.fetch() == []
    assert justjoin.fetch() == []


def test_known_urls_skip_the_detail_page_fetch(monkeypatch):
    from job_finder.models import canonical_job_url

    listing_url = "https://nofluffjobs.com/pl/qa"
    detail_url = "https://nofluffjobs.com/pl/job/qa-engineer-acme-1234"
    listing_html = f'<a href="{detail_url}">QA Engineer at Acme</a>'

    def detail_fetch_not_expected(*args, **kwargs):
        raise AssertionError("detail page should not be fetched for a known URL")

    nofluff = NoFluffSource(queries=[listing_url])
    monkeypatch.setattr("job_finder.sources.nofluff.get_soup", lambda _: BeautifulSoup(listing_html, "html.parser"))
    monkeypatch.setattr(web_utils, "get_soup", detail_fetch_not_expected)

    jobs = nofluff.fetch(known_urls={canonical_job_url(detail_url)})
    assert jobs == []
    assert nofluff.skipped_known == 1
    assert nofluff.candidates == 1


def test_justjoin_paginates_until_an_empty_page(monkeypatch):
    from job_finder.sources.justjoin import JustJoinSource

    base_url = "https://justjoin.it/job-offers/all-locations/testing?orderBy=published"
    pages_html = {
        1: '<a href="https://justjoin.it/job-offer/company-a-qa-engineer">QA Engineer at A</a>',
        2: '<a href="https://justjoin.it/job-offer/company-b-qa-tester">QA Tester at B</a>',
        3: '',  # empty page: pagination should stop here
    }

    def fake_get_soup(url):
        if "page=3" in url:
            page = 3
        elif "page=2" in url:
            page = 2
        else:
            page = 1
        assert page <= 3, "should never request a page past the first empty one"
        return BeautifulSoup(pages_html[page], "html.parser")

    monkeypatch.setattr("job_finder.sources.justjoin.get_soup", fake_get_soup)
    monkeypatch.setattr(
        "job_finder.sources.justjoin.parse_offer_batch",
        lambda offers, name, **kwargs: ([f"parsed:{href}" for href, *_ in offers], []),
    )

    source = JustJoinSource(queries=[base_url])
    jobs = source.fetch()
    assert source.candidates == 2
    assert jobs == [
        "parsed:https://justjoin.it/job-offer/company-a-qa-engineer",
        "parsed:https://justjoin.it/job-offer/company-b-qa-tester",
    ]


def test_offer_parser_reads_individual_jobposting(monkeypatch):
    html = '''<h1>QA Engineer</h1><script type="application/ld+json">
    {"@context":"https://schema.org","@type":"JobPosting","title":"QA Engineer",
    "description":"A detailed role description with testing responsibilities and API work. Additional role details make this a substantive job description.",
    "hiringOrganization":{"@type":"Organization","name":"Example Health"},
    "jobLocation":{"address":{"addressLocality":"Warsaw","addressCountry":"PL"}},
    "employmentType":"CONTRACTOR","datePosted":"2026-09-20"}
    </script>'''
    monkeypatch.setattr(web_utils, "get_soup", lambda _, timeout=10: BeautifulSoup(html, "html.parser"))
    job = web_utils.parse_offer("https://example.com/jobs/123", "test")
    assert job is not None
    assert job.title == "QA Engineer"
    assert job.company == "Example Health"
    assert "Warsaw" in job.location
    assert job.contract == "CONTRACTOR"
    assert "detailed role description" in job.description
    assert job.url == "https://example.com/jobs/123"


def test_remote_detection_handles_streamlit_app_source_labels():
    assert infer_remote("TELECOMMUTE") is True
    assert infer_remote("Hybrid, remote friendly team") is False


def test_missing_company_does_not_discard_an_individual_offer(monkeypatch):
    html = '''<h1>Senior QA Engineer</h1><script type="application/ld+json">
    {"@type":"JobPosting","title":"Senior QA Engineer",
    "description":"A detailed individual job description for a senior QA engineer. The role includes API, exploratory, and regression testing responsibilities."}
    </script>'''
    monkeypatch.setattr(web_utils, "get_soup", lambda _, timeout=10: BeautifulSoup(html, "html.parser"))
    job = web_utils.parse_offer("https://example.com/jobs/124", "test")
    assert job is not None
    assert job.company == ""


def test_future_publication_date_is_treated_as_unknown():
    from datetime import datetime, timezone

    now = datetime(2026, 9, 25, tzinfo=timezone.utc)
    assert web_utils.parse_date("2026-11-09", now=now) is None
    assert web_utils.parse_date("2026-09-24", now=now) is not None


def test_parse_offer_batch_keeps_success_when_one_detail_page_fails(monkeypatch):
    def parse(url, source, title):
        if "broken" in url:
            raise TimeoutError("detail page timed out")
        return title

    monkeypatch.setattr(web_utils, "parse_offer", parse)
    jobs, errors = web_utils.parse_offer_batch([
        ("https://example.com/good", "Good QA"),
        ("https://example.com/broken", "Broken QA"),
    ], "test")
    assert jobs == ["Good QA"]
    assert len(errors) == 1
    assert "Broken QA" in errors[0]
    assert "TimeoutError" in errors[0]


def test_get_soup_retries_transient_failures_then_succeeds(monkeypatch):
    import requests

    class _FakeResponse:
        status_code = 200
        text = "<html><body>ok</body></html>"

        def raise_for_status(self):
            pass

    calls = {"n": 0}

    def flaky_get(url, headers=None, timeout=None):
        calls["n"] += 1
        if calls["n"] == 1:
            raise requests.ConnectionError("reset by peer")
        if calls["n"] == 2:
            resp = _FakeResponse()
            resp.status_code = 503

            def raise_503():
                raise requests.HTTPError("503")
            resp.raise_for_status = raise_503
            return resp
        return _FakeResponse()

    monkeypatch.setattr(web_utils.requests, "get", flaky_get)
    monkeypatch.setattr(web_utils.time, "sleep", lambda _: None)

    soup = web_utils.get_soup("https://example.com/listing")
    assert soup.get_text() == "ok"
    assert calls["n"] == 3


def test_get_soup_gives_up_after_repeated_failures(monkeypatch):
    import requests

    def always_fails(url, headers=None, timeout=None):
        raise requests.ConnectionError("still down")

    monkeypatch.setattr(web_utils.requests, "get", always_fails)
    monkeypatch.setattr(web_utils.time, "sleep", lambda _: None)

    try:
        web_utils.get_soup("https://example.com/listing")
        assert False, "expected ConnectionError to propagate"
    except requests.ConnectionError:
        pass
