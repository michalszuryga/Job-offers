# Hosting

The current MVP is designed for Streamlit Community Cloud.

Entrypoint:
`streamlit_app.py`

The SQLite database is suitable for the hosted demo only.
For the production version, move persistence to PostgreSQL before relying on the
app for long-term job/application history.

Do not put API keys in Git. Use the hosting provider's secrets/environment settings.
