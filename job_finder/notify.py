"""Daily summary e-mail, sent through Gmail SMTP with an app password (the
same one Supabase Auth uses for sign-in links)."""

import json
import os
import re
import smtplib
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from html import escape
from urllib.parse import quote, urlencode, urlsplit, urlunsplit

# The summary step runs straight after the fetch. A last fetch older than this
# means today's failed before recording anything, so its new ids and failed
# sources are yesterday's. Well under a day, so a late cron can't hide that.
CURRENT_FETCH_HOURS = 12
# The most offers one e-mail lists.
MAX_LISTED = 100
# Offers on EU-institution projects go first in the e-mail and get a flag.
EU_PATTERN = re.compile(
    r"\b(?:EU|European)\s+(?:institutions?|agenc(?:y|ies)|public\s+(?:sector|organisations?|institutions?))\b"
    r"|\bEuropean\s+(?:Commission|Parliament|Investment\s+Bank|Central\s+Bank)\b|\beu-LISA\b|\bEuropol\b",
    re.I,
)
EU_FLAG = "🇪🇺"


def is_eu_institution(row):
    return bool(EU_PATTERN.search(" ".join(str(row.get(k) or "") for k in ("title", "company", "description"))))


def _title(row):
    return (f"{EU_FLAG} " if is_eu_institution(row) else "") + (row.get("title") or "")


def _salary(row):
    low, high = row.get("salary_min"), row.get("salary_max")
    if low is None and high is None:
        return ""
    values = [v for v in dict.fromkeys((low, high)) if v is not None]
    amounts = "–".join(f"{v:,.0f}".replace(",", " ") for v in values)
    period = {"hour": "/h", "day": "/dzień", "month": "/mies.", "year": "/rok"}.get((row.get("salary_period") or "").lower(), "")
    return f"{amounts} {row.get('salary_currency') or ''}{period}".strip()


def _failed_sources(last_run):
    # By type first: an exception's message can be empty (AssertionError()).
    return [
        f"{r['name']}: {r.get('error_type') or 'błąd'}"
        for r in (last_run or {}).get("results", [])
        if (r.get("error_type") or r.get("error")) and r.get("error_type") != "OfferParseError"
    ]


def _plural(n, one, few, many):
    """Polish plural forms: 1 oferta, 2–4 / 22–24 oferty, otherwise ofert."""
    if n == 1:
        return one
    return few if n % 10 in (2, 3, 4) and n % 100 not in (12, 13, 14) else many


def app_link(app_url, **params):
    """APP_URL with `params` as its query, e.g. ?view=new. The path always ends in "/", so
    APP_URL may be set with or without one (GitHub Pages would otherwise redirect
    /Job-offers to /Job-offers/). Values are percent-encoded like encodeURIComponent, so an
    offer id, itself a URL, survives the round trip through ?offer=."""
    parts = urlsplit(app_url.strip())
    path = parts.path if parts.path.endswith("/") else f"{parts.path}/"
    return urlunsplit((parts.scheme, parts.netloc, path, urlencode(params, quote_via=quote), ""))


def fetch_is_current(store, now=None):
    """Whether the last recorded fetch is the one this summary reports on."""
    try:
        finished = datetime.fromisoformat(store.get_meta("last_fetch_at") or "")
    except ValueError:
        return False
    if finished.tzinfo is None:
        finished = finished.replace(tzinfo=timezone.utc)
    now = now or datetime.now(timezone.utc)
    return now - finished <= timedelta(hours=CURRENT_FETCH_HOURS)


def summary_rows(store, fallback_hours=24, now=None):
    """Returns (rows, hours). The e-mail covers exactly the last fetch's own new
    offers that are still visible (meta last_run_new_ids), so a fetch every 30 minutes
    never lists an offer twice. The hours window is the fallback when that fetch isn't
    today's (it failed before recording its new ids) or the meta key is missing."""
    try:
        new_ids = json.loads(store.get_meta("last_run_new_ids") or "null")
    except json.JSONDecodeError:
        new_ids = None
    if not isinstance(new_ids, list) or not fetch_is_current(store, now):
        return store.new_since(fallback_hours), fallback_hours
    return store.visible_by_ids(new_ids), None


def _offer_id(row):
    return row.get("external_id") or row.get("url") or ""


def build_summary(new_rows, last_run, hours=None):
    """Returns (subject, plain_text, html). `hours` set means the rows come from
    the time-window fallback, which the subject then says. Offers that are only
    potentially remote (remote_hint, see web_utils.remote_hint) get a section of
    their own below the rest, each with the phrase that put it there."""
    # Stable sort: plainly remote first, then EU-institution offers first, the store's order kept.
    new_rows = sorted(new_rows, key=lambda row: (bool(row.get("remote_hint")), not is_eu_institution(row)))
    count = len(new_rows)
    eu_count = sum(is_eu_institution(row) for row in new_rows)
    window = f" ({hours} h)" if hours else ""
    if count:
        subject = f"JOffers: {count} {_plural(count, 'nowa oferta', 'nowe oferty', 'nowych ofert')}{window}"
        if eu_count:
            subject += f" · {EU_FLAG} {eu_count} UE"
        # The phone shows the subject: the best offer in it is often enough to decide.
        best = max(new_rows, key=lambda row: row.get("score") or 0)
        subject += f" · {best.get('score') or 0:.0f} pkt {best.get('title') or ''} — {best.get('company') or '?'}"
    else:
        subject = f"JOffers: brak nowych ofert{window}"
    # Every new offer is listed — the owner reads them all — up to a safety cap for an
    # unusually big fetch; only beyond it does a "… i jeszcze N" line appear.
    shown = new_rows[:MAX_LISTED]
    more = count - len(shown)
    failed = _failed_sources(last_run)
    app_url = os.environ.get("APP_URL")
    # Numbered in the text itself ("1." … "12."), not with <ol>: Gmail clipped two-digit list
    # numbers. The score follows as "70 pkt" so the two numbers can't be confused.
    numbered = list(enumerate(shown, 1))
    sections = [(None, [(n, r) for n, r in numbered if not r.get("remote_hint")]),
                ("Potencjalnie zdalne", [(n, r) for n, r in numbered if r.get("remote_hint")])]

    def applied_link(row):
        # Opens the offer in the app and marks it Applied (web ?mark=applied), one tap.
        return app_link(app_url, offer=_offer_id(row), mark="applied") if app_url else ""

    lines = []
    for heading, rows in sections:
        if not rows:
            continue
        if heading:
            lines.extend(["", f"— {heading} (hybryda, ale ogłoszenie wspomina o pracy zdalnej) —"])
        for number, row in rows:
            salary = _salary(row)
            lines.append(f"{number}. {row.get('score') or 0:.0f} pkt · {_title(row)} — {row.get('company') or '?'}"
                         + (f" · {salary}" if salary else "") + f"\n   {row.get('url')}")
            if row.get("remote_hint"):
                lines.append(f"   „{row['remote_hint']}”")
            if app_url:
                lines.append(f"   Aplikowałem: {applied_link(row)}")
    more_line = f"… i jeszcze {more} {_plural(more, 'oferta', 'oferty', 'ofert')}"
    if more > 0:
        lines.append(more_line)
    if not shown:
        lines.append("Ostatni fetch nie dodał nowych ofert.")
    if failed:
        lines.append("")
        lines.extend(f"⚠️ {f}" for f in failed)
    text = "\n".join(lines)

    def item(number, row):
        extra = ""
        if row.get("remote_hint"):
            extra += f'<br><span style="color:#586074;font-style:italic">„{escape(row["remote_hint"])}”</span>'
        if app_url:
            extra += (f'<br><a href="{escape(applied_link(row), quote=True)}" '
                      f'style="font-size:13px;color:#2F5D50">✓ Aplikowałem</a>')
        return (f'<li style="margin:0 0 10px"><span style="color:#665C50">{number}.</span> '
                f'<strong>{row.get("score") or 0:.0f} pkt</strong> · '
                f'<a href="{escape(row.get("url") or "", quote=True)}">{escape(_title(row))}</a>'
                f' — {escape(row.get("company") or "?")}'
                + (f' <span style="color:#586074">· {escape(_salary(row))}</span>' if _salary(row) else "")
                + extra + "</li>")

    html = '<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.45;color:#0E1120">'
    for heading, rows in sections:
        if not rows:
            continue
        if heading:
            html += (f'<h3 style="font-size:15px;margin:16px 0 4px">{heading}</h3>'
                     '<p style="margin:0 0 8px;color:#586074;font-size:13px">'
                     'Hybryda lub biuro, ale ogłoszenie wspomina o pracy w pełni zdalnej — warto dopytać.</p>')
        # Unordered list with the numbers written in each item (see above).
        html += f'<ul style="list-style:none;padding-left:0;margin:0 0 12px">{"".join(item(n, r) for n, r in rows)}</ul>'
    if not shown:
        html += "<p>Ostatni fetch nie dodał nowych ofert.</p>"
    if more > 0:
        html += f"<p>{more_line}</p>"
    if failed:
        html += "<p style=\"color:#9A5B00\">" + "<br>".join(f"⚠️ {escape(f)}" for f in failed) + "</p>"
    if app_url:
        # The app opens on the New view: the same offers this e-mail lists (web ?view=new).
        links = [("Otwórz JOffers", app_link(app_url, view="new"))]
        if new_rows:
            best = max(new_rows, key=lambda row: row.get("score") or 0)
            links.append(("Otwórz najlepszą ofertę", app_link(app_url, offer=_offer_id(best))))
        html += "<p>" + " · ".join(
            f'<a href="{escape(url, quote=True)}">{label}</a>' for label, url in links
        ) + "</p>"
        text += "\n\n" + "\n".join(f"{label}: {url}" for label, url in links)
    html += "</div>"
    return subject, text, html


def send_email(subject, text, html):
    user = os.environ.get("SMTP_USER")
    password = os.environ.get("SMTP_PASSWORD")
    if not (user and password):
        return False
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = f"JOffers <{user}>"
    message["To"] = os.environ.get("SUMMARY_TO") or user
    message.set_content(text)
    message.add_alternative(html, subtype="html")
    host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
    with smtplib.SMTP_SSL(host, int(os.environ.get("SMTP_PORT", "465")), timeout=30) as smtp:
        smtp.login(user, password)
        smtp.send_message(message)
    return True


def build_ats_candidates(candidates, app_url=""):
    """Returns (subject, text, html): the companies discover-ats found, each with its board
    and one-tap links that approve or skip it in the web app (?company=ats/slug&decision=…)."""
    from .discover import BOARD_URLS
    count = len(candidates)
    subject = f"JOffers: {count} {_plural(count, 'nowa firma', 'nowe firmy', 'nowych firm')} do akceptacji"
    lines, items = [], []
    for number, c in enumerate(candidates, 1):
        board = BOARD_URLS.get(c["ats"], "").format(slug=c["slug"])
        what = (f"{c['name']} — {c['ats'].title()} · {c.get('jobs') or 0} ofert, w tym QA: {c.get('qa_jobs') or 0}"
                + (f" · tablica: „{c['board_name']}”" if c.get("board_name") else ""))
        decide = {d: app_link(app_url, company=f"{c['ats']}/{c['slug']}", decision=d) for d in ("approve", "skip")} \
            if app_url else {}
        lines.append(f"{number}. {what}\n   {board}"
                     + (f"\n   Dodaj: {decide['approve']}\n   Pomiń: {decide['skip']}" if decide else ""))
        items.append(
            f'<li style="margin:0 0 12px"><span style="color:#665C50">{number}.</span> '
            f'<a href="{escape(board, quote=True)}">{escape(c["name"])}</a> — {escape(what.split(" — ", 1)[1])}'
            + (f'<br><a href="{escape(decide["approve"], quote=True)}" style="color:#2F5D50">✓ Dodaj</a> · '
               f'<a href="{escape(decide["skip"], quote=True)}" style="color:#9A5B00">✗ Pomiń</a>' if decide else "")
            + "</li>")
    intro = ("Firmy, które ostatnio szukały testerów i mają publiczną tablicę ogłoszeń. "
             "Po dodaniu ich oferty QA będą pobierane co 30 minut prosto z ATS-u.")
    text = intro + "\n\n" + "\n".join(lines)
    html = ('<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.45;color:#0E1120">'
            f'<p>{intro}</p><ul style="list-style:none;padding-left:0">{"".join(items)}</ul></div>')
    return subject, text, html
