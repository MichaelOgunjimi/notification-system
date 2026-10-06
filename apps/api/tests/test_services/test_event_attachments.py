"""Validation of URL-referenced event attachments."""

import pytest
from pydantic import ValidationError

from app.modules.events.schemas import Attachment, EventCreate


def _event(attachments: list[dict[str, str | int]]) -> EventCreate:
    return EventCreate(
        event_type="order.confirmed",
        recipients=[{"channels": ["email"], "email": "a@example.com"}],
        inline={"html": "<p>Hi</p>"},
        attachments=attachments,
    )


def test_accepts_https_attachment() -> None:
    event = _event(
        [{"filename": "invoice.pdf", "url": "https://files.example.com/a.pdf", "size_bytes": 1000}]
    )
    assert event.attachments[0].filename == "invoice.pdf"


@pytest.mark.parametrize(
    "bad",
    [
        {"filename": "a.pdf", "url": "ftp://files.example.com/a.pdf", "size_bytes": 1000},
        {"filename": "a.pdf", "url": "file:///etc/passwd", "size_bytes": 1000},
        {"filename": "../a.pdf", "url": "https://files.example.com/a.pdf", "size_bytes": 1000},
        {"filename": "", "url": "https://files.example.com/a.pdf", "size_bytes": 1000},
    ],
)
def test_rejects_bad_attachment(bad: dict[str, str | int]) -> None:
    with pytest.raises(ValidationError):
        Attachment(**bad)


def test_rejects_too_many_attachments() -> None:
    item = {"filename": "a.pdf", "url": "https://files.example.com/a.pdf", "size_bytes": 1000}
    with pytest.raises(ValidationError):
        _event([item] * 11)


def test_rejects_non_positive_size() -> None:
    with pytest.raises(ValidationError):
        Attachment(filename="a.pdf", url="https://files.example.com/a.pdf", size_bytes=0)


def test_rejects_declared_total_over_limit() -> None:
    big = {"filename": "a.pdf", "url": "https://files.example.com/a.pdf", "size_bytes": 20_000_000}
    with pytest.raises(ValidationError, match="maximum total size"):
        _event([big, big])
