# Michal Job Finder v1

Personal job-search engine tailored to Michal's QA profile.

## MVP
- Python + SQLite
- YAML candidate profile
- transparent scoring
- pluggable job-board sources
- Streamlit dashboard
- deduplication by URL
- demo source for local testing

Live job-board adapters are deliberately separated from the core so each source can use its current public/authorized access method rather than brittle scraping.

## Run
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m job_finder.cli init-db
python -m job_finder.cli demo
python -m job_finder.cli list --min-score 55
streamlit run job_finder/app.py
```
