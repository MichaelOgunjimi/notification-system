"""Security-focused template rendering tests."""

from unittest.mock import MagicMock

import pytest
from jinja2.exceptions import SecurityError, TemplateSyntaxError

from app.models.enums import NotificationChannel
from app.services.template_service import preview_template, render_template


def _template(channel: NotificationChannel, body: str, subject: str | None = None) -> MagicMock:
    template = MagicMock()
    template.channel = channel
    template.body = body
    template.subject = subject
    return template


def test_html_script_tag_escaped_in_email() -> None:
    template = _template(NotificationChannel.EMAIL, "Hello {{ value }}")
    _, rendered = render_template(template, {"value": "<script>alert('xss')</script>"})
    assert "<script>" not in rendered
    assert "&lt;script&gt;" in rendered


def test_html_script_tag_not_escaped_in_sms() -> None:
    template = _template(NotificationChannel.SMS, "Hello {{ value }}")
    _, rendered = render_template(template, {"value": "<script>alert('xss')</script>"})
    assert "<script>alert('xss')</script>" in rendered


def test_jinja_expression_not_evaluated_in_email() -> None:
    template = _template(NotificationChannel.EMAIL, "Value: {{ value }}")
    _, rendered = render_template(template, {"value": "{{ 7*7 }}"})
    assert "{{ 7*7 }}" in rendered
    assert "49" not in rendered


def test_sandboxed_env_blocks_class_access() -> None:
    template = _template(NotificationChannel.EMAIL, "{{ ''.__class__ }}")
    try:
        _, rendered = render_template(template, {})
    except SecurityError:
        return
    assert rendered == ""


def test_sandboxed_env_blocks_import() -> None:
    template = _template(NotificationChannel.EMAIL, "{% import os %}")
    with pytest.raises((TemplateSyntaxError, SecurityError)):
        render_template(template, {})


def test_preview_template_html_escapes_variables() -> None:
    _, rendered = preview_template(
        body="Hello {{ value }}",
        subject=None,
        channel=NotificationChannel.EMAIL,
        variables={"value": "<img src=x onerror=alert(1)>"},
    )
    assert "<img" not in rendered
    assert "&lt;img" in rendered


def test_empty_variables_render_safely() -> None:
    template = _template(NotificationChannel.EMAIL, "Hello world")
    _, rendered = render_template(template, {})
    assert rendered == "Hello world"
