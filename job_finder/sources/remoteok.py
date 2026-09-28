from datetime import datetime

import requests
from bs4 import BeautifulSoup

from .base import JobSource
from .web_utils import HEADERS, clean, infer_remote, infer_seniority, looks_like_qa_role
from ..models import Job

API_URL = "https://remoteok.com/api"


class RemoteOKSource(JobSource):
    name = "RemoteOK"

    def __init__(self, api_url=API_URL):
        self.api_url = api_url

    def fetch(self, known_urls=None):
        # No per-offer detail fetch here (the listing already carries the full
        # description), so there is nothing to save by skipping known URLs.
        self.errors = []
        response = requests.get(self.api_url, headers=HEADERS, timeout=20)
        response.raise_for_status()
        entries = [item for item in response.json() if isinstance(item, dict) and item.get("position")]
        self.candidates = len(entries)

        jobs = []
        for entry in entries:
            title = clean(entry.get("position") or "")
            if not looks_like_qa_role(title):
                continue
            description = clean(BeautifulSoup(entry.get("description") or "", "html.parser").get_text(" ", strip=True))
            location = clean(entry.get("location") or "") or "Remote"
            remote = infer_remote(" ".join((title, description, location)))
            if remote is None:
                remote = True  # RemoteOK only lists remote roles.
            salary_min, salary_max = entry.get("salary_min") or None, entry.get("salary_max") or None
            try:
                published = datetime.fromisoformat(str(entry.get("date")).replace("Z", "+00:00"))
            except (TypeError, ValueError):
                published = None
            jobs.append(Job(
                title=title,
                company=clean(entry.get("company") or ""),
                url=entry.get("url") or entry.get("apply_url") or "",
                source=self.name,
                description=description,
                location=location,
                remote=remote,
                contract="",
                salary_min=float(salary_min) if salary_min else None,
                salary_max=float(salary_max) if salary_max else None,
                salary_currency="USD" if (salary_min or salary_max) else "",
                salary_period="year" if (salary_min or salary_max) else "",
                published_at=published,
                seniority=infer_seniority(title + " " + description),
            ))
        self.parsed = len(jobs)
        return jobs
