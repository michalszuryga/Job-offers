import json
from datetime import datetime
import pandas as pd
import streamlit as st

from .config import load_config, save_user_overrides
from .scoring import score_job
from .models import Job
from .sources.sample import SampleSource
from .collector import collect_live_jobs
from .storage import DEFAULT_STATUSES, JobStore
from .sources.web_utils import infer_remote


st.set_page_config(page_title="Michal Job Finder", layout="wide")


def load_demo_data(store, cfg):
    created = 0
    for job in SampleSource().fetch():
        scored = score_job(job, cfg)
        if not scored.rejected and store.upsert(scored):
            created += 1
    return created


def get_stats(store, cfg):
    jobs = store.list(0, remote_only=cfg.get("filters", {}).get("remote_only", False))
    return {
        "jobs": jobs,
        "offers": len(jobs),
        "high_match": sum(
            float(j.get("score") or 0) >= cfg["filters"]["high_match_threshold"]
            for j in jobs
        ),
        "new": sum(j.get("application_status", "NEW") == "NEW" for j in jobs),
    }


def format_published_at(value):
    if not value:
        return ""
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).date().isoformat()
    except ValueError:
        return str(value)


def format_salary(job):
    low, high = job.get("salary_min"), job.get("salary_max")
    if low is None and high is None:
        return "Not listed"

    def amount(value):
        return f"{float(value):,.0f}".replace(",", " ")

    if low is None:
        value = amount(high)
    elif high is None or float(low) == float(high):
        value = amount(low)
    else:
        value = f"{amount(low)}–{amount(high)}"
    suffix = " ".join(part for part in (job.get("salary_currency"), job.get("salary_period")) if part)
    return f"{value} {suffix}".strip()


def refresh_scores_for_config(store, cfg):
    """Reapply changed filters and scoring rules to existing rows once per session/config."""
    scoring_inputs = {key: cfg.get(key) for key in ("candidate", "scoring", "filters", "hard_exclusions")}
    signature = json.dumps(scoring_inputs, sort_keys=True, ensure_ascii=False)
    if st.session_state.get("score_config_signature") == signature:
        return

    for row in store.list_all():
        published_at = row.get("published_at")
        try:
            published_at = datetime.fromisoformat(published_at.replace("Z", "+00:00")) if published_at else None
        except ValueError:
            published_at = None
        remote = None if row.get("remote") is None else bool(row["remote"])
        inferred_remote = infer_remote(" ".join((row.get("title") or "", row.get("description") or "", row.get("location") or "")))
        if inferred_remote is not None:
            remote = inferred_remote
        job = Job(title=row.get("title") or "", company=row.get("company") or "", url=row.get("url") or "",
                  source=row.get("source") or "", description=row.get("description") or "",
                  location=row.get("location") or "", remote=remote, contract=row.get("contract") or "",
                  salary_min=row.get("salary_min"), salary_max=row.get("salary_max"),
                  salary_currency=row.get("salary_currency") or "", salary_period=row.get("salary_period") or "",
                  seniority=row.get("seniority") or "",
                  published_at=published_at)
        store.upsert(score_job(job, cfg))
    st.session_state["score_config_signature"] = signature


def render_scoring_controls(cfg):
    scoring = cfg.setdefault("scoring", {})
    penalties = scoring.setdefault("penalties", {})
    filters = cfg.setdefault("filters", {})

    with st.sidebar.expander("Scoring & filters", expanded=False):
        st.caption("Saved to a local override file. Streamlit Cloud may reset it after an app restart.")
        with st.form("scoring_filters_form"):
            remote_only = st.checkbox("Remote offers only", value=filters.get("remote_only", True))
            automation_penalty = st.slider(
                "Penalty: ‘automation’ in title", 0, 60,
                int(penalties.get("automation_title", 30)), step=5,
            )
            language_penalty = st.slider(
                "Penalty: C++ / Java / C# / Python in title", 0, 60,
                int(penalties.get("programming_language_title", 30)), step=5,
            )
            stale_after_days = st.number_input(
                "Treat offers older than (days)", 0, 90,
                int(penalties.get("stale_after_days", 10)), step=1,
            )
            stale_penalty = st.slider(
                "Penalty for stale offer", 0, 60,
                int(penalties.get("stale_offer", 15)), step=5,
            )
            minimum_score = st.slider(
                "Minimum score to show", 0, 100,
                int(filters.get("minimum_score_to_show", 55)), step=5,
            )
            high_match_threshold = st.slider(
                "High match threshold", 0, 100,
                int(filters.get("high_match_threshold", 80)), step=5,
            )
            save_clicked = st.form_submit_button("Save criteria")

        if save_clicked:
            try:
                save_user_overrides({
                    "filters": {
                        "remote_only": remote_only,
                        "minimum_score_to_show": minimum_score,
                        "high_match_threshold": high_match_threshold,
                    },
                    "scoring": {"penalties": {
                        "automation_title": automation_penalty,
                        "programming_language_title": language_penalty,
                        "stale_after_days": stale_after_days,
                        "stale_offer": stale_penalty,
                    }},
                })
                st.success("Criteria saved.")
                st.rerun()
            except OSError as exc:
                st.error(f"Could not save criteria: {exc}")

    return cfg


def main():
    st.title("Michal's Job Finder")
    st.caption("Hosted MVP - job matching, freshness scoring and application tracking.")

    cfg = load_config()
    cfg = render_scoring_controls(cfg)
    store = JobStore()
    refresh_scores_for_config(store, cfg)

    stats = get_stats(store, cfg)

    # Counters are always calculated from the current database state.
    col1, col2, col3 = st.columns(3)
    col1.metric("Eligible offers", stats["offers"])
    col2.metric("High match", stats["high_match"])
    col3.metric("New", stats["new"])
    st.caption("Offer count includes remote jobs that passed hard exclusions; fetch diagnostics show listing candidates, parsed offers and exclusion reasons.")

    c1, c2, c3 = st.columns(3)

    with c1:
        fetch_clicked = st.button("Fetch live jobs", type="primary", use_container_width=True)

    with c2:
        demo_clicked = st.button("Load demo data", use_container_width=True)

    with c3:
        if st.button("Reload", use_container_width=True):
            st.rerun()

    if fetch_clicked:
        with st.spinner("Fetching No Fluff Jobs, Pracuj.pl and JustJoin.IT..."):
            results = collect_live_jobs()

        st.session_state["last_fetch_results"] = [
            {
                "name": r.name,
                "count": r.count,
                "inserted": r.inserted,
                "updated": r.updated,
                "rejected": r.rejected,
                "candidates": r.candidates,
                "parsed": r.parsed,
                "rejected_by_reason": r.rejected_by_reason,
                "seconds": round(r.seconds, 2),
                "error": r.error,
                "error_type": r.error_type,
            }
            for r in results
        ]

        # Explicitly re-read the database after collection before rerunning.
        # This makes the next render use the newly inserted rows.
        st.success("Live offers fetched.")
        st.rerun()

    if demo_clicked:
        created = load_demo_data(store, cfg)
        st.session_state["demo_message"] = f"Loaded {created} demo offers."
        st.rerun()

    if "demo_message" in st.session_state:
        st.success(st.session_state.pop("demo_message"))

    if "last_fetch_results" in st.session_state:
        st.subheader("Live fetch diagnostics")
        for result in st.session_state["last_fetch_results"]:
            if result["error_type"] == "OfferParseError":
                st.warning(
                    f'{result["name"]}: {result.get("candidates", result["count"])} listing candidates, '
                    f'{result.get("parsed", result["count"])} parsed, '
                    f'{result["count"]} passed source filters, '
                    f'{result["inserted"]} inserted, {result["updated"]} updated, '
                    f'{result["rejected"]} excluded ({result.get("rejected_by_reason", {})}); '
                    f'some detail pages failed: '
                    f'{result["error"]} ({result["seconds"]}s)'
                )
            elif result["error"]:
                st.error(
                    f'{result["name"]}: FAILED '
                    f'[{result["error_type"]}] {result["error"]} '
                    f'({result["seconds"]}s)'
                )
            else:
                st.success(
                    f'{result["name"]}: {result.get("candidates", result["count"])} listing candidates, '
                    f'{result.get("parsed", result["count"])} parsed, '
                    f'{result["count"]} passed source filters, '
                    f'{result["inserted"]} inserted, {result["updated"]} updated, '
                    f'{result["rejected"]} excluded ({result.get("rejected_by_reason", {})}) '
                    f'({result["seconds"]}s)'
                )

    # Re-read after possible actions. Never use the pre-fetch snapshot here.
    stats = get_stats(store, cfg)

    if not stats["jobs"]:
        st.info(
            "No live offers are currently stored. Click 'Fetch live jobs' to "
            "collect current offers from the configured sources."
        )
        st.caption(
            "Note: the hosted MVP currently uses SQLite. Streamlit Cloud can "
            "restart the app and reset local SQLite data. Persistent storage "
            "will require an external database in the next hosting step."
        )
        return

    st.divider()

    min_score = st.slider(
        "Minimum match score",
        0,
        100,
        cfg["filters"]["minimum_score_to_show"],
    )
    status = st.selectbox("Application status", ["ALL"] + DEFAULT_STATUSES)
    limit = st.number_input(
        "Maximum offers",
        min_value=10,
        max_value=200,
        value=50,
        step=10,
    )

    jobs = store.list(
        min_score,
        None if status == "ALL" else status,
        limit=int(limit),
        remote_only=cfg.get("filters", {}).get("remote_only", False),
    )

    if not jobs:
        st.info("No offers match the selected filters.")
        return

    rows = []
    for j in jobs:
        rows.append(
            {
                "Score": j["score"],
                "Freshness points (0-10)": j.get("recency_score", 0),
                "Published": format_published_at(j.get("published_at")),
                "Salary": format_salary(j),
                "Title": j["title"],
                "Company": j.get("company") or "Brak w danych",
                "Location": j["location"],
                "Contract": j["contract"],
                "Status": j.get("application_status", "NEW"),
                "Source": j["source"],
                "URL": j["url"],
            }
        )

    st.dataframe(
        pd.DataFrame(rows),
        use_container_width=True,
        hide_index=True,
        column_config={"URL": st.column_config.LinkColumn()},
    )

    st.subheader("Job details")
    labels = [f'{j["score"]:.0f} - {j["title"]} - {j["company"]}' for j in jobs]
    selected = st.selectbox("Select a job", labels)
    job = jobs[labels.index(selected)]

    left, right = st.columns([2, 1])

    with left:
        st.markdown(f'### {job["title"]}')
        st.write(f'**{job.get("company") or "Brak w danych"}** · {job["location"]} · {job["contract"]}')
        st.write(f'**Salary:** {format_salary(job)}')
        st.write(job["description"])
        st.markdown(f'[Open original offer]({job["url"]})')

    with right:
        st.metric("Match", job["score"])
        st.metric("Freshness bonus (0-10)", f'+{job.get("recency_score", 0)}')

        if job.get("score_breakdown"):
            st.markdown("#### Score breakdown")
            st.json(job["score_breakdown"])

        new_status = st.selectbox(
            "Status",
            DEFAULT_STATUSES,
            index=DEFAULT_STATUSES.index(job.get("application_status", "NEW")),
        )

        if st.button("Save status"):
            store.set_status(job["external_id"], new_status)
            st.success("Status updated.")
            st.rerun()

        if job.get("ai_analysis"):
            st.markdown("#### AI analysis")
            try:
                st.json(json.loads(job["ai_analysis"]))
            except json.JSONDecodeError:
                st.write(job["ai_analysis"])


if __name__ == "__main__":
    main()
