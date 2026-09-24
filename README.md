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


## Hosted MVP

Deploy `streamlit_app.py` to Streamlit Community Cloud. After deployment,
open the app and click **Load demo data** to verify scoring, recency and
application-status tracking.

This hosted MVP uses SQLite for demonstration. Production persistence will move
to PostgreSQL before automated job collection and application tracking are enabled.


## Live job sources

The hosted MVP can fetch jobs from:
- No Fluff Jobs
- Pracuj.pl
- JustJoin.IT

Use **Fetch live jobs** in the dashboard. These adapters scrape public search pages
and normalize the results into the common `Job` model. Job-board HTML changes can
require adapter maintenance, so the dashboard reports per-source errors instead
of silently failing.

Always respect each site's terms, robots rules, rate limits, and application policies.


## Live source diagnostics

After deployment, click **Fetch live jobs**. The dashboard keeps the result on screen
and reports each source independently, including number of offers found, number newly
inserted, elapsed time, exception type and exception message.

\n## V1.2.2 fixes\n
- Fixed SQLite upsert placeholder mismatch that caused `22 values for 21 columns`.
- Updated JustJoin.IT listing URLs to current public testing listings.
- Updated Pracuj.pl QA search URLs.
- Added a storage regression test.
