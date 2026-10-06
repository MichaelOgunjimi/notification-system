"""Event publication and lookup operations."""

from typing import Any
from urllib.parse import urlparse

from ._http import Transport


def event_body(
    event_type: str, recipients: list[dict[str, Any]], **options: Any
) -> dict[str, Any]:
    """Validate and build the JSON body shared by event operations.

    Args:
        event_type: Application-defined event name, between 1 and 255 characters.
        recipients: Recipient dictionaries containing at least one delivery channel.
        **options: Optional API fields such as ``priority``, ``template_id``,
            ``template_name``, ``inline``, ``payload``, ``metadata``, or
            ``idempotency_key``. Values set to ``None`` are omitted. ``inline`` is
            ``{"html": ..., "subject": ..., "text": ..., "from_local": ...,
            "from_name": ..., "reply_to": ...}``; the sender fields are optional.
            ``attachments`` is a list of up to 10 ``{"filename": ..., "url": ...,
            "size_bytes": ...}`` files for email. Beaco does not store them: the
            email provider downloads each ``url`` when sending, so it must stay
            reachable until delivery succeeds. ``size_bytes`` is declared, not
            verified, and the declared total may not exceed 30 MB.

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


MAX_ATTACHMENTS = 10
# Resend's 40 MB email limit after Base64 encoding.
MAX_ATTACHMENT_BYTES = 30_000_000


def _validate_attachments(attachments: list[dict[str, Any]] | None) -> None:
    """Mirror the API's attachment limits so bad input fails before any request."""
    if not attachments:
        return
    if len(attachments) > MAX_ATTACHMENTS:
        raise ValueError(f"attachments must contain at most {MAX_ATTACHMENTS} files.")
    total = 0
    for item in attachments:
        if urlparse(str(item.get("url", ""))).scheme not in ("http", "https"):
            raise ValueError("attachment url must be an http or https URL.")
        filename = str(item.get("filename", ""))
        if (
            not 1 <= len(filename) <= 255
            or "/" in filename
            or "\\" in filename
            or any(ord(c) < 32 or ord(c) == 127 for c in filename)
        ):
            raise ValueError(
                "attachment filename must be 1 to 255 characters without slashes "
                "or control characters."
            )
        size = item.get("size_bytes")
        if not isinstance(size, int) or isinstance(size, bool) or size <= 0:
            raise ValueError("attachment size_bytes must be a positive integer.")
        total += size
    if total > MAX_ATTACHMENT_BYTES:
        raise ValueError(f"attachments exceed {MAX_ATTACHMENT_BYTES} bytes in total.")


def _validate_content_source(options: dict[str, Any]) -> None:
    _validate_attachments(options.get("attachments"))
    sources = [options.get(name) for name in ("template_id", "template_name", "inline")]
    if sum(value is not None for value in sources) != 1:
        raise ValueError(
            "exactly one of template_id, template_name, or inline is required."
        )


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
                ``template_name``, ``inline``, ``attachments``, ``payload``,
                ``metadata``, and ``idempotency_key``.

        Returns:
            The accepted event summary returned by Beaco.

        Raises:
            ValueError: If local event validation fails.
            BeacoError: If the API rejects the request or cannot be reached.

        Note:
            This call creates an event and may enqueue one notification per recipient
            channel. Supply ``idempotency_key`` when retries must not duplicate work.
        """
        _validate_content_source(options)
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
        values = []
        for event in events:
            options = {
                k: v for k, v in event.items() if k not in {"event_type", "recipients"}
            }
            _validate_content_source(options)
            values.append(
                event_body(event["event_type"], event["recipients"], **options)
            )
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
