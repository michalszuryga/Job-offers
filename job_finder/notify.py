"""Daily summary e-mail, sent through Gmail SMTP with an app password (the
same one Supabase Auth uses for sign-in links)."""

import json
import os
import smtplib
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from html import escape
from urllib.parse import quote, urlencode, urlsplit, urlunsplit

# The summary step runs straight after the fetch. A last fetch older than this
# means today's failed before recording anything, so its new ids and failed
# sources are yesterday's. Well under a day, so a late cron can't hide that.
CURRENT_FETCH_HOURS = 12


def _salary(row):
    low, high = row.get("salary_min"), row.get("salary_max")
    if low is None and high is None:
        return ""
    values = [v for v in dict.fromkeys((low, high)) if v is not None]
    amounts = "–".join(f"{v:,.0f}".replace(",", " ") for v in values)
    period = {"hour": "/h", "month": "/mies.", "year": "/rok"}.get((row.get("salary_period") or "").lower(), "")
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
    """Returns (rows, hours). The summary covers exactly the last fetch's new
    offers that are still visible — the same set the web app calls "new" — so
    the count matches what you see when you open it. The hours window is the
    fallback when that fetch isn't today's (it failed before recording its new
    ids) or the database predates the last_fetch_new_ids meta key."""
    try:
        new_ids = json.loads(store.get_meta("last_fetch_new_ids") or "null")
    except json.JSONDecodeError:
        new_ids = None
    if not isinstance(new_ids, list) or not fetch_is_current(store, now):
        return store.new_since(fallback_hours), fallback_hours
    return store.visible_by_ids(new_ids), None


def build_summary(new_rows, last_run, hours=None, top=10):
    """Returns (subject, plain_text, html). `hours` set means the rows come from
    the time-window fallback, which the subject then says."""
    count = len(new_rows)
    window = f" ({hours} h)" if hours else ""
    if count:
        subject = f"JOffers: {count} {_plural(count, 'nowa oferta', 'nowe oferty', 'nowych ofert')}{window}"
    else:
        subject = f"JOffers: brak nowych ofert{window}"
    shown = new_rows[:top]
    more = count - len(shown)
    failed = _failed_sources(last_run)

    lines = []
    for row in shown:
        salary = _salary(row)
        lines.append(f"{row.get('score') or 0:.0f} · {row.get('title')} — {row.get('company') or '?'}"
                     + (f" · {salary}" if salary else "") + f"\n   {row.get('url')}")
    more_line = f"… i jeszcze {more} {_plural(more, 'oferta', 'oferty', 'ofert')}"
    if more > 0:
        lines.append(more_line)
    if not shown:
        lines.append("Ostatni fetch nie dodał nowych ofert.")
    if failed:
        lines.append("")
        lines.extend(f"⚠️ {f}" for f in failed)
    text = "\n".join(lines)

    items = "".join(
        f'<li style="margin:0 0 10px"><strong>{row.get("score") or 0:.0f}</strong> · '
        f'<a href="{escape(row.get("url") or "", quote=True)}">{escape(row.get("title") or "")}</a>'
        f' — {escape(row.get("company") or "?")}'
        + (f' <span style="color:#586074">· {escape(_salary(row))}</span>' if _salary(row) else "")
        + "</li>"
        for row in shown
    )
    html = '<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.45;color:#0E1120">'
    html += f"<ol style=\"padding-left:20px\">{items}</ol>" if shown else "<p>Ostatni fetch nie dodał nowych ofert.</p>"
    if more > 0:
        html += f"<p>{more_line}</p>"
    if failed:
        html += "<p style=\"color:#9A5B00\">" + "<br>".join(f"⚠️ {escape(f)}" for f in failed) + "</p>"
    app_url = os.environ.get("APP_URL")
    if app_url:
        # The app opens on the New view: the same offers this e-mail lists (web ?view=new).
        links = [("Otwórz JOffers", app_link(app_url, view="new"))]
        if new_rows:
            best = max(new_rows, key=lambda row: row.get("score") or 0)
            offer_id = best.get("external_id") or best.get("url") or ""
            links.append(("Otwórz najlepszą ofertę", app_link(app_url, offer=offer_id)))
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
