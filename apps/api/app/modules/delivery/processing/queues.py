"""Celery queue name helpers and channel-to-task mappings.

All queue names in the system follow two patterns:
  - Dispatcher queues: notifications.{priority}
    e.g. notifications.high
  - Channel queues:    notifications.{channel}.{priority}
    e.g. notifications.email.high

Centralising here means a naming change only touches one file.
"""

CHANNEL_TASK_NAMES: dict[str, str] = {
    "email": "app.workers.email_worker.send_email",
    "sms": "app.workers.sms_worker.send_sms",
    "webhook": "app.workers.webhook_worker.send_webhook",
}


def dispatcher_queue(priority: str) -> str:
    """Queue for the dispatcher worker: notifications.{priority}."""
    return f"notifications.{priority}"


def channel_queue(channel: str, priority: str) -> str:
    """Queue for a channel worker: notifications.{channel}.{priority}."""
    return f"notifications.{channel}.{priority}"
