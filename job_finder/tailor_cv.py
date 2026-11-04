"""Tailor the owner's CV to one offer, locally, with the Claude Code CLI
(`claude -p`, the owner's subscription; no API key, no tools).

The CV lives outside this public repo (default ../CV, override JOFFERS_CV_DIR):
cv.html is the base, tailored copies go to <cv dir>/tailored/ as .html + .pdf
plus a .md listing what changed and what the offer asks for that the CV lacks.

Claude may only re-word and re-order what is already there. Every tailored CV
is checked against the base before it is saved: employers, dates, roles,
education, certificates and languages must be identical, and stack/skill
entries may only come from the base CV. A CV that fails is not rendered.
"""

import re
import subprocess
import tempfile
import unicodedata
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from bs4 import BeautifulSoup

CHANGES_MARKER = "<!-- JOFFERS-CHANGES -->"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
# Statuses an offer may still be in when its CV is generated; later ones
# (applied, interview, ...) are left as they are.
EARLY_STATUSES = {"TO_REVIEW", "REVIEW", "INTERESTED", "", None}

PROMPT = """You tailor a QA engineer's CV (an HTML file) to one job offer.

Return the COMPLETE tailored HTML document, then a line with exactly {marker}, then notes in Polish.

Hard rules — the CV is checked automatically and rejected if any is broken:
- Never invent anything: no new employers, roles, dates, degrees, certificates, languages,
  technologies, tools, domains, numbers or years of experience. Use only facts already in the CV.
- Keep unchanged: <head> and all CSS, the header (name, contact links, photo), every <h3>,
  every .dates, every .role line, the Education, Certificates and Languages sections.
- Keep the same HTML structure and class names; keep the jobs in the same order.
- You MAY: rewrite the Profile paragraph to lead with what this offer values; re-order bullets within a
  job; re-word bullets with the offer's vocabulary where it truthfully describes the same work; drop a
  weak bullet; re-order or drop entries inside .stack and the Skills lists (entries must come from the CV);
  change the .eyebrow role title to the offer's role name if it is the same kind of role (keep "8+ years").
- Keep it as long as the original or shorter (it must stay within 2 A4 pages).
- Write in English unless the offer is written in Polish.

After {marker} write, in Polish, as Markdown:
## Zmiany
- what you changed and why (short bullets)
## Braki względem oferty
- requirements from the offer the CV does not cover (be honest; these are for the candidate, not the CV)

=== JOB OFFER ===
Title: {title}
Company: {company}
Location: {location}
URL: {url}

{description}

=== CV (HTML) ===
{cv}
"""


class TailorError(RuntimeError):
    pass


@dataclass
class TailorResult:
    html_path: Path
    pdf_path: Path | None
    notes_path: Path
    notes: str


def cv_dir(path=None):
    import os
    return Path(path or os.environ.get("JOFFERS_CV_DIR") or Path(__file__).resolve().parents[2] / "CV")


def slug(text, limit=40):
    text = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:limit].strip("-") or "offer"


def build_prompt(offer, cv_html):
    return PROMPT.format(
        marker=CHANGES_MARKER,
        title=offer.get("title") or "",
        company=offer.get("company") or "",
        location=offer.get("location") or "",
        url=offer.get("url") or "",
        description=(offer.get("description") or "").strip()[:20000] or "(no description stored)",
        cv=cv_html,
    )


def run_claude(prompt, model=None, timeout=600):
    """`claude -p` with the prompt on stdin, no tools, run in an empty folder."""
    command = ["claude", "-p", "--output-format", "text", "--tools", "", "--no-session-persistence"]
    if model:
        command += ["--model", model]
    with tempfile.TemporaryDirectory() as empty:
        try:
            done = subprocess.run(command, input=prompt, capture_output=True, text=True, timeout=timeout, cwd=empty)
        except FileNotFoundError as exc:
            raise TailorError("Claude Code CLI (`claude`) not found on PATH") from exc
    if done.returncode != 0:
        raise TailorError(f"claude exited {done.returncode}: {(done.stderr or done.stdout).strip()[:500]}")
    return done.stdout


def split_reply(reply):
    """(html, notes) from Claude's answer; tolerates a ```html fence."""
    html, _, notes = reply.partition(CHANGES_MARKER)
    html = re.sub(r"^\s*```(?:html)?\s*|\s*```\s*$", "", html.strip())
    start = html.lower().find("<!doctype")
    if start < 0:
        start = html.lower().find("<html")
    end = html.lower().rfind("</html>")
    if start < 0 or end < 0:
        raise TailorError("Claude's answer has no complete HTML document")
    return html[start:end + len("</html>")], notes.strip()


def _texts(soup, selector):
    return [re.sub(r"\s+", " ", el.get_text(" ", strip=True)) for el in soup.select(selector)]


def _section(soup, label):
    for p in soup.select("p.label"):
        if p.get_text(strip=True).lower() == label.lower():
            return p.parent
    return None


def _section_texts(soup, label):
    section = _section(soup, label)
    return re.sub(r"\s+", " ", section.get_text(" ", strip=True)) if section else None


def _skill_entries(soup):
    entries = set(_texts(soup, ".stack span:not(.k)"))
    for dd in soup.select("dl.grid dd"):
        entries.update(part.strip().lower() for part in dd.get_text().split(",") if part.strip())
    return {e.lower() for e in entries}


def check_integrity(base_html, tailored_html):
    """Problems that make a tailored CV unusable (empty list = fine)."""
    base, new = BeautifulSoup(base_html, "html.parser"), BeautifulSoup(tailored_html, "html.parser")
    problems = []
    for what, selector in (("name", "h1"), ("contact", ".contact"), ("employers/schools", "h3"),
                           ("dates", ".dates"), ("roles", ".role"), ("photo", "img.photo")):
        if selector == "img.photo":
            same = [i.get("src") for i in base.select(selector)] == [i.get("src") for i in new.select(selector)]
        else:
            same = _texts(base, selector) == _texts(new, selector)
        if not same:
            problems.append(f"{what} changed")
    for label in ("Education", "Certificates", "Languages"):
        if _section_texts(base, label) != _section_texts(new, label):
            problems.append(f"{label} section changed")
    years = re.findall(r"\d+\+?\s*years", " ".join(_texts(base, ".eyebrow, .profile")))
    new_years = re.findall(r"\d+\+?\s*years", " ".join(_texts(new, ".eyebrow, .profile")))
    if any(y not in years for y in new_years):
        problems.append(f"years of experience changed: {sorted(set(new_years) - set(years))}")
    added = _skill_entries(new) - _skill_entries(base)
    if added:
        problems.append(f"skills not in the base CV: {sorted(added)}")
    # A tool may not move to a job that didn't list it.
    for base_job, new_job in zip(base.select(".job"), new.select(".job")):
        moved = {s.lower() for s in _texts(new_job, ".stack span:not(.k)")} - {
            s.lower() for s in _texts(base_job, ".stack span:not(.k)")}
        if moved:
            problems.append(f"{_texts(base_job, 'h3')[0]}: stack gained {sorted(moved)}")
    if len(new.get_text()) > len(base.get_text()) * 1.15:
        problems.append("noticeably longer than the base CV (may not fit 2 pages)")
    return problems


def render_pdf(html_path, pdf_path, chrome=CHROME):
    if not Path(chrome).exists():
        return None
    subprocess.run([chrome, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                    "--virtual-time-budget=3000", f"--print-to-pdf={pdf_path}", html_path.resolve().as_uri()],
                   capture_output=True, timeout=120)
    return pdf_path if Path(pdf_path).exists() else None


def tailor(offer, base_dir=None, model=None, runner=run_claude, pdf=render_pdf, today=None):
    base_dir = cv_dir(base_dir)
    base_html = (base_dir / "cv.html").read_text(encoding="utf-8")
    out_dir = base_dir / "tailored"
    out_dir.mkdir(exist_ok=True)
    stem = f"{(today or date.today()).isoformat()}-{slug(offer.get('company'), 25)}-{slug(offer.get('title'))}"
    reply = runner(build_prompt(offer, base_html), model=model)
    try:
        html, notes = split_reply(reply)
    except TailorError as exc:
        raw = out_dir / f"{stem}.reply.txt"
        raw.write_text(reply, encoding="utf-8")
        raise TailorError(f"{exc}. Claude's answer: {raw}") from exc
    problems = check_integrity(base_html, html)
    if problems:
        rejected = out_dir / f"{stem}.rejected.html"
        rejected.write_text(html, encoding="utf-8")
        raise TailorError("Tailored CV rejected (" + "; ".join(problems) + f"). Saved for inspection: {rejected}")
    # The tailored file sits one level below cv.html; <base> keeps fonts/ and img/ resolving.
    if "<base " not in html:
        html = re.sub(r"(<head[^>]*>)", r'\1\n<base href="../">', html, count=1, flags=re.I)
    html_path = out_dir / f"{stem}.html"
    html_path.write_text(html, encoding="utf-8")
    notes_path = out_dir / f"{stem}.md"
    notes_path.write_text(f"# {offer.get('title')} — {offer.get('company')}\n\n{offer.get('url')}\n\n{notes}\n",
                          encoding="utf-8")
    return TailorResult(html_path, pdf(html_path, out_dir / f"{stem}.pdf"), notes_path, notes)


def find_offer(store, ref):
    """An offer from the store by its URL or external id (the canonical URL)."""
    from .models import canonical_job_url
    return store.get(canonical_job_url(ref)) or store.get(ref)


def offer_from_page(url):
    """For an offer that isn't stored: read its page (JSON-LD / meta tags)."""
    import requests
    from .sources.web_utils import HEADERS, clean, parse_offer
    job = parse_offer(url, "manual")
    description = job.description if job else ""
    # Structured data often holds only a company blurb (TalentClue): the page's main
    # content then has the actual duties and requirements.
    if len(description) < 1500:
        response = requests.get(url, headers=HEADERS, timeout=30)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        for tag in soup(["script", "style", "nav", "header", "footer"]):
            tag.decompose()
        main = (soup.select_one(".job-page__content--left") or soup.select_one("main")
                or soup.select_one("article") or soup.body)
        page_text = clean(main.get_text(" ", strip=True)) if main else ""
        if len(page_text) > len(description):
            description = page_text
    if not description:
        raise TailorError(f"Couldn't read an offer description from {url}")
    from urllib.parse import urlsplit
    # e.g. seidor.talentclue.com -> "Seidor" when the page names no company.
    company = (job.company if job else "") or urlsplit(url).hostname.split(".")[0].capitalize()
    return {"title": job.title if job else url, "company": company, "url": url,
            "location": job.location if job else "", "description": description}


def mark_cv_generated(store, offer, path):
    if offer.get("application_status") in EARLY_STATUSES:
        store.save_tailored_cv(offer["external_id"], str(path))
        return True
    return False
