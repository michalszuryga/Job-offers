# Michal Job Finder

Personal job-search engine for collecting, scoring, analyzing and tracking QA job opportunities.

## V1.1
- Deterministic profile matching
- Recency scoring
- Application status tracking
- Streamlit dashboard
- Provider-agnostic AI analysis payload
- Dual-backend persistence: SQLite locally, PostgreSQL (via `DATABASE_URL`) when hosted

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
open the app and click **Fetch live jobs** to collect and score current offers.

The hosted app uses PostgreSQL (Supabase) for persistence, configured via a
`DATABASE_URL` secret — see `.streamlit/secrets.toml.example`. Without that
secret set, the app falls back to a local SQLite file, which does not survive
a Streamlit Cloud restart/redeploy.


## Live job sources

The hosted MVP can fetch jobs from:
- No Fluff Jobs
- Pracuj.pl
- JustJoin.IT
- RemoteOK (public JSON API, international remote roles)
- We Work Remotely (RSS feeds, international remote roles)
- Bulldogjob
- TestDevJobs (QA/testing-only board, Europe remote filter)
- CzyJestEldorado (aggregator — deduplicated by title+company against other sources)

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


## Candidate hard exclusions

The profile now supports hard exclusions. Java is rejected using a whole-word
match, so JavaScript remains allowed. Junior/intern roles and configured Java
phrases are also rejected before insertion into the job database.

Rejected offers are counted in live-fetch diagnostics but are not inserted into
the active offers list.


### V1.2.4 fixes
- Dashboard reruns immediately after live fetch, so counters and table show fresh DB data.
- Legacy demo records are removed automatically.
- Search/listing URLs are filtered out by Pracuj and No Fluff adapters.
- Score calculation now correctly reads the nested candidate technology configuration.


## Persistence

The hosted app stores data in PostgreSQL (Supabase) so job history and
application tracking (status, quoted rate, notice period) survive Streamlit
Cloud restarts/redeploys. The dashboard never blocks the live-fetch button
just because the database is empty. Without `DATABASE_URL` configured, the
app falls back to a local SQLite file for local development.
