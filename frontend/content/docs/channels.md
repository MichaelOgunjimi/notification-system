# Channels

Beacon supports three delivery channels:

- Email
- SMS
- Webhook

Each channel has its own recipient requirements, runtime configuration, and retry policy.

## Channel Overview

Channel choice is declared per recipient via `channels`.

Example:

```json
{
  "recipients": [
    {
      "channels": ["email", "sms"],
      "email": "user@example.com",
      "phone": "+15551234567"
    }
  ]
}
```

Beacon creates one notification per recipient-channel pair and routes each to the corresponding worker queue.

## Email Channel

Email delivery is powered by Resend.

### Recipient Requirements

For `email` channel, recipient must include:

- `email`

Example recipient:

```json
{
  "channels": ["email"],
  "email": "user@example.com"
}
```

### Content Model

Email supports:

- subject line
- body content (plain text and/or HTML depending on template usage)

Subject behavior:

- Uses template subject when available.
- Falls back to auto-generated subject when template subject is not defined.

### Example Event (Email)

```bash
curl -X POST http://localhost:8000/api/v1/events \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_PROJECT_KEY" \
  -d '{
    "event_type": "password.reset",
    "recipients": [{
      "channels": ["email"],
      "email": "user@example.com"
    }],
    "payload": {
      "reset_url": "https://app.example.com/reset?token=abc"
    }
  }'
```

## SMS Channel

SMS delivery is powered by Twilio.

### Recipient Requirements

For `sms` channel, recipient must include:

- `phone` in E.164 format

Valid example:

```text
+15551234567
```

Invalid examples:

- `5551234567`
- `+1 (555) 123-4567`

### Content Model

SMS supports:

- plain text body only

SMS does not use a subject field.

### Example Event (SMS)

```bash
curl -X POST http://localhost:8000/api/v1/events \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_PROJECT_KEY" \
  -d '{
    "event_type": "otp.sent",
    "recipients": [{
      "channels": ["sms"],
      "phone": "+15551234567"
    }],
    "payload": {
      "code": "093144"
    }
  }'
```

## Webhook Channel

Webhook delivery sends a JSON payload to your destination URL.

### Recipient Requirements

For `webhook` channel, recipient must include:

- `webhook_url`

Example:

```json
{
  "channels": ["webhook"],
  "webhook_url": "https://example.com/beacon/hooks"
}
```

### Request Body Sent by Beacon

Webhook payload includes:

- `event_type`
- `payload`
- `notification_id`
- `timestamp`

Example webhook body:

```json
{
  "event_type": "order.fulfilled",
  "payload": {
    "order_id": "ord_123"
  },
  "notification_id": "ntf_01j4za3vdy8r98t7b4s2v0x4bz",
  "timestamp": "2026-01-12T11:02:17Z"
}
```

### URL Validation and SSRF Protection

Beacon validates webhook URLs before delivery:

- must use `http` or `https`
- hostname must resolve
- private/internal IP destinations are blocked

This reduces SSRF risk and prevents delivery to internal network targets.

### Example Event (Webhook)

```bash
curl -X POST http://localhost:8000/api/v1/events \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_PROJECT_KEY" \
  -d '{
    "event_type": "invoice.paid",
    "recipients": [{
      "channels": ["webhook"],
      "webhook_url": "https://example.com/hooks/invoices"
    }],
    "payload": {
      "invoice_id": "inv_10022"
    }
  }'
```

## Channel Configuration

Each channel has configurable operational settings.

Common channel config fields:

| Field | Type | Description |
| --- | --- | --- |
| `enabled` | boolean | Enables or disables the channel |
| `rate_limit_per_minute` | integer | Max outbound sends per minute for channel |

When a channel is disabled, Beacon skips new deliveries for that channel until re-enabled.

Rate limits help protect provider quotas and downstream systems.

## Per-Channel Retry Policies

Retry behavior is configurable per channel.

Policy fields:

| Field | Description |
| --- | --- |
| `max_retries` | Maximum retry attempts before dead-letter |
| `base_delay_seconds` | Initial backoff delay |
| `max_backoff_seconds` | Maximum delay cap |
| `jitter` | Randomized delay offset to spread retries |

Example policy profile:

```json
{
  "email": {
    "max_retries": 5,
    "base_delay_seconds": 10,
    "max_backoff_seconds": 600,
    "jitter": true
  },
  "sms": {
    "max_retries": 3,
    "base_delay_seconds": 5,
    "max_backoff_seconds": 120,
    "jitter": true
  },
  "webhook": {
    "max_retries": 8,
    "base_delay_seconds": 15,
    "max_backoff_seconds": 900,
    "jitter": true
  }
}
```

## Choosing the Right Channel

Use this quick heuristic:

| Scenario | Recommended Channel |
| --- | --- |
| User-facing transactional updates | Email |
| Time-sensitive short alerts | SMS |
| Service-to-service automation | Webhook |

You can combine channels for fallback or layered delivery.

Example strategy:

- primary: email
- urgent fallback: SMS
- internal automation: webhook

## Validation Summary

| Channel | Required Recipient Field | Format Rules |
| --- | --- | --- |
| Email | `email` | Valid email syntax |
| SMS | `phone` | E.164 (`+15551234567`) |
| Webhook | `webhook_url` | Valid external `http`/`https` URL |

## Operational Tips

> Keep channel-specific provider credentials and limits environment-specific (dev/staging/prod).

> Use low retry counts for SMS cost control, and higher retry windows for webhook recovery workflows.

> Monitor per-channel failure rates to detect provider incidents quickly.

## Related Docs

- [Events](/docs/events) for recipient schema and fan-out behavior.
- [Templates](/docs/templates) for channel-specific content rendering.
- [Delivery Pipeline](/docs/delivery) for retries, DLQ, and suppression logic.
- [Quickstart](/docs/quickstart) to send your first channel-specific event.
