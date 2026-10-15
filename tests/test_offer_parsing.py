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


def test_structured_salary_recognizes_spelled_out_unit_text():
    # schema.org's baseSalary.value.unitText commonly comes spelled out
    # ("HOUR", "YEAR"), not as the abbreviated unitCode ("HUR", "ANN") —
    # both must resolve to the same period.
    hourly = web_utils.extract_structured_salary(
        {"currency": "PLN", "value": {"unitText": "HOUR", "minValue": 100, "maxValue": 140}}
    )
    assert hourly == (100.0, 140.0, "PLN", "hour")

    yearly = web_utils.extract_structured_salary(
        {"currency": "PLN", "value": {"unitText": "YEAR", "minValue": 120000, "maxValue": 150000}}
    )
    assert yearly[3] == "year"

    coded = web_utils.extract_structured_salary(
        {"currency": "PLN", "value": {"unitCode": "HUR", "minValue": 100, "maxValue": 140}}
    )
    assert coded[3] == "hour"


# --- Board-native salary units ---------------------------------------------

_LONG_DESCRIPTION = ("A detailed QA role covering manual and automated testing of a fintech platform, "
                     "API checks with Postman and regression suites in Playwright.")


def _justjoin_detail(employment_types, base_salary):
    """Shape of a real JustJoin.IT offer page: a JSON-LD summary plus the
    Next.js flight payload (escaped JSON) holding the offer's employmentTypes,
    after same-named i18n labels."""
    import json

    payload = json.dumps({"employmentTypes": employment_types, "slug": "acme-qa-engineer-warszawa-testing"})
    escaped = payload.replace('"', '\\"')
    posting = {"@context": "https://schema.org", "@type": "JobPosting", "title": "QA Engineer",
               "description": _LONG_DESCRIPTION, "hiringOrganization": {"@type": "Organization", "name": "Acme"},
               "baseSalary": base_salary}
    return (f'<script type="application/ld+json">{json.dumps(posting)}</script>'
            '<script>self.__next_f.push([1,"{\\"filters\\":{\\"employmentTypes\\":\\"Employment type\\"}}"])</script>'
            f'<script>self.__next_f.push([1,"{escaped}"])</script>')


def _jj_type(type_, unit, low, high, currency="PLN", source="original"):
    return {"currency": currency, "from": low, "fromChf": None, "fromEur": None, "fromGbp": None,
            "fromPln": None, "fromUsd": None, "gross": type_ == "permanent", "to": high, "toChf": None,
            "toEur": None, "toGbp": None, "toPln": None, "toUsd": None, "type": type_, "unit": unit,
            "label": type_, "currencySource": source}


def _parse_with(monkeypatch, html, **kwargs):
    monkeypatch.setattr(web_utils, "get_soup", lambda _, timeout=10: BeautifulSoup(html, "html.parser"))
    return web_utils.parse_offer("https://justjoin.it/job-offer/acme-qa-engineer-warszawa-testing", "test", **kwargs)


def test_justjoin_salary_uses_the_offer_employment_type_unit(monkeypatch):
    from job_finder.sources.justjoin import justjoin_salary

    types = [_jj_type("b2b", "hour", 33.7, 36.3, "USD", "conversion"),
             _jj_type("permanent", "month", 12000, 16000),
             _jj_type("b2b", "hour", 130, 140)]
    html = _justjoin_detail(types, {"@type": "MonetaryAmount", "currency": "PLN", "value": {
        "@type": "QuantitativeValue", "unitText": "MONTH", "minValue": 130, "maxValue": 16000}})
    job = _parse_with(monkeypatch, html, salary_parser=justjoin_salary)
    # B2B preferred, the employer's own currency, and that type's own unit.
    assert (job.salary_min, job.salary_max, job.salary_currency, job.salary_period) == (130, 140, "PLN", "hour")


def test_justjoin_daily_and_weekly_units(monkeypatch):
    from job_finder.sources.justjoin import justjoin_salary

    day = _justjoin_detail([_jj_type("b2b", "day", 900, 1100)], None)
    assert justjoin_salary(BeautifulSoup(day, "html.parser")) == (900, 1100, "PLN", "day")
    week = _justjoin_detail([_jj_type("b2b", "week", 3000, 3000)], None)
    assert justjoin_salary(BeautifulSoup(week, "html.parser")) == (13000, 13000, "PLN", "month")


def test_justjoin_hourly_rate_filed_as_month_is_normalized(monkeypatch):
    # The real JellyLabs Tech offer: the board itself says unit "month" for 85–90 PLN.
    from job_finder.sources.justjoin import justjoin_salary

    html = _justjoin_detail([_jj_type("b2b", "month", 85, 90)], {"@type": "MonetaryAmount", "currency": "PLN",
                            "value": {"@type": "QuantitativeValue", "unitText": "MONTH", "minValue": 85, "maxValue": 90}})
    job = _parse_with(monkeypatch, html, salary_parser=justjoin_salary)
    assert (job.salary_min, job.salary_max, job.salary_period) == (85, 90, "hour")


def test_justjoin_undisclosed_salary_is_not_guessed_from_the_text(monkeypatch):
    from job_finder.sources.justjoin import justjoin_salary

    html = _justjoin_detail([_jj_type("b2b", "month", None, None)], None).replace(
        "Playwright.", "Playwright. Pracujemy 16 000 PLN, 8 godzin dziennie.")
    job = _parse_with(monkeypatch, html, salary_parser=justjoin_salary, listing_text="Undisclosed salary")
    assert (job.salary_min, job.salary_max, job.salary_currency, job.salary_period) == (None, None, "", "")


def test_justjoin_source_passes_its_salary_parser(monkeypatch):
    from job_finder.sources import justjoin

    seen = {}

    def fake_batch(offers, name, **kwargs):
        seen.update(kwargs)
        return [], []

    monkeypatch.setattr(justjoin, "get_soup", lambda _: BeautifulSoup("", "html.parser"))
    monkeypatch.setattr(justjoin, "parse_offer_batch", fake_batch)
    JustJoinSource(queries=["https://justjoin.it/job-offers/all-locations/testing"]).fetch()
    assert seen["salary_parser"] is justjoin.justjoin_salary


def _nofluff_detail(original_salary, ld_value):
    import json

    posting = {"@context": "https://schema.org", "@type": "JobPosting", "title": "QA Engineer",
               "description": _LONG_DESCRIPTION, "hiringOrganization": {"@type": "Organization", "name": "Acme"}}
    if ld_value:
        posting["baseSalary"] = {"@type": "MonetaryAmount", "currency": "PLN", "value": ld_value}
    state = {"POSTING": {"id": "acme-qa-engineer-warszawa", "essentials": {"contract": {"start": "ASAP"},
                                                                            "originalSalary": original_salary}},
             "RECOMMENDED": [{"salary": {"from": 21000, "to": 22680, "type": "b2b", "currency": "PLN",
                                         "period": "Month"}}]}
    return (f'<script type="application/ld+json">{json.dumps(posting)}</script>'
            f'<script id="serverApp-state" type="application/json">{json.dumps(state)}</script>')


def test_nofluff_salary_reads_the_range_and_period_from_original_salary(monkeypatch):
    from job_finder.sources.nofluff import nofluff_salary

    # The JSON-LD only carries the top of the range; the state has both ends.
    hourly = _nofluff_detail({"currency": "PLN", "types": {"b2b": {"period": "Hour", "range": [130, 145],
                              "paidHoliday": False}}, "disclosedAt": "VISIBLE"},
                             {"@type": "QuantitativeValue", "value": 145, "unitText": "Hour"})
    job = _parse_with(monkeypatch, hourly, salary_parser=nofluff_salary)
    assert (job.salary_min, job.salary_max, job.salary_currency, job.salary_period) == (130, 145, "PLN", "hour")

    daily = _nofluff_detail({"currency": "PLN", "types": {"b2b": {"period": "Day", "range": [1300, 1520]}},
                             "disclosedAt": "VISIBLE"}, None)
    assert nofluff_salary(BeautifulSoup(daily, "html.parser")) == (1300, 1520, "PLN", "day")

    both = _nofluff_detail({"currency": "PLN", "types": {
        "permanent": {"period": "Month", "range": [12000, 15000]},
        "b2b": {"period": "Month", "range": [16000, 19000]}}, "disclosedAt": "VISIBLE"}, None)
    assert nofluff_salary(BeautifulSoup(both, "html.parser")) == (16000, 19000, "PLN", "month")


def test_nofluff_hidden_salary_is_stored_as_none(monkeypatch):
    from job_finder.sources.nofluff import nofluff_salary

    hidden = _nofluff_detail({"currency": "PLN", "types": {"b2b": {"period": "Hour", "paidHoliday": False}},
                              "disclosedAt": "AT_FIRST_INTERVIEW", "containsSalary": "SALARY_MATCH"}, None)
    job = _parse_with(monkeypatch, hidden, salary_parser=nofluff_salary, listing_text="110 – 115 PLN / godz.")
    assert (job.salary_min, job.salary_max, job.salary_period) == (None, None, "")


def test_nofluff_listing_card_units_are_recognized_without_board_state(monkeypatch):
    from job_finder.sources.nofluff import nofluff_salary

    html = ('<h1>QA Engineer</h1><script type="application/ld+json">{"@type":"JobPosting","title":"QA Engineer",'
            f'"description":"{_LONG_DESCRIPTION}"}}</script>')
    job = _parse_with(monkeypatch, html, salary_parser=nofluff_salary, listing_text="QA Engineer 70 – 95 PLN / godz. SQL")
    assert (job.salary_min, job.salary_max, job.salary_period) == (70, 95, "hour")
