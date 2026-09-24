import re
from datetime import datetime, timezone


def _text(job):
    parts = [
        job.title or "",
        job.company or "",
        job.description or "",
        job.location or "",
        job.contract or "",
        job.seniority or "",
    ]
    return " ".join(parts).lower()


def _whole_word(text, word):
    return re.search(rf"\b{re.escape(word.lower())}\b", text) is not None


def _contains_phrase(text, phrase):
    return phrase.lower() in text


def recency_score(published_at):
    if not published_at:
        return 0
    if published_at.tzinfo is None:
        published_at = published_at.replace(tzinfo=timezone.utc)
    age_days = max(0, (datetime.now(timezone.utc) - published_at).total_seconds() / 86400)
    if age_days < 1:
        return 10
    if age_days <= 3:
        return 8
    if age_days <= 7:
        return 6
    if age_days <= 14:
        return 3
    if age_days <= 30:
        return 1
    return 0


def score_job(job, cfg):
    text = _text(job)
    exclusions = cfg.get("hard_exclusions", {})

    # Java is a hard rejection, but JavaScript must remain valid.
    if _whole_word(text, "java"):
        job.score = 0
        job.recency_score = recency_score(job.published_at)
        job.rejected = True
        job.reject_reason = "Java"
        job.score_breakdown = {"hard_reject": "Java"}
        return job

    for phrase in exclusions.get("keywords", []):
        if _contains_phrase(text, phrase):
            job.score = 0
            job.recency_score = recency_score(job.published_at)
            job.rejected = True
            job.reject_reason = phrase
            job.score_breakdown = {"hard_reject": phrase}
            return job

    for level in exclusions.get("seniority", []):
        if _whole_word(text, level):
            job.score = 0
            job.recency_score = recency_score(job.published_at)
            job.rejected = True
            job.reject_reason = level
            job.score_breakdown = {"hard_reject": level}
            return job

    weights = {
        "technologies": 45,
        "domains": 10,
        "remote": 10,
        "contract": 5,
        "seniority": 5,
    }

    techs = [x.lower() for x in cfg["candidate"].get("technologies", [])]
    domains = [x.lower() for x in cfg["candidate"].get("domains", [])]
    preferred_remote = cfg["candidate"].get("remote", True)
    preferred_contracts = [x.lower() for x in cfg["candidate"].get("contracts", ["B2B"])]

    matched_techs = [x for x in techs if _contains_phrase(text, x)]
    matched_domains = [x for x in domains if _contains_phrase(text, x)]

    tech_points = min(weights["technologies"], round(len(matched_techs) / max(1, len(techs)) * weights["technologies"]))
    domain_points = min(weights["domains"], round(len(matched_domains) / max(1, len(domains)) * weights["domains"]))

    remote_points = weights["remote"] if job.remote is True and preferred_remote else 0
    contract_points = (
        weights["contract"]
        if any(x in (job.contract or "").lower() for x in preferred_contracts)
        else 0
    )

    seniority_text = (job.seniority or "").lower()
    seniority_points = weights["seniority"] if seniority_text in {"mid", "regular", "senior"} else 0

    fresh = recency_score(job.published_at)
    total = min(100, tech_points + domain_points + remote_points + contract_points + seniority_points + fresh)

    job.score = total
    job.recency_score = fresh
    job.rejected = False
    job.reject_reason = ""
    job.score_breakdown = {
        "technology": tech_points,
        "domain": domain_points,
        "remote": remote_points,
        "contract": contract_points,
        "seniority": seniority_points,
        "freshness": fresh,
        "matched_technologies": matched_techs,
        "matched_domains": matched_domains,
    }
    return job
