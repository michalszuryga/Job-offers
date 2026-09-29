import re
import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup
from dateutil import parser as date_parser
from ..models import Job


HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "pl-PL,pl;q=0.9,en;q=0.8",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
}


class BlockedError(RuntimeError):
    """Raised when a source returns an anti-bot challenge page instead of real content."""


_CHALLENGE_MARKERS = (
    "checking your browser",
    "cf-browser-verification",
    "cf-chl-",
    "attention required",
    "just a moment",
    "captcha",
    "access denied",
    "request unsuccessful",
    "verify you are a human",
)


def _looks_like_challenge_page(html: str) -> bool:
    sample = html[:4000].lower()
    return any(marker in sample for marker in _CHALLENGE_MARKERS)


def get_soup(url: str, timeout: int = 20) -> BeautifulSoup:
    """Fetch a page, retrying a 429 (with the server's own Retry-After) and
    other transient failures (timeouts, connection resets, 5xx) with a short
    backoff — these showed up in practice under concurrent multi-source load,
    not just from a single slow/rate-limited site."""
    last_exc = None
    for attempt in range(3):
        try:
            response = requests.get(url, headers=HEADERS, timeout=timeout)
        except (requests.ConnectionError, requests.Timeout) as exc:
            last_exc = exc
            if attempt < 2:
                time.sleep(2 * (attempt + 1))
                continue
            raise
        if response.status_code == 429:
            if attempt < 2:
                try:
                    retry_after = float(response.headers.get("Retry-After", 3))
                except (TypeError, ValueError):
                    retry_after = 3
                time.sleep(min(max(retry_after, 1), 15))
                continue
            response.raise_for_status()
        if response.status_code >= 500 and attempt < 2:
            time.sleep(2 * (attempt + 1))
            continue
        response.raise_for_status()
        if _looks_like_challenge_page(response.text):
            raise BlockedError(f"{url} returned an anti-bot challenge page instead of listing content")
        return BeautifulSoup(response.text, "html.parser")
    raise last_exc


def clean(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def absolute(base_url: str, href: str) -> str:
    return urljoin(base_url, href)


def parse_date(value: str | None, now: datetime | None = None):
    if not value:
        return None
    value = clean(value)
    try:
        # ISO dates must be parsed year-first. dateutil with dayfirst=True can
        # silently turn 2026-11-09 into September 11, 2026.
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            dt = date_parser.parse(value, dayfirst=True)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        now = now or datetime.now(timezone.utc)
        if now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)
        # Job boards occasionally expose a malformed/future date; never present it as
        # a real publication date or award it freshness points.
        if dt.astimezone(timezone.utc) > now.astimezone(timezone.utc) + timedelta(days=1):
            return None
        return dt
    except Exception:
        return None


_AMOUNT = (
    r"(?:\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?"       # comma-thousands: 2,333 / 2,333.50
    r"|\d{1,3}(?:[ \u00a0]\d{3})+(?:[,.]\d{1,2})?"  # space-thousands: 2 333 / 2 333,50
    r"|\d+(?:[,.]\d{1,2})?)"                     # plain: 2333 / 2333.50 / 2333,50
)
_CURRENCY = r"(?:PLN|EUR|USD|GBP|CHF|zł|€|\$|£)"


def _amount_number(raw):
    value = clean(str(raw)).replace("\u00a0", "").replace(" ", "")
    if "," in value and "." in value:
        value = value.replace(".", "").replace(",", ".")
    elif "," in value:
        left, right = value.rsplit(",", 1)
        value = left + ("." + right if len(right) <= 2 else right)
    elif "." in value:
        left, right = value.rsplit(".", 1)
        value = left + ("." + right if len(right) <= 2 else right)
    return float(value)


def _salary_period(text):
    value = (text or "").lower()
    # "hur"/"yer" match schema.org's abbreviated unitCode ("HUR", UN/CEFACT).
    # Sites commonly send the spelled-out unitText instead ("HOUR", "YEAR"),
    # which these sets used to miss entirely — silently dropping the period
    # (and with it the whole hourly-vs-monthly salary conversion) for any
    # offer using that field.
    if value in {"hur", "hour", "hours", "h"}:
        return "hour"
    if value in {"day", "days", "d"}:
        return "day"
    if value in {"mon", "month", "months"}:
        return "month"
    if value in {"yer", "ann", "annum", "year", "years"}:
        return "year"
    if re.search(r"(?:/\s*h\b|per hour|hourly|godzin|za godzin)", value):
        return "hour"
    if re.search(r"(?:/\s*(?:md|day)\b|per day|daily|dziennie|za dzień|za dzien)", value):
        return "day"
    if re.search(r"(?:/\s*(?:month|mo)\b|per month|monthly|miesięczn|miesieczn)", value):
        return "month"
    if re.search(r"(?:/\s*year\b|per year|yearly|annually|rocznie)", value):
        return "year"
    return ""


# A number next to a currency marker isn't necessarily the salary — job ads
# routinely quote amounts for training/certification budgets, benefit cards,
# insurance, equipment, or referral bonuses in the same breath. Skip a match
# whose nearby context names one of those instead of actual compensation.
_NON_SALARY_CONTEXT = re.compile(
    r"(?:budget|budżet|certyfikat|certification|szkolen|training|kurs|course|"
    r"benefit|multisport|karta sportowa|ubezpieczen|insurance|"
    r"reimburs|zwrot koszt|conference|konferencj|bonus|premia|nagrod|"
    r"sprz[eę]t|equipment|laptop|l\s*&\s*d\b)",
    re.I,
)


def _currency_lookup(symbol):
    return {"zł": "PLN", "€": "EUR", "$": "USD", "£": "GBP"}.get(symbol.lower(), symbol.upper())


_CLAUSE_BOUNDARY = re.compile(r"[.!?;\n•,]")


def _has_disqualifying_context(text, match_start, window=60):
    """Only look for a disqualifying word within the same clause as the match,
    so an unrelated earlier mention (e.g. a training-budget sentence) doesn't
    disqualify a real salary that happens to follow it a bit later."""
    context = text[max(0, match_start - window):match_start]
    boundaries = list(_CLAUSE_BOUNDARY.finditer(context))
    if boundaries:
        context = context[boundaries[-1].end():]
    return bool(_NON_SALARY_CONTEXT.search(context))


def extract_salary(text: str):
    """Find salary amounts only when adjacent to a recognized currency marker,
    skipping matches that look like a budget/benefit/bonus figure instead."""
    text = clean(text or "")
    range_pattern = re.compile(
        rf"(?P<first>{_AMOUNT})\s*(?:-|–|—|to)\s*(?P<second>{_AMOUNT})\s*(?P<currency_after>{_CURRENCY})"
        rf"|(?P<currency_before>{_CURRENCY})\s*(?P<first_before>{_AMOUNT})\s*(?:-|–|—|to)\s*(?P<second_before>{_AMOUNT})"
        # A currency symbol repeated before each side of the range, e.g. "€2,333 - €2,900".
        rf"|(?P<currency_both1>{_CURRENCY})\s*(?P<first_both>{_AMOUNT})\s*(?:-|–|—|to)\s*"
        rf"(?P<currency_both2>{_CURRENCY})\s*(?P<second_both>{_AMOUNT})",
        re.I,
    )
    single_pattern = re.compile(rf"(?P<amount>{_AMOUNT})\s*(?P<currency>{_CURRENCY})", re.I)
    for match in range_pattern.finditer(text):
        if _has_disqualifying_context(text, match.start()):
            continue
        first = match.group("first") or match.group("first_before") or match.group("first_both")
        second = match.group("second") or match.group("second_before") or match.group("second_both")
        currency = match.group("currency_after") or match.group("currency_before") or match.group("currency_both1")
        currency = _currency_lookup(currency)
        return min(_amount_number(first), _amount_number(second)), max(_amount_number(first), _amount_number(second)), currency, _salary_period(text[match.start():match.end() + 24])
    for match in single_pattern.finditer(text):
        if _has_disqualifying_context(text, match.start()):
            continue
        amount = _amount_number(match.group("amount"))
        currency = _currency_lookup(match.group("currency"))
        return amount, amount, currency, _salary_period(text[match.start():match.end() + 24])
    return None, None, "", ""


def extract_structured_salary(value):
    if not isinstance(value, dict):
        return None, None, "", ""
    currency = clean(value.get("currency") or "").upper()
    amount = value.get("value")
    period = ""
    if isinstance(amount, dict):
        period = _salary_period(clean(amount.get("unitText") or amount.get("unitCode") or ""))
        low, high = amount.get("minValue"), amount.get("maxValue")
        if low is None and high is None:
            low = high = amount.get("value")
    else:
        low = high = amount
    try:
        return (float(low) if low is not None else None,
                float(high) if high is not None else None,
                currency, period)
    except (TypeError, ValueError):
        return None, None, "", ""


def infer_remote(text: str):
    t = clean(text).lower()
    if any(x in t for x in ["hybryd", "hybrid", "onsite", "on-site", "stacjonarn"]):
        return False
    if any(x in t for x in ["100% zdalna", "100% remote", "praca zdalna", "zdalnie", "fully remote", "telecommute", "remote"]):
        return True
    return None


_QA_TITLE = re.compile(
    r"\b(qa|quality|test|tester|testing|sdet|automation engineer)\b", re.I,
)


def looks_like_qa_role(title: str) -> bool:
    """Loose title filter for feeds without a QA/testing category of their own.

    Deliberately broad (bare 'quality'/'test' match too) since these feeds are
    small and the scoring/hard-exclusion pipeline downstream filters out
    whatever doesn't actually match the candidate profile.
    """
    return bool(_QA_TITLE.search(title or ""))


def infer_seniority(text: str):
    t = clean(text).lower()
    for level in ("senior", "mid", "regular", "junior", "lead"):
        if level in t:
            return level
    return ""


def parse_cards(soup, base_url: str, source_name: str, link_predicate, title_predicate):
    jobs = []
    seen = set()
    for a in soup.find_all("a", href=True):
        href = absolute(base_url, a.get("href"))
        if href in seen or not link_predicate(href):
            continue
        title = clean(a.get_text(" ", strip=True))
        if not title_predicate(title):
            continue

        container = a
        for _ in range(4):
            if getattr(container, "parent", None):
                container = container.parent
        text = clean(container.get_text(" ", strip=True))
        if len(text) < len(title) + 10:
            text = title

        seen.add(href)
        jobs.append((href, title, text))
    return jobs


def _jobposting_objects(value):
    if isinstance(value, list):
        for item in value:
            yield from _jobposting_objects(item)
    elif isinstance(value, dict):
        types = value.get("@type") or []
        if types == "JobPosting" or (isinstance(types, list) and "JobPosting" in types):
            yield value
        for key in ("@graph", "mainEntity", "itemListElement"):
            if key in value:
                yield from _jobposting_objects(value[key])


def _meta(soup, *names):
    for name in names:
        tag = soup.find("meta", attrs={"property": name}) or soup.find("meta", attrs={"name": name})
        if tag and tag.get("content"):
            return clean(tag["content"])
    return ""


def parse_offer(url: str, source_name: str, listing_title: str = "", timeout: int = 10,
                listing_text: str = "") -> Job | None:
    """Fetch one offer page and normalize structured data or page-level metadata."""
    soup = get_soup(url, timeout=timeout)
    posting = None
    for tag in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(tag.string or tag.get_text())
        except (TypeError, ValueError):
            continue
        posting = next(_jobposting_objects(data), None)
        if posting:
            break

    def nested_text(value):
        if isinstance(value, str):
            return clean(value)
        if isinstance(value, dict):
            direct = value.get("name")
            if direct:
                return clean(direct)
            address = value.get("address")
            if address:
                return nested_text(address)
            return ", ".join(clean(value.get(key) or "") for key in
                              ("addressLocality", "addressRegion", "addressCountry") if value.get(key))
        if isinstance(value, list):
            return ", ".join(filter(None, (nested_text(v) for v in value)))
        return ""

    title = clean((posting or {}).get("title") or "") or clean(soup.find("h1").get_text(" ", strip=True) if soup.find("h1") else "") or listing_title
    company = nested_text((posting or {}).get("hiringOrganization")) or _meta(soup, "job:company", "company")
    location = nested_text((posting or {}).get("jobLocation"))
    if not location:
        location = _meta(soup, "job:location", "og:locality")
    description = clean((posting or {}).get("description") or "")
    if description and "<" in description:
        description = clean(BeautifulSoup(description, "html.parser").get_text(" ", strip=True))
    if not description:
        description = _meta(soup, "description", "og:description")
    if not description:
        main = soup.find("main") or soup.find("article")
        description = clean(main.get_text(" ", strip=True)) if main else ""
    # A list card snippet is not a valid individual job description.
    if not title or len(description) < 80:
        return None
    remote = infer_remote(" ".join((title, description, location, nested_text((posting or {}).get("jobLocationType")))))
    contract = nested_text((posting or {}).get("employmentType"))
    if re.search(r"(?<![a-z0-9])b2b(?![a-z0-9])", clean(description).lower()):
        contract = "B2B"
    published = parse_date((posting or {}).get("datePosted") or _meta(soup, "article:published_time", "datePublished", "job:published_time"))
    salary_min, salary_max, salary_currency, salary_period = extract_structured_salary((posting or {}).get("baseSalary"))
    if salary_min is None and salary_max is None:
        salary_min, salary_max, salary_currency, salary_period = extract_salary(description)
    if salary_min is None and salary_max is None:
        salary_min, salary_max, salary_currency, salary_period = extract_salary(listing_text)
    return Job(title=title, company=company, url=url, source=source_name, description=description,
               location=location, remote=remote, contract=contract, salary_min=salary_min,
               salary_max=salary_max, salary_currency=salary_currency, salary_period=salary_period,
               published_at=published, seniority=infer_seniority(title + " " + description))


def parse_offer_batch(offers, source_name: str, max_workers: int = 5, request_interval: float = 0):
    """Fetch detail pages concurrently while preserving partial successes and errors."""
    results = [None] * len(offers)
    errors = []

    def load_offer(offer):
        if request_interval:
            time.sleep(request_interval)
        url, title = offer[:2]
        listing_text = offer[2] if len(offer) > 2 else ""
        if listing_text:
            return parse_offer(url, source_name, title, listing_text=listing_text)
        return parse_offer(url, source_name, title)

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        pending = {executor.submit(load_offer, offer): (index, offer) for index, offer in enumerate(offers)}
        for future in as_completed(pending):
            index, offer = pending[future]
            url, title = offer[:2]
            try:
                results[index] = future.result()
            except Exception as exc:
                errors.append(f"{title} ({url}): {type(exc).__name__}: {exc}")
    return [job for job in results if job is not None], errors
