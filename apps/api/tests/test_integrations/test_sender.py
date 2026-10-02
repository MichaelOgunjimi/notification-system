"""Tests for email sender identity validation and From-header composition."""

import pytest
from pydantic import ValidationError

from app.modules.delivery.sender import compose_from
from app.modules.events.schemas import InlineEmail
from app.modules.templates.schemas import TemplateCreate, TemplateUpdate

DEFAULT = "no-reply@verified.example"


class TestComposeFrom:
    def test_falls_back_to_global_default_when_nothing_set(self):
        assert compose_from(default=DEFAULT) == DEFAULT
        assert compose_from(None, None, default=DEFAULT) == DEFAULT

    def test_from_local_keeps_the_server_domain(self):
        assert compose_from("orders", default=DEFAULT) == "orders@verified.example"

    def test_from_name_alone_keeps_default_local_part(self):
        assert (
            compose_from(from_name="Winwell Orders", default=DEFAULT)
            == "Winwell Orders <no-reply@verified.example>"
        )

    def test_local_and_name_compose_display_address(self):
        assert (
            compose_from("billing", "Acme Billing", default=DEFAULT)
            == "Acme Billing <billing@verified.example>"
        )

    def test_name_with_specials_is_quoted(self):
        assert (
            compose_from("billing", 'Acme, "Inc"', default=DEFAULT)
            == '"Acme, \\"Inc\\"" <billing@verified.example>'
        )

    def test_default_with_display_name_keeps_its_domain_and_name(self):
        default = "Beaco <no-reply@verified.example>"
        assert compose_from("orders", default=default) == "Beaco <orders@verified.example>"


@pytest.mark.parametrize(
    "bad",
    ["orders@evil.example", "or ders", "orders\n", "orders\nBcc: x@y.z", "Orders", "o" * 65],
)
def test_from_local_rejected(bad):
    with pytest.raises(ValidationError):
        InlineEmail(html="<p>Hi</p>", from_local=bad)
    with pytest.raises(ValidationError):
        TemplateCreate(name="t", channel="email", body="b", from_local=bad)


@pytest.mark.parametrize("good", ["orders", "no-reply", "a.b_c+tag", "support2"])
def test_from_local_accepted(good):
    assert InlineEmail(html="<p>Hi</p>", from_local=good).from_local == good


@pytest.mark.parametrize("bad", ["Line\nBreak", "Tab\there", "cr\rname", "x y", "x" * 101])
def test_from_name_rejected(bad):
    with pytest.raises(ValidationError):
        InlineEmail(html="<p>Hi</p>", from_name=bad)


def test_from_name_is_trimmed_and_blank_becomes_none():
    assert InlineEmail(html="<p>Hi</p>", from_name="  Winwell  ").from_name == "Winwell"
    assert InlineEmail(html="<p>Hi</p>", from_name="   ").from_name is None


@pytest.mark.parametrize(
    "bad",
    [
        "not-an-address",
        "a@b",
        "a@@b.com",
        "a b@c.com",
        "a@b.com\n",
        "a@b.com\nBcc: x@y.z",
        "Name <a@b.com>",
        "a@b.com, c@d.com",
    ],
)
def test_reply_to_rejected(bad):
    with pytest.raises(ValidationError):
        InlineEmail(html="<p>Hi</p>", reply_to=bad)
    with pytest.raises(ValidationError):
        TemplateCreate(name="t", channel="email", body="b", reply_to=bad)


def test_reply_to_accepts_any_domain():
    assert InlineEmail(html="<p>Hi</p>", reply_to="help@other.example").reply_to == (
        "help@other.example"
    )


def test_sender_fields_default_to_none():
    inline = InlineEmail(html="<p>Hi</p>")
    assert (inline.from_local, inline.from_name, inline.reply_to) == (None, None, None)
    template = TemplateCreate(name="t", channel="email", body="b")
    assert (template.from_local, template.from_name, template.reply_to) == (None, None, None)


def test_template_update_can_clear_sender_fields():
    update = TemplateUpdate(from_local=None)
    assert update.model_dump(exclude_unset=True) == {"from_local": None}


def test_empty_string_means_not_set():
    inline = InlineEmail(html="<p>Hi</p>", from_local="", from_name="", reply_to="")
    assert (inline.from_local, inline.from_name, inline.reply_to) == (None, None, None)
    assert TemplateUpdate(from_local="").model_dump(exclude_unset=True) == {"from_local": None}
