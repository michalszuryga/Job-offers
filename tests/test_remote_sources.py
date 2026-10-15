import json

from bs4 import BeautifulSoup

from job_finder.sources import web_utils
from job_finder.sources.remoteok import RemoteOKSource
from job_finder.sources.weworkremotely import WeWorkRemotelySource
from job_finder.sources.bulldogjob import BulldogJobSource
from job_finder.sources.testdevjobs import TestDevJobsSource
from job_finder.sources.eldorado import EldoradoSource


class _FakeResponse:
    def __init__(self, *, text="", json_data=None, content=b""):
        self._text = text
        self._json = json_data
        self.content = content or text.encode()

    def raise_for_status(self):
        pass

    def json(self):
        return self._json

    @property
    def text(self):
        return self._text


def test_remoteok_filters_non_qa_titles_and_parses_fields(monkeypatch):
    payload = [
        {"legal": "ignore this meta entry"},
        {
            "position": "QA Automation Engineer",
            "company": "Acme Health",
            "url": "https://remoteok.com/remote-jobs/1",
            "location": "Worldwide",
            "tags": ["qa", "python"],
            "description": "<p>Test our healthcare platform.</p>",
            "date": "2026-09-20T10:00:00+00:00",
            "salary_min": 60000,
            "salary_max": 80000,
        },
        {
            "position": "Backend Engineer",
            "company": "Other Co",
            "url": "https://remoteok.com/remote-jobs/2",
            "location": "Worldwide",
            "tags": ["backend"],
            "description": "<p>Build APIs.</p>",
            "date": "2026-09-20T10:00:00+00:00",
        },
    ]
    monkeypatch.setattr(
        "job_finder.sources.remoteok.requests.get",
        lambda *a, **k: _FakeResponse(json_data=payload),
    )
    source = RemoteOKSource()
    jobs = source.fetch()
    assert source.candidates == 2
    assert len(jobs) == 1
    job = jobs[0]
    assert job.title == "QA Automation Engineer"
    assert job.company == "Acme Health"
    assert job.remote is True
    assert job.salary_min == 60000 and job.salary_max == 80000
    assert job.salary_currency == "USD"


def test_weworkremotely_splits_company_and_filters_by_title(monkeypatch):
    rss = """<?xml version="1.0"?>
    <rss><channel>
    <item>
        <title>Acme Health: QA Engineer</title>
        <link>https://weworkremotely.com/jobs/1</link>
        <region>Anywhere in the World</region>
        <description>&lt;p&gt;Test our systems.&lt;/p&gt;</description>
        <pubDate>Mon, 21 Sep 2026 10:00:00 +0000</pubDate>
    </item>
    <item>
        <title>Other Co: Backend Engineer</title>
        <link>https://weworkremotely.com/jobs/2</link>
        <region>Anywhere in the World</region>
        <description>&lt;p&gt;Build APIs.&lt;/p&gt;</description>
        <pubDate>Mon, 21 Sep 2026 10:00:00 +0000</pubDate>
    </item>
    </channel></rss>"""
    monkeypatch.setattr(
        "job_finder.sources.weworkremotely.requests.get",
        lambda *a, **k: _FakeResponse(content=rss.encode()),
    )
    source = WeWorkRemotelySource(feeds=["https://weworkremotely.com/fake.rss"])
    jobs = source.fetch()
    assert source.candidates == 2
    assert len(jobs) == 1
    job = jobs[0]
    assert job.title == "QA Engineer"
    assert job.company == "Acme Health"
    assert job.remote is True


def test_bulldogjob_skips_non_detail_links_and_parses_jobposting(monkeypatch):
    listing_html = (
        '<a href="https://bulldogjob.pl/companies/jobs/255387-qa-tester-futuresight">QA Tester</a>'
        '<a href="https://bulldogjob.pl/companies/jobs/s/skills,QA">See all QA jobs</a>'
    )
    detail_html = '''<h1>QA Tester</h1><script type="application/ld+json">
    {"@type":"JobPosting","title":"QA Tester",
    "description":"A detailed QA tester role covering manual and automated testing of a healthcare booking platform end to end, including regression and exploratory coverage.",
    "hiringOrganization":{"@type":"Organization","name":"FutureSight"},
    "jobLocationType":"TELECOMMUTE","employmentType":"CONTRACTOR","datePosted":"2026-09-20"}
    </script>'''

    monkeypatch.setattr(
        "job_finder.sources.bulldogjob.get_soup",
        lambda url: BeautifulSoup(listing_html, "html.parser"),
    )
    monkeypatch.setattr(
        web_utils, "get_soup",
        lambda url, timeout=10: BeautifulSoup(detail_html, "html.parser"),
    )

    source = BulldogJobSource(queries=["https://bulldogjob.pl/companies/jobs/s/skills,QA"])
    jobs = source.fetch()
    assert source.candidates == 1  # the search/filter link is excluded
    assert len(jobs) == 1
    job = jobs[0]
    assert job.title == "QA Tester"
    assert job.company == "FutureSight"
    assert job.remote is True


class _FakeTextResponse:
    def __init__(self, text):
        self._text = text

    def raise_for_status(self):
        pass

    @property
    def text(self):
        return self._text


def test_testdevjobs_parses_emoji_tagged_detail_page(monkeypatch):
    listing_html = (
        '<a href="/job/acme-qa-engineer-1/">QA Engineer @ Acme</a>'
        '<a href="/about-us/">About</a>'
    )
    detail_html = '''<html><head>
    <meta property="og:title" content="QA Engineer @ Acme">
    </head><body>
    <p>📍</p><p>Poland</p>
    <p>🌐 Fully Remote</p>
    <p>POSTED</p><p>September 20, 2026</p>
    <p>Tech Stack:</p>
    <p>Playwright TypeScript Postman testing our healthcare booking platform across web
    and mobile with detailed regression and exploratory test coverage every release cycle.</p>
    <p>Apply for this job</p>
    </body></html>'''

    def fake_get(url, headers=None, timeout=None):
        return _FakeTextResponse(detail_html if "/job/" in url else listing_html)

    monkeypatch.setattr("job_finder.sources.testdevjobs.requests.get", fake_get)
    source = TestDevJobsSource(listing_url="https://testdevjobs.com/location/remote-europe/")
    jobs = source.fetch()
    assert source.candidates == 1
    assert len(jobs) == 1
    job = jobs[0]
    assert job.title == "QA Engineer"
    assert job.company == "Acme"
    assert job.remote is True
    assert job.location == "Poland"


def test_eldorado_skips_non_detail_links_and_parses_jobposting(monkeypatch):
    listing_html = (
        '<a href="https://czyjesteldorado.pl/praca/423496-senior-qa-engineer-acme">Senior QA Engineer</a>'
        '<a href="https://czyjesteldorado.pl/kategorie">Categories</a>'
    )
    detail_html = '''<h1>Senior QA Engineer</h1><script type="application/ld+json">
    {"@type":"JobPosting","title":"Senior QA Engineer",
    "description":"A detailed QA engineer role covering manual and automated testing of a fintech payments platform end to end, including regression coverage.",
    "hiringOrganization":{"@type":"Organization","name":"Acme"},
    "jobLocationType":"TELECOMMUTE","employmentType":"CONTRACTOR","datePosted":"2026-09-20"}
    </script>'''

    monkeypatch.setattr(
        "job_finder.sources.eldorado.get_soup",
        lambda url: BeautifulSoup(listing_html, "html.parser"),
    )
    monkeypatch.setattr(
        web_utils, "get_soup",
        lambda url, timeout=10: BeautifulSoup(detail_html, "html.parser"),
    )
    # EldoradoSource paces detail-page fetches (request_interval=0.75); skip
    # the real sleep so this test doesn't take extra wall-clock for nothing.
    monkeypatch.setattr(web_utils.time, "sleep", lambda _: None)

    source = EldoradoSource(queries=["https://czyjesteldorado.pl/search?q=QA"])
    jobs = source.fetch()
    assert source.candidates == 1  # the "kategorie" nav link is excluded
    assert len(jobs) == 1
    job = jobs[0]
    assert job.title == "Senior QA Engineer"
    assert job.company == "Acme"
    assert job.remote is True


def _testdevjobs_detail(header_salary_line):
    # Real layout: the offer header, "Apply for this job", the description,
    # then "Similar Jobs" cards that repeat the 📍/🌐/💵 lines for other offers.
    return f'''<html><head><meta property="og:title" content="QA Engineer @ Acme"></head><body>
    <p>📍</p><p>Germany</p>{header_salary_line}<p>🌐 Fully Remote</p><p>⏰</p><p>Full Time</p>
    <p>POSTED</p><p>October 7, 2026</p><p>Apply for this job</p>
    <p>Tech Stack:</p>
    <p>Playwright TypeScript Postman testing our healthcare booking platform across web
    and mobile with detailed regression and exploratory test coverage every release cycle.</p>
    <p>Apply for this job</p><p>Similar Jobs</p>
    <p>Product Tester – Books, Ebooks</p><p>📍</p><p>France</p>
    <p>💵 €100 - €200 / month</p><p>🌐 On-Site</p><p>⏰</p><p>Contract</p>
    </body></html>'''


def _testdevjobs_job(monkeypatch, detail_html):
    from job_finder.sources import testdevjobs

    monkeypatch.setattr(testdevjobs.requests, "get",
                        lambda url, headers=None, timeout=None: _FakeTextResponse(detail_html))
    return testdevjobs._parse_detail("https://testdevjobs.com/job/acme-qa-engineer-1/", "TestDevJobs")


def test_testdevjobs_undisclosed_salary_does_not_take_a_similar_jobs_card(monkeypatch):
    job = _testdevjobs_job(monkeypatch, _testdevjobs_detail(""))
    assert (job.salary_min, job.salary_max, job.salary_currency, job.salary_period) == (None, None, "", "")
    assert job.location == "Germany" and job.remote is True


def test_testdevjobs_header_salary_units(monkeypatch):
    yearly = _testdevjobs_job(monkeypatch, _testdevjobs_detail("<p>💵 €42,000 - €48,000</p>"))
    assert (yearly.salary_min, yearly.salary_max, yearly.salary_currency, yearly.salary_period) == (
        42000, 48000, "EUR", "year")
    hourly = _testdevjobs_job(monkeypatch, _testdevjobs_detail("<p>💵 $60 - $110 / hour</p>"))
    assert (hourly.salary_min, hourly.salary_max, hourly.salary_currency, hourly.salary_period) == (
        60, 110, "USD", "hour")
    pounds = _testdevjobs_job(monkeypatch, _testdevjobs_detail("<p>💵 £37,000</p>"))
    assert (pounds.salary_min, pounds.salary_currency, pounds.salary_period) == (37000, "GBP", "year")


def _jobposting_detail(base_salary=None, extra_description=""):
    posting = {"@type": "JobPosting", "title": "QA Tester",
               "description": "A detailed QA tester role covering manual and automated testing of a healthcare "
                              "booking platform end to end, including regression and exploratory coverage."
                              + extra_description,
               "hiringOrganization": {"@type": "Organization", "name": "Acme"}, "jobLocationType": "TELECOMMUTE"}
    if base_salary:
        posting["baseSalary"] = base_salary
    return f'<h1>QA Tester</h1><script type="application/ld+json">{json.dumps(posting)}</script>'


def _fetch_one(monkeypatch, source, module, listing_html, detail_html):
    monkeypatch.setattr(f"job_finder.sources.{module}.get_soup", lambda url: BeautifulSoup(listing_html, "html.parser"))
    monkeypatch.setattr(web_utils, "get_soup", lambda url, timeout=10: BeautifulSoup(detail_html, "html.parser"))
    monkeypatch.setattr(web_utils.time, "sleep", lambda _: None)
    jobs = source.fetch()
    assert len(jobs) == 1
    return jobs[0]


def test_bulldogjob_salary_periods(monkeypatch):
    # Salaried detail pages carry JSON-LD unitText "month"; a figure only on the
    # listing card ("12 000 - 16 000 PLN", no unit) follows the monthly convention.
    url = "https://bulldogjob.pl/companies/jobs/258258-test-automation-engineer-devire"
    structured = _jobposting_detail({"@type": "MonetaryAmount", "currency": "PLN", "value": {
        "@type": "QuantitativeValue", "minValue": 14000, "maxValue": 16000, "unitText": "month"}})
    listing = f'<div><a href="{url}">Test Automation Engineer</a><span>Devire</span></div>'
    job = _fetch_one(monkeypatch, BulldogJobSource(queries=["https://bulldogjob.pl/companies/jobs/s/skills,QA"]),
                     "bulldogjob", listing, structured)
    assert (job.salary_min, job.salary_max, job.salary_currency, job.salary_period) == (14000, 16000, "PLN", "month")

    card = f'<div><div><a href="{url}">Test Automation Engineer</a><span>9 600 - 12 800 PLN</span></div></div>'
    job = _fetch_one(monkeypatch, BulldogJobSource(queries=["https://bulldogjob.pl/companies/jobs/s/skills,QA"]),
                     "bulldogjob", card, _jobposting_detail())
    assert (job.salary_min, job.salary_max, job.salary_period) == (9600, 12800, "month")


def test_eldorado_card_amounts_are_monthly_and_text_units_still_win(monkeypatch):
    url = "https://czyjesteldorado.pl/praca/416670-senior-test-automation-engineer-python-lumicode"
    card = f'<div><div><a href="{url}">Senior Test Automation Engineer</a><span>18 480 – 26 880 zł</span></div></div>'
    job = _fetch_one(monkeypatch, EldoradoSource(queries=["https://czyjesteldorado.pl/search?q=QA"]),
                     "eldorado", card, _jobposting_detail())
    assert (job.salary_min, job.salary_max, job.salary_currency, job.salary_period) == (18480, 26880, "PLN", "month")

    hourly_text = _jobposting_detail(extra_description=" Rate: 100 - 130 PLN netto per hour (+ VAT).")
    job = _fetch_one(monkeypatch, EldoradoSource(queries=["https://czyjesteldorado.pl/search?q=QA"]),
                     "eldorado", card, hourly_text)
    assert (job.salary_min, job.salary_max, job.salary_period) == (100, 130, "hour")
