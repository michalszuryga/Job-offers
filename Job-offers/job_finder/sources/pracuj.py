from urllib.parse import unquote

from .base import JobSource
from .web_utils import get_soup, clean, absolute, parse_offer_batch
from ..models import canonical_job_url


class PracujSource(JobSource):
    name = "Pracuj.pl"
    sensitive = True

    def __init__(self, queries=None):
        self.queries = queries or [
            "https://www.pracuj.pl/praca/tester%20-%20qa%20engineer%3Bkw",
            "https://www.pracuj.pl/praca/qa%20tester%3Bkw",
        ]

    def fetch(self, known_urls=None):
        known_urls = known_urls or set()
        self.errors = []
        offers, seen = [], set()
        skipped_known = 0

        for url in self.queries:
            soup = get_soup(url)
            for a in soup.find_all("a", href=True):
                href = absolute(url, a["href"])
                href_l = href.lower()
                if "pracuj.pl/praca/" not in href_l:
                    continue
                # Individual Pracuj offers contain an offer marker and identifier.
                decoded_href = unquote(href_l)
                if ",oferta," not in decoded_href or ";kw" in decoded_href:
                    continue
                title = clean(a.get_text(" ", strip=True))
                if len(title) < 5:
                    continue

                if href in seen:
                    continue
                seen.add(href)
                if canonical_job_url(href) in known_urls:
                    # Already parsed in a previous fetch; skip the detail-page request.
                    # Pracuj.pl is Cloudflare-protected and rate-limits scraping, so
                    # cutting the number of requests matters more here than anywhere else.
                    skipped_known += 1
                    continue
                card = a
                for _ in range(3):
                    if getattr(card, "parent", None):
                        card = card.parent
                offers.append((href, title, clean(card.get_text(" ", strip=True))))
        # Pracuj.pl rate-limits parallel detail-page requests. Keep this source
        # deliberately serial and paced; other sources stay concurrent.
        jobs, self.errors = parse_offer_batch(
            offers, self.name, max_workers=1, request_interval=0.75,
        )
        self.candidates = len(offers) + skipped_known
        self.skipped_known = skipped_known
        self.parsed = len(jobs)
        return [job for job in jobs if any(k in (job.title + " " + job.description).lower() for k in
                                           ["qa", "tester", "quality assurance", "test automation", "software test"])]
