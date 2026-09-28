from .base import JobSource
from .web_utils import get_soup, clean, absolute, parse_offer_batch
from ..models import canonical_job_url


class BulldogJobSource(JobSource):
    name = "Bulldogjob"

    def __init__(self, queries=None):
        self.queries = queries or [
            "https://bulldogjob.pl/companies/jobs/s/role,automation_tester,qa",
            "https://bulldogjob.pl/companies/jobs/s/skills,QA",
        ]

    def fetch(self, known_urls=None):
        known_urls = known_urls or set()
        self.errors = []
        offers = []
        seen = set()
        skipped_known = 0

        for url in self.queries:
            soup = get_soup(url)
            for a in soup.find_all("a", href=True):
                href = absolute(url, a.get("href"))
                href_l = href.lower()
                if "bulldogjob.pl/companies/jobs/" not in href_l:
                    continue
                # Only numeric-id detail pages qualify; listing/filter/search links are ignored.
                tail = href_l.rsplit("/companies/jobs/", 1)[-1]
                if not tail[:1].isdigit():
                    continue

                title = clean(a.get_text(" ", strip=True))
                if len(title) < 4:
                    continue

                if href in seen:
                    continue
                seen.add(href)
                if canonical_job_url(href) in known_urls:
                    # Already parsed in a previous fetch; skip the detail-page request.
                    skipped_known += 1
                    continue
                card = a
                for _ in range(3):
                    if getattr(card, "parent", None):
                        card = card.parent
                offers.append((href, title, clean(card.get_text(" ", strip=True))))
        jobs, self.errors = parse_offer_batch(offers, self.name)
        self.candidates = len(offers) + skipped_known
        self.skipped_known = skipped_known
        self.parsed = len(jobs)
        return jobs
