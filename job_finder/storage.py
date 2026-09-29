import json
import os
import sqlite3
from pathlib import Path

from .models import Job, canonical_job_url


DEFAULT_STATUSES = ["NEW", "REVIEW", "INTERESTED", "CV_GENERATED", "READY_TO_APPLY", "APPLIED", "INTERVIEW", "REJECTED", "WITHDRAWN"]

# All timestamp columns are plain TEXT (matches how SQLite already stores
# job.published_at.isoformat() etc.). SQLite's CURRENT_TIMESTAMP already
# yields a text string, but Postgres's is a real `timestamp with time zone`
# value — assigning it straight into a text column raises "DatatypeMismatch".
# Casting makes the exact same SQL text work correctly on both backends.
_NOW = "CAST(CURRENT_TIMESTAMP AS TEXT)"

# All queries in this file are written once, using SQLite's "?" placeholder
# style; _q() swaps them for Postgres's "%s" when talking to a real Postgres
# server. The two dialects otherwise agree closely enough (TEXT/REAL/INTEGER
# column types, DEFAULT CURRENT_TIMESTAMP, ON CONFLICT ... DO UPDATE SET with
# EXCLUDED) that no separate schema is needed.


class JobStore:
    def __init__(self, path="jobs.db", database_url=None):
        # No DATABASE_URL configured (local dev, tests) -> plain SQLite file,
        # zero setup, no network. Configured (via env var, or app.py bridging
        # st.secrets into the environment) -> shared, persistent Postgres,
        # e.g. so the same data shows up whether you're on your laptop or
        # opening the Streamlit Cloud app from your phone.
        self.database_url = database_url or os.environ.get("DATABASE_URL")
        self.backend = "postgres" if self.database_url else "sqlite"
        self.path = str(Path(path)) if self.backend == "sqlite" else None
        self.init()

    def _connect(self):
        if self.backend == "postgres":
            import psycopg2

            dsn = self.database_url
            if "sslmode=" not in dsn:
                dsn = f"{dsn}{'&' if '?' in dsn else '?'}sslmode=require"
            return psycopg2.connect(dsn, connect_timeout=10)
        return sqlite3.connect(self.path)

    def _q(self, sql):
        return sql.replace("?", "%s") if self.backend == "postgres" else sql

    def _exec(self, conn, sql, params=()):
        """Execute a write/lookup query, returning a cursor either way (sqlite3's
        conn.execute() shorthand doesn't exist on psycopg2 connections)."""
        sql = self._q(sql)
        if self.backend == "postgres":
            cur = conn.cursor()
            cur.execute(sql, params)
            return cur
        return conn.execute(sql, params)

    def _query_dicts(self, conn, sql, params=()):
        sql = self._q(sql)
        if self.backend == "postgres":
            from psycopg2.extras import RealDictCursor

            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute(sql, params)
            return [dict(row) for row in cur.fetchall()]
        conn.row_factory = sqlite3.Row
        return [dict(row) for row in conn.execute(sql, params).fetchall()]

    def _existing_columns(self, conn):
        if self.backend == "postgres":
            cur = conn.cursor()
            cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'jobs'")
            return {row[0] for row in cur.fetchall()}
        return {row[1] for row in conn.execute("PRAGMA table_info(jobs)").fetchall()}

    def init(self):
        with self._connect() as conn:
            self._exec(
                conn,
                """CREATE TABLE IF NOT EXISTS jobs (
                    external_id TEXT PRIMARY KEY, title TEXT, company TEXT, url TEXT, source TEXT,
                    description TEXT, location TEXT, remote INTEGER, contract TEXT, salary_min REAL,
                    salary_max REAL, salary_currency TEXT, salary_period TEXT DEFAULT '', seniority TEXT, published_at TEXT,
                    score REAL, recency_score REAL DEFAULT 0, matched_keywords TEXT, penalties TEXT,
                    application_status TEXT DEFAULT 'NEW', ai_analysis TEXT, tailored_cv_path TEXT,
                    first_seen_at TEXT DEFAULT ({now}), last_seen_at TEXT DEFAULT ({now}),
                    analyzed_at TEXT
                )""".format(now=_NOW),
            )
            # Lightweight migration for an existing V1 database.
            existing = self._existing_columns(conn)
            migrations = {
                "recency_score": "REAL DEFAULT 0",
                "application_status": "TEXT DEFAULT 'NEW'",
                "ai_analysis": "TEXT",
                "tailored_cv_path": "TEXT",
                "last_seen_at": "TEXT",
                "analyzed_at": "TEXT",
                "rejected": "INTEGER DEFAULT 0",
                "reject_reason": "TEXT",
                "score_breakdown": "TEXT",
                "salary_period": "TEXT DEFAULT ''",
                "applied_rate": "TEXT DEFAULT ''",
                "notice_period": "TEXT DEFAULT ''",
                "applied_at": "TEXT",
            }
            for column, definition in migrations.items():
                if column not in existing:
                    self._exec(conn, f"ALTER TABLE jobs ADD COLUMN {column} {definition}")
            self._exec(conn, f"UPDATE jobs SET last_seen_at=COALESCE(last_seen_at, {_NOW})")

    _UPSERT_SQL = """INSERT INTO jobs (external_id,title,company,url,source,description,location,remote,contract,
                salary_min,salary_max,salary_currency,salary_period,seniority,published_at,score,recency_score,
                matched_keywords,penalties,application_status,first_seen_at,last_seen_at,rejected,reject_reason,score_breakdown)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,{now},{now},?,?,?)
                ON CONFLICT(external_id) DO UPDATE SET
                title=excluded.title, company=excluded.company, description=excluded.description,
                location=excluded.location, remote=excluded.remote, contract=excluded.contract,
                salary_min=excluded.salary_min, salary_max=excluded.salary_max, salary_currency=excluded.salary_currency,
                salary_period=excluded.salary_period,
                seniority=excluded.seniority, published_at=excluded.published_at, score=excluded.score,
                recency_score=excluded.recency_score, matched_keywords=excluded.matched_keywords,
                penalties=excluded.penalties, last_seen_at={now}, rejected=excluded.rejected,
                reject_reason=excluded.reject_reason, score_breakdown=excluded.score_breakdown""".format(now=_NOW)

    @staticmethod
    def _upsert_params(job: Job):
        canonical_url = canonical_job_url(job.url)
        return (
            job.external_id, job.title, job.company, canonical_url, job.source, job.description, job.location,
            None if job.remote is None else int(job.remote), job.contract, job.salary_min, job.salary_max,
            job.salary_currency, job.salary_period, job.seniority, job.published_at.isoformat() if job.published_at else None,
            job.score, job.recency_score, json.dumps(job.matched_keywords), json.dumps(job.penalties),
            job.application_status, int(getattr(job, "rejected", False)), getattr(job, "reject_reason", ""),
            json.dumps(getattr(job, "score_breakdown", {}), ensure_ascii=False),
        )

    def upsert(self, job: Job) -> bool:
        with self._connect() as conn:
            old = self._exec(conn, "SELECT external_id FROM jobs WHERE external_id=?", (job.external_id,)).fetchone()
            self._exec(conn, self._UPSERT_SQL, self._upsert_params(job))
        return old is None

    def upsert_many(self, jobs):
        """Like upsert(), but reuses one connection for the whole batch and skips
        the existed/new lookup (unused by callers) — critical for
        refresh_scores_for_config(), which can rewrite hundreds of rows at
        once and would otherwise pay two network round trips per row."""
        with self._connect() as conn:
            for job in jobs:
                self._exec(conn, self._UPSERT_SQL, self._upsert_params(job))

    def list(self, min_score=0, status=None, limit=None, remote_only=False):
        sql = "SELECT * FROM jobs WHERE score>=? AND COALESCE(rejected, 0)=0"
        params = [min_score]
        if remote_only:
            sql += " AND remote=1"
        if status:
            sql += " AND application_status=?"
            params.append(status)
        sql += " ORDER BY score DESC, recency_score DESC, published_at DESC"
        if limit:
            sql += " LIMIT ?"
            params.append(limit)
        with self._connect() as conn:
            return self._query_dicts(conn, sql, params)

    def list_all(self):
        """Return every stored row so changed scoring rules can be reapplied."""
        with self._connect() as conn:
            return self._query_dicts(conn, "SELECT * FROM jobs")

    def contains(self, url: str) -> bool:
        with self._connect() as conn:
            return self._exec(conn, "SELECT 1 FROM jobs WHERE external_id=?", (canonical_job_url(url),)).fetchone() is not None

    def delete_source(self, source):
        with self._connect() as conn:
            self._exec(conn, "DELETE FROM jobs WHERE source=?", (source,))

    def delete_all(self):
        with self._connect() as conn:
            self._exec(conn, "DELETE FROM jobs")

    def set_status(self, external_id, status):
        if status not in DEFAULT_STATUSES:
            raise ValueError(f"Unknown status: {status}")
        with self._connect() as conn:
            if status == "APPLIED":
                self._exec(
                    conn,
                    "UPDATE jobs SET application_status=?, "
                    f"applied_at=COALESCE(applied_at, {_NOW}) WHERE external_id=?",
                    (status, external_id),
                )
            else:
                self._exec(conn, "UPDATE jobs SET application_status=? WHERE external_id=?", (status, external_id))

    def save_application_details(self, external_id, applied_rate="", notice_period=""):
        """The rate and notice period you actually told the employer — kept
        separate from the offer's own listed salary, which may differ from
        what you negotiated or stated."""
        with self._connect() as conn:
            self._exec(
                conn,
                "UPDATE jobs SET applied_rate=?, notice_period=? WHERE external_id=?",
                (applied_rate, notice_period, external_id),
            )

    def save_ai_analysis(self, external_id, analysis: dict):
        with self._connect() as conn:
            self._exec(
                conn,
                f"UPDATE jobs SET ai_analysis=?, analyzed_at={_NOW} WHERE external_id=?",
                (json.dumps(analysis, ensure_ascii=False), external_id),
            )

    def save_tailored_cv(self, external_id, path):
        with self._connect() as conn:
            self._exec(
                conn,
                "UPDATE jobs SET tailored_cv_path=?, application_status='CV_GENERATED' WHERE external_id=?",
                (path, external_id),
            )
