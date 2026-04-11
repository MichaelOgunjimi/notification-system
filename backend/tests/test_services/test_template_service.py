"""Unit tests for template_service — preview_template rendering."""

from app.services.template_service import preview_template


class TestPreviewTemplate:
    def test_renders_body_variables(self) -> None:
        _, body = preview_template(
            body="Hello {{ name }}!", subject=None, variables={"name": "Alice"}
        )
        assert body == "Hello Alice!"

    def test_renders_subject_variables(self) -> None:
        subject, _ = preview_template(
            body="body", subject="Hi {{ name }}", variables={"name": "Bob"}
        )
        assert subject == "Hi Bob"

    def test_returns_none_subject_when_not_provided(self) -> None:
        subject, body = preview_template(body="hello", subject=None, variables={})
        assert subject is None
        assert body == "hello"

    def test_empty_variables(self) -> None:
        _, body = preview_template(body="No vars here", subject=None, variables={})
        assert body == "No vars here"

    def test_multiple_variables(self) -> None:
        _, body = preview_template(
            body="{{ greeting }}, {{ name }}! You have {{ count }} messages.",
            subject=None,
            variables={"greeting": "Hello", "name": "Carol", "count": 3},
        )
        assert body == "Hello, Carol! You have 3 messages."

    def test_html_is_autoescaped(self) -> None:
        """SandboxedEnvironment autoescape=True must escape injected HTML."""
        _, body = preview_template(
            body="Hello {{ name }}",
            subject=None,
            variables={"name": "<script>alert(1)</script>"},
        )
        assert "<script>" not in body
        assert "&lt;script&gt;" in body

    def test_undefined_variable_renders_empty_string(self) -> None:
        """Jinja2 Undefined renders as '' — no exception raised."""
        _, body = preview_template(body="Hello {{ missing }}!", subject=None, variables={})
        assert "Hello" in body

    def test_sandbox_blocks_dangerous_attributes(self) -> None:
        """SandboxedEnvironment silently neutralises __class__ — no raw type leaks."""
        _, body = preview_template(
            body="{{ ''.__class__ }}",
            subject=None,
            variables={},
        )
        # Sandbox blocks attribute introspection → Undefined → renders as empty string
        assert body == ""
