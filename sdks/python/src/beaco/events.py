"""Event publication and lookup operations."""

from typing import Any
from ._http import Transport


def event_body(
    event_type: str, recipients: list[dict[str, Any]], **options: Any
) -> dict[str, Any]:
    """Validate and build the JSON body shared by event operations.

    Args:
        event_type: Application-defined event name, between 1 and 255 characters.
        recipients: Recipient dictionaries containing at least one delivery channel.
        **options: Optional API fields such as ``priority``, ``template_id``,
            ``payload``, ``metadata``, or ``idempotency_key``. Values set to ``None``
            are omitted.

    Returns:
        A JSON-serializable event request body.

    Raises:
        ValueError: If the event type or recipients are invalid.
    """
    if not event_type or len(event_type) > 255:
        raise ValueError("event_type must contain 1 to 255 characters.")
    if not recipients:
        raise ValueError("recipients must contain at least one recipient.")
    if any(not recipient.get("channels") for recipient in recipients):
        raise ValueError("each recipient must contain at least one channel.")
    return {
        "event_type": event_type,
        "recipients": recipients,
        **{k: v for k, v in options.items() if v is not None},
    }


class Events:
    """Publishes and queries Beaco events."""

    def __init__(self, transport: Transport) -> None:
        """Bind event operations to an authenticated transport."""
        self._transport = transport

    def publish(
        self, event_type: str, recipients: list[dict[str, Any]], **options: Any
    ) -> dict[str, Any]:
        """Publish one event for immediate notification fan-out.

        Args:
            event_type: Application-defined event name, between 1 and 255 characters.
            recipients: Recipient dictionaries. Each recipient must contain a non-empty
                ``channels`` list and the address required by each selected channel.
            **options: Optional API fields: ``priority``, ``template_id``,
                ``template_name``, ``payload``, ``metadata``, and ``idempotency_key``.

        Returns:
            The accepted event summary returned by Beaco.

        Raises:
            ValueError: If local event validation fails.
            BeacoError: If the API rejects the request or cannot be reached.

        Note:
            This call creates an event and may enqueue one notification per recipient
            channel. Supply ``idempotency_key`` when retries must not duplicate work.
        """
        return self._transport.request(
            "/events", method="POST", body=event_body(event_type, recipients, **options)
        )

    def publish_batch(self, events: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Publish multiple events in one atomic API request.

        Args:
            events: Event dictionaries using the same fields accepted by
                :meth:`publish`. Every item requires ``event_type`` and ``recipients``.

        Returns:
            Accepted event summaries in the same order as the input.

        Raises:
            KeyError: If an event omits ``event_type`` or ``recipients``.
            ValueError: If the batch is empty or any event fails local validation.
            BeacoError: If the API rejects the batch or cannot be reached.

        Note:
            The API accepts or rejects the batch as a unit; a failed request does not
            partially create events.
        """
        if not events:
            raise ValueError("events must contain at least one event.")
        values = [
            event_body(
                event["event_type"],
                event["recipients"],
                **{
                    k: v
                    for k, v in event.items()
                    if k not in {"event_type", "recipients"}
                },
            )
            for event in events
        ]
        return self._transport.request(
            "/events/batch", method="POST", body={"events": values}
        )

    def list(self, **filters: Any) -> dict[str, Any]:
        """List events visible to the configured project API key.

        Args:
            **filters: API-supported filters and pagination fields, including ``page``,
                ``per_page``, ``status``, ``priority``, ``event_type``, ``date_from``,
                and ``date_to``. ``None`` values are omitted.

        Returns:
            A page dictionary containing ``items``, ``total``, ``page``, ``per_page``,
            and ``total_pages``.

        Raises:
            BeacoError: If the API rejects the request or cannot be reached.
        """
        return self._transport.request("/events", query=filters)

    def retrieve(self, event_id: str) -> dict[str, Any]:
        """Retrieve an event and its generated notifications.

        Args:
            event_id: Unique event identifier returned by :meth:`publish`.

        Returns:
            Detailed event state, payload, metadata, and notification records.

        Raises:
            ValueError: If ``event_id`` is empty.
            BeacoError: If the event is unavailable or the API cannot be reached.
        """
        if not event_id:
            raise ValueError("event_id is required.")
        return self._transport.request(f"/events/{event_id}")
