from job_finder import notify


def _row(score, title, **extra):
    return {"score": score, "title": title, "company": "Acme", **extra}


def test_summary_lists_top_offers_and_failed_sources():
    rows = [_row(90 - i, f"QA {i}") for i in range(12)]
    rows[0].update(salary_min=20000, salary_max=25000, salary_currency="PLN", salary_period="month")
    run = {"results": [
        {"name": "Pracuj.pl", "error": "403", "error_type": "HTTPError"},
        {"name": "JustJoin.IT", "error": "1 page failed", "error_type": "OfferParseError"},
    ]}
    title, message = notify.build_summary(rows, run, top=10)
    assert title == "JOffers: 12 nowych ofert (24 h)"
    assert message.splitlines()[0] == "90 · QA 0 — Acme · 20 000–25 000 PLN/mies."
    assert "… i 2 więcej" in message
    assert "⚠️ Pracuj.pl: HTTPError" in message
    assert "JustJoin" not in message  # partial parse errors aren't a failed source


def test_summary_with_nothing_new():
    title, message = notify.build_summary([], None, hours=72)
    assert title == "JOffers: brak nowych ofert (72 h)"
    assert message == "Ostatni fetch nie dodał nowych ofert."


def test_send_is_skipped_without_topic(monkeypatch):
    monkeypatch.delenv("NTFY_TOPIC", raising=False)
    assert notify.send_ntfy("t", "m") is False


def test_send_posts_json_to_topic(monkeypatch):
    sent = {}

    class _Ok:
        def raise_for_status(self):
            pass

    def fake_post(url, json, timeout):
        sent.update(url=url, payload=json)
        return _Ok()

    monkeypatch.setenv("NTFY_TOPIC", "secret-topic")
    monkeypatch.setattr(notify.requests, "post", fake_post)
    assert notify.send_ntfy("Tytuł ąę", "body", "https://app") is True
    assert sent["url"] == "https://ntfy.sh"
    assert sent["payload"] == {"topic": "secret-topic", "title": "Tytuł ąę", "message": "body",
                               "tags": ["briefcase"], "click": "https://app"}


def test_equal_salary_bounds_shown_once():
    title, message = notify.build_summary(
        [_row(60, "QA", salary_min=16500, salary_max=16500, salary_currency="PLN", salary_period="month")], None)
    assert message == "60 · QA — Acme · 16 500 PLN/mies."
