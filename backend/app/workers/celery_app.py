"""Celery application instance and configuration."""

from celery import Celery
from celery.signals import worker_process_init

from app.core.config import settings

celery_app = Celery(
    "notification_system",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

celery_app.conf.update(
    # Serialization
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    # Timezone
    timezone="UTC",
    enable_utc=True,
    # Task routing — all routing is dynamic via apply_async(queue=...).
    # Dispatcher tasks are sent to notifications.{priority}.
    # Channel tasks are sent to notifications.{channel}.{priority}.
    # No static task_routes needed.
    # Worker settings
    worker_prefetch_multiplier=2,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    # Result settings
    result_expires=3600,
    # Task discovery
    imports=[
        "app.workers.dispatcher",
        "app.workers.email_worker",
        "app.workers.sms_worker",
        "app.workers.webhook_worker",
        "app.workers.reconciliation",
    ],
)

celery_app.conf.beat_schedule = {
    "reconcile-stuck-notifications": {
        "task": "reconciliation.sweep",
        "schedule": 60.0,
        "options": {"queue": "notifications.reconciliation"},
    }
}


@worker_process_init.connect
def _reset_db_connections(**kwargs):
    """Dispose inherited DB connections after Celery prefork.

    Celery's prefork model imports modules in the parent process then forks.
    The child inherits the parent's connection pool with stale file descriptors.
    Disposing forces fresh connections in each worker process.
    """
    from app.workers.database import sync_engine

    sync_engine.dispose()
