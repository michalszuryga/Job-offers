from ..models import Job
from .base import JobSource
from .web_utils import (
    get_soup, clean, absolute, infer_remote, infer_seniority,
    extract_salary, parse_date
)


class NoFluffSource(JobSource):
    name = "No Fluff Jobs"

    def __init__(self, queries=None):
        self.queries = queries or [
            "https://nofluffjobs.com/pl/qa",
            "https://nofluffjobs.com/pl/testing",
        ]

    def fetch(self):
        jobs = []
        seen = set()

        for url in self.queries:
            soup = get_soup(url)
            for a in soup.find_all("a", href=True):
                href = absolute(url, a.get("href"))
                href_l = href.lower()
                if "nofluffjobs.com" not in href_l:
                    continue
                if "/job/" not in href_l:
                    continue
                # Search/listing pages are not job records.
                if href_l.rstrip("/").endswith(("/qa", "/testing", "/job")):
                    continue

                title = clean(a.get_text(" ", strip=True))
                if len(title) < 4 or title.lower() in {"apply", "save", "see more offers"}:
                    continue

                parent = a
                for _ in range(5):
                    parent = getattr(parent, "parent", parent)
                text = clean(parent.get_text(" ", strip=True))

                if href in seen:
                    continue
                seen.add(href)

                salary_min, salary_max = extract_salary(text)
                published = parse_date(next(
                    (s for s in parent.stripped_strings if "2026" in s or "2025" in s),
                    None
                ))

                jobs.append(Job(
                    title=title,
                    company="",
                    url=href,
                    source=self.name,
                    description=text,
                    location=text[:250],
                    remote=infer_remote(text),
                    contract="",
                    salary_min=salary_min,
                    salary_max=salary_max,
                    salary_currency="PLN",
                    seniority=infer_seniority(text),
                    published_at=published,
                ))
        return jobs
