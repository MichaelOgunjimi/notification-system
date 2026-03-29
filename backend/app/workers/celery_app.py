"""Celery application instance and configuration."""

from celery import Celery

from app.config import settings

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
    
    # Task routing — dispatcher goes to priority queue, channels to their own queues
    task_routes={
        "app.workers.dispatcher.dispatch_event": {"queue": "notifications.medium"},
        "app.workers.email_worker.send_email": {"queue": "notifications.email"},
        "app.workers.sms_worker.send_sms": {"queue": "notifications.sms"},
        "app.workers.webhook_worker.send_webhook": {"queue": "notifications.webhook"},
    },
    
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
    ],
)
