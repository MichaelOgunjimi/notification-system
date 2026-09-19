"""Jinja rendering helpers for transactional email templates."""

from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape

_TEMPLATE_DIRECTORY = Path(__file__).parent
_LOADER = FileSystemLoader(_TEMPLATE_DIRECTORY)
_HTML_ENVIRONMENT = Environment(
    loader=_LOADER,
    autoescape=select_autoescape(enabled_extensions=("html", "j2"), default=True),
    undefined=StrictUndefined,
)
_TEXT_ENVIRONMENT = Environment(
    loader=_LOADER,
    autoescape=False,
    undefined=StrictUndefined,
    keep_trailing_newline=True,
)


def asset_url(frontend_url: str, filename: str) -> str:
    return f"{frontend_url.rstrip('/')}/brand/png/{filename}"


def render_html(**context: Any) -> str:
    return _HTML_ENVIRONMENT.get_template("email.html.j2").render(**context)


def render_text(template_name: str, **context: Any) -> str:
    return _TEXT_ENVIRONMENT.get_template(template_name).render(**context).strip()
