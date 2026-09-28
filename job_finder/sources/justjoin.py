from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

from .base import JobSource
from .web_utils import get_soup, clean, absolute, parse_offer_batch
from ..models import canonical_job_url

# JustJoin.IT's listing page only ever renders ~50 offers per request; the site
# genuinely paginates further (?page=2, 3, ...) rather than loading more via
# infinite scroll. A single un-paginated request was silently missing most of
# the category (confirmed: 716+ live offers behind the "testing" query, only
# the first 50 were ever visible to this source).
MAX_PAGES = 10


def _with_page(url, page):
    if page == 1:
        return url
    parts = urlsplit(url)
    query = dict(parse_qsl(parts.query))
    query["page"] = str(page)
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


class JustJoinSource(JobSource):
    name = "JustJoin.IT"

    def __init__(self, queries=None, max_pages=MAX_PAGES):
        self.queries = queries or [
            "https://justjoin.it/job-offers/all-locations/testing?orderBy=published",
        ]
        self.max_pages = max_pages

    def fetch(self, known_urls=None):
        known_urls = known_urls or set()
        self.errors = []
        offers, seen = [], set()
        skipped_known = 0

        for base_url in self.queries:
            for page in range(1, self.max_pages + 1):
                url = _with_page(base_url, page)
                soup = get_soup(url)
                new_on_this_page = 0
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
                    new_on_this_page += 1
                    if canonical_job_url(href) in known_urls:
                        # Already parsed in a previous fetch; skip the detail-page request.
                        skipped_known += 1
                        continue
                    card = a
                    for _ in range(3):
                        if getattr(card, "parent", None):
                            card = card.parent
                    offers.append((href, title, clean(card.get_text(" ", strip=True))))
                if new_on_this_page == 0:
                    # Empty (or fully duplicate) page: reached the end of this query's results.
                    break
        # Unlike Pracuj.pl, JustJoin.IT showed no rate-limiting or errors under
        # load in testing, so use higher concurrency to keep a cold run (with
        # pagination now pulling several hundred candidates) reasonably fast.
        jobs, self.errors = parse_offer_batch(offers, self.name, max_workers=15)
        self.candidates = len(offers) + skipped_known
        self.skipped_known = skipped_known
        self.parsed = len(jobs)
        return jobs
