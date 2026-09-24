import json
import sqlite3
from datetime import datetime
from pathlib import Path

from .models import Job


DEFAULT_STATUSES = ["NEW", "REVIEW", "INTERESTED", "CV_GENERATED", "READY_TO_APPLY", "APPLIED", "INTERVIEW", "REJECTED", "WITHDRAWN"]


class JobStore:
    def __init__(self, path="jobs.db"):
        self.path = str(Path(path))
        self.init()

    def init(self):
        with sqlite3.connect(self.path) as conn:
            conn.execute(
                """CREATE TABLE IF NOT EXISTS jobs (
                    external_id TEXT PRIMARY KEY, title TEXT, company TEXT, url TEXT, source TEXT,
                    description TEXT, location TEXT, remote INTEGER, contract TEXT, salary_min REAL,
                    salary_max REAL, salary_currency TEXT, seniority TEXT, published_at TEXT,
                    score REAL, recency_score REAL DEFAULT 0, matched_keywords TEXT, penalties TEXT,
                    application_status TEXT DEFAULT 'NEW', ai_analysis TEXT, tailored_cv_path TEXT,
                    first_seen_at TEXT DEFAULT CURRENT_TIMESTAMP, last_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    analyzed_at TEXT
                )"""
            )
            # Lightweight migration for an existing V1 database.
            existing = {row[1] for row in conn.execute("PRAGMA table_info(jobs)").fetchall()}
            migrations = {
                "recency_score": "REAL DEFAULT 0",
                "application_status": "TEXT DEFAULT 'NEW'",
                "ai_analysis": "TEXT",
                "tailored_cv_path": "TEXT",
                "last_seen_at": "TEXT",
                "analyzed_at": "TEXT",
            }
            for column, definition in migrations.items():
                if column not in existing:
                    conn.execute(f"ALTER TABLE jobs ADD COLUMN {column} {definition}")
            conn.execute("UPDATE jobs SET last_seen_at=COALESCE(last_seen_at, CURRENT_TIMESTAMP)")

    def upsert(self, job: Job) -> bool:
        with sqlite3.connect(self.path) as conn:
            old = conn.execute("SELECT external_id FROM jobs WHERE external_id=?", (job.external_id,)).fetchone()
            conn.execute(
                """INSERT INTO jobs (external_id,title,company,url,source,description,location,remote,contract,
                    salary_min,salary_max,salary_currency,seniority,published_at,score,recency_score,
                    matched_keywords,penalties,application_status,first_seen_at,last_seen_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
                    ON CONFLICT(external_id) DO UPDATE SET
                    title=excluded.title, company=excluded.company, description=excluded.description,
                    location=excluded.location, remote=excluded.remote, contract=excluded.contract,
                    salary_min=excluded.salary_min, salary_max=excluded.salary_max, salary_currency=excluded.salary_currency,
                    seniority=excluded.seniority, published_at=excluded.published_at, score=excluded.score,
                    recency_score=excluded.recency_score, matched_keywords=excluded.matched_keywords,
                    penalties=excluded.penalties, last_seen_at=CURRENT_TIMESTAMP""",
                (
                    job.external_id, job.title, job.company, job.url, job.source, job.description, job.location,
                    None if job.remote is None else int(job.remote), job.contract, job.salary_min, job.salary_max,
                    job.salary_currency, job.seniority, job.published_at.isoformat() if job.published_at else None,
                    job.score, job.recency_score, json.dumps(job.matched_keywords), json.dumps(job.penalties),
                    job.application_status,
                ),
            )
        return old is None

    def list(self, min_score=0, status=None, limit=None):
        sql = "SELECT * FROM jobs WHERE score>=?"
        params = [min_score]
        if status:
            sql += " AND application_status=?"
            params.append(status)
        sql += " ORDER BY score DESC, recency_score DESC, published_at DESC"
        if limit:
            sql += " LIMIT ?"
            params.append(limit)
        with sqlite3.connect(self.path) as conn:
            conn.row_factory = sqlite3.Row
            return [dict(row) for row in conn.execute(sql, params).fetchall()]

    def set_status(self, external_id, status):
        if status not in DEFAULT_STATUSES:
            raise ValueError(f"Unknown status: {status}")
        with sqlite3.connect(self.path) as conn:
            conn.execute("UPDATE jobs SET application_status=? WHERE external_id=?", (status, external_id))

    def save_ai_analysis(self, external_id, analysis: dict):
        with sqlite3.connect(self.path) as conn:
            conn.execute(
                "UPDATE jobs SET ai_analysis=?, analyzed_at=CURRENT_TIMESTAMP WHERE external_id=?",
                (json.dumps(analysis, ensure_ascii=False), external_id),
            )

    def save_tailored_cv(self, external_id, path):
        with sqlite3.connect(self.path) as conn:
            conn.execute(
                "UPDATE jobs SET tailored_cv_path=?, application_status='CV_GENERATED' WHERE external_id=?",
                (path, external_id),
            )
