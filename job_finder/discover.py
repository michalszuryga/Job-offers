"""Finding companies' ATS job boards to add to the ATS sources (week 3 of the plan).

For each company that recently posted a QA offer anywhere (JustJoin.IT, NFJ, Himalayas…),
guess its board slug on Greenhouse, Lever, Ashby and Recruitee and ask their public APIs.
A board that exists and has openings becomes a *pending* candidate; nothing is fetched from
it until you approve it from the Monday e-mail (owner's decision, 2026-11-15).
"""

import re
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests
import yaml

from .models import _normalize_for_dedup
from .sources.ats import COMPANIES_PATH, JSON_HEADERS, software_qa_title

PROBES = {
    # ats: (list URL, how to read (job titles, board name) from the response)
    "greenhouse": "https://boards-api.greenhouse.io/v1/boards/{slug}/jobs",
    "lever": "https://api.lever.co/v0/postings/{slug}?mode=json",
    "ashby": "https://api.ashbyhq.com/posting-api/job-board/{slug}",
    "recruitee": "https://{slug}.recruitee.com/api/offers/",
}
BOARD_URLS = {
    "greenhouse": "https://job-boards.greenhouse.io/{slug}",
    "lever": "https://jobs.lever.co/{slug}",
    "ashby": "https://jobs.ashbyhq.com/{slug}",
    "recruitee": "https://{slug}.recruitee.com",
    "workable": "https://apply.workable.com/{slug}",
}
# Words that say what a company is, not which: dropped when guessing a slug.
_GENERIC = {"group", "technologies", "technology", "software", "solutions", "systems", "labs", "the", "it",
            "services", "consulting", "company", "international", "global", "digital", "europe", "hr"}


def _ascii(text):
    text = (text or "").replace("ł", "l").replace("Ł", "L")
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()


def slug_variants(company):
    """Likely board slugs: "Kyotu Technology" → kyotutechnology, kyotu-technology, kyotu."""
    words = [w for w in re.split(r"[^a-z0-9]+", _ascii(_normalize_for_dedup(company)).lower()) if w]
    core = [w for w in words if w not in _GENERIC] or words
    variants = ["".join(words), "-".join(words)]
    # Shortened guesses only when long enough not to be someone else's board ("mind", "hard").
    shortened = ["".join(core)] + ([core[0]] if len(core) > 1 else [])
    variants += [v for v in shortened if len(v) >= 5]
    return [v for v in dict.fromkeys(variants) if len(v) >= 3]


def _read(ats, data):
    """(titles, board name) from a board's list response."""
    if ats == "greenhouse":
        return [j.get("title") or "" for j in data.get("jobs") or []], ""
    if ats == "lever":
        return [j.get("text") or "" for j in data or []], ""
    if ats == "ashby":
        return [j.get("title") or "" for j in data.get("jobs") or []], ""
    offers = data.get("offers") or []
    return [j.get("title") or "" for j in offers], (offers[0].get("company_name") or "") if offers else ""


def probe(ats, slug, timeout=15):
    """(jobs, qa_jobs, board name) for an existing board with openings, else None."""
    try:
        response = requests.get(PROBES[ats].format(slug=slug), headers=JSON_HEADERS, timeout=timeout)
        if response.status_code != 200:
            return None
        titles, name = _read(ats, response.json())
    except (requests.RequestException, ValueError):
        return None
    if not titles:
        return None
    if ats == "greenhouse":
        try:
            name = requests.get(f"https://boards-api.greenhouse.io/v1/boards/{slug}", headers=JSON_HEADERS,
                                timeout=timeout).json().get("name") or ""
        except (requests.RequestException, ValueError):
            name = ""
    return len(titles), sum(software_qa_title(t) for t in titles), name


def _same_company(company, board_name):
    """A board that names its company must name this one ("Fin" for intercom is fine to
    show, but a stranger's board under a common word is not)."""
    if not board_name:
        return True
    a, b = (re.sub(r"[^a-z0-9]", "", _ascii(_normalize_for_dedup(x)).lower()) for x in (company, board_name))
    return bool(a and b) and (a in b or b in a)


def configured_slugs(path=COMPANIES_PATH):
    try:
        data = yaml.safe_load(Path(path).read_text(encoding="utf-8")) or {}
    except FileNotFoundError:
        return set()
    return {(ats, str(c.get("slug") or c.get("client_id"))) for ats, companies in data.items() for c in companies or []}


def discover(store, limit=40, workers=16, probe_fn=probe):
    """Probes up to `limit` company names not looked up before; returns the new candidates."""
    names = store.unprobed_companies(limit=limit)
    known = configured_slugs() | {(r["ats"], r["slug"]) for r in store.ats_companies()}
    tasks = [(key, company, ats, slug) for key, company in names for slug in slug_variants(company)
             for ats in PROBES if (ats, slug) not in known]
    with ThreadPoolExecutor(max_workers=workers) as executor:
        results = list(executor.map(lambda t: (t, probe_fn(t[2], t[3])), tasks))
    found = []
    for (key, company, ats, slug), result in results:
        if not result or (ats, slug) in known:
            continue
        jobs, qa_jobs, board_name = result
        if not _same_company(company, board_name):
            continue
        known.add((ats, slug))
        store.add_ats_candidate(ats, slug, company, jobs, qa_jobs, board_name)
        found.append({"ats": ats, "slug": slug, "name": company, "jobs": jobs, "qa_jobs": qa_jobs})
    store.mark_probed([key for key, _ in names])
    return found
