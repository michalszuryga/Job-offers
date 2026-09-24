import re
from datetime import datetime, timezone
from typing import Optional

from .models import Job


def norm(value: Optional[str]) -> str:
    return re.sub(r"\s+", " ", (value or "").lower()).strip()


def hit(text: str, key: str) -> bool:
    return norm(key) in norm(text)


def recency_points(published_at: Optional[datetime], now: Optional[datetime] = None) -> tuple[float, str]:
    """Return a freshness bonus and a human-readable bucket."""
    if not published_at:
        return 0.0, "unknown"

    now = now or datetime.now(timezone.utc)
    if published_at.tzinfo is None:
        published_at = published_at.replace(tzinfo=timezone.utc)
    age_hours = max(0.0, (now - published_at).total_seconds() / 3600)
    if age_hours < 24:
        return 10.0, "<24h"
    if age_hours < 72:
        return 8.0, "1–3d"
    if age_hours < 168:
        return 6.0, "4–7d"
    if age_hours < 336:
        return 3.0, "8–14d"
    if age_hours < 720:
        return 1.0, "15–30d"
    return 0.0, ">30d"


def _contract_match(text: str, contract: str) -> bool:
    # Avoid treating phrases such as "no B2B" as a positive match.
    c = norm(contract)
    t = norm(text)
    negative = [f"no {c}", f"not {c}", f"without {c}", f"nie {c}", f"bez {c}"]
    return c in t and not any(x in t for x in negative)


def score_job(job: Job, cfg, now: Optional[datetime] = None) -> Job:
    c = cfg["candidate"]
    weights = cfg["scoring"]["weights"]
    penalties_cfg = cfg["scoring"]["penalties"]
    text = job.full_text
    score = 0.0
    matched: list[str] = []
    penalties: list[str] = []

    if any(hit(job.title, role) for role in c["target_roles"]):
        score += weights["role"]
        matched.append("target role")

    strong_tech = [x for x in c["technologies"]["strong"] if hit(text, x)]
    additional_tech = [x for x in c["technologies"].get("additional", []) if hit(text, x)]
    # Strong technology coverage is capped at its full weight; additional tools add evidence but not score.
    if strong_tech:
        score += min(weights["technologies"], weights["technologies"] * len(strong_tech) / 6)
        matched.extend(strong_tech)
    matched.extend(additional_tech)

    domains = [x for x in c["domains"] if hit(text, x)]
    if domains:
        score += min(weights["domain"], weights["domain"] * len(domains) / 2)
        matched.extend(domains)

    if job.remote is True or hit(text, "remote") or hit(text, "fully remote") or hit(text, "100% remote"):
        score += weights["remote"]
        matched.append("remote")
    elif job.remote is False or hit(text, "on-site") or hit(text, "onsite") or hit(text, "hybrid"):
        penalties.append("onsite/hybrid")
        score -= penalties_cfg["onsite"]

    if any(_contract_match(text, contract) for contract in c["contracts"]):
        score += weights["contract"]
        matched.append("preferred contract")

    if any(hit(job.seniority, level) for level in c["seniority"]):
        score += weights["seniority"]
        matched.append("preferred seniority")

    if hit(text, "english"):
        score += weights["language"]
        matched.append("English")

    ai = [x for x in c["ai"] if hit(text, x)]
    if ai:
        score += weights["ai"]
        matched.extend(ai)

    if hit(job.seniority, "junior") or hit(job.title, "junior"):
        score -= penalties_cfg["junior"]
        penalties.append("junior")
    if hit(text, "internship") or re.search(r"\bintern\b", text, re.I):
        score -= penalties_cfg["internship"]
        penalties.append("internship")

    if hit(text, "relocation required") or hit(text, "must relocate"):
        score -= penalties_cfg["relocation"]
        penalties.append("relocation required")

    fresh, bucket = recency_points(job.published_at, now=now)
    score += fresh
    job.recency_score = fresh
    if bucket != "unknown":
        matched.append(f"freshness:{bucket}")

    job.score = max(0, min(cfg["scoring"]["max_score"], round(score, 1)))
    job.matched_keywords = list(dict.fromkeys(matched))
    job.penalties = list(dict.fromkeys(penalties))
    return job
