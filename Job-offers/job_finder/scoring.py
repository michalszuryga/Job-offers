import re
from datetime import datetime, timezone
from .salary import monthly_salary_pln


def _text(job):
    return " ".join(str(x or "") for x in (
        job.title, job.company, job.description, job.location, job.contract, job.seniority
    )).lower()


def _word(text, value):
    return bool(re.search(rf"(?<![a-z0-9]){re.escape(str(value).lower())}(?![a-z0-9])", text))


def _phrase(text, value):
    pattern = re.escape(str(value).lower()).replace(r"\ ", r"\s+")
    return bool(re.search(rf"(?<![a-z0-9]){pattern}(?![a-z0-9])", text))


def _java_is_role_requirement(job):
    """Reject Java jobs/required tester skills, not Java mentioned as product stack."""
    title = (job.title or "").lower()
    description = (job.description or "").lower()
    role_terms = ("java developer", "java engineer", "java tester", "java qa",
                  "java automation", "java/sdet", "java selenium")
    if any(_phrase(title, term) for term in role_terms):
        return True
    # Keep evidence local: Java listed in a stack paragraph alone is not a skill gate.
    java = re.finditer(r"(?<![a-z0-9])java(?![a-z0-9])", description)
    requirement_markers = re.compile(
        r"(?:required|requirement|must have|must-have|mandatory|essential|"
        r"experience (?:with|in)|proficien(?:t|cy) (?:in|with)|knowledge of|"
        r"wymagamy|wymagane|wymagana|wymagany|doswiadczenie (?:z|w)|"
        r"znajomosc|bieg(?:la|ly|losc))", re.I
    )
    product_markers = re.compile(r"(?:application|product|platform|system|backend|codebase|"
                                 r"aplikacj[ai]|produkt|platforma|system|backend)", re.I)
    for match in java:
        context = description[max(0, match.start() - 100):match.end() + 100]
        if requirement_markers.search(context) and not product_markers.search(context):
            return True
    return False


def recency_points(published_at, now=None):
    if not published_at:
        return 0, None
    now = now or datetime.now(timezone.utc)
    if published_at.tzinfo is None:
        published_at = published_at.replace(tzinfo=timezone.utc)
    age = max(0, (now - published_at.astimezone(timezone.utc)).total_seconds() / 86400)
    points = 10 if age < 1 else 8 if age <= 3 else 6 if age <= 7 else 3 if age <= 14 else 1 if age <= 30 else 0
    return points, age


def recency_score(published_at):
    return recency_points(published_at)[0]


def score_job(job, cfg, now=None):
    text = _text(job)
    hard = cfg.get("hard_exclusions", {})
    tech_exclusions = hard.get("technologies", [])
    for term in tech_exclusions:
        if str(term).lower() == "java":
            excluded = _java_is_role_requirement(job)
        else:
            excluded = _word(text, term)
        if excluded:
            job.rejected, job.reject_reason, job.score = True, str(term), 0
            job.score_breakdown = {"hard_reject": str(term)}
            return job
    for phrase in hard.get("keywords", []):
        if _phrase(text, phrase):
            job.rejected, job.reject_reason, job.score = True, str(phrase), 0
            job.score_breakdown = {"hard_reject": str(phrase)}
            return job
    for level in hard.get("seniority", []):
        if _word(text, level):
            job.rejected, job.reject_reason, job.score = True, str(level), 0
            job.score_breakdown = {"hard_reject": str(level)}
            return job
    # Default safety behavior when the profile has no technology exclusions.
    if not tech_exclusions and _java_is_role_requirement(job):
        job.rejected, job.reject_reason, job.score = True, "Java", 0
        job.score_breakdown = {"hard_reject": "Java"}
        return job
    if cfg.get("filters", {}).get("remote_only") and job.remote is not True:
        job.rejected, job.reject_reason, job.score = True, "Remote-only preference", 0
        job.score_breakdown = {"hard_reject": "Remote-only preference"}
        return job

    candidate = cfg.get("candidate", {})
    weights = cfg.get("scoring", {}).get("weights", {})
    role_terms = [str(v).lower() for v in candidate.get("target_roles", [])]
    tech_cfg = candidate.get("technologies", {})
    tech_terms = [str(v).lower() for group in tech_cfg.values() for v in (group or [])] if isinstance(tech_cfg, dict) else [str(v).lower() for v in tech_cfg]
    domain_terms = [str(v).lower() for v in candidate.get("domains", [])]
    contracts = [str(v).lower() for v in candidate.get("contracts", [])]
    ai_terms = [str(v).lower() for v in candidate.get("ai", [])]
    matched_roles = [v for v in role_terms if v in text]
    matched_tech = [v for v in tech_terms if v in text]
    matched_domains = [v for v in domain_terms if v in text]
    matched_ai = [v for v in ai_terms if v in text]

    def points(key, hits, denominator):
        return round(weights.get(key, 0) * min(1, len(set(hits)) / max(1, denominator)))

    role = points("role", matched_roles, 2)
    technology = points("technologies", matched_tech, 6)
    domain = points("domain", matched_domains, 2)
    remote = weights.get("remote", 0) if job.remote is True else 0
    contract = weights.get("contract", 0) if any(v in (job.contract or "").lower() for v in contracts) else 0
    seniority_value = (job.seniority or "").lower()
    seniority = weights.get("seniority", 0) if seniority_value in {"mid", "regular", "senior", "lead"} else 0
    language = weights.get("language", 0) if re.search(r"\b(english|angielski|fluent)\b", text) else 0
    ai = weights.get("ai", 0) if matched_ai else 0
    freshness_points, age_days = recency_points(job.published_at, now)
    freshness = min(weights.get("recency_max", 10), freshness_points)
    penalties = cfg.get("scoring", {}).get("penalties", {})
    automation_penalty = -penalties.get("automation_title", 15) if _word(job.title.lower(), "automation") else 0
    title_language_penalty = (
        -penalties.get("programming_language_title", 30)
        if re.search(r"(?<![a-z0-9])(?:c\+\+|c#|java|python)(?![a-z0-9])", job.title or "", re.I)
        else 0
    )
    stale_after_days = penalties.get("stale_after_days", 10)
    stale_penalty = -penalties.get("stale_offer", 15) if age_days is not None and age_days > stale_after_days else 0
    salary_cfg = cfg.get("scoring", {}).get("salary_bonus", {})
    normalized_salary = monthly_salary_pln(job, salary_cfg)
    salary_threshold = salary_cfg.get("monthly_threshold_pln", 15000)
    salary_bonus = (
        salary_cfg.get("points", 15)
        if normalized_salary is not None and normalized_salary >= salary_threshold
        else 0
    )
    breakdown = {"role": role, "technology": technology, "domain": domain, "remote": remote,
                 "contract": contract, "seniority": seniority, "language": language,
                 "ai": ai, "freshness": freshness, "title_automation_penalty": automation_penalty,
                 "title_programming_language_penalty": title_language_penalty,
                 "stale_offer_penalty": stale_penalty, "salary_bonus": salary_bonus,
                 "salary_assessment": {
                     "estimated_monthly_pln": round(normalized_salary, 2) if normalized_salary is not None else None,
                     "threshold_pln": salary_threshold,
                     "minimum_of_range_used": job.salary_min is not None and job.salary_max is not None,
                 },
                 "matched_roles": matched_roles, "matched_technologies": matched_tech,
                 "matched_domains": matched_domains, "matched_ai": matched_ai}
    job.score = max(0, min(100, sum(v for v in breakdown.values() if isinstance(v, (int, float)))))
    job.recency_score = freshness
    job.rejected, job.reject_reason = False, ""
    job.matched_keywords = sorted(set(matched_roles + matched_tech + matched_domains + matched_ai))
    job.score_breakdown = breakdown
    return job
