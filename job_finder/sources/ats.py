"""Companies' own applicant-tracking systems (ATS), read through the public JSON
their career pages load. Mainly IT contractors that staff EU institutions and
agencies (European Dynamics, SEIDOR, ARHS, ...) and post there, not on boards.

One source per ATS, not per company: the companies come from
config/companies.yaml, and one company failing is recorded in `errors` while
the others still load.
"""

import re
from datetime import datetime, timezone
from pathlib import Path

import requests
import yaml
from bs4 import BeautifulSoup

from .base import JobSource
from .web_utils import HEADERS, clean, infer_seniority, looks_like_qa_role
from ..models import Job, canonical_job_url

COMPANIES_PATH = "config/companies.yaml"
JSON_HEADERS = {**HEADERS, "Accept": "application/json"}

# Contractors write the work mode into the title ("IS Tester - Far site - Brussels",
# "Test Engineer | Remotely from Europe"). "Far site" means working from home.
_TITLE_REMOTE = re.compile(r"far[\s-]?site|remote|remotely|telework|home[\s-]?based|anywhere in (?:the )?eu", re.I)
_TITLE_NOT_REMOTE = re.compile(r"near[\s-]?site|on[\s-]?site|onsite|hybrid", re.I)


def load_companies(ats, path=COMPANIES_PATH):
    try:
        with Path(path).open(encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
    except FileNotFoundError:
        return []
    return data.get(ats) or []


def ats_remote(title, structured):
    """A remote phrase in the title wins (it is the contractor's own wording),
    then a near-site/on-site phrase, then the ATS's own remote field."""
    if _TITLE_REMOTE.search(title or ""):
        return True
    if _TITLE_NOT_REMOTE.search(title or ""):
        return False
    return structured


def _contract(label):
    label = (label or "").lower()
    if any(word in label for word in ("contract", "freelance")):
        return "contractor"
    if any(word in label for word in ("full-time", "full time", "permanent", "part-time")):
        return "employment"
    return ""


def _html_text(html):
    return clean(BeautifulSoup(html or "", "html.parser").get_text(" ", strip=True))


def _location(*parts):
    return ", ".join(p for p in (clean(str(x or "")) for x in parts) if p)


def _remote_first(jobs):
    # The same title posted for several cities (one remote, others onsite) shares
    # a dedup key; keep the remote copy, since the first one stored wins.
    return sorted(jobs, key=lambda job: job.remote is not True)


class _ATSSource(JobSource):
    ats = ""
    tier = "fast"

    def __init__(self, companies=None, companies_path=COMPANIES_PATH):
        self.companies = companies if companies is not None else load_companies(self.ats, companies_path)

    def fetch(self, known_urls=None):
        known_urls = known_urls or set()
        self.errors, self.candidates, self.skipped_known = [], 0, 0
        jobs = []
        for company in self.companies:
            try:
                jobs.extend(self.fetch_company(company, known_urls))
            except Exception as exc:  # one company down must not hide the others
                self.errors.append(f"{company.get('name')}: {type(exc).__name__}: {exc}")
        self.parsed = len(jobs)
        return _remote_first(jobs)

    def fetch_company(self, company, known_urls):
        raise NotImplementedError


class WorkableSource(_ATSSource):
    name = "Workable"
    ats = "workable"
    url = "https://apply.workable.com/api/v1/widget/accounts/{slug}?details=true"

    def fetch_company(self, company, known_urls):
        # One request per company: with details=true the listing carries descriptions.
        response = requests.get(self.url.format(slug=company["slug"]), headers=JSON_HEADERS, timeout=30)
        response.raise_for_status()
        entries = response.json().get("jobs") or []
        self.candidates += len(entries)
        jobs = []
        for entry in entries:
            title = clean(entry.get("title") or "")
            if not looks_like_qa_role(title):
                continue
            telecommuting = str(entry.get("telecommuting")).lower() == "true"
            try:
                published = datetime.fromisoformat(entry["published_on"]).replace(tzinfo=timezone.utc)
            except (KeyError, TypeError, ValueError):
                published = None
            description = _html_text(entry.get("description"))
            jobs.append(Job(
                title=title,
                company=company["name"],
                url=entry.get("shortlink") or entry.get("url") or "",
                source=self.name,
                description=description,
                location=_location(entry.get("city"), entry.get("country")) + (" (remote)" if telecommuting else ""),
                remote=ats_remote(title, telecommuting),
                contract=_contract(entry.get("employment_type")),
                published_at=published,
                seniority=infer_seniority(title + " " + description),
            ))
        return jobs


class SmartRecruitersSource(_ATSSource):
    name = "SmartRecruiters"
    ats = "smartrecruiters"
    list_url = "https://api.smartrecruiters.com/v1/companies/{slug}/postings"
    detail_url = "https://api.smartrecruiters.com/v1/companies/{slug}/postings/{id}"
    page_size = 100

    def _postings(self, slug):
        offset = 0
        while True:
            response = requests.get(self.list_url.format(slug=slug), headers=JSON_HEADERS, timeout=30,
                                    params={"limit": self.page_size, "offset": offset})
            response.raise_for_status()
            data = response.json()
            content = data.get("content") or []
            yield from content
            offset += self.page_size
            if not content or offset >= (data.get("totalFound") or 0):
                return

    def fetch_company(self, company, known_urls):
        slug = company["slug"]
        jobs = []
        for posting in self._postings(slug):
            self.candidates += 1
            title = clean(posting.get("name") or "")
            if not looks_like_qa_role(title):
                continue
            location = posting.get("location") or {}
            structured = True if location.get("remote") else False
            remote = ats_remote(title, structured)
            url = f"https://jobs.smartrecruiters.com/{slug}/{posting.get('id')}"
            if canonical_job_url(url) in known_urls:
                self.skipped_known += 1
                continue
            description = ""
            if remote:
                # Detail calls only for offers that can pass the remote-only filter.
                detail = requests.get(self.detail_url.format(slug=slug, id=posting.get("id")),
                                      headers=JSON_HEADERS, timeout=30)
                detail.raise_for_status()
                sections = ((detail.json().get("jobAd") or {}).get("sections") or {}).values()
                description = " ".join(_html_text(s.get("text")) for s in sections if isinstance(s, dict))
            try:
                published = datetime.fromisoformat(str(posting.get("releasedDate")).replace("Z", "+00:00"))
            except ValueError:
                published = None
            jobs.append(Job(
                title=title,
                company=company["name"],
                url=url,
                source=self.name,
                description=description,
                location=location.get("fullLocation") or _location(location.get("city"), location.get("country")),
                remote=remote,
                contract=_contract((posting.get("typeOfEmployment") or {}).get("label")),
                published_at=published,
                seniority=infer_seniority(title + " " + description),
            ))
        return jobs


class TalentClueSource(_ATSSource):
    name = "TalentClue"
    ats = "talentclue"
    # What the company's TalentClue career page widget loads its job list from.
    url = "https://api.talentclue.com/jswidget-ajax/jswidget/jobs/{client_id}"
    _MODALITY = {"remote": True, "hybrid": False, "on site": False}

    def fetch_company(self, company, known_urls):
        response = requests.post(self.url.format(client_id=company["client_id"]), json={}, timeout=30,
                                 headers={**JSON_HEADERS, "X-Requested-With": "XMLHttpRequest"})
        response.raise_for_status()
        entries = list((response.json().get("jobs") or {}).values())
        self.candidates += len(entries)
        jobs = []
        for entry in entries:
            if str(entry.get("is_archived")) == "1":
                continue
            title = clean(entry.get("title") or "")
            if not looks_like_qa_role(title):
                continue
            url = entry.get("url") or ""
            if canonical_job_url(url) in known_urls:
                self.skipped_known += 1
                continue
            modality = clean(entry.get("work_modality") or "").lower()
            remote = ats_remote(title, self._MODALITY.get(modality))
            description = self._description(url) if remote else ""
            try:
                published = datetime.fromtimestamp(int(entry["post_date_timestamp"]), tz=timezone.utc)
            except (KeyError, TypeError, ValueError):
                published = None
            jobs.append(Job(
                title=title,
                company=company["name"],
                url=url,
                source=self.name,
                description=description,
                location=_location(entry.get("city"), entry.get("country_label"))
                + (f" ({entry.get('work_modality')})" if entry.get("work_modality") else ""),
                remote=remote,
                contract=_contract(entry.get("contract_label")),
                published_at=published,
                seniority=infer_seniority(title + " " + description),
            ))
        return jobs

    def _description(self, url):
        response = requests.get(url, headers=HEADERS, timeout=30)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        body = soup.select_one(".job-page__content--left") or soup.select_one(".job-description") or soup.body
        return clean(body.get_text(" ", strip=True)) if body else ""


# The search spans every trade on Workable, so the loose looks_like_qa_role() lets in
# "Physician - Put Medical AI to the Test" and "Data Quality Reviewer": software QA only.
_SOFTWARE_QA_TITLE = re.compile(
    r"\b(?:qa|tester|sdet|quality\s+(?:assurance|engineer)|test(?:ing)?\s+(?:engineer|analyst|automation|lead|manager|specialist))\b",
    re.I,
)
_NOT_SOFTWARE_QA = re.compile(r"physician|doctor|nurse|study\s+tester|usability|data\s+quality|annotat|reviewer|trainer", re.I)


def software_qa_title(title):
    return bool(_SOFTWARE_QA_TITLE.search(title or "")) and not _NOT_SOFTWARE_QA.search(title or "")


class WorkableSearchSource(JobSource):
    """Workable's public job search (jobs.workable.com): every company on Workable at once,
    not only the ones in companies.yaml. Remote QA offers open to Poland, newest first."""
    name = "Workable (search)"
    tier = "fast"
    url = "https://jobs.workable.com/api/v1/jobs"
    queries = ("QA", "tester", "test engineer", "quality assurance")

    def __init__(self, queries=None, location="Poland"):
        self.queries = tuple(queries or self.queries)
        self.location = location

    def fetch(self, known_urls=None):
        self.errors, self.candidates = [], 0
        jobs, seen = [], set()
        for query in self.queries:
            try:
                response = requests.get(self.url, headers=JSON_HEADERS, timeout=30, params={
                    "query": query, "location": self.location, "workplace": "remote"})
                response.raise_for_status()
                entries = response.json().get("jobs") or []
            except Exception as exc:  # one query down must not hide the others
                self.errors.append(f"{query}: {type(exc).__name__}: {exc}")
                continue
            self.candidates += len(entries)
            for entry in entries:
                job = self._job(entry)
                if job and job.url not in seen:
                    seen.add(job.url)
                    jobs.append(job)
        if len(self.errors) == len(self.queries):
            raise RuntimeError(self.errors[0])
        self.skipped_known = 0
        self.parsed = len(jobs)
        return jobs

    def _job(self, entry):
        title = clean(entry.get("title") or "")
        if not software_qa_title(title) or entry.get("state", "published") != "published":
            return None
        workplace = (entry.get("workplace") or "").lower()
        place = entry.get("location") or {}
        city = _location(place.get("city"), place.get("countryName"))
        try:
            published = datetime.fromisoformat(str(entry.get("created")).replace("Z", "+00:00"))
        except ValueError:
            published = None
        description = " ".join(filter(None, (_html_text(entry.get(key)) for key in
                                             ("description", "requirementsSection", "benefitsSection"))))
        return Job(
            title=title,
            company=clean((entry.get("company") or {}).get("title") or ""),
            url=entry.get("url") or "",
            source=self.name,
            description=description,
            location=("Remote · " if workplace == "remote" else f"{workplace.replace('_', ' ').title()} · " if workplace else "") + city,
            remote=ats_remote(title, workplace == "remote"),
            contract=_contract(entry.get("employmentType")),
            published_at=published,
            seniority=infer_seniority(title + " " + description),
        )
