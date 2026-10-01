"""Template operations."""

from typing import Any, Optional
from ._http import Transport, required


class Templates:
    """Creates, previews, updates, and removes delivery templates."""

    def __init__(self, transport: Transport) -> None:
        """Bind template operations to an authenticated transport."""
        self._transport = transport

    def create(
        self,
        name: str,
        channel: str,
        body: str,
        *,
        subject: Optional[str] = None,
        variables: Optional[list[str]] = None,
    ) -> dict[str, Any]:
        """Create a reusable channel-specific delivery template.

        Args:
            name: Project-unique template name used when publishing events.
            channel: Delivery channel: ``email``, ``sms``, or ``webhook``.
            body: Template body, including any variables supported by the API renderer.
            subject: Optional email subject template.
            variables: Names expected in the render payload.

        Returns:
            The newly created template.

        Raises:
            ValueError: If ``name``, ``channel``, or ``body`` is empty.
            BeacoError: If validation, authorization, or the API request fails.
        """
        data = {
            "name": required(name, "name"),
            "channel": required(channel, "channel"),
            "body": required(body, "body"),
            "subject": subject,
            "variables": variables or [],
        }
        return self._transport.request("/templates", method="POST", body=data)

    def list(self, **filters: Any) -> dict[str, Any]:
        """List templates available to the configured project.

        Args:
            **filters: API-supported fields such as ``channel``, ``page``, and
                ``per_page``. ``None`` values are omitted.

        Returns:
            A paginated template response dictionary.

        Raises:
            BeacoError: If the API rejects the request or cannot be reached.
        """
        return self._transport.request("/templates", query=filters)

    def retrieve(self, template_id: str) -> dict[str, Any]:
        """Retrieve a template by identifier.

        Args:
            template_id: Unique template identifier.

        Returns:
            The requested template.

        Raises:
            ValueError: If ``template_id`` is empty.
            BeacoError: If the template is unavailable or the API cannot be reached.
        """
        return self._transport.request(
            f"/templates/{required(template_id, 'template_id')}"
        )

    def update(self, template_id: str, **fields: Any) -> dict[str, Any]:
        """Update selected fields on an owned template.

        Args:
            template_id: Unique template identifier.
            **fields: One or more of ``name``, ``channel``, ``subject``, ``body``, and
                ``variables``. Set ``subject`` to ``None`` to clear it.

        Returns:
            The updated template.

        Raises:
            ValueError: If the identifier is empty, no fields are supplied, or an
                unsupported field is present.
            BeacoError: If validation, ownership, or the API request fails.
        """
        allowed = {"name", "channel", "subject", "body", "variables"}
        if not fields or not fields.keys() <= allowed:
            raise ValueError("fields must contain only editable template fields.")
        return self._transport.request(
            f"/templates/{required(template_id, 'template_id')}",
            method="PUT",
            body=fields,
        )

    def preview(self, template_id: str, variables: dict[str, Any]) -> dict[str, Any]:
        """Render a template without creating or sending a notification.

        Args:
            template_id: Unique template identifier.
            variables: Values substituted into the template body and subject.

        Returns:
            A dictionary containing the rendered ``subject`` and ``body``.

        Raises:
            ValueError: If ``template_id`` is empty.
            BeacoError: If rendering fails or the API cannot be reached.

        Note:
            Previewing is side-effect free with respect to event and notification
            delivery.
        """
        return self._transport.request(
            f"/templates/{required(template_id, 'template_id')}/preview",
            method="POST",
            body={"variables": variables},
        )

    def delete(self, template_id: str) -> None:
        """Soft-delete an owned template.

        Args:
            template_id: Unique template identifier.

        Raises:
            ValueError: If ``template_id`` is empty.
            BeacoError: If ownership validation fails or the API cannot be reached.

        Note:
            The template becomes unavailable for future sends; historical delivery
            records are retained.
        """
        self._transport.request(
            f"/templates/{required(template_id, 'template_id')}", method="DELETE"
        )
