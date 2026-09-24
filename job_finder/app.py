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
        if store.upsert(score_job(job, cfg)):
            created += 1
    return created


def main():
    st.title("Michal's Job Finder")
    st.caption("Hosted MVP - job matching, freshness scoring and application tracking.")

    cfg = load_config()
    store = JobStore()
    all_jobs = store.list(0)

    if not all_jobs:
        st.info("The database is empty. Load demo data to verify that the application works.")
        if st.button("Load demo data", type="primary"):
            created = load_demo_data(store, cfg)
            st.success(f"Loaded {created} demo offers.")
            st.rerun()
        st.stop()

    col1, col2, col3 = st.columns(3)
    col1.metric("Offers", len(all_jobs))
    col2.metric(
        "High match",
        sum(j["score"] >= cfg["filters"]["high_match_threshold"] for j in all_jobs),
    )
    col3.metric(
        "New",
        sum(j.get("application_status", "NEW") == "NEW" for j in all_jobs),
    )

    c1, c2 = st.columns(2)
    with c1:
        if st.button("Fetch live jobs", type="primary"):
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

    with c2:
        if st.button("Reload"):
            st.rerun()

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
