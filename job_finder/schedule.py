"""When the daily fetch counts as done. GitHub's own cron is late or skipped on
busy days, so an external scheduler also triggers the workflow; whichever run
comes first does the fetch and later ones skip."""

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

WARSAW = ZoneInfo("Europe/Warsaw")
# A fetch from this hour on (Warsaw time) is today's daily fetch; an earlier
# manual one doesn't stop the evening run.
DAILY_FROM_HOUR = 17


def daily_fetch_done(last_fetch_at, now=None, from_hour=DAILY_FROM_HOUR):
    if not last_fetch_at:
        return False
    try:
        fetched = datetime.fromisoformat(str(last_fetch_at).replace("Z", "+00:00"))
    except ValueError:
        return False
    if fetched.tzinfo is None:
        fetched = fetched.replace(tzinfo=timezone.utc)
    fetched = fetched.astimezone(WARSAW)
    today = (now or datetime.now(timezone.utc)).astimezone(WARSAW).date()
    return fetched.date() == today and fetched.hour >= from_hour
