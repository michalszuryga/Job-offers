from pathlib import Path

import yaml

DEFAULT_PATH = "config/cv_highlights.yaml"


def load_cv_highlights(path=DEFAULT_PATH):
    config_path = Path(path)
    if not config_path.exists():
        return []
    with config_path.open(encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    highlights = data.get("highlights") or []
    return [h for h in highlights if h.get("text") and h.get("tags")]


def _matched_terms(score_breakdown):
    terms = set()
    for key in ("matched_technologies", "matched_domains", "matched_ai", "matched_roles"):
        terms.update(str(t).lower() for t in (score_breakdown.get(key) or []))
    return terms


def match_highlights(score_breakdown, highlights, limit=4):
    """Rank CV bullets by how many of the job's already-matched
    technologies/domains/ai/role terms they share; no AI call involved,
    this reuses the same matching scoring.py already computed."""
    if not score_breakdown or not highlights:
        return []
    matched_terms = _matched_terms(score_breakdown)
    if not matched_terms:
        return []

    scored = []
    for highlight in highlights:
        tags = {str(t).lower() for t in highlight.get("tags", [])}
        overlap = tags & matched_terms
        if overlap:
            scored.append({
                "text": highlight["text"],
                "matched_tags": sorted(overlap),
                "overlap_count": len(overlap),
            })

    scored.sort(key=lambda entry: entry["overlap_count"], reverse=True)
    return scored[:limit]
