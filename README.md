# JOffers — job finder

[![Tests](https://github.com/michalszuryga/Job-offers/actions/workflows/tests.yml/badge.svg)](https://github.com/michalszuryga/Job-offers/actions/workflows/tests.yml)

Collects QA job offers from Polish and international job boards, scores them
against a candidate profile, and tracks applications. Runs a scheduled fetch
every evening and pushes a summary of new offers to your phone.

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
- **Daily summary** at 18:00 Europe/Warsaw via [ntfy](https://ntfy.sh) push.

## Architecture

```
GitHub Actions (18:00 daily) ──┐
                               ├──► scrapers + scoring (Python) ──► Supabase Postgres ◄── Streamlit dashboard
Dashboard "Fetch live jobs" ───┘                                         │
                                                                         └──► ntfy push summary
```

- `job_finder/sources/` — one adapter per board, all returning the common `Job` model.
- `job_finder/collector.py` — runs sources concurrently, dedups, bulk-stores, expires stale offers.
- `job_finder/scoring.py` — the match score.
- `job_finder/storage.py` — Postgres when `DATABASE_URL` is set, SQLite otherwise (local dev, tests).
- `job_finder/app.py` — Streamlit dashboard.
- `job_finder/cli.py` — `fetch` and `notify-summary` for the scheduled run.

## Run locally

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
pytest -q
streamlit run streamlit_app.py
python -m job_finder.cli fetch          # one fetch from the terminal
python -m job_finder.cli notify-summary # prints the summary if NTFY_TOPIC is unset
```

Without `DATABASE_URL` everything runs against a local `jobs.db` SQLite file.
To use the shared database, copy `.streamlit/secrets.toml.example` to
`.streamlit/secrets.toml` (gitignored) and fill in the Supabase session-pooler URL.

## Deployment

**Dashboard** — Streamlit Community Cloud, entrypoint `streamlit_app.py`, with
`DATABASE_URL` set under *App settings → Secrets*.

**Scheduled fetch** — `.github/workflows/daily-fetch.yml`. In the GitHub repo
settings add:

| Kind | Name | Value |
|---|---|---|
| Secret | `DATABASE_URL` | same Supabase session-pooler URL as the dashboard |
| Secret | `NTFY_TOPIC` | a long random string, e.g. `joffers-` + 24 random characters |
| Variable | `APP_URL` | dashboard URL (opened when you tap the notification) |

Then install the ntfy app on your phone and subscribe to the same topic. The
topic name is the only thing protecting the feed, so keep it random and secret.
Run it once by hand from *Actions → Daily fetch → Run workflow*.

GitHub pauses scheduled workflows after 60 days without repository activity.

## Notes

Scrapers read public search pages; respect each site's terms, robots rules and
rate limits. Pracuj.pl, No Fluff Jobs and CzyJestEldorado are fetched serially
and slowly on purpose, and can be skipped with `--skip-sensitive`.

Never commit `.streamlit/secrets.toml`, `jobs.db` or any API key.
