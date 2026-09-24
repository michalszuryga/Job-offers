import re
from .models import Job

def norm(x):
    return re.sub(r"\s+", " ", (x or "").lower())

def hit(text, key):
    return norm(key) in norm(text)

def score_job(job: Job, cfg):
    c = cfg["candidate"]; w = cfg["scoring"]["weights"]; p = cfg["scoring"]["penalties"]
    text = " ".join([job.title, job.description, job.location, job.contract, job.seniority])
    score = 0; matched=[]; penalties=[]
    if any(hit(job.title, r) for r in c["target_roles"]): score += w["role"]; matched.append("target role")
    tech = [x for x in c["technologies"]["strong"] if hit(text,x)]
    score += min(w["technologies"], w["technologies"] * len(tech) / 8); matched += tech
    domains = [x for x in c["domains"] if hit(text,x)]
    if domains: score += min(w["domain"], w["domain"] * len(domains) / 2); matched += domains
    if job.remote is True or hit(text,"remote"): score += w["remote"]; matched.append("remote")
    if any(hit(text,x) for x in c["contracts"]): score += w["contract"]; matched.append("preferred contract")
    if any(hit(job.seniority,x) for x in c["seniority"]): score += w["seniority"]; matched.append("preferred seniority")
    if hit(text,"english"): score += w["language"]
    ai = [x for x in c["ai"] if hit(text,x)]
    if ai: score += w["ai"]; matched += ai
    if hit(job.seniority,"junior"): score -= p["junior"]; penalties.append("junior")
    if hit(text,"internship") or hit(text,"intern"): score -= p["internship"]; penalties.append("internship")
    if job.remote is False or hit(text,"on-site") or hit(text,"onsite"): score -= p["onsite"]; penalties.append("onsite")
    job.score=max(0,min(cfg["scoring"]["max_score"],round(score,1)))
    job.matched_keywords=list(dict.fromkeys(matched)); job.penalties=penalties
    return job
