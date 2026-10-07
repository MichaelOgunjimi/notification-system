"""Deferred event operations."""

from typing import Any
from ._http import Transport, required
from .events import _validate_content_source, event_body


class ScheduledEvents:
    """Creates, lists, and cancels deferred events."""

    def __init__(self, transport: Transport) -> None:
        """Bind scheduled-event operations to an authenticated transport."""
        self._transport = transport

    def create(
        self,
        event_type: str,
        recipients: list[dict[str, Any]],
        scheduled_for: str,
        **options: Any,
    ) -> dict[str, Any]:
        """Schedule an event for future delivery.

        Args:
            event_type: Application-defined event name, between 1 and 255 characters.
            recipients: Recipient dictionaries containing at least one channel each.
            scheduled_for: Future ISO 8601 timestamp, including a timezone offset.
            **options: The same content fields as ``events.publish`` except
                ``idempotency_key``: exactly one of ``template_id``, ``template_name``
                or ``inline`` is required; ``attachments``, ``priority``, ``payload``
                and ``metadata`` are optional.

        Returns:
            The created scheduled-event record.

        Raises:
            ValueError: If required event data or ``scheduled_for`` is empty, or the
                content source or attachments are invalid.
            BeacoError: If the API rejects the request or cannot be reached.

        Note:
            This call stores a deferred event. Delivery is not attempted until the
            configured time, and an event more than an hour overdue is expired
            rather than sent.
        """
        _validate_content_source(options)
        body = event_body(
            event_type,
            recipients,
            scheduled_for=required(scheduled_for, "scheduled_for"),
            **options,
        )
        return self._transport.request("/scheduled-events", method="POST", body=body)

    def list(self, **filters: Any) -> dict[str, Any]:
        """List scheduled events visible to the configured project.

        Args:
            **filters: API-supported fields such as ``status``, ``page``, and
                ``per_page``. ``None`` values are omitted.

        Returns:
            A paginated scheduled-event response dictionary.

        Raises:
            BeacoError: If the API rejects the request or cannot be reached.
        """
        return self._transport.request("/scheduled-events", query=filters)

    def cancel(self, scheduled_event_id: str) -> None:
        """Cancel a pending scheduled event before dispatch.

        Args:
            scheduled_event_id: Unique scheduled-event identifier.

        Raises:
            ValueError: If ``scheduled_event_id`` is empty.
            BeacoError: If the event cannot be cancelled or the API cannot be reached.

        Note:
            Cancellation changes server state and is only valid before dispatch.
        """
        self._transport.request(
            f"/scheduled-events/{required(scheduled_event_id, 'scheduled_event_id')}",
            method="DELETE",
        )
