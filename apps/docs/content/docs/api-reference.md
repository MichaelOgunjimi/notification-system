# API Reference

Beaco exposes a JSON REST API for event ingestion, delivery operations, templates, analytics, and admin controls.

- **Base URL:** `https://beaco.michaelogunjimi.com/api/v1`
- **Authentication:** bearer access token or scoped `X-API-Key`, depending on the endpoint

For conceptual guides, see [Events](/events), [Templates](/templates), and [Delivery Pipeline](/delivery).

## Authentication

Beaco has two authentication planes:

| Credential         | Used for                                                                                       | Header                        |
| ------------------ | ---------------------------------------------------------------------------------------------- | ----------------------------- |
| Human access token | Organizations, projects, members, invitations, API-key management, and platform administration | `Authorization: Bearer TOKEN` |
| Project API key    | Events, templates, notifications, delivery operations, and project observability               | `X-API-Key: KEY`              |

For example, a notification operation includes:

```bash
curl -H "X-API-Key: YOUR_API_KEY" ...
```

Project API keys are created under `/projects/{project_id}/api-keys` by an authorized human user. Each key carries explicit scopes such as `events:write`, `templates:read`, or `notifications:read`; a missing scope returns `403`.

## Events

### `POST /events`

Create an event and enqueue notification fan-out.

- **Auth required:** project API key with `events:write`
- **Response:** `202 Accepted`

#### Request body

| Field             | Type   | Required     | Description                      |
| ----------------- | ------ | ------------ | -------------------------------- |
| `event_type`      | string | Yes          | Event name, e.g. `order.shipped` |
| `recipients`      | array  | Yes          | Recipient list                   |
| `payload`         | object | Yes          | Event payload                    |
| `priority`        | enum   | No           | `high`, `medium`, `low`          |
| `template_id`     | UUID   | One of three | Template to render               |
| `template_name`   | string | One of three | Template name to render          |
| `inline`          | object | One of three | Rendered email, see below        |
| `attachments`     | array  | No           | Email attachments, see below     |
| `idempotency_key` | string | No           | Deduplication key                |
| `metadata`        | object | No           | Optional metadata                |

Exactly one of `template_id`, `template_name`, or `inline` is required. Inline content is size
validated and delivered without Jinja processing.

`inline` object:

| Field        | Type   | Required | Description                                             |
| ------------ | ------ | -------- | ------------------------------------------------------- |
| `html`       | string | Yes      | Rendered HTML body                                      |
| `subject`    | string | No       | Plain-text subject (max 500)                            |
| `text`       | string | No       | Plain-text alternative; derived from `html` when absent |
| `from_local` | string | No       | Sender name before the `@`: `^[a-z0-9._+-]+$`, max 64   |
| `from_name`  | string | No       | Sender display name, plain text, max 100                |
| `reply_to`   | string | No       | Reply-To address; any valid email address               |

The sender domain always comes from the server's configured address, so `from_local` and
`from_name` can never move an email to another domain. When none is set, the default sender is
used. Example: `"inline": {"subject": "Order confirmed", "html": "<p>Thanks</p>", "from_local":
"orders", "from_name": "Winwell Orders", "reply_to": "support@winwell.example"}` sends as
`Winwell Orders <orders@your-verified-domain>`.

`attachments[]` object (email only, up to 10 per event):

| Field        | Type    | Required | Description                                                      |
| ------------ | ------- | -------- | ---------------------------------------------------------------- |
| `filename`   | string  | Yes      | Name shown to the recipient, 1-255 chars, no slashes or controls |
| `url`        | string  | Yes      | `http(s)` URL of the file, max 2048                              |
| `size_bytes` | integer | Yes      | Declared size in bytes; the declared total may not exceed 30 MB  |

Beaco does not store attachments. The file is downloaded from your `url` each time the email is
sent: by Resend, or by Beaco's worker when SMTP is the provider. The URL must therefore stay
reachable until delivery succeeds, including retries; a short-lived signed URL can expire
mid-retry. Beaco's own download only connects to publicly routable addresses, so URLs on private or
internal networks (`localhost`, `10.x`, `192.168.x`, link-local) are refused, redirects are not
followed, and a 4xx response fails the delivery permanently. `size_bytes` is declared by the caller
and used only to reject oversized emails early (Resend allows 40 MB per email after Base64
encoding, so 30 MB of files); Beaco never fetches the URL when you publish, and the real size is
enforced at send time. `POST /scheduled-events` does not accept `attachments`; the field is ignored
there.

`recipients[]` object:

| Field         | Type   | Required    | Description                              |
| ------------- | ------ | ----------- | ---------------------------------------- |
| `channels`    | array  | Yes         | One or more of `email`, `sms`, `webhook` |
| `email`       | string | Conditional | Required if channel includes `email`     |
| `phone`       | string | Conditional | Required if channel includes `sms`       |
| `webhook_url` | string | Conditional | Required if channel includes `webhook`   |
| `user_id`     | string | No          | Your internal user id                    |

```bash
curl -X POST https://beaco.michaelogunjimi.com/api/v1/events \
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
  "id": "3d434cf3-2f63-4a82-aae4-fbead6877445",
  "event_type": "order.shipped",
  "status": "accepted",
  "priority": "high",
  "recipient_count": 1,
  "has_failures": false,
  "idempotency_key": "ship-ord_991-v1",
  "created_at": "2026-04-17T12:15:32Z",
  "updated_at": "2026-04-17T12:15:32Z"
}
```

Example with attachments (email delivery only):

```bash
curl -X POST https://beaco.michaelogunjimi.com/api/v1/events \
  -H "Content-Type: application/json" \
  -H "X-API-Key: PROJECT_KEY" \
  -d '{
    "event_type": "invoice.issued",
    "recipients": [{"channels": ["email"], "email": "alex@example.com"}],
    "inline": {"subject": "Your invoice", "html": "<p>Invoice attached.</p>"},
    "attachments": [
      {
        "filename": "invoice-1042.pdf",
        "url": "https://files.example.com/invoices/1042.pdf",
        "size_bytes": 48213
      }
    ]
  }'
```

A request is rejected with `422` when there are more than 10 attachments, a `url` is not `http(s)`,
a `filename` contains a slash or control character, `size_bytes` is not positive, or the declared
sizes total more than 30 MB.

### `POST /events/batch`

Create multiple events atomically.

- **Auth required:** scoped project API key
- **Response:** `202 Accepted`
- **Limit:** max `50` events

#### Request body

| Field    | Type  | Required | Description                                          |
| -------- | ----- | -------- | ---------------------------------------------------- |
| `events` | array | Yes      | List of event objects (same shape as `POST /events`) |

```bash
curl -X POST https://beaco.michaelogunjimi.com/api/v1/events/batch \
  -H "Content-Type: application/json" \
  -H "X-API-Key: PROJECT_KEY" \
  -d '{
    "events": [
      {"event_type":"invoice.created","template_name":"invoice-created","recipients":[{"channels":["email"],"email":"a@example.com"}],"payload":{"invoice_id":"inv_100"}},
      {"event_type":"invoice.created","template_name":"invoice-created","recipients":[{"channels":["email"],"email":"b@example.com"}],"payload":{"invoice_id":"inv_101"}}
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

- **Auth required:** scoped project API key

#### Query parameters

| Param        | Type     | Description             |
| ------------ | -------- | ----------------------- |
| `page`       | integer  | Page number             |
| `per_page`   | integer  | Page size               |
| `status`     | string   | Event status            |
| `priority`   | string   | `high`, `medium`, `low` |
| `event_type` | string   | Exact event type filter |
| `date_from`  | datetime | Lower bound             |
| `date_to`    | datetime | Upper bound             |

```bash
curl -X GET "https://beaco.michaelogunjimi.com/api/v1/events?page=1&per_page=2&priority=high" \
  -H "X-API-Key: PROJECT_KEY"
```

```json
{
  "items": [
    {
      "id": "3d434cf3-2f63-4a82-aae4-fbead6877445",
      "event_type": "order.shipped",
      "priority": "high",
      "status": "processing",
      "created_at": "2026-04-17T12:15:32Z"
    },
    {
      "id": "8dc13b38-19cc-40ef-9f85-8d3f402024f1",
      "event_type": "password.reset",
      "priority": "high",
      "status": "completed",
      "created_at": "2026-04-17T11:49:02Z"
    }
  ],
  "total": 42,
  "page": 1,
  "per_page": 2,
  "total_pages": 21
}
```

### `GET /events/{id}`

Get event details with related notifications.

- **Auth required:** scoped project API key

```bash
curl -X GET https://beaco.michaelogunjimi.com/api/v1/events/3d434cf3-2f63-4a82-aae4-fbead6877445 \
  -H "X-API-Key: PROJECT_KEY"
```

```json
{
  "id": "3d434cf3-2f63-4a82-aae4-fbead6877445",
  "event_type": "order.shipped",
  "status": "processing",
  "priority": "high",
  "payload": { "order_id": "ord_991" },
  "notifications": [
    { "id": "f8ce0a5f-9d95-4483-95d7-bda38ab718e8", "channel": "email", "status": "delivered" },
    { "id": "5f2b7371-c2d2-464b-ac53-89b683b80f68", "channel": "sms", "status": "processing" }
  ]
}
```

## Notifications

### `GET /notifications`

List notifications.

- **Auth required:** scoped project API key

#### Query parameters

| Param       | Type     | Description               |
| ----------- | -------- | ------------------------- |
| `page`      | integer  | Page number               |
| `per_page`  | integer  | Page size                 |
| `status`    | string   | Notification status       |
| `channel`   | string   | `email`, `sms`, `webhook` |
| `date_from` | datetime | Lower bound               |
| `date_to`   | datetime | Upper bound               |
| `recipient` | string   | Recipient filter          |

```bash
curl -X GET "https://beaco.michaelogunjimi.com/api/v1/notifications?channel=email&status=delivered" \
  -H "X-API-Key: PROJECT_KEY"
```

```json
{
  "items": [
    {
      "id": "f8ce0a5f-9d95-4483-95d7-bda38ab718e8",
      "event_id": "3d434cf3-2f63-4a82-aae4-fbead6877445",
      "channel": "email",
      "status": "delivered",
      "recipient": "alex@example.com",
      "retry_count": 0
    }
  ],
  "total": 1,
  "page": 1,
  "per_page": 25,
  "total_pages": 1
}
```

### `GET /notifications/{id}`

Get notification detail with attempt logs.

- **Auth required:** scoped project API key

```bash
curl -X GET https://beaco.michaelogunjimi.com/api/v1/notifications/f8ce0a5f-9d95-4483-95d7-bda38ab718e8 \
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
    { "attempt": 1, "status": "processing", "timestamp": "2026-04-17T12:15:34Z" },
    {
      "attempt": 1,
      "status": "delivered",
      "provider_response": { "message_id": "re_2SgB..." },
      "timestamp": "2026-04-17T12:15:36Z"
    }
  ]
}
```

## Templates

See [Templates](/templates).

### `GET /templates`

List templates.

- **Auth required:** scoped project API key

#### Query parameters

| Param      | Type    | Description       |
| ---------- | ------- | ----------------- |
| `page`     | integer | Page number       |
| `per_page` | integer | Page size         |
| `channel`  | string  | Filter by channel |

```bash
curl -X GET "https://beaco.michaelogunjimi.com/api/v1/templates?channel=email" \
  -H "X-API-Key: PROJECT_KEY"
```

```json
{
  "items": [
    {
      "id": "799524b8-fdc7-4f56-8a07-3b00bbc377af",
      "name": "order_shipped_email",
      "channel": "email",
      "subject": "Your order {{ order_id }} has shipped",
      "variables": ["order_id", "tracking_number"]
    }
  ],
  "total": 1,
  "page": 1,
  "per_page": 25,
  "total_pages": 1
}
```

### `POST /templates`

Create template.

- **Auth required:** scoped project API key

#### Request body

| Field                 | Type   | Required | Description                        |
| --------------------- | ------ | -------- | ---------------------------------- |
| `name`                | string | Yes      | Template name                      |
| `channel`             | string | Yes      | `email`, `sms`, `webhook`          |
| `subject`             | string | No       | Plain-text email subject           |
| `body`                | string | Yes      | Template body / email HTML         |
| `text_body`           | string | No       | Plain-text email alternative       |
| `from_local`          | string | No       | Email sender name before the `@`   |
| `from_name`           | string | No       | Email sender display name          |
| `reply_to`            | string | No       | Email Reply-To address             |
| `variables`           | array  | No       | Must match auto-detected variables |
| `on_missing_variable` | enum   | No       | `error` (default) or `blank`       |

```bash
curl -X POST https://beaco.michaelogunjimi.com/api/v1/templates \
  -H "Content-Type: application/json" \
  -H "X-API-Key: PROJECT_KEY" \
  -d '{"name":"order_shipped_email","channel":"email","subject":"Order {{ order_id }} is on the way","body":"Hi {{ customer_name }}, track: {{ tracking_number }}","variables":["order_id","customer_name","tracking_number"]}'
```

```json
{
  "id": "799524b8-fdc7-4f56-8a07-3b00bbc377af",
  "name": "order_shipped_email",
  "channel": "email",
  "detected_variables": ["customer_name", "order_id", "tracking_number"],
  "created_at": "2026-04-17T12:35:00Z"
}
```

### `PUT /templates/by-name/{name}`

Create or update an active project template by name. Pass `channel` as a query parameter; it
defaults to `email`. This endpoint is safe to call on every deployment.

### `POST /templates/import`

Create an email template from plain HTML and sample values. Samples must appear exactly once in an
HTML text node; attribute or duplicate matches return `422` instead of being guessed.

```json
{
  "name": "order-confirmed",
  "subject": "Your order is confirmed",
  "html": "<h1>Thanks, Chidi</h1>",
  "variables": { "customer_name": "Chidi" }
}
```

### `GET /templates/{id}`

Get template by id.

- **Auth required:** scoped project API key

```bash
curl -X GET https://beaco.michaelogunjimi.com/api/v1/templates/799524b8-fdc7-4f56-8a07-3b00bbc377af \
  -H "X-API-Key: PROJECT_KEY"
```

```json
{
  "id": "799524b8-fdc7-4f56-8a07-3b00bbc377af",
  "name": "order_shipped_email",
  "channel": "email",
  "subject": "Order {{ order_id }} is on the way",
  "body": "Hi {{ customer_name }}, track: {{ tracking_number }}",
  "variables": ["order_id", "customer_name", "tracking_number"]
}
```

### `PUT /templates/{id}`

Update template (partial payload allowed).

- **Auth required:** scoped project API key

#### Request body

| Field       | Type   | Description           |
| ----------- | ------ | --------------------- |
| `name`      | string | Updated name          |
| `subject`   | string | Updated subject       |
| `body`      | string | Updated body          |
| `variables` | array  | Updated variable list |

```bash
curl -X PUT https://beaco.michaelogunjimi.com/api/v1/templates/799524b8-fdc7-4f56-8a07-3b00bbc377af \
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

- **Auth required:** scoped project API key
- **Response:** `204 No Content`

```bash
curl -X DELETE https://beaco.michaelogunjimi.com/api/v1/templates/799524b8-fdc7-4f56-8a07-3b00bbc377af \
  -H "X-API-Key: PROJECT_KEY"
```

### `POST /templates/{id}/preview`

Render template using variables.

- **Auth required:** scoped project API key

#### Request body

| Field       | Type   | Required | Description             |
| ----------- | ------ | -------- | ----------------------- |
| `variables` | object | Yes      | Runtime variable values |

```bash
curl -X POST https://beaco.michaelogunjimi.com/api/v1/templates/799524b8-fdc7-4f56-8a07-3b00bbc377af/preview \
  -H "Content-Type: application/json" \
  -H "X-API-Key: PROJECT_KEY" \
  -d '{"variables":{"order_id":"ord_991","customer_name":"Alex","tracking_number":"1Z123"}}'
```

```json
{
  "subject": "Your order ord_991 has shipped",
  "html": "<p>Hi Alex, your package is now in transit.</p>",
  "text": "Hi Alex, your package is now in transit.",
  "variables_used": ["customer_name", "order_id", "tracking_number"],
  "missing_variables": [],
  "body": "<p>Hi Alex, your package is now in transit.</p>"
}
```

## Scheduled Events

Scheduled events are stored now and turned into regular events when `scheduled_for` arrives. A
scheduler checks every minute, so delivery starts within about a minute of the requested time. If
the platform was unable to dispatch an event for more than an hour after `scheduled_for`, it
becomes `expired` and is **not** sent.

Lifecycle `status`: `pending` (waiting), `dispatched` (an event was created; `event_id` is set and
you can follow it with `GET /events/{id}`), `cancelled`, `failed` (the content could not be
delivered, for example the template was deleted after scheduling) and `expired`. `processing` is
reserved and not currently used. For `failed` and `expired` events, `failure_reason` says why.

### `POST /scheduled-events`

Schedule future event delivery.

- **Auth required:** scoped project API key (`scheduled_events:write`)
- **Response:** `201 Created`

#### Request body

Takes the same fields as [`POST /events`](#post-events), except `idempotency_key`, plus
`scheduled_for`. Exactly one of `template_id`, `template_name`, or `inline` is required, and
`attachments` follow the same limits (up to 10 files, 30 MB declared in total).

| Field           | Type     | Required     | Description                              |
| --------------- | -------- | ------------ | ---------------------------------------- |
| `event_type`    | string   | Yes          | Event name                               |
| `recipients`    | array    | Yes          | Recipient array                          |
| `scheduled_for` | datetime | Yes          | Future ISO 8601 datetime with a timezone |
| `template_id`   | UUID     | One of three | Template to render                       |
| `template_name` | string   | One of three | Template name to render                  |
| `inline`        | object   | One of three | Already-rendered email content           |
| `attachments`   | array    | No           | Email attachments, see `POST /events`    |
| `payload`       | object   | No           | Event payload                            |
| `metadata`      | object   | No           | Free-form metadata                       |
| `priority`      | string   | No           | `high`, `medium` (default), `low`        |

A request is rejected with `422` when it does not have exactly one content source, a recipient lacks
the contact field for a requested channel, `template_name` does not exist, or the attachments break
the limits. Templates are rendered at dispatch time, so edits made before `scheduled_for` apply.

```bash
curl -X POST https://beaco.michaelogunjimi.com/api/v1/scheduled-events \
  -H "Content-Type: application/json" \
  -H "X-API-Key: PROJECT_KEY" \
  -d '{"event_type":"renewal.reminder","recipients":[{"channels":["email"],"email":"alex@example.com"}],"template_name":"renewal-reminder","payload":{"renewal_date":"2026-04-20"},"scheduled_for":"2026-04-19T09:00:00Z"}'
```

```json
{
  "id": "39ac7bf3-c4f6-4a1f-ab1a-996f1fcf2d5d",
  "api_key_id": "5d0c5f0e-52c1-4b34-9a8e-1f3f4c9e7a10",
  "event_type": "renewal.reminder",
  "scheduled_for": "2026-04-19T09:00:00Z",
  "priority": "medium",
  "status": "pending",
  "event_id": null,
  "failure_reason": null,
  "created_at": "2026-04-18T12:00:00Z",
  "updated_at": "2026-04-18T12:00:00Z"
}
```

### `GET /scheduled-events`

List scheduled events.

- **Auth required:** scoped project API key (`scheduled_events:read`)

#### Query parameters

| Param      | Type    | Description                                                                |
| ---------- | ------- | -------------------------------------------------------------------------- |
| `page`     | integer | Page number                                                                |
| `per_page` | integer | Page size                                                                  |
| `status`   | string  | `pending`, `processing`, `dispatched`, `cancelled`, `failed`, or `expired` |

```bash
curl -X GET "https://beaco.michaelogunjimi.com/api/v1/scheduled-events?status=pending" \
  -H "X-API-Key: PROJECT_KEY"
```

```json
{
  "items": [
    {
      "id": "39ac7bf3-c4f6-4a1f-ab1a-996f1fcf2d5d",
      "api_key_id": "5d0c5f0e-52c1-4b34-9a8e-1f3f4c9e7a10",
      "event_type": "renewal.reminder",
      "scheduled_for": "2026-04-19T09:00:00Z",
      "priority": "medium",
      "status": "pending",
      "event_id": null,
      "failure_reason": null,
      "created_at": "2026-04-18T12:00:00Z",
      "updated_at": "2026-04-18T12:00:00Z"
    }
  ],
  "total": 1,
  "page": 1,
  "per_page": 25,
  "total_pages": 1
}
```

### `DELETE /scheduled-events/{id}`

Cancel scheduled event.

- **Auth required:** scoped project API key (`scheduled_events:write`)
- **Response:** `204 No Content`; cancelling an already cancelled event is a no-op
- **Conflict:** `409` when the event is no longer `pending` (it was dispatched, failed or expired)

```bash
curl -X DELETE https://beaco.michaelogunjimi.com/api/v1/scheduled-events/39ac7bf3-c4f6-4a1f-ab1a-996f1fcf2d5d \
  -H "X-API-Key: PROJECT_KEY"
```

## Suppressions

### `GET /suppressions`

List suppressions.

- **Auth required:** scoped project API key

#### Query parameters

| Param      | Type    | Description    |
| ---------- | ------- | -------------- |
| `page`     | integer | Page number    |
| `per_page` | integer | Page size      |
| `channel`  | string  | Channel filter |

```bash
curl -X GET "https://beaco.michaelogunjimi.com/api/v1/suppressions?channel=email" \
  -H "X-API-Key: PROJECT_KEY"
```

```json
{
  "items": [
    {
      "id": "90763e0e-e417-44a5-b0d4-ec9793fdf52f",
      "channel": "email",
      "recipient": "alex@example.com",
      "reason": "hard_bounce",
      "source": "system"
    }
  ],
  "total": 1,
  "page": 1,
  "per_page": 25,
  "total_pages": 1
}
```

### `POST /suppressions`

Create suppression.

- **Auth required:** scoped project API key

#### Request body

| Field       | Type   | Required | Description                               |
| ----------- | ------ | -------- | ----------------------------------------- |
| `channel`   | enum   | Yes      | `email`, `sms`, `webhook`                 |
| `recipient` | string | Yes      | Recipient address/number/url              |
| `reason`    | enum   | No       | `hard_bounce`, `spam_complaint`, `manual` |
| `source`    | enum   | No       | `system`, `client`                        |

```bash
curl -X POST https://beaco.michaelogunjimi.com/api/v1/suppressions \
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

- **Auth required:** scoped project API key
- **Response:** `204 No Content`

```bash
curl -X DELETE https://beaco.michaelogunjimi.com/api/v1/suppressions/90763e0e-e417-44a5-b0d4-ec9793fdf52f \
  -H "X-API-Key: PROJECT_KEY"
```

## Dead Letter Queue

### `GET /dead-letter`

List dead-letter messages.

- **Auth required:** scoped project API key

#### Query parameters

| Param      | Type    | Description                      |
| ---------- | ------- | -------------------------------- |
| `page`     | integer | Page number                      |
| `per_page` | integer | Page size                        |
| `status`   | string  | `active`, `retried`, `discarded` |
| `channel`  | string  | Channel filter                   |

```bash
curl -X GET "https://beaco.michaelogunjimi.com/api/v1/dead-letter?status=active&channel=sms" \
  -H "X-API-Key: PROJECT_KEY"
```

```json
{
  "items": [
    {
      "id": "588d499e-0f53-4ac4-b7ec-a6ce77861d2e",
      "notification_id": "5f2b7371-c2d2-464b-ac53-89b683b80f68",
      "channel": "sms",
      "status": "active",
      "error_type": "provider_timeout"
    }
  ],
  "total": 1,
  "page": 1,
  "per_page": 25,
  "total_pages": 1
}
```

### `GET /dead-letter/{id}`

Get dead-letter detail.

- **Auth required:** scoped project API key

```bash
curl -X GET https://beaco.michaelogunjimi.com/api/v1/dead-letter/588d499e-0f53-4ac4-b7ec-a6ce77861d2e \
  -H "X-API-Key: PROJECT_KEY"
```

```json
{
  "id": "588d499e-0f53-4ac4-b7ec-a6ce77861d2e",
  "notification_id": "5f2b7371-c2d2-464b-ac53-89b683b80f68",
  "channel": "sms",
  "recipient": "+15551234567",
  "retry_count": 5,
  "status": "active",
  "error_message": "Twilio timeout after 30s"
}
```

### `POST /dead-letter/{id}/retry`

Re-enqueue dead-letter message.

- **Auth required:** scoped project API key

```bash
curl -X POST https://beaco.michaelogunjimi.com/api/v1/dead-letter/588d499e-0f53-4ac4-b7ec-a6ce77861d2e/retry \
  -H "X-API-Key: PROJECT_KEY"
```

```json
{ "id": "588d499e-0f53-4ac4-b7ec-a6ce77861d2e", "status": "retried", "requeued": true }
```

### `POST /dead-letter/{id}/discard`

Acknowledge/discard dead-letter message.

- **Auth required:** scoped project API key

```bash
curl -X POST https://beaco.michaelogunjimi.com/api/v1/dead-letter/588d499e-0f53-4ac4-b7ec-a6ce77861d2e/discard \
  -H "X-API-Key: PROJECT_KEY"
```

```json
{ "id": "588d499e-0f53-4ac4-b7ec-a6ce77861d2e", "status": "discarded" }
```

## Analytics

### `GET /analytics`

Get aggregate delivery metrics.

- **Auth required:** scoped project API key

#### Query parameters

| Param       | Type     | Description |
| ----------- | -------- | ----------- |
| `date_from` | datetime | Range start |
| `date_to`   | datetime | Range end   |

```bash
curl -X GET "https://beaco.michaelogunjimi.com/api/v1/analytics?date_from=2026-04-01T00:00:00Z&date_to=2026-04-17T23:59:59Z" \
  -H "X-API-Key: PROJECT_KEY"
```

```json
{
  "total_events": 1823,
  "total_notifications": 2941,
  "delivery_rate": 0.984,
  "channel_breakdown": {
    "email": { "sent": 1500, "delivered": 1480, "failed": 20 },
    "sms": { "sent": 900, "delivered": 880, "failed": 20 },
    "webhook": { "sent": 541, "delivered": 534, "failed": 7 }
  }
}
```

### `GET /analytics/trends`

Get time-bucketed notification counts.

- **Auth required:** scoped project API key

#### Query parameters

| Param         | Type     | Description     |
| ------------- | -------- | --------------- |
| `date_from`   | datetime | Range start     |
| `date_to`     | datetime | Range end       |
| `granularity` | enum     | `hour` or `day` |

```bash
curl -X GET "https://beaco.michaelogunjimi.com/api/v1/analytics/trends?date_from=2026-04-15T00:00:00Z&date_to=2026-04-17T23:59:59Z&granularity=day" \
  -H "X-API-Key: PROJECT_KEY"
```

```json
{
  "granularity": "day",
  "series": [
    { "bucket": "2026-04-15", "notifications": 870 },
    { "bucket": "2026-04-16", "notifications": 1011 },
    { "bucket": "2026-04-17", "notifications": 1060 }
  ]
}
```

## Audit Log

### `GET /audit-log`

List audit entries.

- **Auth required:** scoped project API key

#### Query parameters

| Param      | Type     | Description              |
| ---------- | -------- | ------------------------ |
| `page`     | integer  | Page number              |
| `per_page` | integer  | Page size                |
| `action`   | string   | Action filter            |
| `from`     | datetime | Inclusive start datetime |

```bash
curl -X GET "https://beaco.michaelogunjimi.com/api/v1/audit-log?action=api_key.created&page=1" \
  -H "X-API-Key: MASTER_KEY"
```

```json
{
  "items": [
    {
      "id": "9484f7f8-2c7e-4f20-9ca8-2ae3d6c7527f",
      "action": "api_key.created",
      "actor_api_key_id": "1f2721ab-9e73-4dfb-b60e-ea0ef8f2dc17",
      "metadata": { "new_key_name": "billing-service" }
    }
  ],
  "total": 1,
  "page": 1,
  "per_page": 25,
  "total_pages": 1
}
```

## Usage

### `GET /usage`

Get API usage per endpoint per hour.

- **Auth required:** scoped project API key

#### Query parameters

| Param      | Type     | Description     |
| ---------- | -------- | --------------- |
| `page`     | integer  | Page number     |
| `per_page` | integer  | Page size       |
| `from`     | datetime | Start           |
| `to`       | datetime | End             |
| `endpoint` | string   | Endpoint filter |

```bash
curl -X GET "https://beaco.michaelogunjimi.com/api/v1/usage?endpoint=/events&from=2026-04-17T00:00:00Z" \
  -H "X-API-Key: PROJECT_KEY"
```

```json
{
  "items": [{ "hour": "2026-04-17T12:00:00Z", "endpoint": "/events", "request_count": 481 }],
  "total": 1,
  "page": 1,
  "per_page": 25,
  "total_pages": 1
}
```

## Settings

Project API keys with `settings:read` can inspect the effective channel configuration and retry policies used by the delivery workers.

- `GET /settings/channels`
- `GET /settings/retry-policies`

API-key creation and rotation are human control-plane operations under `/projects/{project_id}/api-keys`, not settings endpoints.

## Human Control Plane

Bearer-authenticated users manage the resources around notification integrations:

- `/auth/*` — magic-link sessions, refresh, logout, and the current user
- `/oauth/github/*` — GitHub sign-in and account connection
- `/organizations/*` — organizations, members, invitations, usage, and audit history
- `/organizations/{organization_id}/projects` — create and list projects
- `/projects/{project_id}` — inspect, update, or delete a project
- `/projects/{project_id}/api-keys` — create, list, update, rotate, or revoke scoped keys

These endpoints use `Authorization: Bearer TOKEN`. API-key secrets are returned only when created or rotated.

## Platform Administration

`/admin/*` is a separate bearer-authenticated platform control plane. Access is granted through an `AdminUser` record and explicit permissions, not a master API key.

The current surface covers platform health, analytics, usage, audit history, API-key inspection, system accounts and credentials, administrator records, and system templates.

## Health

### `GET /health`

Public health endpoint.

- **Auth required:** No

```bash
curl -X GET https://beaco.michaelogunjimi.com/api/v1/health \
  -H "X-API-Key: YOUR_API_KEY"
```

```json
{ "status": "healthy" }
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
{ "detail": "Invalid or missing API key" }
```

### 403 Forbidden

```json
{ "detail": "Insufficient permissions for this endpoint" }
```

### 404 Not Found

```json
{ "detail": "Resource not found" }
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
