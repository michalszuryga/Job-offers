# Hosting

What runs where, and which credentials each piece needs. Setup steps are in the
README's *Deployment* section.

| Piece | Where | Notes |
|---|---|---|
| Web app (`web/`) | GitHub Pages, `https://michalszuryga.github.io/Job-offers/` | Deployed by `.github/workflows/web-pages.yml` on every push to `main` touching `web/`. Talks to Supabase with the publishable key; access is enforced by RLS (`db/web_access.sql`). |
| Database + sign-in | Supabase (Postgres, EU region `eu-west-1`) | Magic-link e-mails go out through custom Gmail SMTP; the Magic Link template includes `{{ .Token }}` for code sign-in. Sign-ups are off; members are listed in `app_members`. |
| Daily fetch + summary e-mail | GitHub Actions `.github/workflows/daily-fetch.yml` | Triggered at 17:45 Europe/Warsaw by cron-job.org (`workflow_dispatch`, `daily=true`); GitHub's cron at 17:41 is only a fallback. A daily run skips when today's evening fetch already happened. |
| External scheduler | cron-job.org (owner's free account) | Holds only the GitHub token `joffers-daily-fetch-trigger` (fine-grained, this repo, *Actions: Read and write*). No offer data or database credentials pass through it. |
| Legacy dashboard | Streamlit Community Cloud, entrypoint `streamlit_app.py` | Being retired; uses `DATABASE_URL` from its secrets. SQLite is only a local-dev fallback when `DATABASE_URL` is unset. |

## Credentials and where they live

| Credential | Stored in | Renew / rotate |
|---|---|---|
| `DATABASE_URL` (Supabase session pooler, `postgres` role) | GitHub secret, Streamlit secrets, local `.streamlit/secrets.toml` (gitignored) | When the DB password changes, update all three. |
| `SMTP_USER` / `SMTP_PASSWORD` (Gmail app password) | GitHub secrets; Supabase Auth SMTP settings | If the app password is revoked. |
| Supabase URL + publishable key | GitHub variables `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | Public by design. |
| `joffers-daily-fetch-trigger` GitHub token | cron-job.org job header | **Expires 2027-06-14** — renew before then. |
| `APP_URL`, `SUMMARY_TO`, `CONTROLLER_NAME`, `CONTACT_EMAIL` | GitHub variables (the last two default to the owner's in `web-pages.yml`) | — |

Never put keys in Git; use the hosting provider's secret settings.
