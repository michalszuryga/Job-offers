# Michal Job Finder

Personal job-search engine for collecting, scoring, analyzing and tracking QA job opportunities.

## V1.1
- Deterministic profile matching
- Recency scoring
- Application status tracking
- Streamlit dashboard
- Provider-agnostic AI analysis payload
- SQLite persistence with lightweight migration
- Docker/hosting-ready structure (deployment config to be added next)

## Run locally

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m job_finder.cli demo
python -m job_finder.cli list --min-score 55
streamlit run job_finder/app.py
```

Do not commit API keys, `.env` files or local databases.
