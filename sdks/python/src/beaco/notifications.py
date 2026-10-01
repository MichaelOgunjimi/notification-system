"""Notification delivery record operations."""

from typing import Any
from ._http import Transport, required


class Notifications:
    """Read-only access to notification delivery records."""

    def __init__(self, transport: Transport) -> None:
        """Bind notification queries to an authenticated transport."""
        self._transport = transport

    def list(self, **filters: Any) -> dict[str, Any]:
        """List notification delivery records visible to the project.

        Args:
            **filters: API-supported fields including ``status``, ``channel``,
                ``recipient``, ``date_from``, ``date_to``, ``page``, and ``per_page``.
                ``None`` values are omitted.

        Returns:
            A paginated notification response dictionary.

        Raises:
            BeacoError: If the API rejects the request or cannot be reached.
        """
        return self._transport.request("/notifications", query=filters)

    def retrieve(self, notification_id: str) -> dict[str, Any]:
        """Retrieve a notification and its delivery-attempt history.

        Args:
            notification_id: Unique notification identifier.

        Returns:
            Detailed notification state, rendered content, and chronological logs.

        Raises:
            ValueError: If ``notification_id`` is empty.
            BeacoError: If the notification is unavailable or the API cannot be reached.
        """
        return self._transport.request(
            f"/notifications/{required(notification_id, 'notification_id')}"
        )
