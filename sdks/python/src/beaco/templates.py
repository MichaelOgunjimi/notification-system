"""Template operations."""

from typing import Any, Optional
from urllib.parse import quote

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
        text_body: Optional[str] = None,
        from_local: Optional[str] = None,
        from_name: Optional[str] = None,
        reply_to: Optional[str] = None,
        variables: Optional[list[str]] = None,
        on_missing_variable: str = "error",
    ) -> dict[str, Any]:
        """Create a reusable channel-specific delivery template.

        Args:
            name: Project-unique template name used when publishing events.
            channel: Delivery channel: ``email``, ``sms``, or ``webhook``.
            body: Template body, including any variables supported by the API renderer.
            subject: Optional email subject template.
            text_body: Optional plain-text email alternative.
            from_local: Optional sender name before the ``@``, e.g. ``orders``. The
                domain is always the server's verified domain.
            from_name: Optional sender display name.
            reply_to: Optional Reply-To email address.
            variables: Names expected in the render payload. Omit to auto-detect.
            on_missing_variable: ``error`` or ``blank``.

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
            "text_body": text_body,
            "from_local": from_local,
            "from_name": from_name,
            "reply_to": reply_to,
            "on_missing_variable": on_missing_variable,
        }
        if variables is not None:
            data["variables"] = variables
        return self._transport.request("/templates", method="POST", body=data)

    def upsert_by_name(
        self,
        name: str,
        body: str,
        *,
        channel: str = "email",
        subject: Optional[str] = None,
        text_body: Optional[str] = None,
        from_local: Optional[str] = None,
        from_name: Optional[str] = None,
        reply_to: Optional[str] = None,
        variables: Optional[list[str]] = None,
        on_missing_variable: str = "error",
    ) -> dict[str, Any]:
        """Create or update one project template by name and channel.

        Args:
            name: Project-unique template name.
            body: Complete template body.
            channel: Delivery channel, defaulting to ``email``.
            subject: Optional email subject template.
            text_body: Optional plain-text email alternative.
            from_local: Optional sender name before the ``@``, e.g. ``orders``. The
                domain is always the server's verified domain.
            from_name: Optional sender display name.
            reply_to: Optional Reply-To email address.
            variables: Declared variables, or ``None`` for auto-detection.
            on_missing_variable: ``error`` or ``blank``.

        Returns:
            The created or updated template.

        Raises:
            ValueError: If required input is empty.
            BeacoError: If validation, authorization, or the API request fails.
        """
        data: dict[str, Any] = {
            "body": required(body, "body"),
            "subject": subject,
            "text_body": text_body,
            "from_local": from_local,
            "from_name": from_name,
            "reply_to": reply_to,
            "on_missing_variable": on_missing_variable,
        }
        if variables is not None:
            data["variables"] = variables
        return self._transport.request(
            f"/templates/by-name/{quote(required(name, 'name'), safe='')}",
            method="PUT",
            query={"channel": required(channel, "channel")},
            body=data,
        )

    def import_html(
        self,
        name: str,
        html: str,
        variables: dict[str, str],
        *,
        subject: Optional[str] = None,
    ) -> dict[str, Any]:
        """Create a template from HTML and unambiguous sample text values.

        Args:
            name: Project-unique template name.
            html: Existing HTML email.
            variables: Variable names mapped to sample text values.
            subject: Optional email subject.

        Returns:
            The created template and rendered sample preview.

        Raises:
            ValueError: If required input is empty.
            BeacoError: If replacement is ambiguous or the API request fails.
        """
        return self._transport.request(
            "/templates/import",
            method="POST",
            body={
                "name": required(name, "name"),
                "subject": subject,
                "html": required(html, "html"),
                "variables": variables,
            },
        )

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
            **fields: Editable template fields, including ``text_body``,
                ``from_local``, ``from_name``, ``reply_to``, and
                ``on_missing_variable``. Set ``subject``, ``text_body``, or a sender
                field to ``None`` to clear it.

        Returns:
            The updated template.

        Raises:
            ValueError: If the identifier is empty, no fields are supplied, or an
                unsupported field is present.
            BeacoError: If validation, ownership, or the API request fails.
        """
        allowed = {
            "name",
            "channel",
            "subject",
            "body",
            "text_body",
            "from_local",
            "from_name",
            "reply_to",
            "variables",
            "on_missing_variable",
        }
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
            Rendered ``subject``, ``html``, and ``text`` plus used and missing variables.

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
