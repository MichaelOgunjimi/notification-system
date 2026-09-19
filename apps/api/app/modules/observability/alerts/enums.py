"""Metrics an alert rule can watch."""

from enum import StrEnum


class AlertMetric(StrEnum):
    """A rule fires when its metric exceeds its threshold over its window.

    All three reuse fields the analytics service already computes — no new
    aggregation query is needed to evaluate a rule.
    """

    FAILURE_RATE = "failure_rate"
    DEAD_LETTER_COUNT = "dead_letter_count"
    AVG_LATENCY_MS = "avg_latency_ms"
