from job_finder.cv_highlights import match_highlights, load_cv_highlights


def _highlights():
    return [
        {"text": "Played with Playwright and TypeScript.", "tags": ["playwright", "typescript"]},
        {"text": "Payments domain work.", "tags": ["fintech", "payments"]},
        {"text": "Unrelated bullet.", "tags": ["java"]},
    ]


def test_match_highlights_ranks_by_overlap_and_ignores_no_match():
    breakdown = {
        "matched_technologies": ["playwright", "typescript", "postman"],
        "matched_domains": ["fintech"],
    }
    results = match_highlights(breakdown, _highlights())
    texts = [r["text"] for r in results]
    assert "Unrelated bullet." not in texts
    # Two-tag overlap (playwright+typescript) should rank above one-tag overlap (fintech).
    assert texts[0] == "Played with Playwright and TypeScript."
    assert results[0]["matched_tags"] == ["playwright", "typescript"]


def test_match_highlights_returns_empty_without_score_breakdown():
    assert match_highlights({}, _highlights()) == []
    assert match_highlights({"matched_technologies": ["java"]}, []) == []


def test_match_highlights_respects_limit():
    breakdown = {"matched_technologies": ["playwright", "typescript"], "matched_domains": ["fintech", "payments"]}
    results = match_highlights(breakdown, _highlights(), limit=1)
    assert len(results) == 1


def test_load_cv_highlights_missing_file_returns_empty(tmp_path):
    assert load_cv_highlights(str(tmp_path / "nope.yaml")) == []


def test_real_cv_highlights_file_loads_and_has_tagged_entries():
    highlights = load_cv_highlights()
    assert len(highlights) > 0
    for h in highlights:
        assert h["text"]
        assert h["tags"]
