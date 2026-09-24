from dataclasses import dataclass

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
    error: str = ""


def collect_live_jobs(config_path="config/profile.yaml"):
    cfg = load_config(config_path)
    store = JobStore()
    sources = [NoFluffSource(), PracujSource(), JustJoinSource()]
    results = []

    for source in sources:
        try:
            jobs = source.fetch()
            inserted = 0
            for job in jobs:
                if store.upsert(score_job(job, cfg)):
                    inserted += 1
            results.append(SourceResult(source.name, len(jobs), inserted))
        except Exception as exc:
            results.append(SourceResult(source.name, error=f"{type(exc).__name__}: {exc}"))

    return results
