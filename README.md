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
- **Lifecycle:** offers you haven't acted on (`TO_REVIEW`, or `REVIEW`, which the
  web app sets when you merely open one) are removed after 14 days without appearing
  on their board, unless you recorded a rate or notice period; anything you've
  triaged further is kept.
- **Tracking:** application status, the rate and notice period you quoted, CV
  highlights matched to each offer. `applied_at` is stamped the first time an
  offer is marked `APPLIED` and is never cleared afterwards: moving the status
  back, or undoing the change, keeps the original date.
- **Daily summary e-mail** at 18:00 Europe/Warsaw (Gmail SMTP), listing the
  offers that fetch added; every fetch also rescores stored offers, so freshness
  and the stale-offer penalty stay current. If the fetch fails before it records
  anything, the e-mail lists offers first seen in the last 24 h instead and says
  "(24 h)" in the subject.
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

In Supabase *Authentication → Email Templates → Magic Link*, add a line under the
link: `Or enter this code: {{ .Token }}`. An app installed to the iOS home screen
can't receive the link (it opens in Safari), so it signs in with that code instead
("Have a code? Enter it"). Keep *Allow new users to sign up* off: the app asks with
`shouldCreateUser: false`, and an address without an account is told JOffers is in
private beta (which reveals whether an address has an account; accepted for the beta).

The privacy page (`/privacy`) and "Request access" show the data controller and a
contact address: repository variables `CONTROLLER_NAME` and `CONTACT_EMAIL`, which
default to the owner's in `web-pages.yml`.

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
| Variable | `APP_URL` | the web app's URL, for this repo `https://michalszuryga.github.io/Job-offers/` (the trailing `/` is optional); the e-mail links to its New view (`?view=new`) and to the best new offer (`?offer=…`) |
Run it once by hand from *Actions → Daily fetch → Run workflow*.

GitHub pauses scheduled workflows after 60 days without repository activity.

## Notes

Scrapers read public search pages; respect each site's terms, robots rules and
rate limits. Pracuj.pl, No Fluff Jobs and CzyJestEldorado are fetched serially
and slowly on purpose, and can be skipped with `--skip-sensitive`.

Never commit `.streamlit/secrets.toml`, `jobs.db` or any API key.
