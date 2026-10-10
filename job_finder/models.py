import re
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


_COMPANY_SUFFIXES = re.compile(
    r"\b(sp\.?\s*z\s*o\.?\s*o\.?|s\.?\s*a\.?|sp\.?\s*j\.?|sp\.?\s*k\.?|ltd\.?|inc\.?|llc|gmbh|"
    r"s\.?\s*r\.?\s*o\.?|polska|poland)\b\.?",
    re.I,
)
_TITLE_NOISE = re.compile(r"\((?:k/m|m/k|m/f|f/m|w/m|m/w)\)|\bnowa\b", re.I)


def _normalize_for_dedup(text):
    text = _TITLE_NOISE.sub("", text or "")
    text = _COMPANY_SUFFIXES.sub("", text)
    text = re.sub(r"[.,\-–—/()]", " ", text)
    return re.sub(r"\s+", " ", text).strip().lower()


def dedup_key(title: str, company: str):
    """A same posting cross-posted on an aggregator (different URL, same job)
    normalizes to the same key — used to catch duplicates that canonical_job_url
    (URL-based) can't, since aggregators host their own URLs for the same job."""
    return (_normalize_for_dedup(title), _normalize_for_dedup(company))


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
    application_status: str = "TO_REVIEW"

    @property
    def external_id(self):
        return canonical_job_url(self.url)

    @property
    def full_text(self) -> str:
        return " ".join(
            [self.title, self.company, self.description, self.location, self.contract, self.seniority]
        )
