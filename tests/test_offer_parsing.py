from bs4 import BeautifulSoup

from job_finder.sources import web_utils
from job_finder.sources.nofluff import NoFluffSource
from job_finder.sources.pracuj import PracujSource
from job_finder.sources.justjoin import JustJoinSource


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


def test_offer_parser_reads_individual_jobposting(monkeypatch):
    html = '''<h1>QA Engineer</h1><script type="application/ld+json">
    {"@context":"https://schema.org","@type":"JobPosting","title":"QA Engineer",
    "description":"A detailed role description with testing responsibilities and API work. Additional role details make this a substantive job description.",
    "hiringOrganization":{"@type":"Organization","name":"Example Health"},
    "jobLocation":{"address":{"addressLocality":"Warsaw","addressCountry":"PL"}},
    "employmentType":"CONTRACTOR","datePosted":"2026-09-20"}
    </script>'''
    monkeypatch.setattr(web_utils, "get_soup", lambda _: BeautifulSoup(html, "html.parser"))
    job = web_utils.parse_offer("https://example.com/jobs/123", "test")
    assert job is not None
    assert job.title == "QA Engineer"
    assert job.company == "Example Health"
    assert "Warsaw" in job.location
    assert job.contract == "CONTRACTOR"
    assert "detailed role description" in job.description
    assert job.url == "https://example.com/jobs/123"
