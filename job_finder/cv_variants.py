"""Ready-made CV variants and which one fits an offer (week 4: apply in minutes).

The variants are built locally with tailor-cv's prompt and integrity check (nothing
invented), from a short "focus" description instead of a real offer, and kept next to
cv.html in ../CV/variants/ (outside the public repo). The e-mail then names one per offer.
"""

import json
import re
import shutil
from pathlib import Path

import yaml

DEFAULT_PATH = "config/cv_variants.yaml"


def load_variants(path=DEFAULT_PATH):
    try:
        return (yaml.safe_load(Path(path).read_text(encoding="utf-8")) or {}).get("variants") or {}
    except FileNotFoundError:
        return {}


def _matched(row):
    breakdown = row.get("score_breakdown") or {}
    if isinstance(breakdown, str):
        try:
            breakdown = json.loads(breakdown)
        except ValueError:
            breakdown = {}
    terms = set()
    for key in ("matched_technologies", "matched_domains", "matched_ai", "matched_roles"):
        terms.update(str(t).lower() for t in breakdown.get(key) or [])
    return terms


def suggest_variant(row, variants):
    """The key of the variant whose tags the offer matches most; title words count double,
    ties go to the earlier (first = default) variant."""
    if not variants:
        return None
    matched = _matched(row)
    title = (row.get("title") or "").lower()
    text = " ".join(str(row.get(k) or "") for k in ("title", "description")).lower()

    def score(item):
        tags = [str(t).lower() for t in item[1].get("tags") or []]
        found = sum(1 for t in tags if t in matched or re.search(rf"(?<![a-z0-9]){re.escape(t)}(?![a-z0-9])", text))
        in_title = sum(1 for t in tags if re.search(rf"(?<![a-z0-9]){re.escape(t)}(?![a-z0-9])", title))
        return found + in_title

    best = max(enumerate(variants.items()), key=lambda pair: (score(pair[1]), -pair[0]))
    return best[1][0]


def build_variants(keys=None, base_dir=None, path=DEFAULT_PATH, model=None, tailor_fn=None):
    """Builds ../CV/variants/<key>.html/.pdf/.md; returns {key: TailorResult or error text}."""
    from .tailor_cv import TailorError, cv_dir, tailor
    tailor_fn = tailor_fn or tailor
    variants = load_variants(path)
    out = cv_dir(base_dir) / "variants"
    out.mkdir(parents=True, exist_ok=True)
    results = {}
    for key, variant in variants.items():
        if keys and key not in keys:
            continue
        offer = {"title": variant.get("label") or key, "company": "CV variant", "location": "",
                 "url": "", "description": "Role profile to tailor the CV to (not a real offer):\n"
                                          + (variant.get("focus") or "")}
        try:
            result = tailor_fn(offer, base_dir=base_dir, model=model)
        except TailorError as exc:
            results[key] = str(exc)
            continue
        for produced in (result.html_path, result.pdf_path, result.notes_path):
            if produced:
                shutil.copyfile(produced, out / f"{key}{Path(produced).suffix}")
        results[key] = result
    return results
