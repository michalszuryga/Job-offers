"""Himalayas (himalayas.app), a remote-only job board with a public JSON API.

Terms (himalayas.app/api): link back to the offer on Himalayas and name it as the source —
the stored URL is the Himalayas page and the source is "Himalayas". robots.txt forbids
paging search results, so each query reads its first page only, newest first; a full
fetch (11:00 / 18:00) is enough, so this stays out of the every-30-minutes tier.
"""

from datetime import datetime, timezone

import requests

from .ats import JSON_HEADERS, _contract, _html_text, software_qa_title
from .base import JobSource
from .web_utils import clean, with_work_mode
from ..models import Job

SEARCH_URL = "https://himalayas.app/jobs/api/search"
QUERIES = ("QA", "tester", "test engineer", "SDET", "quality assurance", "test automation")


def _location(restrictions):
    """The countries the offer is open to, short enough to read: the search asks for
    Poland, so the list either has it or is empty (anywhere)."""
    countries = [clean(c) for c in restrictions or [] if c]
    if not countries:
        return "Worldwide"
    if len(countries) <= 3:
        return ", ".join(countries)
    named = "Poland" if "Poland" in countries else countries[0]
    return f"{named} + {len(countries) - 1} more countries"


class HimalayasSource(JobSource):
    name = "Himalayas"

    def __init__(self, queries=QUERIES, country="Poland"):
        self.queries = tuple(queries)
        self.country = country

    def fetch(self, known_urls=None):
        self.errors, self.candidates, self.skipped_known = [], 0, 0
        jobs, seen = [], set()
        for query in self.queries:
            try:
                response = requests.get(SEARCH_URL, headers=JSON_HEADERS, timeout=30,
                                        params={"q": query, "country": self.country, "sort": "recent"})
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
        if self.queries and len(self.errors) == len(self.queries):
            raise RuntimeError(self.errors[0])
        self.parsed = len(jobs)
        return jobs

    def _job(self, entry):
        title = clean(entry.get("title") or "")
        if not software_qa_title(title):
            return None
        try:
            published = datetime.fromtimestamp(int(entry.get("pubDate")), tz=timezone.utc)
        except (TypeError, ValueError):
            published = None
        seniority = entry.get("seniority") or []
        return Job(
            title=title,
            company=clean(entry.get("companyName") or ""),
            url=entry.get("guid") or (entry.get("applicationLink") or "").split("?")[0],
            source=self.name,
            description=_html_text(entry.get("description")) or clean(entry.get("excerpt") or ""),
            location=with_work_mode(_location(entry.get("locationRestrictions")), "remote"),
            remote=True,
            contract=_contract(entry.get("employmentType")),
            salary_min=entry.get("minSalary"),
            salary_max=entry.get("maxSalary"),
            salary_currency=(entry.get("currency") or "") if entry.get("minSalary") or entry.get("maxSalary") else "",
            salary_period=entry.get("salaryPeriod") or "",
            seniority=(seniority[0] if isinstance(seniority, list) and seniority else str(seniority or "")).lower(),
            published_at=published,
        )
