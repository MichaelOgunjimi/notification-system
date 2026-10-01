"""Unit tests for template_service — preview_template rendering."""

import pytest

from app.modules.notifications.enums import NotificationChannel
from app.modules.templates.model import Template
from app.modules.templates.service import (
    detect_variables,
    html_to_text,
    import_html_variables,
    preview_template,
    render_template_parts,
)

EMAIL = NotificationChannel.EMAIL
SMS = NotificationChannel.SMS


class TestPreviewTemplate:
    def test_renders_body_variables(self) -> None:
        _, body = preview_template(
            body="Hello {{ name }}!", subject=None, channel=EMAIL, variables={"name": "Alice"}
        )
        assert body == "Hello Alice!"

    def test_renders_subject_variables(self) -> None:
        subject, _ = preview_template(
            body="body", subject="Hi {{ name }}", channel=EMAIL, variables={"name": "Bob"}
        )
        assert subject == "Hi Bob"

    def test_returns_none_subject_when_not_provided(self) -> None:
        subject, body = preview_template(body="hello", subject=None, channel=EMAIL, variables={})
        assert subject is None
        assert body == "hello"

    def test_empty_variables(self) -> None:
        _, body = preview_template(body="No vars here", subject=None, channel=EMAIL, variables={})
        assert body == "No vars here"

    def test_multiple_variables(self) -> None:
        _, body = preview_template(
            body="{{ greeting }}, {{ name }}! You have {{ count }} messages.",
            subject=None,
            channel=EMAIL,
            variables={"greeting": "Hello", "name": "Carol", "count": 3},
        )
        assert body == "Hello, Carol! You have 3 messages."

    def test_html_is_autoescaped_for_email(self) -> None:
        """Email channel uses autoescape=True — injected HTML must be escaped."""
        _, body = preview_template(
            body="Hello {{ name }}",
            subject=None,
            channel=EMAIL,
            variables={"name": "<script>alert(1)</script>"},
        )
        assert "<script>" not in body
        assert "&lt;script&gt;" in body

    def test_html_not_escaped_for_sms(self) -> None:
        """SMS channel uses autoescape=False — special chars must pass through unmodified."""
        _, body = preview_template(
            body="Call {{ name }} at AT&T",
            subject=None,
            channel=SMS,
            variables={"name": "Bob"},
        )
        assert body == "Call Bob at AT&T"
        assert "&amp;" not in body

    def test_undefined_variable_renders_empty_string(self) -> None:
        """Jinja2 Undefined renders as '' — no exception raised."""
        _, body = preview_template(
            body="Hello {{ missing }}!", subject=None, channel=EMAIL, variables={}
        )
        assert "Hello" in body

    def test_sandbox_blocks_dangerous_attributes(self) -> None:
        """SandboxedEnvironment silently neutralises __class__ — no raw type leaks."""
        _, body = preview_template(
            body="{{ ''.__class__ }}",
            subject=None,
            channel=EMAIL,
            variables={},
        )
        # Sandbox blocks attribute introspection → Undefined → renders as empty string
        assert body == ""


def test_detects_variables_across_subject_html_and_text() -> None:
    assert detect_variables(
        "<p>{{ customer_name }}</p>",
        "Order {{ order_number }}",
        "Hi {{ customer_name }}",
    ) == ["customer_name", "order_number"]


def test_email_subject_is_plain_text_and_html_values_are_escaped() -> None:
    template = Template(
        name="escaping",
        channel=EMAIL,
        subject="For {{ customer }}",
        body="<strong>Brand</strong> {{ customer }}",
        variables=["customer"],
    )

    subject, html, text = render_template_parts(template, {"customer": "O'Brien & <Tom>"})

    assert subject == "For O'Brien & <Tom>"
    assert html == "<strong>Brand</strong> O&#39;Brien &amp; &lt;Tom&gt;"
    assert text == "Brand O'Brien & <Tom>"


def test_missing_variable_error_names_variable() -> None:
    template = Template(
        name="strict",
        channel=EMAIL,
        subject="Hi {{ customer }}",
        body="<p>{{ order_number }}</p>",
        variables=["customer", "order_number"],
    )

    with pytest.raises(ValueError, match="customer, order_number"):
        render_template_parts(template, {})


def test_text_fallback_is_readable() -> None:
    assert html_to_text("<h1>Order confirmed</h1><p>Thanks &amp; goodbye.</p>") == (
        "Order confirmed\nThanks & goodbye."
    )


def test_import_replaces_one_text_node_and_rejects_attributes() -> None:
    assert (
        import_html_variables('<p class="greeting">Hello Chidi</p>', {"customer_name": "Chidi"})
        == '<p class="greeting">Hello {{ customer_name }}</p>'
    )
    with pytest.raises(Exception, match="attribute"):
        import_html_variables('<a title="Chidi">Hello</a>', {"customer_name": "Chidi"})
    with pytest.raises(Exception, match="overlap"):
        import_html_variables("<p>Tom Jones</p>", {"first_name": "Tom", "name": "Tom Jones"})
    with pytest.raises(Exception, match="valid identifiers"):
        import_html_variables("<p>Chidi</p>", {"customer-name": "Chidi"})
