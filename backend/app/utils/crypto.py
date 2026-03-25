"""Cryptographic utilities — API key generation, hashing, and UUID helpers."""

import hashlib
import secrets
import uuid


def generate_api_key() -> str:
    """Generate a secure API key with ``nk_`` prefix."""
    return f"nk_{secrets.token_urlsafe(32)}"


def hash_api_key(key: str) -> str:
    """Return SHA-256 hex digest of an API key."""
    return hashlib.sha256(key.encode()).hexdigest()


def generate_uuid() -> str:
    """Generate a random UUID4 as a string."""
    return str(uuid.uuid4())
