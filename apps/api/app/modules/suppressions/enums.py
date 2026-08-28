"""Suppression-owned reason and source values."""

import enum


class SuppressionSource(enum.StrEnum):
    SYSTEM = "system"
    CLIENT = "client"


class SuppressionReason(enum.StrEnum):
    HARD_BOUNCE = "hard_bounce"
    SPAM_COMPLAINT = "spam_complaint"
    MANUAL = "manual"
