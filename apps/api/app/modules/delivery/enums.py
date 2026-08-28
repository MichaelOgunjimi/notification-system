"""Delivery-owned state values."""

import enum


class DeadLetterStatus(enum.StrEnum):
    ACTIVE = "active"
    RETRIED = "retried"
    DISCARDED = "discarded"
