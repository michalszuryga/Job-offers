import json
from datetime import datetime, timedelta, timezone

import pytest

from job_finder import notify
from job_finder.models import Job
from job_finder.storage import JobStore


def _row(score, title, **extra):
    return {"score": score, "title": title, "company": "Acme", "url": f"https://board.test/{score}", **extra}


def test_summary_lists_top_offers_with_links_and_failed_sources(monkeypatch):
    monkeypatch.setenv("APP_URL", "https://app.test/")
    rows = [_row(90 - i, f"QA {i}") for i in range(12)]
    rows[0].update(salary_min=20000, salary_max=25000, salary_currency="PLN", salary_period="month")
    run = {"results": [
        {"name": "Pracuj.pl", "error": "403", "error_type": "HTTPError"},
        {"name": "JustJoin.IT", "error": "1 page failed", "error_type": "OfferParseError"},
    ]}
    subject, text, html = notify.build_summary(rows, run, top=10)
    assert subject == "JOffers: 12 nowych ofert"
    assert text.splitlines()[0] == "90 · QA 0 — Acme · 20 000–25 000 PLN/mies."
    assert "https://board.test/90" in text and "… i jeszcze 2 oferty" in text
    assert "⚠️ Pracuj.pl: HTTPError" in text and "JustJoin" not in text
    silent = {"results": [{"name": "Bulldogjob", "error": "", "error_type": "AssertionError"}]}
    assert "⚠️ Bulldogjob: AssertionError" in notify.build_summary([], silent)[1]
    assert '<a href="https://board.test/90">QA 0</a>' in html
    assert "https://app.test/" in html


def test_summary_escapes_html_from_scraped_titles():
    _, _, html = notify.build_summary([_row(50, "<script>x</script>")], None)
    assert "<script>" not in html and "&lt;script&gt;" in html


def test_summary_with_nothing_new():
    subject, text, _ = notify.build_summary([], None)
    assert subject == "JOffers: brak nowych ofert"
    assert text.startswith("Ostatni fetch nie dodał nowych ofert.")


def test_hours_fallback_is_named_in_the_subject():
    assert notify.build_summary([], None, hours=72)[0] == "JOffers: brak nowych ofert (72 h)"
    assert notify.build_summary([_row(80, "QA")], None, hours=24)[0] == "JOffers: 1 nowa oferta (24 h)"


@pytest.mark.parametrize("count, words", [
    (1, "nowa oferta"), (2, "nowe oferty"), (4, "nowe oferty"), (5, "nowych ofert"),
    (12, "nowych ofert"), (14, "nowych ofert"), (21, "nowych ofert"), (22, "nowe oferty"),
])
def test_subject_uses_polish_plurals(count, words):
    rows = [_row(99 - i, f"QA {i}") for i in range(count)]
    assert notify.build_summary(rows, None)[0] == f"JOffers: {count} {words}"


def test_more_line_uses_polish_plurals():
    rows = [_row(99 - i, f"QA {i}") for i in range(11)]
    text, html = notify.build_summary(rows, None, top=10)[1:]
    assert "… i jeszcze 1 oferta" in text and "<p>… i jeszcze 1 oferta</p>" in html


def _store_with(tmp_path, *jobs, fetched_hours_ago=0.1):
    store = JobStore(tmp_path / "jobs.db")
    store.upsert_many(jobs)
    finished = datetime.now(timezone.utc) - timedelta(hours=fetched_hours_ago)
    store.set_meta("last_fetch_at", finished.isoformat(timespec="seconds"))
    return store


def test_summary_counts_the_visible_new_ids_of_the_last_fetch(tmp_path):
    new_best = Job("QA Best", "A", "https://board.test/best", "src", score=90)
    new_ok = Job("QA Ok", "B", "https://board.test/ok", "src", score=60)
    new_rejected = Job("Java QA", "C", "https://board.test/java", "src", score=0, rejected=True)
    older = Job("QA Older", "D", "https://board.test/older", "src", score=95)
    store = _store_with(tmp_path, new_best, new_ok, new_rejected, older)
    new_ids = [new_ok.external_id, new_rejected.external_id, new_best.external_id]
    store.set_meta("last_fetch_new_ids", json.dumps(new_ids))

    rows, hours = notify.summary_rows(store)
    visible_new = [r for r in store.list(0) if r["external_id"] in new_ids]
    assert hours is None
    assert len(rows) == len(visible_new) == 2
    assert [r["title"] for r in rows] == ["QA Best", "QA Ok"]
    assert notify.build_summary(rows, None)[0] == "JOffers: 2 nowe oferty"


def test_summary_falls_back_to_the_hours_window_without_new_ids(tmp_path):
    store = _store_with(tmp_path, Job("QA Fresh", "A", "https://board.test/fresh", "src", score=70))
    rows, hours = notify.summary_rows(store, fallback_hours=48)
    assert hours == 48 and [r["title"] for r in rows] == ["QA Fresh"]


@pytest.mark.parametrize("hours_ago", [13, 23.9, 30])
def test_a_fetch_that_is_not_todays_falls_back_to_the_window(tmp_path, hours_ago):
    # Today's fetch failed before run_fetch recorded anything: the ids are yesterday's.
    stale = Job("QA Yesterday", "A", "https://board.test/old", "src", score=90)
    store = _store_with(tmp_path, stale, fetched_hours_ago=hours_ago)
    store.set_meta("last_fetch_new_ids", json.dumps([stale.external_id]))
    rows, hours = notify.summary_rows(store, fallback_hours=6)
    assert hours == 6
    assert notify.fetch_is_current(store) is False


def test_a_missing_or_broken_fetch_time_is_not_current(tmp_path):
    store = JobStore(tmp_path / "jobs.db")
    assert notify.fetch_is_current(store) is False
    store.set_meta("last_fetch_at", "not a date")
    assert notify.fetch_is_current(store) is False
    store.set_meta("last_fetch_at", "2026-10-11T16:05:00")
    assert notify.fetch_is_current(store, now=datetime(2026, 10, 11, 18, tzinfo=timezone.utc)) is True


def test_an_empty_last_fetch_is_not_a_fallback(tmp_path):
    store = _store_with(tmp_path, Job("QA Fresh", "A", "https://board.test/fresh", "src", score=70))
    store.set_meta("last_fetch_new_ids", "[]")
    assert notify.summary_rows(store) == ([], None)


def test_send_is_skipped_without_credentials(monkeypatch):
    monkeypatch.delenv("SMTP_USER", raising=False)
    monkeypatch.delenv("SMTP_PASSWORD", raising=False)
    assert notify.send_email("s", "t", "<p>h</p>") is False


def test_send_uses_gmail_ssl_and_defaults_recipient_to_sender(monkeypatch):
    sent = {}

    class FakeSMTP:
        def __init__(self, host, port, timeout):
            sent.update(host=host, port=port)
        def __enter__(self):
            return self
        def __exit__(self, *exc):
            return False
        def login(self, user, password):
            sent["login"] = (user, password)
        def send_message(self, message):
            sent["to"], sent["subject"] = message["To"], message["Subject"]

    monkeypatch.setenv("SMTP_USER", "me@gmail.com")
    monkeypatch.setenv("SMTP_PASSWORD", "app-pass")
    monkeypatch.delenv("SUMMARY_TO", raising=False)
    monkeypatch.setattr(notify.smtplib, "SMTP_SSL", FakeSMTP)
    assert notify.send_email("Temat ąę", "t", "<p>h</p>") is True
    assert sent == {"host": "smtp.gmail.com", "port": 465, "login": ("me@gmail.com", "app-pass"),
                    "to": "me@gmail.com", "subject": "Temat ąę"}
