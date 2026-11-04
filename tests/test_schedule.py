from datetime import datetime, timezone

from job_finder.schedule import current_slot_start, daily_fetch_done

# 14:30 in Warsaw (CEST, UTC+2): inside the 11:00 slot.
NOW = datetime(2026, 10, 13, 12, 30, tzinfo=timezone.utc)


def test_fetch_in_the_current_slot_counts_as_done():
    # 11:03 Warsaw.
    assert daily_fetch_done("2026-10-13T09:03:00+00:00", NOW)


def test_morning_manual_fetch_does_not_stop_the_11_oclock_run():
    # 09:00 Warsaw.
    assert not daily_fetch_done("2026-10-13T07:00:00+00:00", NOW)


def test_the_18_oclock_slot_runs_even_after_a_midday_fetch():
    evening = datetime(2026, 11, 4, 17, 2, tzinfo=timezone.utc)  # 18:02 Warsaw (CET, UTC+1)
    assert not daily_fetch_done("2026-11-04T10:00:00+00:00", evening)  # 11:00 Warsaw
    assert daily_fetch_done("2026-11-04T17:01:00+00:00", evening)  # 18:01 Warsaw


def test_before_11_the_slot_is_yesterdays_evening_one():
    early = datetime(2026, 11, 5, 6, 0, tzinfo=timezone.utc)  # 07:00 Warsaw
    assert current_slot_start(early).isoformat() == "2026-11-04T18:00:00+01:00"
    assert daily_fetch_done("2026-11-04T17:05:00+00:00", early)


def test_yesterdays_fetch_does_not_count_for_todays_slot():
    assert not daily_fetch_done("2026-10-12T19:54:00+00:00", NOW)


def test_missing_or_broken_value_means_not_done():
    assert not daily_fetch_done(None, NOW)
    assert not daily_fetch_done("not a date", NOW)
