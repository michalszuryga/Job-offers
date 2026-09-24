import json

import pandas as pd
import streamlit as st

from .config import load_config
from .storage import DEFAULT_STATUSES, JobStore

st.set_page_config(page_title="Michal Job Finder", layout="wide")
st.title("Michal's Job Finder")

cfg = load_config()
store = JobStore()

col1, col2, col3 = st.columns(3)
all_jobs = store.list(0)
col1.metric("Offers", len(all_jobs))
col2.metric("High match", sum(j["score"] >= cfg["filters"]["high_match_threshold"] for j in all_jobs))
col3.metric("New", sum(j.get("application_status", "NEW") == "NEW" for j in all_jobs))

st.divider()

min_score = st.slider("Minimum match score", 0, 100, cfg["filters"]["minimum_score_to_show"])
status = st.selectbox("Application status", ["ALL"] + DEFAULT_STATUSES)
limit = st.number_input("Maximum offers", min_value=10, max_value=200, value=50, step=10)

jobs = store.list(min_score, None if status == "ALL" else status, limit=int(limit))

if not jobs:
    st.info("No jobs yet. Run: python -m job_finder.cli demo")
else:
    rows = []
    for j in jobs:
        rows.append({
            "Score": j["score"],
            "Freshness": j.get("recency_score", 0),
            "Title": j["title"],
            "Company": j["company"],
            "Location": j["location"],
            "Contract": j["contract"],
            "Status": j.get("application_status", "NEW"),
            "Source": j["source"],
            "URL": j["url"],
        })
    st.dataframe(pd.DataFrame(rows), use_container_width=True, hide_index=True, column_config={"URL": st.column_config.LinkColumn()})

    st.subheader("Job details")
    selected = st.selectbox("Select a job", [f"{j['score']:.0f} — {j['title']} — {j['company']}" for j in jobs])
    job = jobs[[f"{j['score']:.0f} — {j['title']} — {j['company']}" for j in jobs].index(selected)]
    left, right = st.columns([2, 1])
    with left:
        st.markdown(f"### {job['title']}")
        st.write(f"**{job['company']}** · {job['location']} · {job['contract']}")
        st.write(job["description"])
        st.markdown(f"[Open original offer]({job['url']})")
    with right:
        st.metric("Match", job["score"])
        st.metric("Freshness bonus", f"+{job.get('recency_score', 0)}")
        new_status = st.selectbox("Status", DEFAULT_STATUSES, index=DEFAULT_STATUSES.index(job.get("application_status", "NEW")))
        if st.button("Save status"):
            store.set_status(job["external_id"], new_status)
            st.success("Status updated")
            st.rerun()

        if job.get("ai_analysis"):
            st.markdown("#### AI analysis")
            try:
                analysis = json.loads(job["ai_analysis"])
                st.json(analysis)
            except json.JSONDecodeError:
                st.write(job["ai_analysis"])
