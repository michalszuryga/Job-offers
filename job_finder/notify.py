"""Daily summary pushed to a phone via ntfy (https://ntfy.sh): free, no account,
the phone app just subscribes to a topic name. Anyone who knows the topic can
read it, so the topic must be a long random string kept as a secret."""

import os

import requests


def _salary(row):
    low, high = row.get("salary_min"), row.get("salary_max")
    if low is None and high is None:
        return ""
    values = [v for v in dict.fromkeys((low, high)) if v is not None]
    amounts = "–".join(f"{v:,.0f}".replace(",", " ") for v in values)
    period = {"hour": "/h", "month": "/mies.", "year": "/rok"}.get((row.get("salary_period") or "").lower(), "")
    return f" · {amounts} {row.get('salary_currency') or ''}{period}".rstrip()


def build_summary(new_rows, last_run, hours=24, top=10):
    count = len(new_rows)
    title = f"JOffers: {count} nowych ofert ({hours} h)" if count else f"JOffers: brak nowych ofert ({hours} h)"
    lines = [
        f"{row.get('score') or 0:.0f} · {row.get('title')} — {row.get('company') or '?'}{_salary(row)}"
        for row in new_rows[:top]
    ]
    if count > top:
        lines.append(f"… i {count - top} więcej")
    failed = [
        f"⚠️ {r['name']}: {r['error_type'] or 'błąd'}"
        for r in (last_run or {}).get("results", [])
        if r.get("error") and r.get("error_type") != "OfferParseError"
    ]
    if failed:
        lines.append("")
        lines.extend(failed)
    return title, "\n".join(lines) or "Ostatni fetch nie dodał nowych ofert."


def send_ntfy(title, message, click_url=None):
    topic = os.environ.get("NTFY_TOPIC")
    if not topic:
        return False
    payload = {"topic": topic, "title": title, "message": message, "tags": ["briefcase"]}
    if click_url:
        payload["click"] = click_url
    # JSON publishing (not headers) so Polish characters in the title survive.
    server = os.environ.get("NTFY_SERVER", "https://ntfy.sh").rstrip("/")
    response = requests.post(server, json=payload, timeout=20)
    response.raise_for_status()
    return True
