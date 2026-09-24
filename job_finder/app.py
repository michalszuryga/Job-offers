import json
import pandas as pd
import streamlit as st

from .config import load_config
from .scoring import score_job
from .sources.sample import SampleSource
from .collector import collect_live_jobs
from .storage import DEFAULT_STATUSES, JobStore


st.set_page_config(page_title="Michal Job Finder", layout="wide")


def load_demo_data(store, cfg):
    created = 0
    for job in SampleSource().fetch():
        scored = score_job(job, cfg)
        if not scored.rejected and store.upsert(scored):
            created += 1
    return created


def get_stats(store, cfg):
    jobs = store.list(0)
    return {
        "jobs": jobs,
        "offers": len(jobs),
        "high_match": sum(
            float(j.get("score") or 0) >= cfg["filters"]["high_match_threshold"]
            for j in jobs
        ),
        "new": sum(j.get("application_status", "NEW") == "NEW" for j in jobs),
    }


def main():
    st.title("Michal's Job Finder")
    st.caption("Hosted MVP - job matching, freshness scoring and application tracking.")

    cfg = load_config()
    store = JobStore()

    # Remove legacy demo records automatically. This is safe because only the
    # dedicated "demo" source is deleted; live sources are untouched.
    store.delete_source("demo")

    stats = get_stats(store, cfg)

    # Counters are always calculated from the current database state.
    col1, col2, col3 = st.columns(3)
    col1.metric("Offers", stats["offers"])
    col2.metric("High match", stats["high_match"])
    col3.metric("New", stats["new"])

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
                "rejected": r.rejected,
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
            if result["error"]:
                st.error(
                    f'{result["name"]}: FAILED '
                    f'[{result["error_type"]}] {result["error"]} '
                    f'({result["seconds"]}s)'
                )
            else:
                st.success(
                    f'{result["name"]}: {result["count"]} found, '
                    f'{result["inserted"]} new, {result["rejected"]} rejected '
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
    )

    if not jobs:
        st.info("No offers match the selected filters.")
        return

    rows = []
    for j in jobs:
        rows.append(
            {
                "Score": j["score"],
                "Freshness": j.get("recency_score", 0),
                "Title": j["title"],
                "Company": j["company"],
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
        st.write(f'**{job["company"]}** · {job["location"]} · {job["contract"]}')
        st.write(job["description"])
        st.markdown(f'[Open original offer]({job["url"]})')

    with right:
        st.metric("Match", job["score"])
        st.metric("Freshness bonus", f'+{job.get("recency_score", 0)}')

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
