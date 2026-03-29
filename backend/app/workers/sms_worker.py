"""SMS channel worker — processes SMS notifications.

Phase 2: Stub that marks notifications as delivered.
Phase 3: Will integrate with Twilio API.
"""

import logging

from app.workers.celery_app import celery_app
from app.workers.channel_base import process_notification

logger = logging.getLogger(__name__)


@celery_app.task(name="app.workers.sms_worker.send_sms", bind=True)
def send_sms(self, notification_id: str) -> dict:
    """Send an SMS notification."""
    return process_notification(notification_id, channel="sms")
