"""AI analysis layer.

The first version is provider-agnostic: it builds a strict prompt and returns a structured
result. A concrete API client can be plugged in later without changing scoring or storage.
"""

import json


def build_analysis_payload(job, profile: dict) -> dict:
    return {
        "task": "Analyze this job against the candidate profile. Do not invent experience.
",
        "candidate": profile["candidate"],
        "job": {
            "title": job.title,
            "company": job.company,
            "description": job.description,
            "location": job.location,
            "remote": job.remote,
            "contract": job.contract,
            "seniority": job.seniority,
            "salary_min": job.salary_min,
            "salary_max": job.salary_max,
        },
        "output_schema": {
            "match_summary": "string",
            "strong_matches": ["string"],
            "missing_or_unclear": ["string"],
            "concerns": ["string"],
            "cv_emphasis": ["string"],
            "application_questions": [{"question": "string", "suggested_answer": "string"}],
        },
    }


def build_prompt(job, profile: dict) -> str:
    payload = build_analysis_payload(job, profile)
    return json.dumps(payload, ensure_ascii=False, indent=2)
