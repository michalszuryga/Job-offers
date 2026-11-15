"""Silent-source alarm: a source that keeps failing, or one that loads yet stopped
bringing new offers, is named in the 11:00 / 18:00 e-mail and the Monday report."""

from datetime import datetime, timedelta, timezone

from job_finder.notify import build_summary, build_weekly, source_alarms, weekly_stats

NOW = datetime(2026, 11, 20, 17, 5, tzinfo=timezone.utc)


def _run(hours_ago, **sources):
    started = (NOW - timedelta(hours=hours_ago)).isoformat(timespec="seconds")
    return {"started_at": started, "results": [{"name": name, **result} for name, result in sources.items()]}


OK = {"candidates": 50, "error_type": ""}


def _seen(source, *days_ago):
    return [{"source": source, "first_seen_at": (NOW - timedelta(days=d)).isoformat()} for d in days_ago]


def test_a_source_failing_in_every_recent_run_is_broken():
    runs = [_run(1, Pracuj=dict(candidates=0, error_type="HTTPError"), JJIT=OK),
            _run(7, Pracuj=dict(candidates=0, error_type=""), JJIT=OK),
            _run(30, Pracuj=dict(candidates=0, error_type="HTTPError"))]
    alarms = source_alarms(runs, _seen("JJIT", 0), now=NOW)
    assert alarms == ["Pracuj: nie działa od 48 h (3 próby, ostatnio: HTTPError)"]


def test_one_failure_or_one_good_run_is_not_an_alarm():
    one = [_run(1, Pracuj=dict(candidates=0, error_type="HTTPError"))]
    mixed = one + [_run(7, Pracuj=OK)]
    parse_errors = [_run(1, Pracuj=dict(candidates=9, error_type="OfferParseError")), _run(7, Pracuj=OK)]
    rows = _seen("Pracuj", 0)
    assert source_alarms(one, rows, now=NOW) == source_alarms(mixed, rows, now=NOW) == []
    assert source_alarms(parse_errors, rows, now=NOW) == []


def test_runs_older_than_48_hours_do_not_count():
    runs = [_run(60, Pracuj=dict(candidates=0)), _run(70, Pracuj=dict(candidates=0))]
    assert source_alarms(runs, [], now=NOW) == []


def test_a_source_that_loads_but_brought_nothing_new_for_days_is_quiet():
    runs = [_run(1, Bulldog=OK), _run(7, Bulldog=OK)]
    rows = _seen("Bulldog", 25, 25, 12, 9, 6)
    assert source_alarms(runs, rows, now=NOW) == [
        "Bulldog: od 6 dni ani jednej nowej oferty (wcześniej nowe w 3 dni z 30)"]


def test_quiet_needs_a_history_beyond_the_first_backfill():
    runs = [_run(1, Workable=OK), _run(7, Workable=OK)]
    backfill = _seen("Workable", *[16] * 28)  # 28 offers on the first day, nothing since
    assert source_alarms(runs, backfill, now=NOW) == []
    assert source_alarms(runs, _seen("Workable", 16, 12, 9, 2), now=NOW) == []  # new 2 days ago


def test_a_source_left_out_of_the_runs_is_not_checked():
    assert source_alarms([_run(1, JJIT=OK), _run(7, JJIT=OK)], _seen("CzyJestEldorado", 40, 30, 20, 10), now=NOW) == []


def test_the_summary_and_the_weekly_report_list_the_alarms():
    alarms = ["Pracuj: nie działa od 48 h (3 próby, ostatnio: HTTPError)"]
    _, text, html = build_summary([], None, alarms=alarms)
    assert "Źródła do sprawdzenia:\n🔕 Pracuj" in text and "Źródła do sprawdzenia" in html and "Pracuj" in html
    _, text, html = build_weekly(weekly_stats([], now=NOW), [], alarms=alarms)
    assert "🔕 Pracuj" in text and "<li>Pracuj" in html
    assert "Źródła do sprawdzenia" not in build_summary([], None)[1]


def test_the_store_returns_recent_runs_newest_first(tmp_path, monkeypatch):
    from job_finder.storage import JobStore
    monkeypatch.delenv("DATABASE_URL", raising=False)
    store = JobStore(str(tmp_path / "runs.db"))
    now = datetime.now(timezone.utc)
    for hours in (1, 30, 80):
        started = (now - timedelta(hours=hours)).isoformat(timespec="seconds")
        store.record_fetch_run(started, started, "test", [{"name": f"S{hours}", "candidates": 1}])
    runs = store.fetch_runs(days=2)
    assert [r["results"][0]["name"] for r in runs] == ["S1", "S30"]
