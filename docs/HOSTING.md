# Hosting

The current MVP is designed for Streamlit Community Cloud.

Entrypoint:
`streamlit_app.py`

The hosted app uses PostgreSQL (Supabase) for persistence, configured via the
`DATABASE_URL` secret. SQLite is only used as a local-dev fallback when that
secret is not set, and does not survive Streamlit Cloud restarts/redeploys.

Do not put API keys in Git. Use the hosting provider's secrets/environment settings.
