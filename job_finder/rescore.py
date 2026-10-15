"""Reapplying the scoring rules to stored offers. Shared by the scheduled
fetch (daily, so freshness and the stale penalty move without anyone opening
the dashboard) and the Streamlit dashboard (on a config change)."""

import json
from datetime import datetime, timezone

from .models import Job
from .scoring import SCORING_VERSION, score_job
from .sources.web_utils import infer_remote


def scoring_inputs(cfg):
    """Everything that can change a score. Stored as-is in meta 'scoring_profile'
    so the web app shows the same maxima and terms the scorer used."""
    inputs = {key: cfg.get(key) for key in ("candidate", "scoring", "filters", "hard_exclusions")}
    inputs["scoring_version"] = SCORING_VERSION
    return inputs


def config_signature(cfg):
    return json.dumps(scoring_inputs(cfg), sort_keys=True, ensure_ascii=False)


def row_to_job(row):
    published_at = row.get("published_at")
    try:
        published_at = datetime.fromisoformat(published_at.replace("Z", "+00:00")) if published_at else None
    except ValueError:
        published_at = None
    # The current remote inference overrides the stored flag (older parsers set
    # it differently), so remote-only filtering stays consistent across rows.
    remote = None if row.get("remote") is None else bool(row["remote"])
    inferred_remote = infer_remote(" ".join((row.get("title") or "", row.get("description") or "",
                                             row.get("location") or "")))
    if inferred_remote is not None:
        remote = inferred_remote
    # Job.__post_init__ runs salary.normalize_salary, so a stored row with an
    # impossible period (85 PLN "month") comes back corrected, and rescore()'s
    # upsert writes the corrected salary fields back to the DB.
    return Job(title=row.get("title") or "", company=row.get("company") or "", url=row.get("url") or "",
               source=row.get("source") or "", description=row.get("description") or "",
               location=row.get("location") or "", remote=remote, contract=row.get("contract") or "",
               salary_min=row.get("salary_min"), salary_max=row.get("salary_max"),
               salary_currency=row.get("salary_currency") or "", salary_period=row.get("salary_period") or "",
               seniority=row.get("seniority") or "", published_at=published_at)


def rescore(store, cfg, meta, visible_rows, today=None, force=False):
    """Rescore on a config change, once a day, or when forced. Returns whether
    anything was rewritten. State lives in the DB, so a new browser session or
    a second run on the same day doesn't rescore on its own."""
    signature = config_signature(cfg)
    today = str(today or datetime.now(timezone.utc).date())
    config_changed = meta.get("score_config_signature") != signature
    if not (force or config_changed or meta.get("scores_refreshed_on") != today):
        return False

    # A config change can flip hard rejections, so it needs every row. A new
    # day only moves freshness and stale-offer points, which matter just for
    # visible offers — known offers skipped by a fetch are never re-scored
    # otherwise, so their freshness would stay frozen.
    rows = store.list_all() if config_changed else visible_rows
    store.upsert_many([score_job(row_to_job(row), cfg) for row in rows], touch_last_seen=False)
    store.set_meta("score_config_signature", signature)
    # Written with every rescore, so the web app's maxima and penalty thresholds
    # always describe the config the stored scores came from.
    store.set_meta("scoring_profile", json.dumps(scoring_inputs(cfg), ensure_ascii=False))
    store.set_meta("scores_refreshed_on", today)
    return True
