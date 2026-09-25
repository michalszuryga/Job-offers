import re
import json
from datetime import datetime, timezone
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
    if any(x in t for x in ["hybryd", "hybrid", "onsite", "on-site", "stacjonarn"]):
        return False
    if any(x in t for x in ["100% zdalna", "100% remote", "praca zdalna", "zdalnie", "fully remote", "telecommute", "remote"]):
        return True
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


def parse_offer(url: str, source_name: str, listing_title: str = "") -> Job | None:
    """Fetch one offer page and normalize structured data or page-level metadata."""
    soup = get_soup(url)
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
    salary_min, salary_max = extract_salary(description)
    return Job(title=title, company=company, url=url, source=source_name, description=description,
               location=location, remote=remote, contract=contract, salary_min=salary_min,
               salary_max=salary_max, published_at=published, seniority=infer_seniority(title + " " + description))
