from job_finder import notify


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
    assert subject == "JOffers: 12 nowych ofert (24 h)"
    assert text.splitlines()[0] == "90 · QA 0 — Acme · 20 000–25 000 PLN/mies."
    assert "https://board.test/90" in text and "… i 2 więcej" in text
    assert "⚠️ Pracuj.pl: HTTPError" in text and "JustJoin" not in text
    assert '<a href="https://board.test/90">QA 0</a>' in html
    assert "https://app.test/" in html


def test_summary_escapes_html_from_scraped_titles():
    _, _, html = notify.build_summary([_row(50, "<script>x</script>")], None)
    assert "<script>" not in html and "&lt;script&gt;" in html


def test_summary_with_nothing_new():
    subject, text, _ = notify.build_summary([], None, hours=72)
    assert subject == "JOffers: brak nowych ofert (72 h)"
    assert text.startswith("Ostatni fetch nie dodał nowych ofert.")


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
