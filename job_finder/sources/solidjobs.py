"""Solid.jobs, a Polish IT board with an official public API for aggregators
(solid.jobs/api-ofert-pracy): no key, a `campaign` name for their statistics, up to 300
requests a minute. The whole IT list is a few pages of 500, so it runs in the full
fetches only (11:00 / 18:00), not every 30 minutes.
"""

from datetime import datetime

import requests

from .ats import JSON_HEADERS, _html_text, software_qa_title
from .base import JobSource
from .web_utils import clean, infer_seniority, with_work_mode
from ..models import Job

API_URL = "https://solid.jobs/public-api/offers/IT"
CAMPAIGN = "joffers"
PAGE_SIZE = 500
MAX_PAGES = 6


def _contract(salary):
    kind = ((salary or {}).get("employmentType") or "").lower()
    if "b2b" in kind:
        return "B2B"
    if kind:
        return "employment"
    return ""


class SolidJobsSource(JobSource):
    name = "Solid.jobs"

    def fetch(self, known_urls=None):
        self.errors, self.candidates, self.skipped_known = [], 0, 0
        jobs = []
        page, pages = 0, 1
        while page < min(pages, MAX_PAGES):
            response = requests.get(API_URL, headers=JSON_HEADERS, timeout=60, params={
                "campaign": CAMPAIGN, "pageSize": PAGE_SIZE, "pageIndex": page})
            response.raise_for_status()
            data = response.json()
            pages = int(data.get("totalPages") or 1)
            entries = data.get("jobs") or []
            self.candidates += len(entries)
            jobs.extend(job for job in map(self._job, entries) if job)
            page += 1
        self.parsed = len(jobs)
        return jobs

    def _job(self, entry):
        title = clean(entry.get("title") or "")
        if entry.get("category") != "Tester" and not software_qa_title(title):
            return None
        location = ", ".join(clean(c) for c in entry.get("locations") or [] if c)
        if entry.get("isRemote"):
            location = with_work_mode(location, "remote")
        if entry.get("isHybrid"):
            location = with_work_mode(location, "hybrid")
        if not entry.get("isRemote") and not entry.get("isHybrid"):
            location = with_work_mode(location, "office")
        salary = entry.get("salary") or {}
        try:
            published = datetime.fromisoformat(entry.get("validFrom") or "")
        except ValueError:
            published = None
        skills = ", ".join(clean(s.get("name") or "") for s in entry.get("skills") or [] if isinstance(s, dict))
        description = " ".join(filter(None, (_html_text(entry.get("description")),
                                             f"Skills: {skills}" if skills else "")))
        return Job(
            title=title,
            company=clean(entry.get("company") or ""),
            url=entry.get("url") or "",
            source=self.name,
            description=description,
            location=location,
            remote=bool(entry.get("isRemote")) and not entry.get("isHybrid"),
            contract=_contract(salary),
            salary_min=salary.get("from"),
            salary_max=salary.get("to"),
            salary_currency=salary.get("currency") or "",
            salary_period=salary.get("period") or "",
            seniority=(entry.get("experienceLevel") or infer_seniority(title)).lower(),
            published_at=published,
        )
