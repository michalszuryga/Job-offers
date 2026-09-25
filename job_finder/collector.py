from dataclasses import dataclass, field
from time import perf_counter

from .config import load_config
from .scoring import score_job
from .storage import JobStore
from .sources.nofluff import NoFluffSource
from .sources.pracuj import PracujSource
from .sources.justjoin import JustJoinSource


@dataclass
class SourceResult:
    name: str
    count: int = 0
    inserted: int = 0
    updated: int = 0
    rejected: int = 0
    candidates: int = 0
    parsed: int = 0
    rejected_by_reason: dict = field(default_factory=dict)
    seconds: float = 0.0
    error: str = ""
    error_type: str = ""


def collect_live_jobs(config_path="config/profile.yaml"):
    cfg = load_config(config_path)
    store = JobStore()
    sources = [NoFluffSource(), PracujSource(), JustJoinSource()]
    results = []

    for source in sources:
        started = perf_counter()
        try:
            jobs = source.fetch()
            inserted = 0
            updated = 0
            rejected = 0
            rejected_by_reason = {}
            for job in jobs:
                scored = score_job(job, cfg)
                if getattr(scored, 'rejected', False):
                    rejected += 1
                    reason = scored.reject_reason or "Unknown"
                    rejected_by_reason[reason] = rejected_by_reason.get(reason, 0) + 1
                    continue
                existed = store.contains(scored.url)
                store.upsert(scored)
                if existed:
                    updated += 1
                else:
                    inserted += 1
            results.append(
                SourceResult(
                    name=source.name,
                    count=len(jobs),
                    inserted=inserted,
                    updated=updated,
                    rejected=rejected,
                    candidates=getattr(source, "candidates", len(jobs)),
                    parsed=getattr(source, "parsed", len(jobs)),
                    rejected_by_reason=rejected_by_reason,
                    seconds=perf_counter() - started,
                    error="; ".join(source.errors[:3]) if getattr(source, "errors", None) else "",
                    error_type="OfferParseError" if getattr(source, "errors", None) else "",
                )
            )
        except Exception as exc:
            results.append(
                SourceResult(
                    name=source.name,
                    seconds=perf_counter() - started,
                    error=str(exc),
                    error_type=type(exc).__name__,
                )
            )

    return results
