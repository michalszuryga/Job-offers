from urllib.parse import unquote

from .base import JobSource
from .web_utils import get_soup, clean, absolute, parse_offer_batch


class PracujSource(JobSource):
    name = "Pracuj.pl"

    def __init__(self, queries=None):
        self.queries = queries or [
            "https://www.pracuj.pl/praca/tester%20-%20qa%20engineer%3Bkw",
            "https://www.pracuj.pl/praca/qa%20tester%3Bkw",
        ]

    def fetch(self):
        self.errors = []
        offers, seen = [], set()

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
                offers.append((href, title))
        jobs, self.errors = parse_offer_batch(offers, self.name)
        return [job for job in jobs if any(k in (job.title + " " + job.description).lower() for k in
                                           ["qa", "tester", "quality assurance", "test automation", "software test"])]
