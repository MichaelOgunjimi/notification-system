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


def email_verification_email(
    *,
    frontend_url: str,
    recipient: str,
    action_url: str,
    expires_hours: int,
) -> TransactionalEmail:
    subject = "Confirm your email address"
    expiry = f"{expires_hours} hours"
    context = {
        **_shared_assets(frontend_url),
        "subject": subject,
        "preheader": f"Confirm that {recipient} belongs to your Beaco account.",
        "eyebrow": "Email verification",
        "heading": "Confirm this email address",
        "intro": (
            f"Add {recipient} as a verified way to reach and identify your "
            "Beaco account. Confirm it below."
        ),
        "detail_label": "Valid for",
        "detail_value": expiry,
        "security_value": "Single-use access",
        "action_label": "Confirm email address",
        "action_url": action_url,
        "footnote": (
            f"This link expires in {expiry}. If you did not add this address, "
            "no action is required."
        ),
        "recipient": recipient,
    }
    return TransactionalEmail(
        subject=subject,
        html=render_html(**context),
        text=render_text(
            "email_verification.txt.j2",
            recipient=recipient,
            action_url=action_url,
            expiry=expiry,
        ),
    )


def welcome_email(
    *,
    frontend_url: str,
    recipient: str,
    recipient_name: str,
    workspace_name: str,
) -> TransactionalEmail:
    subject = "Welcome to Beaco"
    context = {
        **_shared_assets(frontend_url),
        "subject": subject,
        "preheader": f"Your workspace {workspace_name} is ready.",
        "eyebrow": "Account created",
        "heading": "Beaco is ready for you",
        "intro": (
            f"Hi {recipient_name}, your account is live. {workspace_name} is set up "
            "with a first project, so anything you send runs through one accountable "
            "delivery record."
        ),
        "detail_label": "Workspace",
        "detail_value": workspace_name,
        "security_value": "Passwordless sign-in",
        "action_label": "Open your workspace",
        "action_url": f"{frontend_url.rstrip('/')}/workspace",
        "footnote": (
            "You received this because an account was created with this address. "
            "If it was not you, reply to let us know."
        ),
        "recipient": recipient,
    }
    return TransactionalEmail(
        subject=subject,
        html=render_html(**context),
        text=render_text(
            "welcome.txt.j2",
            recipient_name=recipient_name,
            workspace_name=workspace_name,
            action_url=f"{frontend_url.rstrip('/')}/workspace",
        ),
    )


def email_changed_email(
    *,
    frontend_url: str,
    recipient: str,
    recipient_name: str,
    new_email: str,
) -> TransactionalEmail:
    subject = "Your Beaco primary email address changed"
    context = {
        **_shared_assets(frontend_url),
        "subject": subject,
        "preheader": f"Your account is now identified by {new_email}.",
        "eyebrow": "Security alert",
        "heading": "Primary address changed",
        "intro": (
            f"Hi {recipient_name}, the primary email address on your Beaco account "
            f"was changed to {new_email}. Sign-in links and notifications now go there."
        ),
        "detail_label": "New primary address",
        "detail_value": new_email,
        "security_value": "Change you can review",
        "action_label": "Go to sign in",
        "action_url": f"{frontend_url.rstrip('/')}/login",
        "footnote": (
            "If you did not make this change, someone may have access to your "
            "account. Reply to this email immediately so we can help you recover it."
        ),
        "recipient": recipient,
    }
    return TransactionalEmail(
        subject=subject,
        html=render_html(**context),
        text=render_text(
            "email_changed.txt.j2",
            recipient_name=recipient_name,
            new_email=new_email,
            action_url=f"{frontend_url.rstrip('/')}/login",
        ),
    )


def member_removed_email(
    *,
    frontend_url: str,
    recipient: str,
    recipient_name: str,
    organization_name: str,
) -> TransactionalEmail:
    subject = f"You were removed from {organization_name} on Beaco"
    context = {
        **_shared_assets(frontend_url),
        "subject": subject,
        "preheader": f"Your access to {organization_name} has ended.",
        "eyebrow": "Membership update",
        "heading": f"Your seat at {organization_name} closed",
        "intro": (
            f"Hi {recipient_name}, your membership in {organization_name} was removed. "
            "You no longer have access to its projects, API keys, or delivery history."
        ),
        "detail_label": "Organization",
        "detail_value": organization_name,
        "security_value": "Access ended",
        "action_label": "Go to Beaco",
        "action_url": f"{frontend_url.rstrip('/')}/workspace",
        "footnote": (
            "If you think this was a mistake, contact an administrator of that organization."
        ),
        "recipient": recipient,
    }
    return TransactionalEmail(
        subject=subject,
        html=render_html(**context),
        text=render_text(
            "member_removed.txt.j2",
            recipient_name=recipient_name,
            organization_name=organization_name,
            action_url=f"{frontend_url.rstrip('/')}/workspace",
        ),
    )


def member_role_changed_email(
    *,
    frontend_url: str,
    recipient: str,
    recipient_name: str,
    organization_name: str,
    role: str,
) -> TransactionalEmail:
    role_label = role.replace("_", " ").title()
    subject = f"Your role in {organization_name} changed"
    context = {
        **_shared_assets(frontend_url),
        "subject": subject,
        "preheader": f"You are now {role_label} in {organization_name}.",
        "eyebrow": "Membership update",
        "heading": f"New access level in {organization_name}",
        "intro": (
            f"Hi {recipient_name}, your role in {organization_name} is now {role_label}. "
            "This changes what you can see and manage across its projects."
        ),
        "detail_label": "New role",
        "detail_value": role_label,
        "security_value": "Effective immediately",
        "action_label": "Open Beaco",
        "action_url": f"{frontend_url.rstrip('/')}/workspace",
        "footnote": (
            "Roles are set by organization administrators. Contact one of them with any questions."
        ),
        "recipient": recipient,
    }
    return TransactionalEmail(
        subject=subject,
        html=render_html(**context),
        text=render_text(
            "member_role_changed.txt.j2",
            recipient_name=recipient_name,
            organization_name=organization_name,
            role=role_label,
            action_url=f"{frontend_url.rstrip('/')}/workspace",
        ),
    )


def invitation_accepted_email(
    *,
    frontend_url: str,
    recipient: str,
    recipient_name: str,
    organization_name: str,
    member_email: str,
    role: str,
) -> TransactionalEmail:
    role_label = role.replace("_", " ").title()
    subject = f"{member_email} joined {organization_name}"
    context = {
        **_shared_assets(frontend_url),
        "subject": subject,
        "preheader": f"{member_email} accepted your invitation to {organization_name}.",
        "eyebrow": "Invitation accepted",
        "heading": f"{organization_name} has a new member",
        "intro": (
            f"Hi {recipient_name}, {member_email} accepted your invitation and joined "
            f"{organization_name} as {role_label}."
        ),
        "detail_label": "New member",
        "detail_value": member_email,
        "security_value": "Verified-email access",
        "action_label": "View members",
        "action_url": f"{frontend_url.rstrip('/')}/workspace",
        "footnote": "You received this because you sent the invitation.",
        "recipient": recipient,
    }
    return TransactionalEmail(
        subject=subject,
        html=render_html(**context),
        text=render_text(
            "invitation_accepted.txt.j2",
            recipient_name=recipient_name,
            organization_name=organization_name,
            member_email=member_email,
            role=role_label,
            action_url=f"{frontend_url.rstrip('/')}/workspace",
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
