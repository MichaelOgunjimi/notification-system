# Events

Events are the primary trigger mechanism in Beacon.

You publish an event that describes what happened, and Beacon handles notification fan-out, queueing, delivery, and tracking.

## What Is an Event?

An event is a structured request that includes:

- what happened (`event_type`)
- who should be notified (`recipients`)
- context data (`payload`)
- optional delivery controls (`priority`, `template_id`, `idempotency_key`)

Beacon stores the event and creates notification records asynchronously.

## Create an Event

Endpoint:

```text
POST /events
```

Full URL:

```text
https://beacon.michaelogunjimi.com/api/v1/events
```

Authentication:

```text
X-API-Key: <project key or master key>
```

### Request Fields

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `event_type` | string | yes | Logical event name, e.g. `user.welcome` |
| `recipients` | array | yes | One or more recipient definitions |
| `payload` | object | yes | Data for template rendering and downstream context |
| `priority` | enum | no | `high`, `medium`, `low` (default: `medium`) |
| `template_id` | string | no | Template reference for channel content rendering |
| `idempotency_key` | string | no | Duplicate-prevention key for safe retries |

### Example: Single Event

```bash
curl -X POST https://beacon.michaelogunjimi.com/api/v1/events \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_PROJECT_KEY" \
  -d '{
    "event_type": "invoice.paid",
    "priority": "high",
    "template_id": "tmpl_invoice_paid",
    "idempotency_key": "evt-invoice-78341-v1",
    "recipients": [{
      "channels": ["email", "sms"],
      "email": "user@example.com",
      "phone": "+15551234567",
      "user_id": "usr_123"
    }],
    "payload": {
      "invoice_id": "inv_78341",
      "amount": "49.00",
      "currency": "USD"
    }
  }'
```

Typical response for first submission:

```json
{
  "id": "evt_01j4z89n8x5t5b5w3j9m8k0h2z",
  "status": "accepted",
  "event_type": "invoice.paid"
}
```

## Recipients

Each recipient object defines:

- a `channels` array
- channel-specific fields required by selected channels
- optional `user_id` for your internal identity mapping

### Recipient Shape

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `channels` | array<string> | yes | One or more of `email`, `sms`, `webhook` |
| `email` | string | required for email | Must be valid email format |
| `phone` | string | required for sms | Must be E.164 format (`+15551234567`) |
| `webhook_url` | string | required for webhook | Must be valid external `http`/`https` URL |
| `user_id` | string | no | Optional app-level identifier |

### Example: Multi-Recipient, Multi-Channel

```json
{
  "event_type": "order.shipped",
  "recipients": [
    {
      "channels": ["email"],
      "email": "alice@example.com",
      "user_id": "usr_alice"
    },
    {
      "channels": ["sms", "webhook"],
      "phone": "+15551234567",
      "webhook_url": "https://example.com/hooks/order-events",
      "user_id": "usr_ops"
    }
  ],
  "payload": {
    "order_id": "ord_10019"
  }
}
```

## Event Lifecycle

Events move through explicit statuses:

| Status | Meaning |
| --- | --- |
| `accepted` | Event validated and persisted |
| `processing` | Notifications are being created and/or delivered |
| `completed` | All notifications reached terminal success |
| `partially_failed` | At least one notification failed while others succeeded |
| `failed` | Event could not be processed to successful completion |

> Event status is aggregate state. Individual notifications have their own delivery statuses.

## Priority Levels

Set `priority` to influence queue routing:

| Priority | Behavior |
| --- | --- |
| `high` | Routed for fastest processing |
| `medium` | Default processing class |
| `low` | Deprioritized for non-urgent workloads |

High priority events are processed first when queue pressure exists.

Use cases:

- `high`: security alerts, password resets
- `medium`: transactional user updates
- `low`: bulk informational events

## Idempotency

Idempotency prevents duplicate event creation on client retries.

Include the same `idempotency_key` when retrying a request after a timeout or network error.

Behavior:

- First submission: returns `202 Accepted` and creates event.
- Duplicate submission with same key: returns `200 OK` and original event.

### Example: Idempotent Replay

```bash
curl -X POST https://beacon.michaelogunjimi.com/api/v1/events \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_PROJECT_KEY" \
  -d '{
    "event_type": "user.welcome",
    "idempotency_key": "welcome-user-abc-001",
    "recipients": [{"channels":["email"],"email":"user@example.com"}],
    "payload": {"user_name":"Alice"}
  }'
```

Repeat the exact call with the same `idempotency_key` to get the previously created event response.

## Batch Events

For multi-event ingestion, use:

```text
POST /events/batch
```

Batch requests submit multiple events in one operation and are processed atomically.

If batch validation fails, no partial batch is committed.

### Example: Batch Request

```bash
curl -X POST https://beacon.michaelogunjimi.com/api/v1/events/batch \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_PROJECT_KEY" \
  -d '{
    "events": [
      {
        "event_type": "user.welcome",
        "recipients": [{"channels":["email"],"email":"a@example.com"}],
        "payload": {"user_name":"A"}
      },
      {
        "event_type": "user.welcome",
        "recipients": [{"channels":["email"],"email":"b@example.com"}],
        "payload": {"user_name":"B"}
      }
    ]
  }'
```

## Event → Notification Fan-Out

Beacon creates one notification per:

```text
recipient × channel
```

Example:

- 2 recipients
- channels per recipient: `["email","sms"]`

Result:

- 4 notifications total

This fan-out model ensures channel isolation and independent retry behavior.

## Validation Rules

Beacon validates event payloads before acceptance.

### Recipient and Channel Validation

| Rule | Example |
| --- | --- |
| Valid email required for `email` channel | `user@example.com` |
| E.164 phone required for `sms` channel | `+15551234567` |
| Valid `http`/`https` URL required for `webhook` channel | `https://example.com/hook` |

### SSRF Protection for Webhooks

Webhook URLs are validated to reduce SSRF risk:

- URL must use `http` or `https`
- hostname must resolve
- private/internal IP ranges are rejected

Invalid targets are rejected at validation time.

## Query an Event

Endpoint:

```text
GET /events/{id}
```

Example:

```bash
curl -X GET https://beacon.michaelogunjimi.com/api/v1/events/evt_01j4z89n8x5t5b5w3j9m8k0h2z \
  -H "X-API-Key: YOUR_PROJECT_KEY"
```

Use this endpoint to track event-level progress.

For delivery-level detail, use [Delivery Pipeline](/docs/delivery) and notification endpoints.

## Best Practices

1. Use stable, domain-driven `event_type` names (`order.shipped`, `invoice.failed`).
2. Always send `idempotency_key` from upstream producers.
3. Keep payloads explicit and template-focused.
4. Use `priority=high` sparingly for truly urgent flows.
5. Validate channel-specific data before calling Beacon.

## Related Docs

- [Introduction](/docs/introduction)
- [Quickstart](/docs/quickstart)
- [Channels](/docs/channels)
- [Templates](/docs/templates)
- [Delivery Pipeline](/docs/delivery)
