# Roadmap

Long-term goal: a public, multi-user product — **JOffers** — that anyone can use
the way the author does today.

## Stage 1 — correctness and foundations ✅
- [x] Whole-word keyword matching (substring matches inflated AI/Git points)
- [x] All tests green, CI on every push
- [x] Pinned dependencies, dev dependencies split out
- [x] Scoring settings stored in the database, shared by every device
- [x] Fast dashboard: one cached read instead of several per interaction
- [x] Stale offers expire after 14 days off their board

## Stage 2 — fetch in the background ✅
- [x] Scheduled fetch in GitHub Actions at 18:00 Europe/Warsaw
- [x] Fetch history stored in the database (diagnostics survive reloads)
- [x] Daily summary e-mail (Gmail SMTP)
- [ ] Check whether boards block GitHub-hosted runners; mitigate if they do
- [ ] Alert when a source returns nothing for several runs in a row

## Stage 3 — new web app (alongside Streamlit, same database)
- [x] React + TypeScript frontend on GitHub Pages, reading Supabase directly
- [x] Supabase Auth (magic link) + row-level security, access via `app_members`
- [x] Offer list with the daily filters, details, status/rate/notice tracking
- [x] Playwright end-to-end tests (desktop + phone, Supabase mocked) in CI
- [ ] Scoring settings and fetch diagnostics in the web app
- [ ] "Fetch now" triggers the GitHub workflow instead of scraping in the page

## Stage 3b — multi-tenant data model (once Streamlit is retired)
- [ ] Shared scraped offers; per-user profile, scores, statuses, notes and quoted rates
- [ ] Scheduled fetch scores offers for every user's profile

## Stage 4 — switch over
- [ ] Retire the Streamlit dashboard
- [ ] Postgres only: drop the SQLite fallback, real timestamp types, versioned migrations

## Before going public
- [ ] Legal review: terms of service of each board for commercial reuse of listings
- [ ] Privacy policy / GDPR for user accounts and application data
- [ ] Per-user scheduled fetch costs and rate limits
- [ ] Email notifications (account-based) alongside push
- [ ] Billing, if commercialized

## Later ideas
- [ ] AI-assisted offer analysis and tailored CV generation
- [ ] Application assistant with human approval before anything is sent
