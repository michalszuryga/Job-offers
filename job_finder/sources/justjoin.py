from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

from .base import JobSource
from .web_utils import get_soup, clean, absolute, parse_offer_batch, embedded_json_value, _salary_period
from ..models import canonical_job_url

# JustJoin.IT's listing page only ever renders ~50 offers per request; the site
# genuinely paginates further (?page=2, 3, ...) rather than loading more via
# infinite scroll. A single un-paginated request was silently missing most of
# the category (confirmed: 716+ live offers behind the "testing" query, only
# the first 50 were ever visible to this source).
MAX_PAGES = 10


# Preferred contract when an offer lists several (B2B usually quotes the rate
# the profile cares about); otherwise the board's first listed type.
PREFERRED_EMPLOYMENT_TYPE = "b2b"


def justjoin_salary(soup):
    """Salary from the offer's own `employmentTypes` (the page's embedded
    Next.js data), each with its own `unit` (hour/day/week/month/year).

    The JSON-LD baseSalary is a lossy summary of the same data, and taking
    the unit and range from one employment type keeps them consistent. An
    offer whose types carry no amounts is undisclosed: nothing is guessed
    from the description. JustJoin.IT converts each amount into several
    currencies; only the `original` one is the employer's figure."""
    types = embedded_json_value(str(soup), "employmentTypes", list)
    if types is None:
        return None
    types = [t for t in types if isinstance(t, dict)]
    original = [t for t in types if (t.get("currencySource") or "original") == "original"] or types
    priced = [t for t in original if t.get("from") is not None or t.get("to") is not None]
    if not priced:
        return None, None, "", ""
    chosen = next((t for t in priced if (t.get("type") or "").lower() == PREFERRED_EMPLOYMENT_TYPE), priced[0])
    low, high = chosen.get("from"), chosen.get("to")
    unit = (chosen.get("unit") or "").lower()
    scale = 1.0
    if unit == "week":
        unit, scale = "month", 52 / 12
    try:
        low = float(low) * scale if low is not None else None
        high = float(high) * scale if high is not None else None
    except (TypeError, ValueError):
        return None
    return low, high, (chosen.get("currency") or "").upper(), _salary_period(unit)


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
        jobs, self.errors = parse_offer_batch(offers, self.name, max_workers=15, salary_parser=justjoin_salary)
        self.candidates = len(offers) + skipped_known
        self.skipped_known = skipped_known
        self.parsed = len(jobs)
        return jobs
