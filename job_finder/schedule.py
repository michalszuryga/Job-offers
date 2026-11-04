"""When a scheduled fetch counts as done. GitHub's own cron is late or skipped on
busy days, so an external scheduler also triggers the workflow; whichever run
comes first in a slot does the fetch and later ones in the same slot skip."""

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

WARSAW = ZoneInfo("Europe/Warsaw")
# Scheduled fetches, as Warsaw hours (cron-job.org triggers at 11:00 and 17:00).
# A slot runs from its hour until the next slot's; a fetch inside it, scheduled
# or manual, makes later triggers of that slot skip.
SLOT_HOURS = (11, 17)


def current_slot_start(now=None, slots=SLOT_HOURS):
    """Start of the slot `now` falls in; before the first slot of the day it is
    yesterday's last one."""
    local = (now or datetime.now(timezone.utc)).astimezone(WARSAW)
    started = [h for h in sorted(slots) if h <= local.hour]
    if started:
        day, hour = local.date(), started[-1]
    else:
        day, hour = local.date() - timedelta(days=1), max(slots)
    return datetime(day.year, day.month, day.day, hour, tzinfo=WARSAW)


def daily_fetch_done(last_fetch_at, now=None, slots=SLOT_HOURS):
    if not last_fetch_at:
        return False
    try:
        fetched = datetime.fromisoformat(str(last_fetch_at).replace("Z", "+00:00"))
    except ValueError:
        return False
    if fetched.tzinfo is None:
        fetched = fetched.replace(tzinfo=timezone.utc)
    return fetched >= current_slot_start(now, slots)
