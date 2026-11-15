from urllib.parse import unquote

from .base import JobSource
from .web_utils import get_soup, clean, absolute, parse_offer_batch
from ..models import canonical_job_url


def work_modes(soup):
    """The offer's work modes as Pracuj labels them, e.g. "praca zdalna, praca hybrydowa".
    Not in the JSON-LD description, so before this every Pracuj offer looked non-remote."""
    labels = []
    for item in soup.select('[data-test^="sections-benefit-work-modes"]'):
        badge = item.select_one('[data-test="offer-badge-title"]')
        text = clean((badge or item).get_text(" ", strip=True))
        if text and text not in labels:
            labels.append(text)
    return ", ".join(labels)


class PracujSource(JobSource):
    name = "Pracuj.pl"
    sensitive = True

    # wm=home-office: only offers with "praca zdalna" among their work modes (Pracuj's own
    # filter). Without it the listing was mostly office/hybrid offers, every one rejected.
    # A few listing pages each; known offers cost nothing, only new ones get a detail request.
    pages = 3

    def __init__(self, queries=None):
        self.queries = queries or [
            "https://www.pracuj.pl/praca/tester%20-%20qa%20engineer%3Bkw?wm=home-office",
            "https://www.pracuj.pl/praca/qa%20tester%3Bkw?wm=home-office",
        ]

    def _listing_urls(self):
        for url in self.queries:
            yield url
            for page in range(2, self.pages + 1):
                yield f"{url}{'&' if '?' in url else '?'}pn={page}"

    def fetch(self, known_urls=None):
        known_urls = known_urls or set()
        self.errors = []
        offers, seen = [], set()
        skipped_known = 0

        for url in self._listing_urls():
            try:
                soup = get_soup(url)
            except Exception as exc:
                # A missing later page must not throw away the first page's offers.
                if url in self.queries:
                    raise
                self.errors.append(f"{url}: {type(exc).__name__}")
                break
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
        jobs, errors = parse_offer_batch(
            offers, self.name, max_workers=1, request_interval=0.75, work_modes_parser=work_modes,
        )
        self.errors += errors
        self.candidates = len(offers) + skipped_known
        self.skipped_known = skipped_known
        self.parsed = len(jobs)
        return [job for job in jobs if any(k in (job.title + " " + job.description).lower() for k in
                                           ["qa", "tester", "quality assurance", "test automation", "software test"])]
