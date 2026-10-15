from .base import JobSource
from .web_utils import get_soup, clean, absolute, parse_offer_batch, embedded_json_value, _salary_period
from ..models import canonical_job_url

# No Fluff Jobs' ?page=N is cumulative (page=3 renders pages 1-3 worth of
# postings in one response, not page 3 alone), unlike JustJoin.IT's true
# pagination. It also becomes unreliable past a certain size: response size
# and link count grew consistently up to page~5 in testing, then dropped
# (an SSR render-budget/timeout truncating the response, not real content
# running out — a genuinely empty tag list looks different). So instead of a
# fixed page count, keep asking for bigger pages while the result keeps
# growing, then use the single largest response that came back intact.
# Capped at 5 (growth plateaued there in testing) rather than the 8 originally
# tried — fewer listing requests, and a smaller candidate pool to fetch detail
# pages for, both reduce the total request volume that triggers rate limiting.
MAX_PAGES = 5


PREFERRED_EMPLOYMENT_TYPE = "b2b"


def nofluff_salary(soup):
    """Salary from the posting's own `originalSalary` in the page's
    serverApp-state: {"currency": "PLN", "types": {"b2b": {"period": "Hour",
    "range": [130, 145]}}}. The JSON-LD only carries the top of the range
    (a single `value`), and the listing card prints "/ godz." / "/ dzień",
    which the text fallback used to miss. A posting whose types have no
    range hides the salary (disclosedAt AT_FIRST_INTERVIEW): store none."""
    state = soup.find("script", id="serverApp-state")
    salary = embedded_json_value(state.string or state.get_text() if state else "", "originalSalary")
    if not salary:
        return None
    types = salary.get("types") or {}
    priced = [(name, spec) for name, spec in types.items()
              if isinstance(spec, dict) and isinstance(spec.get("range"), list) and spec["range"]]
    if not priced:
        return None, None, "", ""
    name, spec = next((item for item in priced if item[0].lower() == PREFERRED_EMPLOYMENT_TYPE), priced[0])
    try:
        amounts = [float(v) for v in spec["range"] if v is not None]
    except (TypeError, ValueError):
        return None
    if not amounts:
        return None, None, "", ""
    return min(amounts), max(amounts), (salary.get("currency") or "").upper(), _salary_period(spec.get("period") or "")


def _with_page(url, page):
    if page == 1:
        return url
    separator = "&" if "?" in url else "?"
    return f"{url}{separator}page={page}"


def _extract_candidates(base_url, soup):
    seen = set()
    candidates = []
    for a in soup.find_all("a", href=True):
        href = absolute(base_url, a.get("href"))
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
        candidates.append((href, title, clean(card.get_text(" ", strip=True))))
    return candidates


class NoFluffSource(JobSource):
    name = "No Fluff Jobs"
    sensitive = True

    def __init__(self, queries=None, max_pages=MAX_PAGES):
        self.queries = queries or [
            "https://nofluffjobs.com/pl/qa",
            "https://nofluffjobs.com/pl/testing",
        ]
        self.max_pages = max_pages

    def fetch(self, known_urls=None):
        known_urls = known_urls or set()
        self.errors = []
        offers = []
        seen = set()
        skipped_known = 0

        for base_url in self.queries:
            best_candidates = []
            for page in range(1, self.max_pages + 1):
                soup = get_soup(_with_page(base_url, page))
                candidates = _extract_candidates(base_url, soup)
                if len(candidates) <= len(best_candidates):
                    # Growth stopped (or the response shrank/truncated); the
                    # previous page already had everything reachable.
                    break
                best_candidates = candidates

            for href, title, text in best_candidates:
                if href in seen:
                    continue
                seen.add(href)
                if canonical_job_url(href) in known_urls:
                    # Already parsed in a previous fetch; skip the detail-page request.
                    skipped_known += 1
                    continue
                offers.append((href, title, text))
        # Unlike JustJoin.IT, No Fluff Jobs is rate-limit sensitive: 15 workers
        # failed outright, and even the default 5 eventually produced a total
        # outage (0/155 parsed) under sustained testing. Match Pracuj.pl's
        # proven-stable pattern — fully serial with a paced interval — trading
        # speed for actually getting results back instead of a wall of 429s.
        jobs, self.errors = parse_offer_batch(offers, self.name, max_workers=1, request_interval=0.75,
                                             salary_parser=nofluff_salary)
        self.candidates = len(offers) + skipped_known
        self.skipped_known = skipped_known
        self.parsed = len(jobs)
        return jobs
