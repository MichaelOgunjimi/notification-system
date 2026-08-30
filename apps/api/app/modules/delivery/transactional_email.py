"""Branded HTML and plain-text presentation for Beaco account emails."""

# Email-client-safe HTML relies on inline styles, which are intentionally kept
# intact even when they exceed the normal Python source line length.
# ruff: noqa: E501

from dataclasses import dataclass
from html import escape


@dataclass(frozen=True)
class TransactionalEmail:
    subject: str
    html: str
    text: str


def _safe(value: object) -> str:
    return escape(str(value), quote=True)


def _asset_url(frontend_url: str, filename: str) -> str:
    return f"{frontend_url.rstrip('/')}/brand/png/{filename}"


def _render_shell(
    *,
    frontend_url: str,
    subject: str,
    preheader: str,
    eyebrow: str,
    heading: str,
    intro: str,
    detail_label: str,
    detail_value: str,
    security_value: str,
    action_label: str,
    action_url: str,
    footnote: str,
    recipient: str,
) -> str:
    logo_url = _safe(_asset_url(frontend_url, "beaco-lockup-horizontal-dark.png"))
    footer_mark_light_url = _safe(_asset_url(frontend_url, "beaco-mark-on-light.png"))
    footer_mark_dark_url = _safe(_asset_url(frontend_url, "beaco-mark-128.png"))
    safe_action_url = _safe(action_url)
    return f"""<!doctype html>
<html lang="en" style="color-scheme:light dark;supported-color-schemes:light dark;">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>{_safe(subject)}</title>
  <style>
    :root {{ color-scheme: light dark; supported-color-schemes: light dark; }}
    .email-mark-dark {{ display:none !important; max-height:0 !important; overflow:hidden !important; mso-hide:all; }}
    @media (prefers-color-scheme: dark) {{
      .email-root {{ background:#080807 !important; }}
      .email-card,.email-body {{ background:#11110f !important; color:#f2eee4 !important; }}
      .email-copy {{ color:#b4aea2 !important; }}
      .email-line {{ border-color:#37362f !important; }}
      .email-muted {{ color:#8f897e !important; }}
      .email-fallback {{ background:#191916 !important; color:#aba59a !important; }}
      .email-footer {{ background:#0b0b0a !important; border-color:#34332e !important; color:#f2eee4 !important; }}
      .email-mark-light {{ display:none !important; max-height:0 !important; overflow:hidden !important; mso-hide:all !important; }}
      .email-mark-dark {{ display:block !important; max-height:none !important; overflow:visible !important; }}
    }}
    [data-ogsc] .email-root {{ background:#080807 !important; }}
    [data-ogsc] .email-card,[data-ogsc] .email-body {{ background:#11110f !important; color:#f2eee4 !important; }}
    [data-ogsc] .email-copy {{ color:#b4aea2 !important; }}
    [data-ogsc] .email-footer {{ background:#0b0b0a !important; color:#f2eee4 !important; }}
    [data-ogsc] .email-mark-light {{ display:none !important; max-height:0 !important; overflow:hidden !important; }}
    [data-ogsc] .email-mark-dark {{ display:block !important; max-height:none !important; overflow:visible !important; }}
  </style>
</head>
<body style="margin:0;padding:0;background:#ded9cc;color:#211f1a;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">{_safe(preheader)}</div>
  <table class="email-root" role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#ded9cc" style="width:100%;border-collapse:collapse;background:#ded9cc;">
    <tr><td align="center" style="padding:24px 10px;">
      <table class="email-card" role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#f7f4eb" style="width:100%;max-width:640px;border-collapse:collapse;background:#f7f4eb;color:#211f1a;">
        <tr><td bgcolor="#11110f" style="padding:25px 38px 23px;background:#11110f;border-bottom:2px solid #e9aa31;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
            <td><img src="{logo_url}" width="132" alt="Beaco" style="display:block;width:132px;max-width:100%;height:auto;border:0;"></td>
            <td align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:9px;line-height:1.5;text-transform:uppercase;letter-spacing:1.5px;color:#827d73;">Identity message</td>
          </tr></table>
        </td></tr>
        <tr><td class="email-body" bgcolor="#f7f4eb" style="padding:48px 40px 44px;background:#f7f4eb;color:#211f1a;">
          <table role="presentation" cellspacing="0" cellpadding="0"><tr>
            <td width="18"><span style="display:block;width:8px;height:8px;background:#e9aa31;">&nbsp;</span></td>
            <td style="font-family:'Courier New',Courier,monospace;font-size:9px;line-height:1.5;text-transform:uppercase;letter-spacing:1.7px;color:#8a8274;">{_safe(eyebrow)}</td>
          </tr></table>
          <h1 style="max-width:480px;margin:27px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:42px;line-height:1.03;font-weight:700;letter-spacing:-2px;color:inherit;">{_safe(heading)}</h1>
          <p class="email-copy" style="max-width:510px;margin:24px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.75;color:#5f5a50;">{_safe(intro)}</p>
          <table class="email-line" role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;margin-top:34px;border-collapse:collapse;border-top:1px solid #ded9cc;border-bottom:1px solid #ded9cc;">
            <tr>
              <td width="50%" valign="top" style="padding:20px 18px 20px 0;">
                <div style="font-family:'Courier New',Courier,monospace;font-size:9px;text-transform:uppercase;letter-spacing:1.5px;color:#8a8274;">{_safe(detail_label)}</div>
                <div style="margin-top:9px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:inherit;">{_safe(detail_value)}</div>
              </td>
              <td class="email-line" width="50%" valign="top" style="padding:20px 0 20px 24px;border-left:1px solid #ded9cc;">
                <div style="font-family:'Courier New',Courier,monospace;font-size:9px;text-transform:uppercase;letter-spacing:1.5px;color:#8a8274;">Security</div>
                <div style="margin-top:9px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:inherit;">{_safe(security_value)}</div>
              </td>
            </tr>
          </table>
          <table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:34px;"><tr><td bgcolor="#e9aa31" style="background:#e9aa31;">
            <a href="{safe_action_url}" style="display:inline-block;padding:17px 23px;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;color:#1d160b;text-decoration:none;">{_safe(action_label)}&nbsp;&nbsp;&nbsp;&rarr;</a>
          </td></tr></table>
          <p class="email-muted" style="margin:27px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.7;color:#7c7569;">{_safe(footnote)}</p>
          <div class="email-fallback" style="margin-top:25px;padding:13px 16px;border-left:2px solid #e9aa31;background:#eeeadf;color:#514d45;">
            <div style="font-family:'Courier New',Courier,monospace;font-size:9px;line-height:1.5;text-transform:uppercase;letter-spacing:1.3px;color:#777064;">Button not working?</div>
            <div style="margin-top:7px;word-break:break-all;font-family:'Courier New',Courier,monospace;font-size:9px;line-height:1.6;">{safe_action_url}</div>
          </div>
        </td></tr>
        <tr><td class="email-footer" bgcolor="#ebe7dc" style="padding:27px 40px;background:#ebe7dc;border-top:1px solid #ddd7ca;color:#211f1a;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
            <td width="52" valign="top">
              <img class="email-mark-light" src="{footer_mark_light_url}" width="38" height="38" alt="" style="display:block;width:38px;height:38px;border:0;">
              <img class="email-mark-dark" src="{footer_mark_dark_url}" width="38" height="38" alt="" style="display:none;width:38px;height:38px;max-height:0;overflow:hidden;border:0;">
            </td>
            <td valign="top"><div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;color:inherit;">Beaco</div><div class="email-muted" style="margin-top:4px;font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:1.5;color:#777064;">Notification infrastructure with an accountable delivery record.</div></td>
          </tr></table>
          <div class="email-line email-muted" style="margin-top:22px;padding-top:18px;border-top:1px solid #d7d1c4;font-family:'Courier New',Courier,monospace;font-size:9px;line-height:1.6;color:#777064;">Docs&nbsp;&nbsp;&middot;&nbsp;&nbsp;Security&nbsp;&nbsp;&middot;&nbsp;&nbsp;Privacy<span style="float:right;">Sent to {_safe(recipient)}</span></div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


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
    html = _render_shell(
        frontend_url=frontend_url,
        subject=subject,
        preheader=f"Your private Beaco sign-in link expires in {expiry}.",
        eyebrow="Secure account access",
        heading="Your private route into Beaco",
        intro=f"Hi {recipient_name}, use this one-time link to securely sign in. No password, no credentials left behind.",
        detail_label="Valid for",
        detail_value=expiry,
        security_value="Single-use access",
        action_label="Sign in to Beaco",
        action_url=action_url,
        footnote=f"This link expires in {expiry} and can only be used once. If you did not request it, no action is required.",
        recipient=recipient,
    )
    text = (
        f"Your private route into Beaco\n\nHi {recipient_name}, use this one-time link to sign in:\n"
        f"{action_url}\n\nThis link expires in {expiry} and can only be used once."
    )
    return TransactionalEmail(subject=subject, html=html, text=text)


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
    html = _render_shell(
        frontend_url=frontend_url,
        subject=subject,
        preheader=f"{inviter_name} invited you to join {organization_name} on Beaco.",
        eyebrow="Organization invitation",
        heading=f"A seat is waiting at {organization_name}",
        intro=f"{inviter_name} invited you to join {organization_name} and work from one shared notification record.",
        detail_label="Access level",
        detail_value=role.replace("_", " ").title(),
        security_value="Verified-email access",
        action_label="Review invitation",
        action_url=action_url,
        footnote=f"This invitation expires in {expiry}. Sign in using the verified email address that received it.",
        recipient=recipient,
    )
    text = (
        f"Join {organization_name} on Beaco\n\n{inviter_name} invited you as {role}.\n"
        f"Review the invitation: {action_url}\n\nThis invitation expires in {expiry}."
    )
    return TransactionalEmail(subject=subject, html=html, text=text)
