from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from time import perf_counter

from .config import load_config
from .models import dedup_key
from .scoring import score_job
from .storage import JobStore
from .sources.nofluff import NoFluffSource
from .sources.pracuj import PracujSource
from .sources.justjoin import JustJoinSource
from .sources.remoteok import RemoteOKSource
from .sources.weworkremotely import WeWorkRemotelySource
from .sources.bulldogjob import BulldogJobSource
from .sources.testdevjobs import TestDevJobsSource
from .sources.eldorado import EldoradoSource


@dataclass
class SourceResult:
    name: str
    count: int = 0
    inserted: int = 0
    updated: int = 0
    rejected: int = 0
    duplicate: int = 0
    candidates: int = 0
    parsed: int = 0
    skipped_known: int = 0
    rejected_by_reason: dict = field(default_factory=dict)
    seconds: float = 0.0
    error: str = ""
    error_type: str = ""
    expired: int = 0
    inserted_urls: list = field(default_factory=list)


class _SeenRecorder(set):
    """known_urls stand-in that records every URL a source checks against it,
    i.e. every offer still on its listing — including known ones it skips
    without re-parsing, which would otherwise never be marked as still live."""

    def __init__(self, known):
        super().__init__(known)
        self.asked = set()

    def __contains__(self, item):
        self.asked.add(item)
        return super().__contains__(item)


def _fetch_and_score(source, cfg, known_urls):
    """Network I/O only — no DB writes here, so sources can run concurrently
    without a lock. Storing happens afterwards, serially, once every source's
    jobs are in hand and can be deduplicated against each other."""
    started = perf_counter()
    try:
        jobs = source.fetch(known_urls=known_urls)
        scored_jobs = [score_job(job, cfg) for job in jobs]
        return {
            "source": source,
            "scored_jobs": scored_jobs,
            "count": len(jobs),
            "candidates": getattr(source, "candidates", len(jobs)),
            "parsed": getattr(source, "parsed", len(jobs)),
            "skipped_known": getattr(source, "skipped_known", 0),
            "seconds": perf_counter() - started,
            "error": "; ".join(source.errors[:3]) if getattr(source, "errors", None) else "",
            "error_type": "OfferParseError" if getattr(source, "errors", None) else "",
        }
    except Exception as exc:
        return {
            "source": source,
            "scored_jobs": [],
            "count": 0, "candidates": 0, "parsed": 0, "skipped_known": 0,
            "seconds": perf_counter() - started,
            "error": str(exc),
            "error_type": type(exc).__name__,
        }


# For UI use (e.g. "N/SOURCE_COUNT sources fetched so far") — kept as a plain
# number, not a captured list of the classes themselves: collect_live_jobs()
# below looks up each source class by name at call time (module-level lookup),
# which is what lets tests monkeypatch e.g. `collector.JustJoinSource` and have
# it take effect. A list captured once at import time would freeze in the
# original classes and silently ignore any later monkeypatching.
SOURCE_COUNT = 8
SENSITIVE_SOURCE_COUNT = 3  # Pracuj.pl, No Fluff Jobs, CzyJestEldorado


def collect_live_jobs(config_path="config/profile.yaml", on_source_fetched=None, skip_sensitive=False,
                      store=None, expire_after_days=14):
    cfg = load_config(config_path)
    store = store or JobStore()
    sources = [
        NoFluffSource(), PracujSource(), JustJoinSource(),
        RemoteOKSource(), WeWorkRemotelySource(), BulldogJobSource(), TestDevJobsSource(),
        EldoradoSource(),
    ]
    if skip_sensitive:
        # Skip sources that have shown rate-limiting/blocking under load
        # (Pracuj.pl, No Fluff Jobs, CzyJestEldorado) — for a fast run, or to
        # avoid poking a site that's already actively blocking this IP.
        sources = [source for source in sources if not source.sensitive]
    # Offers already in the database don't need their detail page re-fetched;
    # this is what keeps repeat fetches fast (and Pracuj.pl's Cloudflare
    # protection happy) once the first cold run has populated the store.
    existing_rows = store.list_all()
    known_urls = {row["url"] for row in existing_rows}
    known_ids = {row["external_id"] for row in existing_rows}
    # Aggregators (e.g. CzyJestEldorado) re-host postings that already exist
    # under a different URL on a direct board — URL-based known_urls can't
    # catch that, so seed a title+company dedup set from what's already stored.
    seen_dedup_keys = {dedup_key(row.get("title"), row.get("company")) for row in existing_rows}

    # Sources are independent and network-bound; fetching them concurrently
    # keeps total wall-clock close to the slowest single source instead of
    # their sum (Pracuj's rate-limited fetch alone can take a minute).
    #
    # Storing + dedup happens right here, inline, as each source finishes —
    # not in a second pass after every source is done. That's what lets a
    # caller show real offers appearing progressively instead of one blank
    # wait for the slowest source. Dedup stays correct either way (a later
    # completion never misses an earlier one's keys), but which source "wins"
    # when the same posting shows up on two of them depends on completion
    # order, not the list order above — e.g. if an aggregator happens to finish
    # first, its copy is what gets kept and the direct board's is the duplicate.
    results = []
    recorders = {source: _SeenRecorder(known_urls) for source in sources}
    with ThreadPoolExecutor(max_workers=len(sources)) as executor:
        futures = {
            executor.submit(_fetch_and_score, source, cfg, recorders[source]): source
            for source in sources
        }
        for future in as_completed(futures):
            source = futures[future]
            raw = future.result()

            inserted = updated = rejected = duplicate = 0
            rejected_by_reason = {}
            inserted_urls = []
            new_jobs = []
            to_store = []
            for scored in raw["scored_jobs"]:
                if getattr(scored, "rejected", False):
                    rejected += 1
                    reason = scored.reject_reason or "Unknown"
                    rejected_by_reason[reason] = rejected_by_reason.get(reason, 0) + 1
                    # Store rejected offers too (hidden from the dashboard by
                    # the rejected=0 filter) so their URL is known next time
                    # and its detail page doesn't need re-fetching.
                    to_store.append(scored)
                    continue

                key = dedup_key(scored.title, scored.company)
                if key in seen_dedup_keys:
                    duplicate += 1
                    continue
                seen_dedup_keys.add(key)

                to_store.append(scored)
                if scored.external_id in known_ids:
                    updated += 1
                else:
                    known_ids.add(scored.external_id)
                    inserted += 1
                    inserted_urls.append(scored.external_id)
                    new_jobs.append(scored)

            # One bulk write per source: per-offer writes cost a full network
            # round trip each against a remote Postgres.
            store.upsert_many(to_store)
            expired = 0
            listing_ok = raw["candidates"] > 0 and raw["error_type"] in ("", "OfferParseError")
            if listing_ok:
                seen = recorders[source].asked | {job.external_id for job in raw["scored_jobs"]}
                store.touch_seen(seen)
                # Only for a source whose listing actually loaded — a blocked or
                # failed source would otherwise make all its offers look expired.
                expired = store.delete_expired(source.name, expire_after_days)

            result = SourceResult(
                name=source.name,
                count=raw["count"],
                inserted=inserted,
                updated=updated,
                rejected=rejected,
                duplicate=duplicate,
                candidates=raw["candidates"],
                parsed=raw["parsed"],
                skipped_known=raw["skipped_known"],
                rejected_by_reason=rejected_by_reason,
                seconds=raw["seconds"],
                error=raw["error"],
                error_type=raw["error_type"],
                expired=expired,
                inserted_urls=inserted_urls,
            )
            results.append(result)

            # Fired on the main thread as soon as this source is fetched AND
            # stored — the dashboard can render `new_jobs` immediately rather
            # than waiting for every source to finish.
            if on_source_fetched:
                on_source_fetched(raw, result, new_jobs)

    return results
