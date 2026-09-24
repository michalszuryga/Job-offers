import re
from datetime import datetime, timezone
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup
from dateutil import parser as date_parser


HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136 Safari/537.36"
    ),
    "Accept-Language": "pl-PL,pl;q=0.9,en;q=0.8",
}


def get_soup(url: str, timeout: int = 20) -> BeautifulSoup:
    response = requests.get(url, headers=HEADERS, timeout=timeout)
    response.raise_for_status()
    return BeautifulSoup(response.text, "html.parser")


def clean(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def absolute(base_url: str, href: str) -> str:
    return urljoin(base_url, href)


def parse_date(value: str | None):
    if not value:
        return None
    value = clean(value)
    try:
        dt = date_parser.parse(value, dayfirst=True)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


def extract_salary(text: str):
    nums = re.findall(r"(\d[\d\s]{2,6}(?:[.,]\d{1,2})?)", text or "")
    values = []
    for raw in nums:
        try:
            values.append(float(raw.replace(" ", "").replace(",", ".")))
        except ValueError:
            pass
    if not values:
        return None, None
    if len(values) == 1:
        return values[0], values[0]
    return min(values), max(values)


def infer_remote(text: str):
    t = clean(text).lower()
    if any(x in t for x in ["100% zdalna", "100% remote", "praca zdalna", "zdalnie", "fully remote", "remote"]):
        return True
    if any(x in t for x in ["hybryd", "hybrid", "onsite", "on-site", "stacjonarn"]):
        return False
    return None


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
