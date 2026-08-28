"""Webhook channel worker — processes webhook notifications.

Phase 2: Stub that marks notifications as delivered.
Phase 3: Will make actual HTTP POST calls.
"""

import logging

from app.modules.delivery.processing.channel import process_notification
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="app.workers.webhook_worker.send_webhook", bind=True)
def send_webhook(self, notification_id: str) -> dict:
    """Send a webhook notification."""
    return process_notification(notification_id, channel="webhook", celery_task=self)
