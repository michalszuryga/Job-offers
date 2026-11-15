"""ATS sources, with payloads trimmed from real responses (2026-11-04)."""

from job_finder.notify import build_summary, is_eu_institution
from job_finder.sources import ats
from job_finder.sources.ats import SmartRecruitersSource, TalentClueSource, WorkableSource, ats_remote, load_companies


class _Response:
    def __init__(self, json_data=None, text=""):
        self._json, self.text = json_data, text

    def raise_for_status(self):
        pass

    def json(self):
        return self._json


def test_title_wording_beats_the_structured_remote_field():
    assert ats_remote("IS tester - Far site - Brussels (Remote work allowed anywhere in EU territory)", False)
    assert ats_remote("Test Engineer senior l EU Institutions Project l Remotely from Europe", None)
    assert ats_remote("Test Expert - Warsaw - Near site", True) is False
    assert ats_remote("Java Developer Senior - On site - Brussels", None) is False
    assert ats_remote("Test Analyst", True) is True
    assert ats_remote("Test Analyst", None) is None


def test_companies_yaml_lists_each_ats():
    assert {"name": "European Dynamics", "slug": "european-dynamics"} in load_companies("workable")
    assert load_companies("talentclue")[0]["name"] == "SEIDOR"
    assert load_companies("workable", path="does/not/exist.yaml") == []


def test_workable_keeps_qa_titles_with_telecommuting_flag(monkeypatch):
    payload = {"name": "EUROPEAN DYNAMICS", "jobs": [
        {"title": "QA Engineer - Automation & Manual (Remote/Thessaloniki)", "telecommuting": "True",
         "shortlink": "https://apply.workable.com/j/F777325D76", "published_on": "2026-11-02",
         "country": "Greece", "city": "Thessaloniki", "employment_type": "Full-time",
         "description": "<p>QA for <strong>European Commission</strong> projects, REST API, SQL.</p>"},
        {"title": "IT System Analyst / Tester (Crete)", "telecommuting": "False",
         "shortlink": "https://apply.workable.com/j/B004A9EFE6", "published_on": "2026-11-02",
         "country": "Greece", "city": "Heraklion", "description": ""},
        {"title": "Senior Java Developer", "telecommuting": "True",
         "shortlink": "https://apply.workable.com/j/X", "published_on": "2026-11-02"},
    ]}
    calls = []
    monkeypatch.setattr(ats.requests, "get", lambda url, **k: calls.append(url) or _Response(payload))
    source = WorkableSource(companies=[{"name": "European Dynamics", "slug": "european-dynamics"}])
    jobs = source.fetch()

    assert calls == ["https://apply.workable.com/api/v1/widget/accounts/european-dynamics?details=true"]
    assert source.candidates == 3 and source.parsed == 2
    remote, onsite = jobs  # remote first
    assert remote.remote is True and remote.company == "European Dynamics"
    assert remote.location == "Thessaloniki, Greece (remote)"
    assert remote.contract == "employment"
    assert "European Commission" in remote.description
    assert remote.published_at.isoformat() == "2026-11-02T00:00:00+00:00"
    assert onsite.remote is False


def test_smartrecruiters_pages_and_fetches_detail_only_for_remote_unknown(monkeypatch):
    pages = {
        0: {"totalFound": 3, "content": [
            {"id": "1", "name": "Test Specialist", "releasedDate": "2026-10-14T08:27:16.468Z",
             "location": {"fullLocation": "Warsaw, Poland", "remote": False, "hybrid": True},
             "typeOfEmployment": {"label": "Full-time"}},
            {"id": "2", "name": "QA Engineer (Remote, EU)", "releasedDate": "2026-11-01T08:00:00Z",
             "location": {"fullLocation": "Luxembourg", "remote": False}},
        ]},
        2: {"totalFound": 3, "content": [
            {"id": "3", "name": "Test Automation Engineer", "releasedDate": "2026-11-02T08:00:00Z",
             "location": {"fullLocation": "Sofia, Bulgaria", "remote": True}},
        ]},
    }
    detail = {"jobAd": {"sections": {"jobDescription": {"text": "<p>Testing for EU institutions.</p>"}}}}
    calls = []

    def fake_get(url, params=None, **kwargs):
        calls.append(url)
        if params is not None:
            return _Response(pages[params["offset"]])
        return _Response(detail)

    monkeypatch.setattr(ats.requests, "get", fake_get)
    source = SmartRecruitersSource(companies=[{"name": "ARHS Group", "slug": "ARHS"}])
    source.page_size = 2
    known = {"https://jobs.smartrecruiters.com/ARHS/3"}
    jobs = source.fetch(known_urls=known)

    assert source.candidates == 3 and source.skipped_known == 1
    assert [j.title for j in jobs] == ["QA Engineer (Remote, EU)", "Test Specialist"]
    assert jobs[0].remote is True and "EU institutions" in jobs[0].description
    assert jobs[1].remote is False and jobs[1].description == ""
    assert sum("/postings/" in c for c in calls) == 1  # only the remote, unknown one


def test_talentclue_reads_widget_jobs_and_work_modality(monkeypatch):
    payload = {"jobs": {
        "130000001": {"url": "https://seidor.talentclue.com/en/node/130000001/4590",
                      "title": "Test Engineer senior l EU Institutions Project l Remotely from Europe ",
                      "post_date_timestamp": "1793782844", "city": "Luxembourg", "country_label": "Luxembourg",
                      "work_modality": "Remote", "contract_label": "Contractor/Freelance", "is_archived": "0"},
        "122493488": {"url": "https://seidor.talentclue.com/node/122493488/445",
                      "title": "Senior Test Management Specialist - Strasbourg - Near Site - EU-LISA",
                      "post_date_timestamp": "1769500000", "city": "Strasbourg", "country_label": "France",
                      "work_modality": "On site", "contract_label": "Contractor/Freelance", "is_archived": "0"},
        "130000002": {"url": "https://seidor.talentclue.com/en/node/130000002/4590",
                      "title": "Angular Developer Senior - Far site (Remote) - Brussels",
                      "post_date_timestamp": "1793782844", "work_modality": "Remote", "is_archived": "0"},
    }}
    page = ('<html><body><div class="job-page__content--left"><h2>Job description</h2>'
            '<p>Manual testing for the European Investment Bank. SQL, Jira.</p></div></body></html>')
    posts, gets = [], []
    monkeypatch.setattr(ats.requests, "post", lambda url, **k: posts.append(url) or _Response(payload))
    monkeypatch.setattr(ats.requests, "get", lambda url, **k: gets.append(url) or _Response(text=page))
    source = TalentClueSource(companies=[{"name": "SEIDOR", "client_id": "abc"}])
    jobs = source.fetch()

    assert posts == ["https://api.talentclue.com/jswidget-ajax/jswidget/jobs/abc"]
    assert source.candidates == 3 and len(jobs) == 2
    remote, near = jobs
    assert remote.remote is True and remote.contract == "contractor"
    assert remote.title.endswith("Remotely from Europe")
    assert "European Investment Bank" in remote.description
    assert remote.location == "Luxembourg, Luxembourg (Remote)"
    assert near.remote is False
    assert gets == ["https://seidor.talentclue.com/en/node/130000001/4590"]


def test_one_failing_company_is_recorded_and_others_still_load(monkeypatch):
    def fake_get(url, **kwargs):
        if "broken" in url:
            raise ats.requests.ConnectionError("reset")
        return _Response({"jobs": [{"title": "QA Tester", "telecommuting": "True",
                                    "shortlink": "https://apply.workable.com/j/OK"}]})

    monkeypatch.setattr(ats.requests, "get", fake_get)
    source = WorkableSource(companies=[{"name": "Broken", "slug": "broken"}, {"name": "Fine", "slug": "fine"}])
    jobs = source.fetch()
    assert [j.company for j in jobs] == ["Fine"]
    assert source.errors and source.errors[0].startswith("Broken: ConnectionError")


def test_summary_puts_eu_institution_offers_first_with_a_flag():
    rows = [
        {"title": "QA Engineer", "company": "Acme", "score": 80, "url": "https://a"},
        {"title": "IS Tester - Far site", "company": "SEIDOR", "score": 60, "url": "https://b",
         "description": "Project for the European Commission"},
    ]
    assert is_eu_institution(rows[1]) and not is_eu_institution(rows[0])
    subject, text, html = build_summary(rows, None)
    assert subject == "JOffers: 2 nowe oferty · 🇪🇺 1 UE · 80 pkt QA Engineer — Acme"
    assert text.splitlines()[0].startswith("1. 60 pkt · 🇪🇺 IS Tester - Far site — SEIDOR")
    assert "🇪🇺 IS Tester" in html
