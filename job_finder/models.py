from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


def canonical_job_url(url: str) -> str:
    """Normalize equivalent offer URLs into a stable storage key."""
    parts = urlsplit((url or "").strip())
    query = sorted((k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True)
                   if not k.lower().startswith("utm_") and k.lower() not in {"fbclid", "gclid"})
    path = parts.path.rstrip("/") or "/"
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), path, urlencode(query), ""))


@dataclass
class Job:
    title: str
    company: str
    url: str
    source: str
    description: str = ""
    location: str = ""
    remote: Optional[bool] = None
    contract: str = ""
    salary_min: Optional[float] = None
    salary_max: Optional[float] = None
    salary_currency: str = ""
    salary_period: str = ""
    seniority: str = ""
    published_at: Optional[datetime] = None
    score: float = 0.0
    rejected: bool = False
    reject_reason: str = ""
    score_breakdown: dict = field(default_factory=dict)
    recency_score: float = 0.0
    matched_keywords: list[str] = field(default_factory=list)
    penalties: list[str] = field(default_factory=list)
    application_status: str = "NEW"

    @property
    def external_id(self):
        return canonical_job_url(self.url)

    @property
    def full_text(self) -> str:
        return " ".join(
            [self.title, self.company, self.description, self.location, self.contract, self.seniority]
        )
