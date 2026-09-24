import re
from datetime import datetime, timezone

def _text(job):
    return " ".join([
        job.title or "", job.company or "", job.description or "",
        job.location or "", job.contract or "", job.seniority or ""
    ]).lower()

def _word(text, value):
    return bool(re.search(rf"(?<![a-z0-9]){re.escape(value.lower())}(?![a-z0-9])", text))

def _phrase(text, value):
    return value.lower() in text

def recency_score(published_at):
    if not published_at:
        return 0
    if published_at.tzinfo is None:
        published_at = published_at.replace(tzinfo=timezone.utc)
    age = max(0, (datetime.now(timezone.utc) - published_at).total_seconds() / 86400)
    if age < 1: return 10
    if age <= 3: return 8
    if age <= 7: return 6
    if age <= 14: return 3
    if age <= 30: return 1
    return 0

def score_job(job, cfg):
    text = _text(job)
    hard = cfg.get("hard_exclusions", {})

    # Hard exclusions first. Java is a whole-word match, therefore JavaScript is safe.
    if _word(text, "java"):
        job.rejected, job.reject_reason, job.score = True, "Java", 0
        job.recency_score = recency_score(job.published_at)
        job.score_breakdown = {"hard_reject": "Java"}
        return job

    for phrase in hard.get("keywords", []):
        if _phrase(text, phrase):
            job.rejected, job.reject_reason, job.score = True, phrase, 0
            job.recency_score = recency_score(job.published_at)
            job.score_breakdown = {"hard_reject": phrase}
            return job

    for level in hard.get("seniority", []):
        if _word(text, level):
            job.rejected, job.reject_reason, job.score = True, level, 0
            job.recency_score = recency_score(job.published_at)
            job.score_breakdown = {"hard_reject": level}
            return job

    cand = cfg.get("candidate", {})
    weights = cfg.get("scoring", {}).get("weights", {})
    role_terms = [str(x).lower() for x in cand.get("target_roles", [])]
    tech_cfg = cand.get("technologies", {})
    tech_terms = []
    if isinstance(tech_cfg, dict):
        tech_terms = [str(x).lower() for group in tech_cfg.values() for x in (group or [])]
    else:
        tech_terms = [str(x).lower() for x in tech_cfg]
    domain_terms = [str(x).lower() for x in cand.get("domains", [])]
    ai_terms = [str(x).lower() for x in cand.get("ai", [])]
    contracts = [str(x).lower() for x in cand.get("contracts", [])]

    matched_roles = [x for x in role_terms if x in text]
    matched_tech = [x for x in tech_terms if x in text]
    matched_domain = [x for x in domain_terms if x in text]
    matched_ai = [x for x in ai_terms if x in text]

    def proportional(n, total):
        return round(min(1, n / max(1, total)), 2)

    role = round(weights.get("role", 20) * proportional(len(matched_roles), 2))
    tech = round(weights.get("technologies", 25) * proportional(len(matched_tech), 6))
    domain = round(weights.get("domain", 10) * proportional(len(matched_domain), 2))
    remote = weights.get("remote", 15) if job.remote is True else 0
    contract = weights.get("contract", 10) if any(x in (job.contract or "").lower() for x in contracts) else 0
    seniority = weights.get("seniority", 5) if (job.seniority or "").lower() in {"mid","regular","senior","lead"} else 0
    ai = weights.get("ai", 5) if matched_ai else 0
    fresh = min(weights.get("recency_max", 10), recency_score(job.published_at))

    total = min(100, role + tech + domain + remote + contract + seniority + ai + fresh)
    job.score = total
    job.recency_score = fresh
    job.rejected = False
    job.reject_reason = ""
    job.score_breakdown = {
        "role": role, "technology": tech, "domain": domain, "remote": remote,
        "contract": contract, "seniority": seniority, "ai": ai, "freshness": fresh,
        "matched_roles": matched_roles, "matched_technologies": matched_tech,
        "matched_domains": matched_domain, "matched_ai": matched_ai,
    }
    return job
