"""Provider-agnostic AI analysis payload builder.

The real model API integration will be added after the hosted MVP is verified.
"""

import json


def build_analysis_payload(job, profile: dict) -> dict:
    return {
        "task": "Analyze this job against the candidate profile. Do not invent experience.",
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
            "application_questions": [
                {"question": "string", "suggested_answer": "string"}
            ],
        },
    }


def build_prompt(job, profile: dict) -> str:
    return json.dumps(
        build_analysis_payload(job, profile),
        ensure_ascii=False,
        indent=2,
    )
