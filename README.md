# JOffers — job finder

[![Tests](https://github.com/michalszuryga/Job-offers/actions/workflows/tests.yml/badge.svg)](https://github.com/michalszuryga/Job-offers/actions/workflows/tests.yml)

Collects QA job offers from Polish and international job boards, scores them
against a candidate profile, and tracks applications. Runs a scheduled fetch
every evening and e-mails a summary of new offers.

## What it does

- **8 sources:** No Fluff Jobs, Pracuj.pl, JustJoin.IT, Bulldogjob, TestDevJobs,
  CzyJestEldorado (aggregator), RemoteOK, We Work Remotely.
- **Scoring:** deterministic, explainable 0–100 match score from the profile in
  `config/profile.yaml` (roles, technologies, domains, contract, seniority,
  salary, freshness) plus hard exclusions (e.g. Java-as-a-requirement, junior-only).
- **Deduplication** across boards by normalized title + company.
- **Lifecycle:** offers you haven't touched (`TO_REVIEW`) are removed after 14
  days without appearing on their board; anything you've triaged is kept.
- **Tracking:** application status, the rate and notice period you quoted, CV
  highlights matched to each offer.
- **Daily summary e-mail** at 18:00 Europe/Warsaw (Gmail SMTP).
- **Web app** (`web/`, React + TypeScript) with magic-link sign-in, built for
  phone and laptop; the Streamlit dashboard is being phased out.

## Architecture

```
GitHub Actions (18:00 daily) ──┐                                         ┌── Web app (GitHub Pages, Supabase Auth + RLS)
                               ├──► scrapers + scoring (Python) ──► Supabase Postgres
Dashboard "Fetch live jobs" ───┘                                         ├── Streamlit dashboard (legacy)
                                                                         └──► e-mail summary
```

- `job_finder/sources/` — one adapter per board, all returning the common `Job` model.
- `job_finder/collector.py` — runs sources concurrently, dedups, bulk-stores, expires stale offers.
- `job_finder/scoring.py` — the match score.
- `job_finder/storage.py` — Postgres when `DATABASE_URL` is set, SQLite otherwise (local dev, tests).
- `job_finder/app.py` — Streamlit dashboard.
- `job_finder/cli.py` — `fetch` and `notify-summary` for the scheduled run.
- `web/` — the web app; talks to Supabase directly with the publishable key.
- `db/web_access.sql` — row-level security and the one write function the web app may call.

## Run locally

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
pytest -q
streamlit run streamlit_app.py
python -m job_finder.cli fetch          # one fetch from the terminal
python -m job_finder.cli notify-summary # prints the summary if SMTP_USER is unset
```

Without `DATABASE_URL` everything runs against a local `jobs.db` SQLite file.
To use the shared database, copy `.streamlit/secrets.toml.example` to
`.streamlit/secrets.toml` (gitignored) and fill in the Supabase session-pooler URL.

### Web app

```bash
cd web
cp .env.example .env.local   # Supabase project URL + publishable key
npm install
npm run dev
npx playwright install chromium && npm run test:e2e   # Supabase is mocked
```

## Deployment

**Web app** — `.github/workflows/web-pages.yml` deploys `web/` to GitHub Pages.
In Supabase enable the Data API (*Integrations → Data API*) with `public`
exposed. Enable *Settings → Pages → Source: GitHub Actions*, add repository variables
`SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`, and apply `db/web_access.sql`.
Access is limited to users listed in `app_members`; in Supabase Auth set the
Site URL to the Pages URL and turn off new sign-ups once your account exists.

**Dashboard** — Streamlit Community Cloud, entrypoint `streamlit_app.py`, with
`DATABASE_URL` set under *App settings → Secrets*.

**Scheduled fetch** — `.github/workflows/daily-fetch.yml`. In the GitHub repo
settings add:

| Kind | Name | Value |
|---|---|---|
| Secret | `DATABASE_URL` | same Supabase session-pooler URL as the dashboard |
| Secret | `SMTP_USER` | Gmail address the summary is sent from |
| Secret | `SMTP_PASSWORD` | a Gmail app password (myaccount.google.com/apppasswords) |
| Variable | `SUMMARY_TO` | recipient; defaults to `SMTP_USER` |
| Variable | `APP_URL` | web app URL, linked at the bottom of the e-mail |
Run it once by hand from *Actions → Daily fetch → Run workflow*.

GitHub pauses scheduled workflows after 60 days without repository activity.

## Notes

Scrapers read public search pages; respect each site's terms, robots rules and
rate limits. Pracuj.pl, No Fluff Jobs and CzyJestEldorado are fetched serially
and slowly on purpose, and can be skipped with `--skip-sensitive`.

Never commit `.streamlit/secrets.toml`, `jobs.db` or any API key.
