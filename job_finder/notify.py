"""Daily summary e-mail, sent through Gmail SMTP with an app password (the
same one Supabase Auth uses for sign-in links)."""

import os
import smtplib
from email.message import EmailMessage
from html import escape


def _salary(row):
    low, high = row.get("salary_min"), row.get("salary_max")
    if low is None and high is None:
        return ""
    values = [v for v in dict.fromkeys((low, high)) if v is not None]
    amounts = "–".join(f"{v:,.0f}".replace(",", " ") for v in values)
    period = {"hour": "/h", "month": "/mies.", "year": "/rok"}.get((row.get("salary_period") or "").lower(), "")
    return f"{amounts} {row.get('salary_currency') or ''}{period}".strip()


def _failed_sources(last_run):
    return [
        f"{r['name']}: {r['error_type'] or 'błąd'}"
        for r in (last_run or {}).get("results", [])
        if r.get("error") and r.get("error_type") != "OfferParseError"
    ]


def build_summary(new_rows, last_run, hours=24, top=10):
    """Returns (subject, plain_text, html)."""
    count = len(new_rows)
    subject = f"JOffers: {count} nowych ofert ({hours} h)" if count else f"JOffers: brak nowych ofert ({hours} h)"
    shown = new_rows[:top]
    more = count - len(shown)
    failed = _failed_sources(last_run)

    lines = []
    for row in shown:
        salary = _salary(row)
        lines.append(f"{row.get('score') or 0:.0f} · {row.get('title')} — {row.get('company') or '?'}"
                     + (f" · {salary}" if salary else "") + f"\n   {row.get('url')}")
    if more > 0:
        lines.append(f"… i {more} więcej")
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
        html += f"<p>… i {more} więcej</p>"
    if failed:
        html += "<p style=\"color:#9A5B00\">" + "<br>".join(f"⚠️ {escape(f)}" for f in failed) + "</p>"
    app_url = os.environ.get("APP_URL")
    if app_url:
        html += f'<p><a href="{escape(app_url, quote=True)}">Otwórz JOffers</a></p>'
        text += f"\n\nOtwórz JOffers: {app_url}"
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
