from .base import JobSource
from .web_utils import get_soup, clean, absolute, parse_offer_batch


class NoFluffSource(JobSource):
    name = "No Fluff Jobs"

    def __init__(self, queries=None):
        self.queries = queries or [
            "https://nofluffjobs.com/pl/qa",
            "https://nofluffjobs.com/pl/testing",
        ]

    def fetch(self):
        self.errors = []
        offers = []
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
                # Only detail URLs qualify. Listing page anchors are ignored.
                if href_l.rstrip("/").endswith(("/qa", "/testing", "/job")) or href_l.count("/") < 4:
                    continue

                title = clean(a.get_text(" ", strip=True))
                if len(title) < 4 or title.lower() in {"apply", "save", "see more offers"}:
                    continue

                if href in seen:
                    continue
                seen.add(href)
                card = a
                for _ in range(3):
                    if getattr(card, "parent", None):
                        card = card.parent
                offers.append((href, title, clean(card.get_text(" ", strip=True))))
        jobs, self.errors = parse_offer_batch(offers, self.name)
        self.candidates = len(offers)
        self.parsed = len(jobs)
        return jobs
