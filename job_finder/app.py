import streamlit as st
import pandas as pd
from .storage import JobStore
st.set_page_config(page_title="Michal Job Finder",layout="wide")
st.title("Michal's Job Finder")
min_score=st.slider("Minimum match score",0,100,55)
jobs=JobStore().list(min_score)
if not jobs: st.info("No jobs yet. Run: python -m job_finder.cli demo")
else: st.dataframe(pd.DataFrame([{k:j[k] for k in ["score","title","company","location","contract","source","url"]} for j in jobs]),use_container_width=True,hide_index=True)
