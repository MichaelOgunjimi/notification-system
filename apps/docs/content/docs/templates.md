# Templates

Templates are reusable notification definitions with variable substitution.

They let you keep message content centralized while producers focus on sending structured event payloads.

## What Templates Are

A template defines message content for one channel.

You can reference a template by `template_id` when creating events.

Beaco renders the template using values from event `payload`.

Benefits:

- consistency across notifications
- easier content updates
- less duplication in producer services

## Template Fields

Each template has a core schema:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `name` | string | yes | Human-readable identifier |
| `channel` | enum | yes | `email`, `sms`, or `webhook` |
| `subject` | string | email only | Subject line for email templates |
| `body` | string | yes | Main message content |
| `variables` | array<string> | no | Variable names expected in render context |

## Jinja2 Variable Syntax

Beaco templates use Jinja2-style placeholders:

```text
{{ variable_name }}
```

You can use variables in:

- `subject` (email templates)
- `body` (all channels)

Example:

```text
Welcome, {{ user_name }}!
```

## Create a Template

Endpoint:

```text
POST /templates
```

Example request:

```bash
curl -X POST https://beaco.michaelogunjimi.com/api/v1/templates \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{
    "name": "welcome-email",
    "channel": "email",
    "subject": "Welcome, {{ user_name }}!",
    "body": "Hi {{ user_name }},\n\nWelcome to {{ app_name }}. Your account is ready.",
    "variables": ["user_name", "app_name"]
  }'
```

Example response:

```json
{
  "id": "tmpl_01j4zb7h0ws8f5m6a2x1v4q7pk",
  "name": "welcome-email",
  "channel": "email",
  "created_at": "2026-01-12T11:24:19Z"
}
```

## Use a Template in Event Creation

When creating an event:

1. set `template_id`
2. provide payload keys matching required variables

Example:

```bash
curl -X POST https://beaco.michaelogunjimi.com/api/v1/events \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_PROJECT_KEY" \
  -d '{
    "event_type": "user.welcome",
    "template_id": "tmpl_01j4zb7h0ws8f5m6a2x1v4q7pk",
    "recipients": [{
      "channels": ["email"],
      "email": "user@example.com"
    }],
    "payload": {
      "user_name": "Alice",
      "app_name": "Beaco Cloud"
    }
  }'
```

## Preview a Template

Use preview to test rendering without sending notifications.

Endpoint:

```text
POST /templates/{id}/preview
```

Example:

```bash
curl -X POST https://beaco.michaelogunjimi.com/api/v1/templates/tmpl_01j4zb7h0ws8f5m6a2x1v4q7pk/preview \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{
    "variables": {
      "user_name": "Alice",
      "app_name": "Beaco Cloud"
    }
  }'
```

Example preview response:

```json
{
  "subject": "Welcome, Alice!",
  "body": "Hi Alice,\n\nWelcome to Beaco Cloud. Your account is ready."
}
```

> Use preview during CI checks for template integrity before deployment.

## Template Ownership Model

Every template is associated with the API key that created it.

Ownership implications:

- keys with `templates:read` can inspect templates available to that integration
- keys with `templates:write` can create and manage their own templates
- internal system defaults may be made available by the platform but are not managed through a master key
- authorized platform administrators use the separate admin control plane

This model supports multi-tenant safety and predictable content boundaries.

## Channel-Specific Guidance

### Email Templates

Use:

- descriptive subjects
- concise intro paragraphs
- explicit CTAs

Template example:

```text
Subject: Invoice {{ invoice_id }} paid
Body: Hi {{ user_name }}, your payment of {{ amount }} was received.
```

### SMS Templates

Prefer short, direct bodies to stay within segment limits.

Template example:

```text
{{ app_name }}: Your OTP is {{ otp_code }}. Expires in {{ expires_in_minutes }} minutes.
```

### Webhook Templates

Webhook channel body usually contains JSON-oriented data fields.

Template example:

```text
{"type":"{{ event_type }}","customer_id":"{{ customer_id }}","status":"{{ status }}"}
```

## Validation and Common Errors

| Error | Typical Cause | Fix |
| --- | --- | --- |
| Missing variable at render | Payload key not provided | Add expected key to event payload |
| Invalid channel-template pairing | Template channel differs from recipient channel | Use matching template/channel |
| Unauthorized template update | Wrong API key scope | Use a project key with template write access |
| Invalid Jinja syntax | Unclosed braces or malformed expressions | Validate template text and preview |

## Versioning Strategy

Recommended pattern:

1. create new template version with revised content
2. migrate producer usage gradually
3. deprecate old templates after validation

This avoids abrupt behavior changes for active event producers.

## Best Practices

1. Keep variables explicit and stable (`user_name`, not `u`).
2. Use template names tied to domain actions (`welcome-email`, `invoice-paid`).
3. Preview templates before production rollout.
4. Store long-form content in templates, not in producer payload.
5. Avoid embedding business logic in template expressions.

## Minimal Python Example

```python
import requests

BASE_URL = "https://beaco.michaelogunjimi.com/api/v1"
API_KEY = "YOUR_PROJECT_KEY"

payload = {
    "event_type": "user.welcome",
    "template_id": "tmpl_01j4zb7h0ws8f5m6a2x1v4q7pk",
    "recipients": [{"channels": ["email"], "email": "user@example.com"}],
    "payload": {"user_name": "Alice", "app_name": "Beaco"}
}

resp = requests.post(
    f"{BASE_URL}/events",
    json=payload,
    headers={"X-API-Key": API_KEY}
)

print(resp.status_code, resp.json())
```

## Related Docs

- [Events](/events) for template usage during event creation.
- [Channels](/channels) for channel-specific content constraints.
- [Delivery Pipeline](/delivery) for async delivery behavior after render.
- [Quickstart](/quickstart) for first-run API flow.
