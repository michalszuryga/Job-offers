from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import timezone

import requests
from bs4 import BeautifulSoup
from dateutil import parser as date_parser

from .base import JobSource
from .web_utils import HEADERS, clean, absolute, extract_salary, infer_seniority
from ..models import Job, canonical_job_url

LISTING_URL = "https://testdevjobs.com/location/remote-europe/"

# The TestDevJobs page is a niche QA/testing board rendered mostly server-side:
# no JSON-LD, so fields are pulled from its emoji-tagged layout (📍 location,
# 🌐 remote type, 💵 salary, "Tech Stack:" ... "Apply for this job" description).


def _parse_detail(url, source_name):
    response = requests.get(url, headers=HEADERS, timeout=10)
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "html.parser")

    og_title = soup.find("meta", property="og:title")
    title_company = clean(og_title["content"]) if og_title and og_title.get("content") else ""
    title, _, company = title_company.partition(" @ ")
    if not title:
        title = clean(soup.title.get_text()) if soup.title else ""

    lines = [clean(line) for line in soup.get_text("\n", strip=True).split("\n") if clean(line)]

    location = ""
    for i, line in enumerate(lines):
        if line == "📍" and i + 1 < len(lines):
            location = lines[i + 1]
            break

    remote_line = next((line for line in lines if line.startswith("🌐")), "").lower()
    remote = None
    if "on-site" in remote_line:
        remote = False
    elif "hybrid" in remote_line:
        remote = False
    elif "remote" in remote_line:
        remote = True

    published = None
    if "POSTED" in lines:
        idx = lines.index("POSTED")
        if idx + 1 < len(lines):
            try:
                published = date_parser.parse(lines[idx + 1]).replace(tzinfo=timezone.utc)
            except (ValueError, OverflowError):
                published = None

    description = ""
    if "Tech Stack:" in lines:
        tech_idx = lines.index("Tech Stack:")
        try:
            apply_idx = lines.index("Apply for this job", tech_idx + 1)
        except ValueError:
            apply_idx = len(lines)
        description = clean(" ".join(lines[tech_idx + 1:apply_idx]))

    # A thin aggregator stub ("Company is looking for Title") isn't a usable description.
    if not title or len(description) < 80:
        return None

    salary_line = next((line for line in lines if line.startswith("💵")), "")
    salary_min, salary_max, salary_currency, salary_period = extract_salary(salary_line)

    return Job(
        title=title, company=company, url=url, source=source_name,
        description=description, location=location or "Europe", remote=remote,
        contract="", salary_min=salary_min, salary_max=salary_max,
        salary_currency=salary_currency, salary_period=salary_period,
        published_at=published, seniority=infer_seniority(title + " " + description),
    )


class TestDevJobsSource(JobSource):
    __test__ = False  # pytest would otherwise try to collect this as a test class.
    name = "TestDevJobs"

    def __init__(self, listing_url=LISTING_URL):
        self.listing_url = listing_url

    def fetch(self, known_urls=None):
        known_urls = known_urls or set()
        self.errors = []
        response = requests.get(self.listing_url, headers=HEADERS, timeout=20)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")

        links, seen = [], set()
        skipped_known = 0
        for a in soup.find_all("a", href=True):
            href = absolute(self.listing_url, a["href"])
            if "/job/" not in href or href in seen:
                continue
            seen.add(href)
            if canonical_job_url(href) in known_urls:
                # Already parsed in a previous fetch; skip the detail-page request.
                skipped_known += 1
                continue
            links.append(href)
        self.candidates = len(links) + skipped_known
        self.skipped_known = skipped_known

        jobs = []
        with ThreadPoolExecutor(max_workers=5) as executor:
            pending = {executor.submit(_parse_detail, url, self.name): url for url in links}
            for future in as_completed(pending):
                url = pending[future]
                try:
                    job = future.result()
                except Exception as exc:
                    self.errors.append(f"{url}: {type(exc).__name__}: {exc}")
                    continue
                if job is not None:
                    jobs.append(job)
        self.parsed = len(jobs)
        return jobs
