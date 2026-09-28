from .base import JobSource
from .web_utils import get_soup, clean, absolute, parse_offer_batch
from ..models import canonical_job_url


class EldoradoSource(JobSource):
    name = "CzyJestEldorado"
    sensitive = True

    def __init__(self, queries=None):
        # One query only: this search already returns up to 100 results (more
        # than most other sources' single page), and each additional query adds
        # ~100 more detail-page fetches at a site that showed mild rate-limiting
        # under default concurrency — not worth tripling the cold-run cost for
        # a source whose whole point is duplicate/overlap coverage anyway.
        self.queries = queries or [
            "https://czyjesteldorado.pl/search?q=QA",
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
                if "czyjesteldorado.pl/praca/" not in href_l:
                    continue
                # Only numeric-id detail pages qualify; nav/filter links are ignored.
                tail = href_l.rsplit("/praca/", 1)[-1]
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
        # Showed a 429 under default concurrency in testing (and a full 403 on
        # the listing page itself under sustained load) — same treatment as
        # Pracuj.pl and No Fluff Jobs: fully serial with a paced interval.
        jobs, self.errors = parse_offer_batch(offers, self.name, max_workers=1, request_interval=0.75)
        self.candidates = len(offers) + skipped_known
        self.skipped_known = skipped_known
        self.parsed = len(jobs)
        return jobs
