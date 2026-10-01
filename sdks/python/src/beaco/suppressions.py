"""Recipient suppression operations."""

from typing import Any, Optional
from ._http import Transport, required


class Suppressions:
    """Manages recipients blocked from receiving notifications."""

    def __init__(self, transport: Transport) -> None:
        """Bind suppression operations to an authenticated transport."""
        self._transport = transport

    def create(
        self,
        channel: str,
        recipient: str,
        *,
        reason: Optional[str] = None,
        source: Optional[str] = None,
    ) -> dict[str, Any]:
        """Prevent delivery to one recipient on one channel.

        Args:
            channel: Delivery channel: ``email``, ``sms``, or ``webhook``.
            recipient: Channel-specific address to suppress.
            reason: Optional reason such as ``manual``, ``hard_bounce``, or
                ``spam_complaint``.
            source: Optional origin, normally ``client`` for SDK-created entries.

        Returns:
            The created suppression record.

        Raises:
            ValueError: If ``channel`` or ``recipient`` is empty.
            BeacoError: If validation, authorization, or the API request fails.

        Note:
            Future matching notifications are blocked until this suppression is deleted.
        """
        data = {
            "channel": required(channel, "channel"),
            "recipient": required(recipient, "recipient"),
            **({"reason": reason} if reason is not None else {}),
            **({"source": source} if source is not None else {}),
        }
        return self._transport.request("/suppressions", method="POST", body=data)

    def list(self, **filters: Any) -> dict[str, Any]:
        """List suppressions owned by the configured API key.

        Args:
            **filters: API-supported fields such as ``channel``, ``page``, and
                ``per_page``. ``None`` values are omitted.

        Returns:
            A paginated suppression response dictionary.

        Raises:
            BeacoError: If the API rejects the request or cannot be reached.
        """
        return self._transport.request("/suppressions", query=filters)

    def delete(self, suppression_id: str) -> None:
        """Permanently remove a suppression.

        Args:
            suppression_id: Unique suppression identifier.

        Raises:
            ValueError: If ``suppression_id`` is empty.
            BeacoError: If the suppression is unavailable or the API cannot be reached.

        Note:
            Removing the record allows future matching notifications to be delivered.
        """
        self._transport.request(
            f"/suppressions/{required(suppression_id, 'suppression_id')}",
            method="DELETE",
        )
