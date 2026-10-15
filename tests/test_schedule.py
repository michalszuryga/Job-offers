from datetime import datetime, timezone

from job_finder.schedule import daily_fetch_done

# 14:30 in Warsaw (CEST, UTC+2).
NOW = datetime(2026, 10, 13, 12, 30, tzinfo=timezone.utc)


def test_midday_fetch_today_counts_as_done():
    # 12:03 Warsaw.
    assert daily_fetch_done("2026-10-13T10:03:00+00:00", NOW)


def test_morning_manual_fetch_does_not_stop_the_midday_run():
    # 09:00 Warsaw.
    assert not daily_fetch_done("2026-10-13T07:00:00+00:00", NOW)


def test_yesterdays_late_fetch_does_not_count():
    # 21:54 Warsaw the day before.
    assert not daily_fetch_done("2026-10-12T19:54:00+00:00", NOW)


def test_missing_or_broken_value_means_not_done():
    assert not daily_fetch_done(None, NOW)
    assert not daily_fetch_done("not a date", NOW)
