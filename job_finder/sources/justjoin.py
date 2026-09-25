from .base import JobSource
from .web_utils import get_soup, clean, absolute, parse_offer_batch


class JustJoinSource(JobSource):
    name = "JustJoin.IT"

    def __init__(self, queries=None):
        self.queries = queries or [
            "https://justjoin.it/job-offers/all-locations/testing?orderBy=published",
        ]

    def fetch(self):
        self.errors = []
        offers, seen = [], set()

        for url in self.queries:
            soup = get_soup(url)
            for a in soup.find_all("a", href=True):
                href = absolute(url, a["href"])
                if "justjoin.it/job-offer/" not in href.lower():
                    continue

                title = clean(a.get_text(" ", strip=True))
                if len(title) < 5 or title.lower() in {"apply", "save"}:
                    continue

                if href in seen:
                    continue
                seen.add(href)
                offers.append((href, title))
        jobs, self.errors = parse_offer_batch(offers, self.name)
        return jobs
