from abc import ABC, abstractmethod
from ..models import Job


class JobSource(ABC):
    name = "unknown"
    # True for sources that have shown rate-limiting/blocking under sustained
    # or repeated use (Pracuj.pl, No Fluff Jobs, CzyJestEldorado) — lets a
    # caller offer a "skip sensitive sources" fetch that avoids poking a site
    # that's already blocking this IP, or just wants a faster, lighter run.
    sensitive = False

    @abstractmethod
    def fetch(self, known_urls: set | None = None) -> list[Job]:
        """known_urls: canonical URLs already stored, so a source can skip
        re-fetching detail pages for offers it has already parsed before."""
        raise NotImplementedError
