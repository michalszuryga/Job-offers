from abc import ABC, abstractmethod
from ..models import Job


class JobSource(ABC):
    name = "unknown"

    @abstractmethod
    def fetch(self) -> list[Job]:
        raise NotImplementedError
