"""Message-specific values for Beaco transactional emails."""

from app.modules.delivery.templates.transactional.models import TransactionalEmail
from app.modules.delivery.templates.transactional.renderer import (
    asset_url,
    render_html,
    render_text,
)


def _shared_assets(frontend_url: str) -> dict[str, str]:
    return {
        "logo_url": asset_url(frontend_url, "beaco-lockup-horizontal-dark.png"),
        "footer_mark_light_url": asset_url(frontend_url, "beaco-mark-on-light.png"),
        "footer_mark_dark_url": asset_url(frontend_url, "beaco-mark-128.png"),
    }


def magic_link_email(
    *,
    frontend_url: str,
    recipient: str,
    recipient_name: str,
    action_url: str,
    expires_minutes: int,
) -> TransactionalEmail:
    subject = "Your private link to Beaco"
    expiry = f"{expires_minutes} minutes"
    context = {
        **_shared_assets(frontend_url),
        "subject": subject,
        "preheader": f"Your private Beaco sign-in link expires in {expiry}.",
        "eyebrow": "Secure account access",
        "heading": "Your private route into Beaco",
        "intro": (
            f"Hi {recipient_name}, use this one-time link to securely sign in. "
            "No password, no credentials left behind."
        ),
        "detail_label": "Valid for",
        "detail_value": expiry,
        "security_value": "Single-use access",
        "action_label": "Sign in to Beaco",
        "action_url": action_url,
        "footnote": (
            f"This link expires in {expiry} and can only be used once. "
            "If you did not request it, no action is required."
        ),
        "recipient": recipient,
    }
    return TransactionalEmail(
        subject=subject,
        html=render_html(**context),
        text=render_text(
            "magic_link.txt.j2",
            recipient_name=recipient_name,
            action_url=action_url,
            expiry=expiry,
        ),
    )


def organization_invitation_email(
    *,
    frontend_url: str,
    recipient: str,
    inviter_name: str,
    organization_name: str,
    role: str,
    action_url: str,
    expires_days: int,
) -> TransactionalEmail:
    subject = f"Join {organization_name} on Beaco"
    expiry = f"{expires_days} days"
    role_label = role.replace("_", " ").title()
    context = {
        **_shared_assets(frontend_url),
        "subject": subject,
        "preheader": (f"{inviter_name} invited you to join {organization_name} on Beaco."),
        "eyebrow": "Organization invitation",
        "heading": f"A seat is waiting at {organization_name}",
        "intro": (
            f"{inviter_name} invited you to join {organization_name} and work "
            "from one shared notification record."
        ),
        "detail_label": "Access level",
        "detail_value": role_label,
        "security_value": "Verified-email access",
        "action_label": "Review invitation",
        "action_url": action_url,
        "footnote": (
            f"This invitation expires in {expiry}. Sign in using the verified "
            "email address that received it."
        ),
        "recipient": recipient,
    }
    return TransactionalEmail(
        subject=subject,
        html=render_html(**context),
        text=render_text(
            "organization_invitation.txt.j2",
            organization_name=organization_name,
            inviter_name=inviter_name,
            role=role,
            action_url=action_url,
            expiry=expiry,
        ),
    )
