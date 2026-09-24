from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

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
    seniority: str = ""
    published_at: Optional[datetime] = None
    score: float = 0.0
    matched_keywords: list[str] = field(default_factory=list)
    penalties: list[str] = field(default_factory=list)

    @property
    def external_id(self):
        return self.url.strip().lower()
