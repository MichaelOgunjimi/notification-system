"""Values rendered and sent for one transactional email."""

from dataclasses import dataclass


@dataclass(frozen=True)
class TransactionalEmail:
    subject: str
    html: str
    text: str
