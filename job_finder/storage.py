import sqlite3, json
from .models import Job

class JobStore:
    def __init__(self,path="jobs.db"):
        self.path=path; self.init()
    def init(self):
        with sqlite3.connect(self.path) as c:
            c.execute('''CREATE TABLE IF NOT EXISTS jobs (external_id TEXT PRIMARY KEY,title,company,url,source,description,location,remote,contract,salary_min,salary_max,salary_currency,seniority,published_at,score,matched_keywords,penalties,first_seen_at DEFAULT CURRENT_TIMESTAMP)''')
    def upsert(self,j):
        with sqlite3.connect(self.path) as c:
            old=c.execute("SELECT external_id FROM jobs WHERE external_id=?",(j.external_id,)).fetchone()
            c.execute('''INSERT INTO jobs VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(external_id) DO UPDATE SET title=excluded.title,company=excluded.company,description=excluded.description,location=excluded.location,remote=excluded.remote,contract=excluded.contract,salary_min=excluded.salary_min,salary_max=excluded.salary_max,salary_currency=excluded.salary_currency,seniority=excluded.seniority,published_at=excluded.published_at,score=excluded.score,matched_keywords=excluded.matched_keywords,penalties=excluded.penalties''', (j.external_id,j.title,j.company,j.url,j.source,j.description,j.location,None if j.remote is None else int(j.remote),j.contract,j.salary_min,j.salary_max,j.salary_currency,j.seniority,j.published_at.isoformat() if j.published_at else None,j.score,json.dumps(j.matched_keywords),json.dumps(j.penalties)))
        return old is None
    def list(self,min_score=0):
        with sqlite3.connect(self.path) as c:
            c.row_factory=sqlite3.Row
            return [dict(x) for x in c.execute("SELECT * FROM jobs WHERE score>=? ORDER BY score DESC",(min_score,)).fetchall()]
