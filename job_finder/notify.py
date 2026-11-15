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


def build_summary(new_rows, last_run, hours=None, alarms=()):
    """Returns (subject, plain_text, html). `hours` set means the rows come from
    the time-window fallback, which the subject then says. Offers that are only
    potentially remote (remote_hint, see web_utils.remote_hint) get a section of
    their own below the rest, each with the phrase that put it there. `alarms` are the
    sources to check (source_alarms), listed at the end."""
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

    from .cv_variants import load_variants, suggest_variant
    variants = load_variants()

    def cv_line(row):
        key = suggest_variant(row, variants)
        return f"CV: {variants[key].get('label') or key}" if key else ""

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
            if cv_line(row):
                lines.append(f"   {cv_line(row)}")
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
    if alarms:
        lines.extend(["", "Źródła do sprawdzenia:"] + [f"🔕 {a}" for a in alarms])
    text = "\n".join(lines)

    def item(number, row):
        extra = ""
        if row.get("remote_hint"):
            extra += f'<br><span style="color:#586074;font-style:italic">„{escape(row["remote_hint"])}”</span>'
        if cv_line(row) or app_url:
            extra += '<br><span style="font-size:13px">'
            if cv_line(row):
                extra += f'<span style="color:#586074">{escape(cv_line(row))}</span>'
            if app_url:
                extra += (" · " if cv_line(row) else "") + (
                    f'<a href="{escape(applied_link(row), quote=True)}" style="color:#2F5D50">✓ Aplikowałem</a>')
            extra += "</span>"
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
    if alarms:
        html += ('<p style="color:#9A5B00"><strong>Źródła do sprawdzenia</strong><br>'
                 + "<br>".join(f"🔕 {escape(a)}" for a in alarms) + "</p>")
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


def _parse_time(value):
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _median(values):
    values = sorted(values)
    if not values:
        return None
    middle = len(values) // 2
    return values[middle] if len(values) % 2 else (values[middle - 1] + values[middle]) / 2


def weekly_stats(rows, now=None, days=7, good_score=60):
    """The week in numbers, from stored rows: how fast offers reach JOffers after they
    are published (boards that give only a date are left out: their time is midnight),
    how fast you apply after JOffers shows one, and the good offers nobody acted on."""
    now = now or datetime.now(timezone.utc)
    since = now - timedelta(days=days)
    new = [r for r in rows if (_parse_time(r.get("first_seen_at")) or since) > since]
    visible = [r for r in new if not r.get("rejected")]
    lags = {}
    for row in visible:
        published, seen = _parse_time(row.get("published_at")), _parse_time(row.get("first_seen_at"))
        # Published this week too: a new source's first fetch brings months-old offers.
        if published and seen and published > since and (published.hour, published.minute, published.second) != (0, 0, 0):
            lags.setdefault(row.get("source") or "?", []).append(max(0.0, (seen - published).total_seconds() / 3600))
    applied = [r for r in rows if (_parse_time(r.get("applied_at")) or since) > since]
    to_apply = [((_parse_time(r["applied_at"]) - _parse_time(r["first_seen_at"])).total_seconds() / 3600)
                for r in applied if _parse_time(r.get("first_seen_at"))]
    untouched = [r for r in visible if (r.get("score") or 0) >= good_score
                 and (r.get("application_status") or "TO_REVIEW") in ("TO_REVIEW", "REVIEW")]
    all_lags = [h for values in lags.values() for h in values]
    return {
        "new": len(new), "visible": len(visible),
        "maybe": sum(1 for r in visible if r.get("remote_hint")),
        "good": sum(1 for r in visible if (r.get("score") or 0) >= good_score),
        "lag_hours": _median(all_lags),
        "lag_by_source": sorted(((source, _median(v), len(v)) for source, v in lags.items()), key=lambda x: x[1]),
        "applied": len(applied), "apply_hours": _median(to_apply),
        "untouched_good": sorted(untouched, key=lambda r: -(r.get("score") or 0)),
    }


def source_alarms(runs, rows, now=None, broken_hours=48, quiet_days=4, history_days=30, min_days=3):
    """Sources worth a look, as e-mail lines. Two kinds:
    - broken: every run in the last `broken_hours` (at least two) failed or listed nothing;
    - quiet: it loads, yet stored no new offer for `quiet_days`, though before that it
      brought new offers on at least `min_days` different days (a board's first, one-off
      backfill doesn't count — single-company boards are quiet by nature).
    Only sources that still run are checked: one left out on purpose (--skip-source) isn't news."""
    now = now or datetime.now(timezone.utc)
    recent = {}
    for run in sorted(runs, key=lambda r: r.get("started_at") or "", reverse=True):
        started = _parse_time(run.get("started_at"))
        if started and now - timedelta(hours=broken_hours) < started <= now:
            for result in run.get("results") or []:
                recent.setdefault(result["name"], []).append(result)
    alarms, broken = [], set()
    for name, results in sorted(recent.items()):
        failed = [r for r in results
                  if not r.get("candidates") or r.get("error_type") not in ("", None, "OfferParseError")]
        if len(results) >= 2 and len(failed) == len(results):
            broken.add(name)
            why = results[0].get("error_type") or "pusta lista ogłoszeń"
            alarms.append(f"{name}: nie działa od {broken_hours} h ({len(results)} "
                          f"{_plural(len(results), 'próba', 'próby', 'prób')}, ostatnio: {why})")
    quiet_since, history_since = now - timedelta(days=quiet_days), now - timedelta(days=history_days)
    for name in sorted(set(recent) - broken):
        seen = sorted(t for t in (_parse_time(r.get("first_seen_at")) for r in rows if r.get("source") == name) if t)
        if not seen or seen[-1] > quiet_since:
            continue
        days = {t.date() for t in seen if history_since < t <= quiet_since} - {seen[0].date()}
        if len(days) >= min_days:
            idle = (now - seen[-1]).days
            alarms.append(f"{name}: od {idle} {_plural(idle, 'dnia', 'dni', 'dni')} ani jednej nowej oferty "
                          f"(wcześniej nowe w {len(days)} {_plural(len(days), 'dzień', 'dni', 'dni')} z {history_days})")
    return alarms


def _hours(value):
    if value is None:
        return "—"
    return f"{value * 60:.0f} min" if value < 1 else f"{value:.1f} h" if value < 48 else f"{value / 24:.1f} dni"


def build_weekly(stats, candidates, app_url="", alarms=()):
    """Returns (subject, text, html): the Monday report, then the companies to approve."""
    subject = f"JOffers: tydzień — {stats['visible']} ofert, {stats['applied']} aplikacji"
    if candidates:
        subject += f" · {len(candidates)} {_plural(len(candidates), 'firma', 'firmy', 'firm')} do akceptacji"
    facts = [
        f"Nowe oferty: {stats['visible']} widocznych (z {stats['new']} pobranych), w tym ≥60 pkt: {stats['good']}, "
        f"potencjalnie zdalnych: {stats['maybe']}",
        f"Od publikacji do JOffers (mediana): {_hours(stats['lag_hours'])}",
        f"Oznaczonych jako „Aplikowałem”: {stats['applied']}"
        + (f", od pojawienia się w JOffers do aplikacji (mediana): {_hours(stats['apply_hours'])}"
           if stats["apply_hours"] is not None else ""),
        f"Dobre oferty (≥60 pkt) bez reakcji: {len(stats['untouched_good'])}",
    ]
    by_source = [f"{source}: {_hours(h)} ({n})" for source, h, n in stats["lag_by_source"]]
    waiting = [f"{r.get('score') or 0:.0f} pkt · {r.get('title')} — {r.get('company')}"
               + (f"\n   {app_link(app_url, offer=_offer_id(r))}" if app_url else f"\n   {r.get('url')}")
               for r in stats["untouched_good"][:10]]
    text = "\n".join(facts)
    if by_source:
        text += "\n\nCzas do JOffers wg źródła: " + "; ".join(by_source)
    if waiting:
        text += "\n\nCzekają na decyzję:\n" + "\n".join(waiting)
    html = ('<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.45;color:#0E1120">'
            + "<ul>" + "".join(f"<li>{escape(f)}</li>" for f in facts) + "</ul>")
    if by_source:
        html += f'<p style="color:#586074;font-size:13px">Czas do JOffers wg źródła: {escape("; ".join(by_source))}</p>'
    if waiting:
        html += "<h3 style=\"font-size:15px\">Czekają na decyzję</h3><ul>" + "".join(
            f'<li><a href="{escape(app_link(app_url, offer=_offer_id(r)) if app_url else r.get("url") or "", quote=True)}">'
            f'{escape(r.get("title") or "")}</a> — {escape(r.get("company") or "")} · {r.get("score") or 0:.0f} pkt</li>'
            for r in stats["untouched_good"][:10]) + "</ul>"
    if alarms:
        text += "\n\nŹródła do sprawdzenia:\n" + "\n".join(f"🔕 {a}" for a in alarms)
        html += ('<h3 style="font-size:15px">Źródła do sprawdzenia</h3><ul>'
                 + "".join(f"<li>{escape(a)}</li>" for a in alarms) + "</ul>")
    if candidates:
        _, ctext, chtml = build_ats_candidates(candidates, app_url)
        text += "\n\n— Firmy do akceptacji —\n" + ctext
        html += '<h3 style="font-size:15px">Firmy do akceptacji</h3>' + chtml
    return subject, text, html + "</div>"
