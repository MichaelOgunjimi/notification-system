"""Cryptographic helpers for credentials and identifiers."""

import hashlib
import secrets
import uuid
from typing import Literal


def generate_api_key(environment: Literal["live", "test"] = "live") -> str:
    """Generate a secure project API key labelled with its environment."""
    return f"nk_{environment}_{secrets.token_urlsafe(32)}"


def generate_system_key() -> str:
    """Generate an internal system-account credential."""
    return f"nsk_{secrets.token_urlsafe(32)}"


def hash_api_key(key: str) -> str:
    """Return SHA-256 hex digest of an API key."""
    return hashlib.sha256(key.encode()).hexdigest()


def generate_uuid() -> str:
    """Generate a random UUID4 as a string."""
    return str(uuid.uuid4())
