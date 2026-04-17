# API Reference

Beacon exposes a JSON REST API for event ingestion, delivery operations, templates, analytics, and admin controls.

- **Base URL:** `https://beacon.michaelogunjimi.com/api/v1`
- **Authentication:** `X-API-Key` header on all endpoints except `GET /health`

For conceptual guides, see [Events](/docs/events), [Templates](/docs/templates), and [Delivery Pipeline](/docs/delivery).

## Authentication

All authenticated requests must include:

```bash
curl -H "X-API-Key: YOUR_API_KEY" ...
```

Beacon supports two API key types:

| Key type | Scope | Can access |
| --- | --- | --- |
| Master key | Global/admin | `/settings/*`, `/admin/*`, plus all project data |
| Project key | Project-scoped | Regular endpoints scoped to its own data |

> Project keys cannot call master-only endpoints. Those requests return `403`.

### Validate API Key

#### `POST /auth/validate`

Validate whether the provided key is active and authorized.

- **Auth required:** Yes (master or project)

```bash
curl -X POST https://beacon.michaelogunjimi.com/api/v1/auth/validate \
  -H "X-API-Key: YOUR_API_KEY"
```

```json
{
  "valid": true,
  "api_key_id": "1f2721ab-9e73-4dfb-b60e-ea0ef8f2dc17",
  "scope": "project",
  "name": "checkout-service"
}
```

## Events

### `POST /events`

Create an event and enqueue notification fan-out.

- **Auth required:** Yes (project key only)
- **Response:** `202 Accepted`

#### Request body

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `event_type` | string | Yes | Event name, e.g. `order.shipped` |
| `recipients` | array | Yes | Recipient list |
| `payload` | object | Yes | Event payload |
| `priority` | enum | No | `high`, `medium`, `low` |
| `template_id` | UUID | No | Template to render |
| `idempotency_key` | string | No | Deduplication key |
| `metadata` | object | No | Optional metadata |

`recipients[]` object:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `channels` | array | Yes | One or more of `email`, `sms`, `webhook` |
| `email` | string | Conditional | Required if channel includes `email` |
| `phone` | string | Conditional | Required if channel includes `sms` |
| `webhook_url` | string | Conditional | Required if channel includes `webhook` |
| `user_id` | string | No | Your internal user id |

```bash
curl -X POST https://beacon.michaelogunjimi.com/api/v1/events \
  -H "Content-Type: application/json" \
  -H "X-API-Key: PROJECT_KEY" \
  -d '{
    "event_type": "order.shipped",
    "recipients": [{
      "channels": ["email", "sms"],
      "email": "alex@example.com",
      "phone": "+15551234567",
      "user_id": "usr_123"
    }],
    "payload": {"order_id": "ord_991", "tracking_number": "1Z123"},
    "priority": "high",
    "template_id": "799524b8-fdc7-4f56-8a07-3b00bbc377af",
    "idempotency_key": "ship-ord_991-v1",
    "metadata": {"source": "orders-service"}
  }'
```

```json
{
  "event_id": "3d434cf3-2f63-4a82-aae4-fbead6877445",
  "status": "accepted",
  "priority": "high",
  "notification_count": 2,
  "created_at": "2026-04-17T12:15:32Z"
}
```

### `POST /events/batch`

Create multiple events atomically.

- **Auth required:** Yes (project key only)
- **Response:** `202 Accepted`
- **Limit:** max `50` events

#### Request body

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `events` | array | Yes | List of event objects (same shape as `POST /events`) |

```bash
curl -X POST https://beacon.michaelogunjimi.com/api/v1/events/batch \
  -H "Content-Type: application/json" \
  -H "X-API-Key: PROJECT_KEY" \
  -d '{
    "events": [
      {"event_type":"invoice.created","recipients":[{"channels":["email"],"email":"a@example.com"}],"payload":{"invoice_id":"inv_100"}},
      {"event_type":"invoice.created","recipients":[{"channels":["email"],"email":"b@example.com"}],"payload":{"invoice_id":"inv_101"}}
    ]
  }'
```

```json
{
  "batch_id": "09f33df8-0499-4db6-8adf-c235f34ca26f",
  "status": "accepted",
  "events_created": 2,
  "notifications_created": 2
}
```

### `GET /events`

List events.

- **Auth required:** Yes (master or project)

#### Query parameters

| Param | Type | Description |
| --- | --- | --- |
| `page` | integer | Page number |
| `per_page` | integer | Page size |
| `status` | string | Event status |
| `priority` | string | `high`, `medium`, `low` |
| `event_type` | string | Exact event type filter |
| `date_from` | datetime | Lower bound |
| `date_to` | datetime | Upper bound |

```bash
curl -X GET "https://beacon.michaelogunjimi.com/api/v1/events?page=1&per_page=2&priority=high" \
  -H "X-API-Key: PROJECT_KEY"
```

```json
{
  "items": [
    {"id":"3d434cf3-2f63-4a82-aae4-fbead6877445","event_type":"order.shipped","priority":"high","status":"processing","created_at":"2026-04-17T12:15:32Z"},
    {"id":"8dc13b38-19cc-40ef-9f85-8d3f402024f1","event_type":"password.reset","priority":"high","status":"completed","created_at":"2026-04-17T11:49:02Z"}
  ],
  "total": 42,
  "page": 1,
  "per_page": 2,
  "total_pages": 21
}
```

### `GET /events/{id}`

Get event details with related notifications.

- **Auth required:** Yes (master or project)

```bash
curl -X GET https://beacon.michaelogunjimi.com/api/v1/events/3d434cf3-2f63-4a82-aae4-fbead6877445 \
  -H "X-API-Key: PROJECT_KEY"
```

```json
{
  "id": "3d434cf3-2f63-4a82-aae4-fbead6877445",
  "event_type": "order.shipped",
  "status": "processing",
  "priority": "high",
  "payload": {"order_id": "ord_991"},
  "notifications": [
    {"id":"f8ce0a5f-9d95-4483-95d7-bda38ab718e8","channel":"email","status":"delivered"},
    {"id":"5f2b7371-c2d2-464b-ac53-89b683b80f68","channel":"sms","status":"processing"}
  ]
}
```

## Notifications

### `GET /notifications`

List notifications.

- **Auth required:** Yes (master or project)

#### Query parameters

| Param | Type | Description |
| --- | --- | --- |
| `page` | integer | Page number |
| `per_page` | integer | Page size |
| `status` | string | Notification status |
| `channel` | string | `email`, `sms`, `webhook` |
| `date_from` | datetime | Lower bound |
| `date_to` | datetime | Upper bound |
| `recipient` | string | Recipient filter |

```bash
curl -X GET "https://beacon.michaelogunjimi.com/api/v1/notifications?channel=email&status=delivered" \
  -H "X-API-Key: PROJECT_KEY"
```

```json
{
  "items": [
    {"id":"f8ce0a5f-9d95-4483-95d7-bda38ab718e8","event_id":"3d434cf3-2f63-4a82-aae4-fbead6877445","channel":"email","status":"delivered","recipient":"alex@example.com","retry_count":0}
  ],
  "total": 1,
  "page": 1,
  "per_page": 25,
  "total_pages": 1
}
```

### `GET /notifications/{id}`

Get notification detail with attempt logs.

- **Auth required:** Yes (master or project)

```bash
curl -X GET https://beacon.michaelogunjimi.com/api/v1/notifications/f8ce0a5f-9d95-4483-95d7-bda38ab718e8 \
  -H "X-API-Key: PROJECT_KEY"
```

```json
{
  "id": "f8ce0a5f-9d95-4483-95d7-bda38ab718e8",
  "channel": "email",
  "status": "delivered",
  "recipient": "alex@example.com",
  "retry_count": 0,
  "notification_logs": [
    {"attempt":1,"status":"processing","timestamp":"2026-04-17T12:15:34Z"},
    {"attempt":1,"status":"delivered","provider_response":{"message_id":"re_2SgB..."},"timestamp":"2026-04-17T12:15:36Z"}
  ]
}
```

## Templates

See [Templates](/docs/templates).

### `GET /templates`

List templates.

- **Auth required:** Yes (master or project)

#### Query parameters

| Param | Type | Description |
| --- | --- | --- |
| `page` | integer | Page number |
| `per_page` | integer | Page size |
| `channel` | string | Filter by channel |

```bash
curl -X GET "https://beacon.michaelogunjimi.com/api/v1/templates?channel=email" \
  -H "X-API-Key: PROJECT_KEY"
```

```json
{
  "items": [
    {"id":"799524b8-fdc7-4f56-8a07-3b00bbc377af","name":"order_shipped_email","channel":"email","subject":"Your order {{ order_id }} has shipped","variables":["order_id","tracking_number"]}
  ],
  "total": 1,
  "page": 1,
  "per_page": 25,
  "total_pages": 1
}
```

### `POST /templates`

Create template.

- **Auth required:** Yes (master or project)

#### Request body

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | Yes | Template name |
| `channel` | string | Yes | `email`, `sms`, `webhook` |
| `subject` | string | No | Subject for email templates |
| `body` | string | Yes | Template body |
| `variables` | array | No | Variable definitions/list |

```bash
curl -X POST https://beacon.michaelogunjimi.com/api/v1/templates \
  -H "Content-Type: application/json" \
  -H "X-API-Key: PROJECT_KEY" \
  -d '{"name":"order_shipped_email","channel":"email","subject":"Order {{ order_id }} is on the way","body":"Hi {{ customer_name }}, track: {{ tracking_number }}","variables":["order_id","customer_name","tracking_number"]}'
```

```json
{
  "id": "799524b8-fdc7-4f56-8a07-3b00bbc377af",
  "name": "order_shipped_email",
  "channel": "email",
  "created_at": "2026-04-17T12:35:00Z"
}
```

### `GET /templates/{id}`

Get template by id.

- **Auth required:** Yes (master or project)

```bash
curl -X GET https://beacon.michaelogunjimi.com/api/v1/templates/799524b8-fdc7-4f56-8a07-3b00bbc377af \
  -H "X-API-Key: PROJECT_KEY"
```

```json
{
  "id":"799524b8-fdc7-4f56-8a07-3b00bbc377af",
  "name":"order_shipped_email",
  "channel":"email",
  "subject":"Order {{ order_id }} is on the way",
  "body":"Hi {{ customer_name }}, track: {{ tracking_number }}",
  "variables":["order_id","customer_name","tracking_number"]
}
```

### `PUT /templates/{id}`

Update template (partial payload allowed).

- **Auth required:** Yes (master or project)

#### Request body

| Field | Type | Description |
| --- | --- | --- |
| `name` | string | Updated name |
| `subject` | string | Updated subject |
| `body` | string | Updated body |
| `variables` | array | Updated variable list |

```bash
curl -X PUT https://beacon.michaelogunjimi.com/api/v1/templates/799524b8-fdc7-4f56-8a07-3b00bbc377af \
  -H "Content-Type: application/json" \
  -H "X-API-Key: PROJECT_KEY" \
  -d '{"subject":"Your order {{ order_id }} has shipped","body":"Hi {{ customer_name }}, your package is now in transit."}'
```

```json
{
  "id": "799524b8-fdc7-4f56-8a07-3b00bbc377af",
  "name": "order_shipped_email",
  "channel": "email",
  "subject": "Your order {{ order_id }} has shipped",
  "updated_at": "2026-04-17T12:38:43Z"
}
```

### `DELETE /templates/{id}`

Delete template.

- **Auth required:** Yes (master or project)
- **Response:** `204 No Content`

```bash
curl -X DELETE https://beacon.michaelogunjimi.com/api/v1/templates/799524b8-fdc7-4f56-8a07-3b00bbc377af \
  -H "X-API-Key: PROJECT_KEY"
```

### `POST /templates/{id}/preview`

Render template using variables.

- **Auth required:** Yes (master or project)

#### Request body

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `variables` | object | Yes | Runtime variable values |

```bash
curl -X POST https://beacon.michaelogunjimi.com/api/v1/templates/799524b8-fdc7-4f56-8a07-3b00bbc377af/preview \
  -H "Content-Type: application/json" \
  -H "X-API-Key: PROJECT_KEY" \
  -d '{"variables":{"order_id":"ord_991","customer_name":"Alex","tracking_number":"1Z123"}}'
```

```json
{
  "subject": "Your order ord_991 has shipped",
  "body": "Hi Alex, your package is now in transit."
}
```

## Scheduled Events

### `POST /scheduled-events`

Schedule future event delivery.

- **Auth required:** Yes (project key only)

#### Request body

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `event_type` | string | Yes | Event name |
| `recipients` | array | Yes | Recipient array |
| `payload` | object | Yes | Event payload |
| `scheduled_for` | datetime | Yes | Future UTC datetime |
| `priority` | string | No | `high`, `medium`, `low` |
| `template_id` | UUID | No | Optional template |

```bash
curl -X POST https://beacon.michaelogunjimi.com/api/v1/scheduled-events \
  -H "Content-Type: application/json" \
  -H "X-API-Key: PROJECT_KEY" \
  -d '{"event_type":"renewal.reminder","recipients":[{"channels":["email"],"email":"alex@example.com"}],"payload":{"renewal_date":"2026-04-20"},"scheduled_for":"2026-04-19T09:00:00Z"}'
```

```json
{
  "id": "39ac7bf3-c4f6-4a1f-ab1a-996f1fcf2d5d",
  "status": "scheduled",
  "scheduled_for": "2026-04-19T09:00:00Z"
}
```

### `GET /scheduled-events`

List scheduled events.

- **Auth required:** Yes (master or project)

#### Query parameters

| Param | Type | Description |
| --- | --- | --- |
| `page` | integer | Page number |
| `per_page` | integer | Page size |
| `status` | string | `scheduled`, `dispatched`, `cancelled` |

```bash
curl -X GET "https://beacon.michaelogunjimi.com/api/v1/scheduled-events?status=scheduled" \
  -H "X-API-Key: PROJECT_KEY"
```

```json
{
  "items": [{"id":"39ac7bf3-c4f6-4a1f-ab1a-996f1fcf2d5d","event_type":"renewal.reminder","status":"scheduled","scheduled_for":"2026-04-19T09:00:00Z"}],
  "total": 1,
  "page": 1,
  "per_page": 25,
  "total_pages": 1
}
```

### `DELETE /scheduled-events/{id}`

Cancel scheduled event.

- **Auth required:** Yes (project key only)
- **Response:** `204 No Content`

```bash
curl -X DELETE https://beacon.michaelogunjimi.com/api/v1/scheduled-events/39ac7bf3-c4f6-4a1f-ab1a-996f1fcf2d5d \
  -H "X-API-Key: PROJECT_KEY"
```

## Suppressions

### `GET /suppressions`

List suppressions.

- **Auth required:** Yes (master or project)

#### Query parameters

| Param | Type | Description |
| --- | --- | --- |
| `page` | integer | Page number |
| `per_page` | integer | Page size |
| `channel` | string | Channel filter |

```bash
curl -X GET "https://beacon.michaelogunjimi.com/api/v1/suppressions?channel=email" \
  -H "X-API-Key: PROJECT_KEY"
```

```json
{
  "items": [{"id":"90763e0e-e417-44a5-b0d4-ec9793fdf52f","channel":"email","recipient":"alex@example.com","reason":"hard_bounce","source":"system"}],
  "total": 1,
  "page": 1,
  "per_page": 25,
  "total_pages": 1
}
```

### `POST /suppressions`

Create suppression.

- **Auth required:** Yes (master or project)

#### Request body

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `channel` | enum | Yes | `email`, `sms`, `webhook` |
| `recipient` | string | Yes | Recipient address/number/url |
| `reason` | enum | No | `hard_bounce`, `spam_complaint`, `manual` |
| `source` | enum | No | `system`, `client` |

```bash
curl -X POST https://beacon.michaelogunjimi.com/api/v1/suppressions \
  -H "Content-Type: application/json" \
  -H "X-API-Key: PROJECT_KEY" \
  -d '{"channel":"email","recipient":"alex@example.com","reason":"manual","source":"client"}'
```

```json
{
  "id": "90763e0e-e417-44a5-b0d4-ec9793fdf52f",
  "channel": "email",
  "recipient": "alex@example.com",
  "reason": "manual",
  "source": "client"
}
```

### `DELETE /suppressions/{id}`

Delete suppression.

- **Auth required:** Yes (master or project)
- **Response:** `204 No Content`

```bash
curl -X DELETE https://beacon.michaelogunjimi.com/api/v1/suppressions/90763e0e-e417-44a5-b0d4-ec9793fdf52f \
  -H "X-API-Key: PROJECT_KEY"
```

## Dead Letter Queue

### `GET /dead-letter`

List dead-letter messages.

- **Auth required:** Yes (master or project)

#### Query parameters

| Param | Type | Description |
| --- | --- | --- |
| `page` | integer | Page number |
| `per_page` | integer | Page size |
| `status` | string | `active`, `retried`, `discarded` |
| `channel` | string | Channel filter |

```bash
curl -X GET "https://beacon.michaelogunjimi.com/api/v1/dead-letter?status=active&channel=sms" \
  -H "X-API-Key: PROJECT_KEY"
```

```json
{
  "items": [{"id":"588d499e-0f53-4ac4-b7ec-a6ce77861d2e","notification_id":"5f2b7371-c2d2-464b-ac53-89b683b80f68","channel":"sms","status":"active","error_type":"provider_timeout"}],
  "total": 1,
  "page": 1,
  "per_page": 25,
  "total_pages": 1
}
```

### `GET /dead-letter/{id}`

Get dead-letter detail.

- **Auth required:** Yes (master or project)

```bash
curl -X GET https://beacon.michaelogunjimi.com/api/v1/dead-letter/588d499e-0f53-4ac4-b7ec-a6ce77861d2e \
  -H "X-API-Key: PROJECT_KEY"
```

```json
{
  "id":"588d499e-0f53-4ac4-b7ec-a6ce77861d2e",
  "notification_id":"5f2b7371-c2d2-464b-ac53-89b683b80f68",
  "channel":"sms",
  "recipient":"+15551234567",
  "retry_count":5,
  "status":"active",
  "error_message":"Twilio timeout after 30s"
}
```

### `POST /dead-letter/{id}/retry`

Re-enqueue dead-letter message.

- **Auth required:** Yes (master or project)

```bash
curl -X POST https://beacon.michaelogunjimi.com/api/v1/dead-letter/588d499e-0f53-4ac4-b7ec-a6ce77861d2e/retry \
  -H "X-API-Key: PROJECT_KEY"
```

```json
{"id":"588d499e-0f53-4ac4-b7ec-a6ce77861d2e","status":"retried","requeued":true}
```

### `POST /dead-letter/{id}/discard`

Acknowledge/discard dead-letter message.

- **Auth required:** Yes (master or project)

```bash
curl -X POST https://beacon.michaelogunjimi.com/api/v1/dead-letter/588d499e-0f53-4ac4-b7ec-a6ce77861d2e/discard \
  -H "X-API-Key: PROJECT_KEY"
```

```json
{"id":"588d499e-0f53-4ac4-b7ec-a6ce77861d2e","status":"discarded"}
```

## Alerts

### `GET /alerts`

List alert rules.

- **Auth required:** Yes (master or project)

```bash
curl -X GET https://beacon.michaelogunjimi.com/api/v1/alerts \
  -H "X-API-Key: PROJECT_KEY"
```

```json
[
  {"id":"7186d35b-137f-4a44-8583-6f0f8f35913b","name":"High email failure rate","metric":"failure_rate","threshold":0.05,"window_minutes":15,"is_active":true}
]
```

### `POST /alerts`

Create alert rule.

- **Auth required:** Yes (master or project)

#### Request body

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | Yes | Alert name |
| `metric` | enum | Yes | `failure_rate`, `queue_depth`, `delivery_latency` |
| `threshold` | number | Yes | Trigger threshold |
| `window_minutes` | integer | No | Evaluation window |
| `notify_email` | string | No | Email destination |
| `is_active` | boolean | No | Defaults `true` |

```bash
curl -X POST https://beacon.michaelogunjimi.com/api/v1/alerts \
  -H "Content-Type: application/json" \
  -H "X-API-Key: PROJECT_KEY" \
  -d '{"name":"Webhook queue too deep","metric":"queue_depth","threshold":1000,"window_minutes":5,"notify_email":"oncall@example.com"}'
```

```json
{"id":"03f80ee5-09d8-4f88-aee1-50b70b538795","name":"Webhook queue too deep","metric":"queue_depth","threshold":1000}
```

### `PUT /alerts/{id}`

Update alert rule.

- **Auth required:** Yes (master or project)

```bash
curl -X PUT https://beacon.michaelogunjimi.com/api/v1/alerts/03f80ee5-09d8-4f88-aee1-50b70b538795 \
  -H "Content-Type: application/json" \
  -H "X-API-Key: PROJECT_KEY" \
  -d '{"threshold":1500,"is_active":false}'
```

```json
{"id":"03f80ee5-09d8-4f88-aee1-50b70b538795","threshold":1500,"is_active":false}
```

### `DELETE /alerts/{id}`

Delete alert rule.

- **Auth required:** Yes (master or project)
- **Response:** `204 No Content`

```bash
curl -X DELETE https://beacon.michaelogunjimi.com/api/v1/alerts/03f80ee5-09d8-4f88-aee1-50b70b538795 \
  -H "X-API-Key: PROJECT_KEY"
```

## Analytics

### `GET /analytics`

Get aggregate delivery metrics.

- **Auth required:** Yes (master or project)

#### Query parameters

| Param | Type | Description |
| --- | --- | --- |
| `date_from` | datetime | Range start |
| `date_to` | datetime | Range end |

```bash
curl -X GET "https://beacon.michaelogunjimi.com/api/v1/analytics?date_from=2026-04-01T00:00:00Z&date_to=2026-04-17T23:59:59Z" \
  -H "X-API-Key: PROJECT_KEY"
```

```json
{
  "total_events": 1823,
  "total_notifications": 2941,
  "delivery_rate": 0.984,
  "channel_breakdown": {
    "email": {"sent": 1500, "delivered": 1480, "failed": 20},
    "sms": {"sent": 900, "delivered": 880, "failed": 20},
    "webhook": {"sent": 541, "delivered": 534, "failed": 7}
  }
}
```

### `GET /analytics/trends`

Get time-bucketed notification counts.

- **Auth required:** Yes (master or project)

#### Query parameters

| Param | Type | Description |
| --- | --- | --- |
| `date_from` | datetime | Range start |
| `date_to` | datetime | Range end |
| `granularity` | enum | `hour` or `day` |

```bash
curl -X GET "https://beacon.michaelogunjimi.com/api/v1/analytics/trends?date_from=2026-04-15T00:00:00Z&date_to=2026-04-17T23:59:59Z&granularity=day" \
  -H "X-API-Key: PROJECT_KEY"
```

```json
{
  "granularity": "day",
  "series": [
    {"bucket": "2026-04-15", "notifications": 870},
    {"bucket": "2026-04-16", "notifications": 1011},
    {"bucket": "2026-04-17", "notifications": 1060}
  ]
}
```

## Audit Log

### `GET /audit-log`

List audit entries.

- **Auth required:** Yes (master or project)

#### Query parameters

| Param | Type | Description |
| --- | --- | --- |
| `page` | integer | Page number |
| `per_page` | integer | Page size |
| `action` | string | Action filter |
| `from` | datetime | Inclusive start datetime |

```bash
curl -X GET "https://beacon.michaelogunjimi.com/api/v1/audit-log?action=api_key.created&page=1" \
  -H "X-API-Key: MASTER_KEY"
```

```json
{
  "items": [{"id":"9484f7f8-2c7e-4f20-9ca8-2ae3d6c7527f","action":"api_key.created","actor_api_key_id":"1f2721ab-9e73-4dfb-b60e-ea0ef8f2dc17","metadata":{"new_key_name":"billing-service"}}],
  "total": 1,
  "page": 1,
  "per_page": 25,
  "total_pages": 1
}
```

## Usage

### `GET /usage`

Get API usage per endpoint per hour.

- **Auth required:** Yes (master or project)

#### Query parameters

| Param | Type | Description |
| --- | --- | --- |
| `page` | integer | Page number |
| `per_page` | integer | Page size |
| `from` | datetime | Start |
| `to` | datetime | End |
| `endpoint` | string | Endpoint filter |

```bash
curl -X GET "https://beacon.michaelogunjimi.com/api/v1/usage?endpoint=/events&from=2026-04-17T00:00:00Z" \
  -H "X-API-Key: PROJECT_KEY"
```

```json
{
  "items": [{"hour":"2026-04-17T12:00:00Z","endpoint":"/events","request_count":481}],
  "total": 1,
  "page": 1,
  "per_page": 25,
  "total_pages": 1
}
```

## Settings (Master Key Only)

### `POST /settings/api-keys`

Create API key.

- **Auth required:** Yes (master only)

#### Request body

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | Yes | Key name |
| `rate_limit_per_min` | integer | No | Per-key limit override |

```bash
curl -X POST https://beacon.michaelogunjimi.com/api/v1/settings/api-keys \
  -H "Content-Type: application/json" \
  -H "X-API-Key: MASTER_KEY" \
  -d '{"name":"checkout-service","rate_limit_per_min":1200}'
```

```json
{
  "id": "2f44dad2-41a2-4f4c-8d7a-a6ca73f08953",
  "name": "checkout-service",
  "key_prefix": "bk_live_",
  "api_key": "bk_live_4vQ...raw-key-shown-once",
  "rate_limit_per_min": 1200,
  "created_at": "2026-04-17T13:05:00Z"
}
```

> The raw `api_key` value is shown only once.

### `GET /settings/api-keys`

List API keys.

- **Auth required:** Yes (master only)

```bash
curl -X GET "https://beacon.michaelogunjimi.com/api/v1/settings/api-keys?page=1&per_page=25" \
  -H "X-API-Key: MASTER_KEY"
```

```json
{
  "items": [{"id":"2f44dad2-41a2-4f4c-8d7a-a6ca73f08953","name":"checkout-service","key_prefix":"bk_live_","is_active":true,"last_used_at":"2026-04-17T13:08:10Z"}],
  "total": 1,
  "page": 1,
  "per_page": 25,
  "total_pages": 1
}
```

### `DELETE /settings/api-keys/{id}`

Revoke API key.

- **Auth required:** Yes (master only)
- **Response:** `204 No Content`

```bash
curl -X DELETE https://beacon.michaelogunjimi.com/api/v1/settings/api-keys/2f44dad2-41a2-4f4c-8d7a-a6ca73f08953 \
  -H "X-API-Key: MASTER_KEY"
```

### `GET /settings/channels`

List channel configs.

- **Auth required:** Yes (master only)

```bash
curl -X GET https://beacon.michaelogunjimi.com/api/v1/settings/channels \
  -H "X-API-Key: MASTER_KEY"
```

```json
[
  {"channel":"email","enabled":true,"provider":"resend"},
  {"channel":"sms","enabled":true,"provider":"twilio"},
  {"channel":"webhook","enabled":true,"timeout_seconds":30}
]
```

### `GET /settings/retry-policies`

List retry policy per channel.

- **Auth required:** Yes (master only)

```bash
curl -X GET https://beacon.michaelogunjimi.com/api/v1/settings/retry-policies \
  -H "X-API-Key: MASTER_KEY"
```

```json
[
  {"channel":"email","max_retries":5,"base_delay_seconds":10},
  {"channel":"sms","max_retries":3,"base_delay_seconds":5},
  {"channel":"webhook","max_retries":7,"base_delay_seconds":15}
]
```

## Admin (Master Key Only)

### `GET /admin/keys`

List all API keys with event counts.

- **Auth required:** Yes (master only)

```bash
curl -X GET https://beacon.michaelogunjimi.com/api/v1/admin/keys \
  -H "X-API-Key: MASTER_KEY"
```

```json
{"items":[{"api_key_id":"2f44dad2-41a2-4f4c-8d7a-a6ca73f08953","name":"checkout-service","event_count":4902}]}
```

### `GET /admin/health`

Get system health snapshot.

- **Auth required:** Yes (master only)

```bash
curl -X GET https://beacon.michaelogunjimi.com/api/v1/admin/health \
  -H "X-API-Key: MASTER_KEY"
```

```json
{
  "status":"healthy",
  "database":{"status":"ok","latency_ms":4},
  "redis":{"status":"ok","latency_ms":2},
  "queues":{"email":{"depth":3},"sms":{"depth":0},"webhook":{"depth":7}},
  "error_rate_5m":0.003
}
```

### `GET /admin/analytics`

Cross-key aggregated analytics.

- **Auth required:** Yes (master only)

```bash
curl -X GET "https://beacon.michaelogunjimi.com/api/v1/admin/analytics?date_from=2026-04-01T00:00:00Z&date_to=2026-04-17T23:59:59Z" \
  -H "X-API-Key: MASTER_KEY"
```

```json
{"projects":8,"total_events":48302,"total_notifications":120221,"delivery_rate":0.978}
```

### `GET /admin/usage`

List all usage data.

- **Auth required:** Yes (master only)

#### Query parameters

| Param | Type | Description |
| --- | --- | --- |
| `api_key_id` | UUID | Optional key filter |
| `from` | datetime | Start |
| `to` | datetime | End |
| `endpoint` | string | Endpoint filter |

```bash
curl -X GET "https://beacon.michaelogunjimi.com/api/v1/admin/usage?endpoint=/events&from=2026-04-17T00:00:00Z" \
  -H "X-API-Key: MASTER_KEY"
```

```json
{
  "items": [{"api_key_id":"2f44dad2-41a2-4f4c-8d7a-a6ca73f08953","hour":"2026-04-17T13:00:00Z","endpoint":"/events","request_count":300}],
  "total": 1,
  "page": 1,
  "per_page": 25,
  "total_pages": 1
}
```

## Health

### `GET /health`

Public health endpoint.

- **Auth required:** No

```bash
curl -X GET https://beacon.michaelogunjimi.com/api/v1/health \
  -H "X-API-Key: YOUR_API_KEY"
```

```json
{"status":"healthy"}
```

## Pagination

All paginated endpoints return:

```json
{
  "items": [],
  "total": 0,
  "page": 1,
  "per_page": 25,
  "total_pages": 0
}
```

## Error Responses

### 401 Unauthorized

```json
{"detail":"Invalid or missing API key"}
```

### 403 Forbidden

```json
{"detail":"Insufficient permissions for this endpoint"}
```

### 404 Not Found

```json
{"detail":"Resource not found"}
```

### 422 Validation Error

```json
{
  "detail": [
    {
      "loc": ["body", "recipients", 0, "phone"],
      "msg": "phone is required when channels includes sms",
      "type": "value_error"
    }
  ]
}
```
