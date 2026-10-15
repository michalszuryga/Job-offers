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
    subject, text, html = notify.build_summary(rows, run)
    assert subject == "JOffers: 12 nowych ofert"
    assert text.splitlines()[0] == "1. 90 pkt · QA 0 — Acme · 20 000–25 000 PLN/mies."
    # All 12 are listed, with no "… and N more" line.
    assert "https://board.test/90" in text and "QA 11" in text and "jeszcze" not in text
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


def test_every_offer_is_listed_and_numbered_in_the_text():
    rows = [_row(99 - i, f"QA {i}") for i in range(11)]
    text, html = notify.build_summary(rows, None)[1:]
    assert html.count("<li") == 11 and "11. 89 pkt · QA 10" in text
    # Gmail clipped two-digit <ol> numbers, so each item carries its own number.
    assert "<ol" not in html and '10.</span> <strong>90 pkt</strong>' in html


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


@pytest.mark.parametrize("app_url", ["https://app.test/Job-offers/", "https://app.test/Job-offers"])
def test_app_links_open_the_new_view_and_the_best_offer(monkeypatch, app_url):
    monkeypatch.setenv("APP_URL", app_url)
    best = _row(91, "QA Best", external_id="https://board.test/oferta?id=7&ref=list")
    rows = [_row(80, "QA Ok", external_id="https://board.test/ok"), best]
    _, text, html = notify.build_summary(rows, None)
    new_view = "https://app.test/Job-offers/?view=new"
    best_link = "https://app.test/Job-offers/?offer=https%3A%2F%2Fboard.test%2Foferta%3Fid%3D7%26ref%3Dlist"
    assert f"Otwórz JOffers: {new_view}" in text
    assert f"Otwórz najlepszą ofertę: {best_link}" in text
    assert f'<a href="{new_view}">Otwórz JOffers</a>' in html
    assert f'<a href="{best_link}">Otwórz najlepszą ofertę</a>' in html


def test_no_best_offer_link_without_new_offers(monkeypatch):
    monkeypatch.setenv("APP_URL", "https://app.test/")
    _, text, html = notify.build_summary([], None)
    assert "https://app.test/?view=new" in text and "?offer=" not in html
    assert "Otwórz najlepszą ofertę" not in text


def test_no_app_links_without_app_url(monkeypatch):
    monkeypatch.delenv("APP_URL", raising=False)
    _, text, html = notify.build_summary([_row(80, "QA")], None)
    assert "Otwórz" not in text and "Otwórz" not in html


def test_app_link_keeps_the_path_and_encodes_like_encode_uri_component():
    assert notify.app_link("https://x.test", view="new") == "https://x.test/?view=new"
    assert notify.app_link(" https://x.test/app ", offer="a b/c") == "https://x.test/app/?offer=a%20b%2Fc"


def test_a_huge_fetch_is_capped_at_100_with_a_more_line():
    rows = [_row(50, f"QA {i}") for i in range(102)]
    text, html = notify.build_summary(rows, None)[1:]
    assert html.count("<li") == 100 and "100. 50 pkt · QA 99" in text
    assert "… i jeszcze 2 oferty" in text and "<p>… i jeszcze 2 oferty</p>" in html
