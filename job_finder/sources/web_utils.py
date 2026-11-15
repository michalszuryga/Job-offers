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


_UNIT_WORDS = (
    ("hour", r"h|hr|hrs|hour|hours|godz\.?|godzin[aęy]?|godzinę"),
    ("day", r"d|day|days|md|dzie[nń]|dni|dzień\s+roboczy"),
    ("month", r"mo|mon|month|months|mies\.?|miesiąc|miesiac|msc|m-c|mc"),
    ("year", r"y|yr|year|years|annum|rok|roku"),
)
_UNIT_ADVERBS = (
    ("hour", r"hourly|godzinowo|za\s+godzin[ęe]"),
    ("day", r"daily|dziennie|za\s+dzie[nń]"),
    ("month", r"monthly|miesięcznie|miesiecznie|za\s+miesiąc|za\s+miesiac"),
    ("year", r"yearly|annually|rocznie|za\s+rok"),
)
# Words that may sit between an amount and its unit: "PLN netto / h",
# "zł + VAT (B2B) / godz.", "EUR gross per year".
_SALARY_FILLER = (r"(?:\s*(?:netto|brutto|net|gross|\+\s*vat|vat|\(\s*(?:b2b|uop)\s*\)|b2b|uop|"
                  r"pln|zł|eur|usd|gbp|chf|[€$£]))*")
_TRAILING_UNIT = [
    (period, re.compile(rf"^{_SALARY_FILLER}\s*(?:/|per|za|a|an)\s*(?:{words})(?![a-ząćęłńóśźż])", re.I))
    for period, words in _UNIT_WORDS
] + [
    (period, re.compile(rf"^{_SALARY_FILLER}\s*(?:{words})(?![a-ząćęłńóśźż])", re.I))
    for period, words in _UNIT_ADVERBS
]
# The period stated just before the amount: "hourly rate: 100-130 PLN",
# "Monthly gross salary of 17,500 PLN", "stawka godzinowa 120 zł".
_LEADING_UNIT = (
    ("hour", re.compile(r"(?:hourly|per hour|godzinow|stawka za godzin)[^.;:\n]{0,25}[:\s]*$", re.I)),
    ("day", re.compile(r"(?:daily rate|day rate|per day|dzienn|stawka za dzie)[^.;:\n]{0,25}[:\s]*$", re.I)),
    ("month", re.compile(r"(?:monthly|per month|miesięczn|miesieczn)[^.;:\n]{0,25}[:\s]*$", re.I)),
    ("year", re.compile(r"(?:annual|yearly|per year|per annum|roczn)[^.;:\n]{0,25}[:\s]*$", re.I)),
)


def _salary_period(text):
    """Map a structured unit value (schema.org unitText/unitCode, a board's own
    unit field) to hour/day/month/year."""
    value = clean(text or "").lower()
    # "hur"/"yer" match schema.org's abbreviated unitCode ("HUR", UN/CEFACT).
    # Sites commonly send the spelled-out unitText instead ("HOUR", "YEAR").
    if value in {"hur", "hour", "hours", "h", "hourly"}:
        return "hour"
    if value in {"day", "days", "d", "daily"}:
        return "day"
    if value in {"mon", "month", "months", "monthly"}:
        return "month"
    if value in {"yer", "ann", "annum", "year", "years", "yearly", "annual"}:
        return "year"
    return _period_after(value)


def _period_after(text):
    """The unit written right after an amount ("PLN / godz.", "€ per hour",
    "zł netto miesięcznie"). Anchored at the start, so an unrelated later word
    ("16 000 PLN, 8 godzin dziennie") no longer turns a monthly figure hourly."""
    for period, pattern in _TRAILING_UNIT:
        if pattern.search(text or ""):
            return period
    return ""


def _period_before(text):
    for period, pattern in _LEADING_UNIT:
        if pattern.search(text or ""):
            return period
    return ""


# A number next to a currency marker isn't necessarily the salary — job ads
# routinely quote amounts for training/certification budgets, benefit cards,
# insurance, equipment, or referral bonuses in the same breath. Skip a match
# whose nearby context names one of those instead of actual compensation.
_NON_SALARY_CONTEXT = re.compile(
    r"(?:budget|budżet|certyfikat|certification|szkolen|training|kurs|course|"
    r"benefit|multisport|karta sportowa|ubezpieczen|insurance|"
    r"reimburs|zwrot koszt|conference|konferencj|bonus|premia|(?<!wy)nagrod|"
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
        period = _period_after(text[match.end():match.end() + 40]) or _period_before(text[max(0, match.start() - 40):match.start()])
        return min(_amount_number(first), _amount_number(second)), max(_amount_number(first), _amount_number(second)), currency, period
    for match in single_pattern.finditer(text):
        if _has_disqualifying_context(text, match.start()):
            continue
        amount = _amount_number(match.group("amount"))
        currency = _currency_lookup(match.group("currency"))
        period = _period_after(text[match.end():match.end() + 40]) or _period_before(text[max(0, match.start() - 40):match.start()])
        return amount, amount, currency, period
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
    if any(x in t for x in ["100% zdalna", "100% remote", "praca zdalna", "zdalnie", "fully remote", "telecommute", "remote",
                                "home office work"]):
        return True
    return None


# A board's own work mode, kept in the stored location as a " · Remote" / " · Hybrid" /
# " · Office" segment (Pracuj.pl: its own labels). The rescore rebuilds offers from stored
# rows, so this is how the structured mode survives instead of being guessed from the text
# again, where any "hybrid" (a benefit list, "remote or hybrid") used to mean not remote.
_WORK_MODE_LABELS = {"remote": "Remote", "hybrid": "Hybrid", "office": "Office"}
_MODE_REMOTE = re.compile(r"(?<![a-ząćęłńóśźż])(?:remote|praca\s+zdalna)(?![a-ząćęłńóśźż])")
_MODE_NOT_REMOTE = re.compile(r"(?<![a-ząćęłńóśźż])(?:hybrid|hybrydowa|office|stacjonarna)(?![a-ząćęłńóśźż])")


def with_work_mode(location: str, mode: str | None) -> str:
    """The location with the board's work mode ("remote", "hybrid", "office") appended."""
    label = _WORK_MODE_LABELS.get((mode or "").lower())
    if not label:
        return location or ""
    if not location or location.strip().lower() == label.lower():
        return label
    return f"{location} · {label}"


def location_work_mode(location: str):
    """True / False from a work-mode segment of the location (see with_work_mode), None
    when it has none. Several modes ("praca zdalna, praca hybrydowa") mean not plainly remote."""
    if (location or "").strip().lower().endswith("(remote)"):
        return True  # the ATS adapters' "Thessaloniki, Greece (remote)"
    parts = [p.strip().lower() for p in (location or "").split(" · ")]
    if len(parts) < 2:
        # A bare mode is the whole location ("Remote": with_work_mode with no place).
        return {"remote": True, "hybrid": False, "office": False}.get(parts[0])
    modes = " ".join(p.replace("home office work", "remote") for p in parts
                     if _MODE_REMOTE.search(p.replace("home office work", "remote")) or _MODE_NOT_REMOTE.search(p))
    if not modes:
        return None
    return not _MODE_NOT_REMOTE.search(modes)


def page_work_mode(html: str) -> str | None:
    """JustJoin.IT (and others built on it) embed the offer's workplaceType in the page."""
    match = re.search(r'workplaceType\\?"\s*:\s*\\?"(remote|hybrid|office)', html or "", re.I)
    return match.group(1).lower() if match else None


# Region eligibility, read from the board's location field only (owner's decision,
# 2026-11-15): a remote offer limited to a region you can't work from is rejected; one
# that only says so in the description is kept. Any European signal wins, and a single
# European country stays (EU-institution contractors post "Athens, Greece (remote)").
_REGION_OK = re.compile(
    r"\b(?:poland|polska|europe|european|eu|eea|emea|cet|cest|worldwide|world|anywhere|global|globally)\b", re.I)
_REGION_OUTSIDE = re.compile(
    r"\b(?:united\s+states|usa|u\.s\.a?\.?|us|canada|north\s+america|americas|latam|latin\s+america|"
    r"south\s+america|brazil|mexico|argentina|colombia|chile|peru|apac|asia|india|pakistan|philippines|"
    r"vietnam|indonesia|malaysia|singapore|japan|china|australia|new\s+zealand|africa|nigeria|kenya|"
    r"egypt|tunisia|morocco|israel|uae|dubai|saudi\s+arabia)\b", re.I)


def region_outside(location: str) -> str:
    """The non-European region the location limits the offer to ("USA Only" → "USA"), or ""."""
    text = (location or "").replace("·", " ")
    if _REGION_OK.search(text):
        return ""
    match = _REGION_OUTSIDE.search(text)
    return match.group(0) if match else ""


# "Potentially remote": an offer that isn't plainly remote (hybrid, a city, or no mode at all)
# but whose text says working fully remotely is possible — "hybrid in Gdańsk or Warsaw, fully
# remote work also possible", "100% zdalnie dla osób spoza Krakowa", Pracuj.pl's "praca
# zdalna, praca hybrydowa" (both modes ticked). The bare benefit-list "możliwość pracy zdalnej"
# usually means occasional home office, so it does not count on its own.
_REMOTE_HINTS = re.compile(
    r"(?:fully|100\s*%|completely|entirely)[\s-]*remote(?:ly)?"
    r"|remote(?:\s+work(?:ing)?)?\s+(?:is\s+)?(?:also\s+)?(?:possible|available|an\s+option)"
    r"|(?:possibility|option|opportunity)\s+(?:to|of)\s+work(?:ing)?\s+(?:fully\s+|100\s*%\s+)?remote"
    r"|remote\s+or\s+hybrid|hybrid\s+or\s+(?:fully\s+)?remote|work\s+from\s+anywhere|remote[\s-]first"
    r"|remote(?:ly)?\s+for\s+(?:candidates|people|those)|(?:candidates|people)\s+(?:based\s+|living\s+)?outside\s+(?:of\s+)?[a-ząćęłńóśźż]+"
    r"|w\s+pe[lł]ni\s+zdaln\w*|100\s*%\s*zdaln\w*|ca[lł]kowicie\s+zdaln\w*"
    r"|praca\s+zdalna\s+(?:jest\s+)?(?:te[zż]\s+)?mo[zż]liwa|zdalnie\s+dla\s+os[oó]b|os[oó]b\s+spoza\s+[a-ząćęłńóśźż]+"
    r"|hybrydowo\s+lub\s+(?:w\s+pe[lł]ni\s+)?zdalnie|zdalnie\s+lub\s+hybrydowo"
    r"|praca\s+zdalna[\s,;•|/]+praca\s+hybrydowa|praca\s+hybrydowa[\s,;•|/]+praca\s+zdalna"
    r"|home\s+office\s+work[\s,;•|/]+hybrid\s+work|hybrid\s+work[\s,;•|/]+home\s+office\s+work"
    r"|·\s*remote\s*·\s*hybrid|·\s*hybrid\s*·\s*remote",  # with_work_mode: both modes offered
    re.I,
)
_NEGATION_BEFORE = re.compile(r"(?:\bnot|\bno|n't|\bnie(?:\s+jest)?|\bbrak)\s*(?:\w+\s+)?$", re.I)


def remote_hint(text: str) -> str:
    """The phrase that suggests full remote is possible, with a little context, or ""."""
    t = clean(text)
    for match in _REMOTE_HINTS.finditer(t):
        if _NEGATION_BEFORE.search(t[max(0, match.start() - 20):match.start()]):
            continue
        start = t.rfind(" ", 0, max(0, match.start() - 50)) + 1
        end = t.find(" ", min(len(t), match.end() + 50))
        snippet = t[start:end if end != -1 else len(t)].strip(" ,.;•|")
        return ("… " if start > 0 else "") + snippet + (" …" if end != -1 else "")
    return ""


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


def embedded_json_value(text, key, kind=dict):
    """Decode the first value of type `kind` that follows `"key":` in a page's
    embedded state (Next.js/Angular payloads, possibly with escaped quotes).
    Pages also carry same-named i18n labels, hence the type check."""
    if not text:
        return None
    decoder = json.JSONDecoder()
    for source in (text, text.replace('\\"', '"')):
        marker = f'"{key}":'
        index = source.find(marker)
        while index >= 0:
            start = index + len(marker)
            while start < len(source) and source[start].isspace():
                start += 1
            try:
                value, _ = decoder.raw_decode(source, start)
            except ValueError:
                value = None
            if isinstance(value, kind):
                return value
            index = source.find(marker, index + len(marker))
    return None


def parse_offer(url: str, source_name: str, listing_title: str = "", timeout: int = 10,
                listing_text: str = "", salary_parser=None, default_period: str = "",
                work_modes_parser=None) -> Job | None:
    """Fetch one offer page and normalize structured data or page-level metadata.

    salary_parser(soup) reads a board's own salary data (with its own unit):
    a (min, max, currency, period) tuple wins outright — all None means the
    board says the salary is undisclosed, so nothing is guessed from the text;
    None means the board data wasn't found and the generic chain runs.
    default_period is the board's display convention for a figure printed
    without a unit (Bulldogjob and CzyJestEldorado list monthly amounts).
    work_modes_parser(soup) returns the board's own work-mode labels ("praca zdalna, praca
    hybrydowa"), appended to the location so the remote inference and the app both see them."""
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
    work_modes = work_modes_parser(soup) if work_modes_parser else ""
    if work_modes:
        location = f"{location} · {work_modes}" if location else work_modes
    else:
        location = with_work_mode(location, page_work_mode(str(soup)))
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
    remote = location_work_mode(location)
    if remote is None:
        remote = infer_remote(" ".join((title, description, location, nested_text((posting or {}).get("jobLocationType")))))
    contract = nested_text((posting or {}).get("employmentType"))
    if re.search(r"(?<![a-z0-9])b2b(?![a-z0-9])", clean(description).lower()):
        contract = "B2B"
    published = parse_date((posting or {}).get("datePosted") or _meta(soup, "article:published_time", "datePublished", "job:published_time"))
    board_salary = salary_parser(soup) if salary_parser else None
    if board_salary is not None:
        salary_min, salary_max, salary_currency, salary_period = board_salary
    else:
        salary_min, salary_max, salary_currency, salary_period = extract_structured_salary(
            (posting or {}).get("baseSalary"))
        if salary_min is None and salary_max is None:
            salary_min, salary_max, salary_currency, salary_period = extract_salary(description)
        if salary_min is None and salary_max is None:
            salary_min, salary_max, salary_currency, salary_period = extract_salary(listing_text)
        if (salary_min is not None or salary_max is not None) and not salary_period:
            salary_period = default_period
    return Job(title=title, company=company, url=url, source=source_name, description=description,
               location=location, remote=remote, contract=contract, salary_min=salary_min,
               salary_max=salary_max, salary_currency=salary_currency, salary_period=salary_period,
               published_at=published, seniority=infer_seniority(title + " " + description))


def parse_offer_batch(offers, source_name: str, max_workers: int = 5, request_interval: float = 0,
                      salary_parser=None, default_period: str = "", work_modes_parser=None):
    """Fetch detail pages concurrently while preserving partial successes and errors."""
    results = [None] * len(offers)
    errors = []
    salary_kwargs = {key: value for key, value in (("salary_parser", salary_parser),
                                                   ("default_period", default_period),
                                                   ("work_modes_parser", work_modes_parser)) if value}

    def load_offer(offer):
        if request_interval:
            time.sleep(request_interval)
        url, title = offer[:2]
        listing_text = offer[2] if len(offer) > 2 else ""
        if listing_text:
            return parse_offer(url, source_name, title, listing_text=listing_text, **salary_kwargs)
        return parse_offer(url, source_name, title, **salary_kwargs)

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
