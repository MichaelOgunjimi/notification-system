"""Email channel worker — processes email notifications.

Phase 2: Stub that marks notifications as delivered.
Phase 3: Will integrate with Resend API.
"""

import logging

from app.workers.celery_app import celery_app
from app.workers.channel_base import process_notification

logger = logging.getLogger(__name__)


@celery_app.task(name="app.workers.email_worker.send_email", bind=True)
def send_email(self, notification_id: str) -> dict:
    """Send an email notification."""
    return process_notification(notification_id, channel="email")
