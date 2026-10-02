"""Sender identity for outgoing email: validation and From-header composition.

The domain always comes from the server's EMAIL_FROM_ADDRESS, so a caller can
choose who an email appears to come from (the part before the @, and a display
name) but can never leave the verified sending domain. Reply-To is the one
exception: it is only a reply hint, needs no DNS, and may be any valid address.
"""

import re
from email.headerregistry import Address
from email.utils import parseaddr
from typing import Annotated

from pydantic import AfterValidator

from app.core.config import settings

FROM_LOCAL_MAX_LENGTH = 64
FROM_NAME_MAX_LENGTH = 100
REPLY_TO_MAX_LENGTH = 320

# fullmatch is required everywhere below: "$" would let a trailing "\n" through.
_FROM_LOCAL_RE = re.compile(r"[a-z0-9._+-]+")
_REPLY_TO_RE = re.compile(
    r"[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+"
    r"@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?"
    r"(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+"
)
# C0/C1 controls (incl. CR, LF, NEL) plus the Unicode line and paragraph separators.
_CONTROL_CHARS_RE = re.compile(r"[\x00-\x1f\x7f-\x9f  ]")


def validate_from_local(value: str | None) -> str | None:
    # An empty string means "not set", so clients without null (Go) can clear a field.
    if not value:
        return None
    if len(value) > FROM_LOCAL_MAX_LENGTH:
        raise ValueError(f"from_local must be at most {FROM_LOCAL_MAX_LENGTH} characters")
    if not _FROM_LOCAL_RE.fullmatch(value):
        raise ValueError(
            "from_local may contain only lowercase letters, digits, '.', '_', '+' and '-' "
            "(the part before the @, without the domain)"
        )
    return value


def validate_from_name(value: str | None) -> str | None:
    if not value:
        return None
    if _CONTROL_CHARS_RE.search(value):
        raise ValueError("from_name must be plain text without control characters or newlines")
    value = value.strip()
    if not value:
        return None
    if len(value) > FROM_NAME_MAX_LENGTH:
        raise ValueError(f"from_name must be at most {FROM_NAME_MAX_LENGTH} characters")
    return value


def validate_reply_to(value: str | None) -> str | None:
    if not value:
        return None
    if len(value) > REPLY_TO_MAX_LENGTH or not _REPLY_TO_RE.fullmatch(value):
        raise ValueError("reply_to must be a valid email address")
    return value


def compose_from(
    from_local: str | None = None,
    from_name: str | None = None,
    *,
    default: str | None = None,
) -> str:
    """Return the From header value for the given sender fields.

    The domain is always taken from `default` (EMAIL_FROM_ADDRESS unless given).
    With neither field set the default is returned unchanged.
    """
    default = default or settings.EMAIL_FROM_ADDRESS
    if not from_local and not from_name:
        return default
    default_name, default_address = parseaddr(default)
    default_local, _, domain = default_address.rpartition("@")
    address = Address(
        display_name=from_name or default_name,
        username=from_local or default_local,
        domain=domain,
    )
    return str(address)


# Annotated types for request schemas, so every entry point validates identically.
FromLocal = Annotated[str | None, AfterValidator(validate_from_local)]
FromName = Annotated[str | None, AfterValidator(validate_from_name)]
ReplyTo = Annotated[str | None, AfterValidator(validate_reply_to)]
