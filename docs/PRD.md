# Product Requirements Document — Event-Driven Notification System

> **Version:** 1.0  
> **Status:** Draft  
> **Last Updated:** 2025-07-17

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Core Backend Features](#2-core-backend-features)
3. [Frontend Features (Dashboard)](#3-frontend-features-dashboard)
4. [API Endpoints](#4-api-endpoints)
5. [Data Models](#5-data-models)
6. [System Architecture](#6-system-architecture)
7. [Non-Functional Requirements](#7-non-functional-requirements)
8. [Project Structure](#8-project-structure)

---

## 1. Project Overview

### What This Is

A production-grade, event-driven notification system that accepts events via a RESTful API, processes them asynchronously through a Celery + Redis task pipeline, and delivers notifications across multiple channels — email, SMS, and webhook — with full retry logic, dead-letter handling, idempotency guarantees, and a real-time monitoring dashboard.

### Who It's For

This is a **portfolio project** designed to demonstrate mastery of distributed systems concepts for Staff/Senior engineer interviews at top-tier technology companies.

### Distributed Systems Concepts Demonstrated

| Concept | Implementation |
|---------|---------------|
| Asynchronous message processing | Celery workers consuming from Redis-backed queues |
| Priority queues | Multiple Celery queues with priority routing |
| At-least-once delivery | Celery `acks_late` with idempotent workers |
| Exactly-once semantics (application level) | Idempotency keys with Redis-backed deduplication |
| Exponential backoff with jitter | Configurable retry policies per notification channel |
| Dead-letter queues | Failed tasks routed to DLQ after max retries exhausted |
| Fan-out pattern | Batch events decomposed into individual notification tasks |
| Rate limiting | Sliding window counters in Redis for API and channel limits |
| Real-time event streaming | WebSocket push for live status updates |
| Horizontal scalability | Stateless workers, independently scalable per channel |
| Graceful degradation | Circuit breakers, health checks, fallback behavior |
| Idempotent operations | Deduplication via client-supplied idempotency keys |

### Why This Stands Out vs. Typical CRUD Apps

- **Async-first architecture** — not a synchronous request/response CRUD app; the core flow is event-driven with observable state transitions.
- **Failure as a first-class concern** — retry policies, dead-letter queues, delivery tracking, and error forensics are central features, not afterthoughts.
- **Operability** — a real-time monitoring dashboard, structured logging, health endpoints, and queue introspection reflect how production systems are actually operated.
- **Scalability story** — each component (API server, workers per channel, database, cache) scales independently with clear bottleneck analysis.

### Tech Stack

| Category | Technology | Purpose |
|----------|-----------|---------|
| API Framework | FastAPI | Async Python web framework with OpenAPI docs |
| Task Queue | Celery | Distributed task processing |
| Message Broker / Cache | Redis | Queue broker, caching, rate limiting, pub/sub |
| Database | PostgreSQL | Primary data store |
| ORM | SQLModel | SQLAlchemy + Pydantic hybrid models |
| Migrations | Alembic | Database schema migrations |
| Email Delivery | Resend | Transactional email via HTTP API |
| SMS Delivery | Twilio | Production SMS delivery |
| Frontend | React 19 + TypeScript | Dashboard SPA |
| Build Tool | Vite | Frontend dev server and bundling |
| CSS | Tailwind CSS v4 | Utility-first styling |
| Containerization | Docker Compose | Multi-service orchestration |
| Package Management | uv | Fast Python package manager and project tool |

### Learning-First Build Approach

This project is designed to be built **incrementally, one concept at a time**. Each phase introduces a new distributed systems concept, so you can understand the "why" before moving to the next layer:

1. **Phase 1: Foundation** — FastAPI + PostgreSQL + SQLModel (synchronous API, basic CRUD)
2. **Phase 2: Async Processing** — Add Celery + Redis (understand why we decouple)
3. **Phase 3: Delivery Channels** — Adapter pattern for Email/SMS/Webhook (pluggable providers)
4. **Phase 4: Reliability** — Retry logic, exponential backoff, dead-letter queues (failure handling)
5. **Phase 5: Correctness** — Idempotency keys (exactly-once semantics)
6. **Phase 6: Protection** — Rate limiting with sliding window counters (system safety)
7. **Phase 7: Observability** — Real-time dashboard with WebSocket updates (monitoring)
8. **Phase 8: Scale** — Docker Compose multi-service orchestration (production readiness)

A companion document (`docs/CONCEPTS.md`) provides deep explanations of every concept with real-world analogies and interview talking points.

---

## 2. Core Backend Features

### 2.1 Event Ingestion API

The primary entry point for external systems. Clients submit notification events that describe _what_ happened and _who_ should be notified.

**Capabilities:**

- RESTful JSON API secured with API key authentication (`X-API-Key` header).
- JSON Schema validation on all incoming payloads using Pydantic v2 models.
- Support for **single event submission** (`POST /api/v1/events/`) and **batch event submission** (`POST /api/v1/events/batch`).
- Request-level rate limiting enforced via sliding window counters in Redis, scoped per API key.
- Idempotency support via the `Idempotency-Key` request header — duplicate submissions return the original cached response.
- Every accepted event returns a unique `event_id` and list of `notification_id`s for downstream tracking.

**Single Event Payload Example:**

```json
{
  "event_type": "order.completed",
  "recipients": [
    {
      "user_id": "usr_abc123",
      "channels": ["email", "sms"],
      "email": "user@example.com",
      "phone": "+15551234567"
    }
  ],
  "priority": "high",
  "template_id": "tmpl_order_complete",
  "payload": {
    "order_id": "ord_789",
    "total": "$149.99",
    "item_count": 3
  },
  "metadata": {
    "source": "order-service",
    "correlation_id": "corr_xyz"
  }
}
```

### 2.2 Message Queue System

All notification delivery is decoupled from the API layer via Celery with Redis as both broker and result backend.

**Queue Topology:**

| Queue Name | Purpose | Default Concurrency |
|------------|---------|---------------------|
| `notifications.high` | High-priority notifications | 8 |
| `notifications.medium` | Default priority | 4 |
| `notifications.low` | Low-priority / batch | 2 |
| `notifications.email` | Email channel tasks | 4 |
| `notifications.sms` | SMS channel tasks | 4 |
| `notifications.webhook` | Webhook channel tasks | 6 |
| `notifications.dlq` | Dead-letter processing | 1 |

**Task Routing:**

- Events are first placed in a priority queue (`high`, `medium`, `low`).
- A dispatcher task dequeues from priority queues and fans out to channel-specific queues.
- Each channel queue is consumed by dedicated workers, enabling independent scaling.

**Configuration:**

- Concurrency is configurable per worker via environment variables.
- `task_acks_late = True` ensures tasks are only acknowledged after successful processing, preventing message loss on worker crash.
- `task_reject_on_worker_lost = True` requeues tasks if a worker is killed unexpectedly.
- Prefetch multiplier is tuned per queue type (lower for slow I/O tasks like email).

### 2.3 Notification Workers

Each delivery channel has a dedicated Celery worker process, isolated for independent scaling and failure containment.

#### Email Worker

- Resend HTTP API adapter for reliable email delivery.
- Pluggable adapter architecture: Resend (primary) with abstract base class for future providers.
- Supports HTML and plain-text email via Jinja2 templates.
- Handles bounce and complaint tracking via Resend webhooks.
- Domain verification support for production sending.

#### SMS Worker

- Pluggable adapter architecture with two implementations:
  - **Twilio adapter** — Production SMS delivery via Twilio REST API.
  - **Mock adapter** — Console + WebSocket logging for development and demos (zero cost).
- Adapter selection via environment variable (`SMS_PROVIDER=twilio|mock`).
- Message segmentation awareness (tracks character count and segment billing).
- Delivery status callback URL registration for async status updates (Twilio).
- Phone number validation using E.164 format enforcement.

#### Webhook Worker

- HTTP POST to arbitrary client-specified URLs.
- Request signing with HMAC-SHA256 (`X-Signature-256` header) so receivers can verify authenticity.
- Configurable connect and read timeouts (defaults: 5s connect, 30s read).
- Full request/response logging: status code, headers, body (truncated), latency.
- Follows redirects up to a configurable maximum (default: 3).

#### Worker Isolation

- Each worker type runs as a separate process/container.
- A slow or failing email provider does not block webhook deliveries.
- Workers can be independently scaled: `docker compose up --scale worker-email=4`.

### 2.4 Retry Logic & Dead-Letter Queue

Failures are expected in distributed systems. The retry subsystem provides configurable, observable recovery with a clear terminal state.

**Retry Strategy:**

- **Algorithm:** Exponential backoff with full jitter.
- **Formula:** `delay = random(0, min(max_backoff, base_delay * 2^attempt))`
- **Defaults:** base delay 10s, max backoff 600s (10 minutes), max retries 5.
- **Per-channel overrides:** Each channel can have its own retry policy (e.g., webhooks may tolerate more retries than SMS).

**Retry Flow:**

1. Worker attempts delivery.
2. On transient failure (network error, 5xx response, timeout):
   - Increment `retry_count` on the notification record.
   - Log a `NotificationLog` entry with error details and timestamp.
   - Schedule retry with computed backoff delay via `self.retry(countdown=delay)`.
3. On permanent failure (4xx response, invalid recipient, authentication error):
   - Immediately move to dead-letter queue — do not retry.
4. On max retries exceeded:
   - Update notification status to `dead_letter`.
   - Create a `DeadLetterMessage` record with full error history.
   - Broadcast status change via WebSocket.

**Dead-Letter Queue (DLQ):**

- DLQ is a PostgreSQL-backed store (not a Redis queue) for durability and queryability.
- Each DLQ entry contains the original event payload, all retry attempt logs, and the terminal error.
- **Manual retry:** Re-enqueue a DLQ message back to the appropriate channel queue.
- **Bulk retry:** Re-enqueue all DLQ messages matching a filter (e.g., all failed webhooks from the last hour).
- **Discard:** Permanently mark a DLQ entry as discarded (soft delete).
- **Inspect:** View full delivery timeline and error forensics for any DLQ entry.

### 2.5 Idempotency

Prevents duplicate notification delivery when clients retry requests due to network failures or timeouts.

**Implementation:**

- Clients include an `Idempotency-Key` header with a unique value (typically a UUID).
- On receiving a request, the API server checks Redis for an existing key.
- **Key exists:** Return the cached response (status code + body) without reprocessing.
- **Key absent:** Process the request, store the response in Redis with a TTL (default: 24 hours), and return the result.
- Redis key format: `idempotency:{api_key}:{idempotency_key}`.
- The stored value includes the HTTP status code and full response body, serialized as JSON.
- TTL is configurable via `IDEMPOTENCY_TTL_SECONDS` environment variable.

**Edge Cases:**

- Concurrent duplicate requests: A Redis `SET NX` (set-if-not-exists) lock is acquired before processing. The second request waits briefly and then returns the cached result.
- Requests with different bodies but the same idempotency key: Return a `422 Unprocessable Entity` error — the key is bound to the original request hash.

### 2.6 Delivery Tracking

Every notification progresses through a defined status lifecycle, with every transition recorded for auditability.

**Status Lifecycle:**

```
pending → queued → processing → delivered
                             → failed → (retry) → processing
                                      → dead_letter
```

| Status | Meaning |
|--------|---------|
| `pending` | Event received, notification record created |
| `queued` | Task enqueued to Celery via Redis |
| `processing` | Worker has picked up the task |
| `delivered` | Upstream provider confirmed delivery |
| `failed` | Delivery attempt failed (may be retried) |
| `dead_letter` | Max retries exhausted, moved to DLQ |

**Tracking Mechanics:**

- Every status change writes a `NotificationLog` entry with: `notification_id`, `previous_status`, `new_status`, `timestamp`, `worker_id`, `error_message` (if applicable), and `metadata` (provider response details).
- Status changes are persisted to PostgreSQL synchronously within the worker task.
- After the database write, a WebSocket message is broadcast to all connected dashboard clients with the notification ID, new status, and timestamp.

### 2.7 Webhook Delivery System

Webhooks allow external systems to receive notification events via HTTP callbacks.

**Request Format:**

```http
POST {webhook_url}
Content-Type: application/json
X-Signature-256: sha256={hmac_hex_digest}
X-Notification-Id: ntf_abc123
X-Timestamp: 1721234567
User-Agent: NotificationSystem/1.0

{
  "event_type": "order.completed",
  "notification_id": "ntf_abc123",
  "delivered_at": "2025-07-17T12:00:00Z",
  "payload": { ... }
}
```

**Signature Verification:**

- Compute HMAC-SHA256 over the raw request body using a shared secret.
- Include the hex digest in the `X-Signature-256` header.
- Recipients verify by recomputing the HMAC and comparing using a constant-time comparison function.
- The webhook secret is configurable per API key / tenant.

**Response Handling:**

- `2xx` → delivery successful.
- `3xx` → follow redirects (up to configured max).
- `4xx` → permanent failure, do not retry (except `429 Too Many Requests` — retry with backoff).
- `5xx` → transient failure, schedule retry.
- Timeout → transient failure, schedule retry.

### 2.8 Rate Limiting

Rate limiting protects both the notification system and downstream providers from overload.

**Two Levels of Rate Limiting:**

1. **API Rate Limiting** (inbound):
   - Enforced at the FastAPI middleware layer.
   - Sliding window counter per API key, stored in Redis.
   - Default: 1000 requests/minute per API key (configurable).
   - Returns `429 Too Many Requests` with `Retry-After` header when exceeded.

2. **Channel Rate Limiting** (outbound):
   - Enforced within each Celery worker before delivery attempt.
   - Prevents exceeding provider limits (e.g., Resend: rate limits per plan, Twilio: 1 SMS/second per number).
   - When a channel rate limit is hit, the task is re-enqueued with a short delay rather than counted as a failure.
   - Limits are configurable per channel in the `ChannelConfig` database model.

**Sliding Window Algorithm:**

- Uses Redis sorted sets.
- Each request adds a member with the current timestamp as the score.
- Before processing, the window is trimmed (remove entries older than the window size).
- The count of remaining members is compared against the limit.
- Atomic via Redis Lua script to prevent race conditions.

### 2.9 Template System

Notification templates provide reusable, parameterized message content per channel.

**Capabilities:**

- Templates stored in PostgreSQL, managed via CRUD API and dashboard UI.
- Jinja2 rendering engine with sandboxed execution (no file system access, restricted builtins).
- Each template is scoped to a channel: `email` templates produce HTML, `sms` templates produce plain text, `webhook` templates produce JSON payloads.
- Variable validation: templates declare required variables, and the system validates that the event payload supplies all of them before enqueuing.
- Version history: templates are soft-updated, and the previous version is retained for audit purposes.

**Email Template Example:**

```html
<h1>Order Confirmed</h1>
<p>Hi {{ recipient_name }},</p>
<p>Your order <strong>#{{ order_id }}</strong> totaling {{ total }} has shipped.</p>
```

**SMS Template Example:**

```
Your order #{{ order_id }} ({{ total }}) has shipped. Track at {{ tracking_url }}
```

### 2.10 Batch Processing

Enables sending notifications to multiple recipients in a single API call.

**Flow:**

1. Client submits a batch event with N recipients.
2. API server validates the entire batch, creates an `Event` record, and generates N `Notification` records.
3. Each notification is enqueued as an independent Celery task (fan-out).
4. Batch status is queryable: returns aggregate counts by status (`delivered: 45, failed: 3, pending: 2`).
5. Individual notification status is independently trackable.

**Batch Payload Example:**

```json
{
  "event_type": "marketing.campaign",
  "recipients": [
    { "user_id": "u1", "channels": ["email"], "email": "a@example.com" },
    { "user_id": "u2", "channels": ["email", "sms"], "email": "b@example.com", "phone": "+15559876543" },
    { "user_id": "u3", "channels": ["webhook"], "webhook_url": "https://hooks.example.com/n" }
  ],
  "priority": "low",
  "template_id": "tmpl_campaign_july",
  "payload": { "campaign_name": "Summer Sale", "discount": "20%" }
}
```

This produces 4 notification tasks: 2 email, 1 SMS, 1 webhook.

**Limits:**

- Maximum 1000 recipients per batch request (configurable).
- Batch requests count as a single API rate-limit hit but fan-out respects channel rate limits.

---

## 3. Frontend Features (Dashboard)

The dashboard is a Vite + React 19 + TypeScript single-page application styled with Tailwind CSS v4. It connects to the backend via REST API and a persistent WebSocket for real-time updates.

### 3.1 `/` — Dashboard Overview

The landing page provides an at-a-glance operational summary.

**Features:**

- **Metric Cards:** Total notifications sent (24h), delivery success rate (%), failure rate (%), average delivery latency (ms). Each card shows a delta vs. the previous 24h period.
- **Real-time Activity Feed:** A live-updating list showing notifications as they flow through the system. Each entry shows: notification ID (truncated), channel icon, status badge, recipient (masked), and timestamp. New entries appear at the top with a subtle animation.
- **Queue Depth Sparkline Charts:** Small inline charts showing the current depth of each channel queue over the last 30 minutes. Updates every 5 seconds.
- **System Health Indicators:** Green/yellow/red status dots for: API server, Redis, PostgreSQL, each worker type. Derived from the `/api/v1/health/` endpoint, polled every 15 seconds.

### 3.2 `/notifications` — Notification History

A comprehensive, searchable log of all notifications.

**Features:**

- **Searchable Table:** Columns: ID, event type, channel, recipient, status, created at, delivered at, latency. Sortable by any column.
- **Filters:** Status (multi-select), channel (multi-select), date range (date picker), recipient (text search), event type (dropdown).
- **Expandable Rows:** Click a row to expand and see the full delivery timeline: every `NotificationLog` entry with status, timestamp, worker ID, and error message. Visual timeline representation.
- **Pagination:** Server-side pagination with configurable page size (25, 50, 100).
- **Bulk Actions:** Select multiple notifications and retry (if failed) or export as CSV.

### 3.3 `/queues` — Queue Monitor

Real-time visibility into queue health and worker activity.

**Features:**

- **Queue Depth Charts:** Line chart per channel queue showing depth over time (last 1h, 6h, 24h). Updates in real-time via WebSocket.
- **Active Workers:** Table showing each connected worker: ID, channel, status (idle/busy), current task, uptime, tasks completed.
- **Processing Rate:** Notifications processed per second, displayed as a real-time counter and a line chart.
- **Task Distribution:** Stacked bar chart showing task count per channel per hour.

### 3.4 `/dead-letter` — Dead Letter Queue

Management interface for failed notifications.

**Features:**

- **DLQ Table:** Columns: ID, original notification ID, channel, recipient, failure reason, retry count, failed at.
- **Error Details Panel:** Click a row to see the full error history: each retry attempt with timestamp, error type, error message, and response details (for webhooks).
- **Actions:**
  - **Retry Single:** Re-enqueue one DLQ entry back to its channel queue.
  - **Retry All / Retry Filtered:** Re-enqueue all visible (filtered) DLQ entries.
  - **Discard:** Soft-delete a DLQ entry (mark as discarded).
- **Filters:** Channel, error type, date range, status (active/discarded).

### 3.5 `/analytics` — Analytics

Historical analysis of notification system performance.

**Features:**

- **Delivery Success Rate:** Line chart showing percentage of successful deliveries over time (hourly, daily, weekly granularity).
- **Latency Percentiles:** Line chart showing p50, p95, p99 delivery latency over time, with selectable time range.
- **Channel Breakdown:** Donut chart showing notification volume per channel.
- **Failure Reasons:** Horizontal bar chart showing top failure reasons ranked by frequency.
- **Date Range Selector:** Global date range control affecting all charts on the page.
- **Export:** Download chart data as CSV.

### 3.6 `/templates` — Template Manager

CRUD interface for managing notification templates.

**Features:**

- **Template List:** Table of all templates: name, channel, last modified, status (active/draft).
- **Template Editor:**
  - Code editor with Jinja2 syntax highlighting.
  - Split pane: code on the left, rendered preview on the right.
  - Variable declaration and validation — declare required variables and provide sample values for preview.
  - Channel-specific rendering: email shows HTML preview, SMS shows character count, webhook shows formatted JSON.
- **Create / Edit / Delete:** Full CRUD with confirmation dialogs for destructive actions.
- **Version History:** View previous versions of a template with diff view.

### 3.7 `/settings` — Settings

System configuration management.

**Features:**

- **API Key Management:**
  - Create new API keys with name, description, and optional rate limit override.
  - List all API keys with creation date, last used date, and status.
  - Revoke (soft-delete) API keys.
  - Copy key to clipboard (shown only once on creation).
- **Channel Configuration:**
  - Email: Resend API key (masked), from address, domain verification status.
  - SMS: Twilio account SID, auth token (masked), from number.
  - Webhook: Default timeout, max redirects, default signing secret.
- **Retry Policy Configuration:**
  - Per-channel settings: max retries, base delay, max backoff, jitter toggle.
  - Visual preview of retry schedule.
- **Rate Limit Configuration:**
  - Per-API-key limits: requests per minute.
  - Per-channel limits: max sends per minute.

### 3.8 `/playground` — Event Playground

Interactive tool for testing the notification system end-to-end.

**Features:**

- **Request Builder:** JSON editor with schema validation. Pre-built example payloads selectable from a dropdown (order confirmation, password reset, webhook test, batch send).
- **Send & Observe:** Click "Send" to submit the event via the API. The response (event ID, notification IDs) is displayed immediately.
- **Live Flow Visualization:** After sending, a real-time panel shows the notification's journey: `pending → queued → processing → delivered/failed`. Updates arrive via WebSocket. Visual state machine diagram with animated transitions.
- **Request/Response Inspector:** Tabs showing the raw HTTP request (method, headers, body) and response (status, headers, body).
- **History:** Previous playground requests are saved in local storage for quick replay.

---

## 4. API Endpoints

All endpoints are prefixed with `/api/v1`. Authentication is via `X-API-Key` header unless noted otherwise.

### Events API

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/events/` | Submit a single notification event |
| `POST` | `/api/v1/events/batch` | Submit a batch of notification events (multiple recipients) |
| `GET` | `/api/v1/events/{event_id}` | Get event details and associated notification statuses |
| `GET` | `/api/v1/events/` | List events with pagination and filters |

**`POST /api/v1/events/`**

```
Request Headers:
  X-API-Key: <api_key>
  Idempotency-Key: <uuid>  (optional)
  Content-Type: application/json

Request Body:
  {
    "event_type": string (required),
    "recipients": [
      {
        "user_id": string (required),
        "channels": ["email" | "sms" | "webhook"] (required),
        "email": string (conditional — required if channel is email),
        "phone": string (conditional — required if channel is sms),
        "webhook_url": string (conditional — required if channel is webhook),
        "webhook_secret": string (optional)
      }
    ],
    "priority": "high" | "medium" | "low" (default: "medium"),
    "template_id": string (optional — if omitted, payload.body is used directly),
    "payload": object (required — template variables or direct content),
    "metadata": object (optional — passthrough metadata)
  }

Response 202 Accepted:
  {
    "event_id": string,
    "notification_ids": [string],
    "status": "accepted",
    "created_at": ISO8601 datetime
  }
```

**`POST /api/v1/events/batch`**

Same schema as single event but `recipients` can contain up to 1000 entries. Response includes a `batch_id` for aggregate status tracking.

```
Response 202 Accepted:
  {
    "event_id": string,
    "batch_id": string,
    "notification_count": integer,
    "notification_ids": [string],
    "status": "accepted",
    "created_at": ISO8601 datetime
  }
```

**`GET /api/v1/events/{event_id}`**

```
Response 200:
  {
    "event_id": string,
    "event_type": string,
    "priority": string,
    "status": "accepted" | "processing" | "completed" | "partial_failure",
    "notification_summary": {
      "total": integer,
      "delivered": integer,
      "failed": integer,
      "pending": integer,
      "dead_letter": integer
    },
    "notifications": [ ... ],
    "created_at": ISO8601 datetime,
    "metadata": object
  }
```

**`GET /api/v1/events/`**

```
Query Parameters:
  page: integer (default: 1)
  page_size: integer (default: 25, max: 100)
  event_type: string (filter)
  status: string (filter)
  created_after: ISO8601 datetime (filter)
  created_before: ISO8601 datetime (filter)

Response 200:
  {
    "items": [ ... ],
    "total": integer,
    "page": integer,
    "page_size": integer,
    "pages": integer
  }
```

### Notifications API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/notifications/{notification_id}` | Get notification details with full delivery timeline |
| `GET` | `/api/v1/notifications/` | List notifications with filters and pagination |
| `GET` | `/api/v1/notifications/{notification_id}/logs` | Get status change log for a notification |
| `POST` | `/api/v1/notifications/{notification_id}/retry` | Manually retry a failed notification |
| `POST` | `/api/v1/notifications/{notification_id}/cancel` | Cancel a pending/queued notification |

**`GET /api/v1/notifications/{notification_id}`**

```
Response 200:
  {
    "notification_id": string,
    "event_id": string,
    "channel": "email" | "sms" | "webhook",
    "recipient": {
      "user_id": string,
      "address": string (email/phone/url — partially masked)
    },
    "status": string,
    "priority": string,
    "retry_count": integer,
    "max_retries": integer,
    "created_at": ISO8601 datetime,
    "queued_at": ISO8601 datetime | null,
    "processing_started_at": ISO8601 datetime | null,
    "delivered_at": ISO8601 datetime | null,
    "failed_at": ISO8601 datetime | null,
    "latency_ms": integer | null,
    "provider_response": object | null,
    "logs": [ ... ]
  }
```

**`GET /api/v1/notifications/`**

```
Query Parameters:
  page: integer (default: 1)
  page_size: integer (default: 25, max: 100)
  status: string (filter, comma-separated for multiple)
  channel: string (filter, comma-separated)
  event_type: string (filter)
  recipient: string (search)
  created_after: ISO8601 datetime
  created_before: ISO8601 datetime
  sort_by: string (default: "created_at")
  sort_order: "asc" | "desc" (default: "desc")

Response 200:
  {
    "items": [ ... ],
    "total": integer,
    "page": integer,
    "page_size": integer,
    "pages": integer
  }
```

### Templates API

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/templates/` | Create a new notification template |
| `GET` | `/api/v1/templates/` | List all templates with pagination |
| `GET` | `/api/v1/templates/{template_id}` | Get template details |
| `PUT` | `/api/v1/templates/{template_id}` | Update a template |
| `DELETE` | `/api/v1/templates/{template_id}` | Soft-delete a template |
| `POST` | `/api/v1/templates/{template_id}/preview` | Render a template with sample data |
| `GET` | `/api/v1/templates/{template_id}/versions` | List version history |

**`POST /api/v1/templates/`**

```
Request Body:
  {
    "name": string (required),
    "channel": "email" | "sms" | "webhook" (required),
    "subject": string (required for email, ignored for other channels),
    "body": string (required — Jinja2 template content),
    "variables": [
      {
        "name": string,
        "type": "string" | "number" | "boolean",
        "required": boolean,
        "default": any | null
      }
    ],
    "metadata": object (optional)
  }

Response 201 Created:
  {
    "template_id": string,
    "name": string,
    "channel": string,
    "version": integer,
    "created_at": ISO8601 datetime
  }
```

**`POST /api/v1/templates/{template_id}/preview`**

```
Request Body:
  {
    "variables": { "order_id": "ORD-123", "total": "$49.99" }
  }

Response 200:
  {
    "rendered_subject": string | null,
    "rendered_body": string,
    "character_count": integer (for SMS),
    "sms_segments": integer (for SMS)
  }
```

### Dead Letter API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/dead-letter/` | List dead-letter messages with filters |
| `GET` | `/api/v1/dead-letter/{dlq_id}` | Get DLQ entry details with full error history |
| `POST` | `/api/v1/dead-letter/{dlq_id}/retry` | Re-enqueue a single DLQ message |
| `POST` | `/api/v1/dead-letter/retry-batch` | Re-enqueue multiple DLQ messages |
| `DELETE` | `/api/v1/dead-letter/{dlq_id}` | Discard (soft-delete) a DLQ entry |
| `GET` | `/api/v1/dead-letter/stats` | Get DLQ aggregate statistics |

**`GET /api/v1/dead-letter/`**

```
Query Parameters:
  page: integer (default: 1)
  page_size: integer (default: 25, max: 100)
  channel: string (filter)
  error_type: string (filter)
  created_after: ISO8601 datetime
  created_before: ISO8601 datetime
  status: "active" | "discarded" (default: "active")

Response 200:
  {
    "items": [
      {
        "dlq_id": string,
        "notification_id": string,
        "channel": string,
        "recipient": string (masked),
        "error_type": string,
        "error_message": string,
        "retry_count": integer,
        "original_event": object,
        "failed_at": ISO8601 datetime,
        "retry_history": [ ... ]
      }
    ],
    "total": integer,
    "page": integer,
    "page_size": integer,
    "pages": integer
  }
```

**`POST /api/v1/dead-letter/retry-batch`**

```
Request Body:
  {
    "dlq_ids": [string] (optional — if omitted, retries all matching filter),
    "filter": {
      "channel": string (optional),
      "error_type": string (optional),
      "created_after": ISO8601 datetime (optional),
      "created_before": ISO8601 datetime (optional)
    }
  }

Response 202 Accepted:
  {
    "retried_count": integer,
    "notification_ids": [string]
  }
```

### Analytics API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/analytics/overview` | Get aggregate metrics for a time range |
| `GET` | `/api/v1/analytics/delivery-rate` | Delivery success rate time series |
| `GET` | `/api/v1/analytics/latency` | Latency percentiles time series |
| `GET` | `/api/v1/analytics/channel-breakdown` | Volume breakdown by channel |
| `GET` | `/api/v1/analytics/failure-reasons` | Top failure reasons ranked by frequency |
| `GET` | `/api/v1/analytics/throughput` | Processing throughput time series |

**`GET /api/v1/analytics/overview`**

```
Query Parameters:
  period: "1h" | "6h" | "24h" | "7d" | "30d" (default: "24h")

Response 200:
  {
    "period": string,
    "total_sent": integer,
    "total_delivered": integer,
    "total_failed": integer,
    "delivery_rate": float,
    "avg_latency_ms": float,
    "p50_latency_ms": float,
    "p95_latency_ms": float,
    "p99_latency_ms": float,
    "active_dlq_count": integer,
    "by_channel": {
      "email": { "sent": int, "delivered": int, "failed": int },
      "sms": { "sent": int, "delivered": int, "failed": int },
      "webhook": { "sent": int, "delivered": int, "failed": int }
    }
  }
```

**`GET /api/v1/analytics/delivery-rate`**

```
Query Parameters:
  start: ISO8601 datetime (required)
  end: ISO8601 datetime (required)
  granularity: "minute" | "hour" | "day" (default: "hour")
  channel: string (optional filter)

Response 200:
  {
    "data_points": [
      {
        "timestamp": ISO8601 datetime,
        "total": integer,
        "delivered": integer,
        "failed": integer,
        "rate": float
      }
    ]
  }
```

### Settings API

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/settings/api-keys` | Create a new API key |
| `GET` | `/api/v1/settings/api-keys` | List all API keys |
| `DELETE` | `/api/v1/settings/api-keys/{key_id}` | Revoke an API key |
| `GET` | `/api/v1/settings/channels` | Get all channel configurations |
| `PUT` | `/api/v1/settings/channels/{channel}` | Update channel configuration |
| `GET` | `/api/v1/settings/retry-policies` | Get retry policies per channel |
| `PUT` | `/api/v1/settings/retry-policies/{channel}` | Update retry policy for a channel |
| `GET` | `/api/v1/settings/rate-limits` | Get rate limit configuration |
| `PUT` | `/api/v1/settings/rate-limits` | Update rate limit configuration |

**`POST /api/v1/settings/api-keys`**

```
Request Body:
  {
    "name": string (required),
    "description": string (optional),
    "rate_limit_override": integer | null (requests/minute, null = use default)
  }

Response 201 Created:
  {
    "key_id": string,
    "api_key": string (shown ONLY in this response),
    "name": string,
    "created_at": ISO8601 datetime
  }
```

### Health API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/health/` | Aggregate health check (all dependencies) |
| `GET` | `/api/v1/health/ready` | Readiness probe (is the service ready to accept traffic?) |
| `GET` | `/api/v1/health/live` | Liveness probe (is the process alive?) |

**`GET /api/v1/health/`**

```
Response 200 (healthy) / 503 (degraded):
  {
    "status": "healthy" | "degraded" | "unhealthy",
    "timestamp": ISO8601 datetime,
    "version": string,
    "uptime_seconds": integer,
    "checks": {
      "postgresql": { "status": "up", "latency_ms": 2 },
      "redis": { "status": "up", "latency_ms": 1 },
      "celery_workers": {
        "status": "up",
        "workers": {
          "email": { "active": 2, "status": "up" },
          "sms": { "active": 1, "status": "up" },
          "webhook": { "active": 3, "status": "up" }
        }
      }
    }
  }
```

### WebSocket

| Protocol | Path | Description |
|----------|------|-------------|
| `WS` | `/ws/notifications` | Real-time notification status stream |

**Connection:**

```
ws://localhost:8000/ws/notifications?token={api_key}
```

**Server → Client Messages:**

```json
{
  "type": "notification.status_changed",
  "data": {
    "notification_id": "ntf_abc123",
    "event_id": "evt_xyz789",
    "channel": "email",
    "previous_status": "processing",
    "new_status": "delivered",
    "timestamp": "2025-07-17T12:00:05Z",
    "latency_ms": 1250
  }
}
```

```json
{
  "type": "queue.depth_update",
  "data": {
    "queue": "notifications.email",
    "depth": 42,
    "timestamp": "2025-07-17T12:00:05Z"
  }
}
```

```json
{
  "type": "worker.status_changed",
  "data": {
    "worker_id": "worker-email-01",
    "channel": "email",
    "status": "idle",
    "timestamp": "2025-07-17T12:00:05Z"
  }
}
```

---

## 5. Data Models

All models use `SQLModel` (SQLAlchemy + Pydantic hybrid). UUIDs are used for all primary keys. Timestamps are UTC.

### Event

Represents an incoming notification request from a client.

```
Table: events
─────────────────────────────────────────────────────
Column              Type                 Constraints
─────────────────────────────────────────────────────
id                  UUID                 PK, default=uuid4
event_type          VARCHAR(255)         NOT NULL, indexed
priority            VARCHAR(10)          NOT NULL, default="medium"
                                         CHECK IN ("high","medium","low")
status              VARCHAR(20)          NOT NULL, default="accepted"
                                         CHECK IN ("accepted","processing",
                                         "completed","partial_failure")
template_id         UUID                 FK → templates.id, nullable
payload             JSONB                NOT NULL
metadata            JSONB                nullable
api_key_id          UUID                 FK → api_keys.id, NOT NULL
idempotency_key     VARCHAR(255)         nullable, unique per api_key
                                         (composite unique: api_key_id + idempotency_key)
batch_id            UUID                 nullable, indexed
                                         (set for batch submissions)
recipient_count     INTEGER              NOT NULL, default=1
created_at          TIMESTAMP(tz)        NOT NULL, default=now()
updated_at          TIMESTAMP(tz)        NOT NULL, default=now(), onupdate=now()
─────────────────────────────────────────────────────

Indexes:
  - idx_events_event_type ON (event_type)
  - idx_events_status ON (status)
  - idx_events_created_at ON (created_at DESC)
  - idx_events_api_key_id ON (api_key_id)
  - idx_events_batch_id ON (batch_id)
  - uq_events_idempotency ON (api_key_id, idempotency_key) WHERE idempotency_key IS NOT NULL

Relationships:
  - notifications: Event 1 → N Notification
  - api_key: Event N → 1 ApiKey
  - template: Event N → 1 Template (optional)
```

### Notification

Individual notification instance — one per recipient per channel.

```
Table: notifications
─────────────────────────────────────────────────────
Column                Type                Constraints
─────────────────────────────────────────────────────
id                    UUID                PK, default=uuid4
event_id              UUID                FK → events.id, NOT NULL, indexed
channel               VARCHAR(10)         NOT NULL
                                          CHECK IN ("email","sms","webhook")
status                VARCHAR(20)         NOT NULL, default="pending"
                                          CHECK IN ("pending","queued",
                                          "processing","delivered",
                                          "failed","dead_letter","cancelled")
priority              VARCHAR(10)         NOT NULL, default="medium"
recipient_user_id     VARCHAR(255)        NOT NULL
recipient_address     VARCHAR(500)        NOT NULL
                                          (email address, phone number, or webhook URL)
webhook_secret        VARCHAR(500)        nullable (for webhook channel)
rendered_subject      TEXT                nullable (for email)
rendered_body         TEXT                nullable
retry_count           INTEGER             NOT NULL, default=0
max_retries           INTEGER             NOT NULL, default=5
next_retry_at         TIMESTAMP(tz)       nullable
celery_task_id        VARCHAR(255)        nullable, indexed
provider_response     JSONB               nullable
error_message         TEXT                nullable
created_at            TIMESTAMP(tz)       NOT NULL, default=now()
queued_at             TIMESTAMP(tz)       nullable
processing_started_at TIMESTAMP(tz)       nullable
delivered_at          TIMESTAMP(tz)       nullable
failed_at             TIMESTAMP(tz)       nullable
updated_at            TIMESTAMP(tz)       NOT NULL, default=now(), onupdate=now()
─────────────────────────────────────────────────────

Indexes:
  - idx_notifications_event_id ON (event_id)
  - idx_notifications_status ON (status)
  - idx_notifications_channel ON (channel)
  - idx_notifications_created_at ON (created_at DESC)
  - idx_notifications_celery_task_id ON (celery_task_id)
  - idx_notifications_channel_status ON (channel, status)

Relationships:
  - event: Notification N → 1 Event
  - logs: Notification 1 → N NotificationLog
  - dead_letter_message: Notification 1 → 0..1 DeadLetterMessage
```

### NotificationLog

Immutable audit trail of every status change for a notification.

```
Table: notification_logs
─────────────────────────────────────────────────────
Column              Type                 Constraints
─────────────────────────────────────────────────────
id                  UUID                 PK, default=uuid4
notification_id     UUID                 FK → notifications.id, NOT NULL, indexed
previous_status     VARCHAR(20)          nullable (null for initial creation)
new_status          VARCHAR(20)          NOT NULL
worker_id           VARCHAR(255)         nullable
error_type          VARCHAR(100)         nullable
error_message       TEXT                 nullable
provider_response   JSONB                nullable
metadata            JSONB                nullable
created_at          TIMESTAMP(tz)        NOT NULL, default=now()
─────────────────────────────────────────────────────

Indexes:
  - idx_notification_logs_notification_id ON (notification_id)
  - idx_notification_logs_created_at ON (created_at DESC)

Relationships:
  - notification: NotificationLog N → 1 Notification
```

### DeadLetterMessage

Stores notifications that have exhausted all retry attempts.

```
Table: dead_letter_messages
─────────────────────────────────────────────────────
Column              Type                 Constraints
─────────────────────────────────────────────────────
id                  UUID                 PK, default=uuid4
notification_id     UUID                 FK → notifications.id, NOT NULL, unique
channel             VARCHAR(10)          NOT NULL
recipient_address   VARCHAR(500)         NOT NULL
event_payload       JSONB                NOT NULL (snapshot of original event)
error_type          VARCHAR(100)         NOT NULL
error_message       TEXT                 NOT NULL
retry_count         INTEGER              NOT NULL
retry_history       JSONB                NOT NULL
                                         (array of {attempt, timestamp, error, response})
status              VARCHAR(20)          NOT NULL, default="active"
                                         CHECK IN ("active","retried","discarded")
failed_at           TIMESTAMP(tz)        NOT NULL
retried_at          TIMESTAMP(tz)        nullable
discarded_at        TIMESTAMP(tz)        nullable
created_at          TIMESTAMP(tz)        NOT NULL, default=now()
updated_at          TIMESTAMP(tz)        NOT NULL, default=now(), onupdate=now()
─────────────────────────────────────────────────────

Indexes:
  - idx_dlq_notification_id ON (notification_id)
  - idx_dlq_channel ON (channel)
  - idx_dlq_status ON (status)
  - idx_dlq_failed_at ON (failed_at DESC)

Relationships:
  - notification: DeadLetterMessage 1 → 1 Notification
```

### Template

Jinja2-based notification templates scoped to a channel.

```
Table: templates
─────────────────────────────────────────────────────
Column              Type                 Constraints
─────────────────────────────────────────────────────
id                  UUID                 PK, default=uuid4
name                VARCHAR(255)         NOT NULL
channel             VARCHAR(10)          NOT NULL
                                         CHECK IN ("email","sms","webhook")
subject             VARCHAR(500)         nullable (used for email)
body                TEXT                 NOT NULL (Jinja2 template content)
variables           JSONB                NOT NULL, default=[]
                                         (array of {name, type, required, default})
version             INTEGER              NOT NULL, default=1
is_active           BOOLEAN              NOT NULL, default=true
metadata            JSONB                nullable
created_by          UUID                 FK → api_keys.id, nullable
created_at          TIMESTAMP(tz)        NOT NULL, default=now()
updated_at          TIMESTAMP(tz)        NOT NULL, default=now(), onupdate=now()
─────────────────────────────────────────────────────

Indexes:
  - idx_templates_name ON (name)
  - idx_templates_channel ON (channel)
  - idx_templates_is_active ON (is_active)
  - uq_templates_name_channel ON (name, channel) WHERE is_active = true

Relationships:
  - events: Template 1 → N Event
```

### ApiKey

API authentication keys for clients.

```
Table: api_keys
─────────────────────────────────────────────────────
Column              Type                 Constraints
─────────────────────────────────────────────────────
id                  UUID                 PK, default=uuid4
key_hash            VARCHAR(255)         NOT NULL, unique
                                         (bcrypt hash of the actual key)
key_prefix          VARCHAR(10)          NOT NULL
                                         (first 8 chars of key for identification)
name                VARCHAR(255)         NOT NULL
description         TEXT                 nullable
rate_limit_per_min  INTEGER              nullable (null = use system default)
is_active           BOOLEAN              NOT NULL, default=true
last_used_at        TIMESTAMP(tz)        nullable
created_at          TIMESTAMP(tz)        NOT NULL, default=now()
revoked_at          TIMESTAMP(tz)        nullable
─────────────────────────────────────────────────────

Indexes:
  - idx_api_keys_key_hash ON (key_hash)
  - idx_api_keys_key_prefix ON (key_prefix)
  - idx_api_keys_is_active ON (is_active)

Relationships:
  - events: ApiKey 1 → N Event
```

### RetryPolicy

Configurable retry behavior per notification channel.

```
Table: retry_policies
─────────────────────────────────────────────────────
Column              Type                 Constraints
─────────────────────────────────────────────────────
id                  UUID                 PK, default=uuid4
channel             VARCHAR(10)          NOT NULL, unique
                                         CHECK IN ("email","sms","webhook")
max_retries         INTEGER              NOT NULL, default=5
base_delay_seconds  INTEGER              NOT NULL, default=10
max_backoff_seconds INTEGER              NOT NULL, default=600
jitter_enabled      BOOLEAN              NOT NULL, default=true
retry_on_timeout    BOOLEAN              NOT NULL, default=true
retry_on_5xx        BOOLEAN              NOT NULL, default=true
retry_on_4xx        BOOLEAN              NOT NULL, default=false
created_at          TIMESTAMP(tz)        NOT NULL, default=now()
updated_at          TIMESTAMP(tz)        NOT NULL, default=now(), onupdate=now()
─────────────────────────────────────────────────────
```

### ChannelConfig

Channel-specific configuration (credentials, defaults).

```
Table: channel_configs
─────────────────────────────────────────────────────
Column              Type                 Constraints
─────────────────────────────────────────────────────
id                  UUID                 PK, default=uuid4
channel             VARCHAR(10)          NOT NULL, unique
                                         CHECK IN ("email","sms","webhook")
is_enabled          BOOLEAN              NOT NULL, default=true
rate_limit_per_min  INTEGER              nullable
config              JSONB                NOT NULL
                                         (channel-specific settings, encrypted at rest)
                                         Email: {resend_api_key, from_address,
                                                 domain_verified}
                                         SMS:   {twilio_account_sid, twilio_auth_token,
                                                 from_number}
                                         Webhook: {default_timeout_seconds,
                                                   max_redirects, default_secret}
created_at          TIMESTAMP(tz)        NOT NULL, default=now()
updated_at          TIMESTAMP(tz)        NOT NULL, default=now(), onupdate=now()
─────────────────────────────────────────────────────
```

### Entity Relationship Summary

```
ApiKey 1──N Event 1──N Notification 1──N NotificationLog
                  │                  │
                  │                  └──0..1 DeadLetterMessage
                  │
                  └──0..1 Template

RetryPolicy (per channel, standalone)
ChannelConfig (per channel, standalone)
```

---

## 6. System Architecture

### End-to-End Flow

```
                           ┌─────────────────────────────────────────────┐
                           │              FastAPI Server                 │
Client ──HTTP POST──▶      │  1. Authenticate (X-API-Key)               │
                           │  2. Validate payload (Pydantic)            │
                           │  3. Check idempotency key (Redis)          │
                           │  4. Check rate limit (Redis)               │
                           │  5. Create Event + Notification records    │
                           │  6. Enqueue Celery tasks                   │
                           │  7. Return 202 Accepted                    │
                           └───────────────┬─────────────────────────────┘
                                           │
                                    Celery .delay()
                                           │
                                           ▼
                           ┌─────────────────────────────────────────────┐
                           │             Redis (Broker)                  │
                           │                                             │
                           │  Queue: notifications.high                  │
                           │  Queue: notifications.medium                │
                           │  Queue: notifications.low                   │
                           │  Queue: notifications.email                 │
                           │  Queue: notifications.sms                   │
                           │  Queue: notifications.webhook               │
                           └───────────────┬─────────────────────────────┘
                                           │
                              ┌────────────┼────────────┐
                              ▼            ▼            ▼
                        ┌──────────┐ ┌──────────┐ ┌──────────┐
                        │  Email   │ │   SMS    │ │ Webhook  │
                        │  Worker  │ │  Worker  │ │  Worker  │
                        └────┬─────┘ └────┬─────┘ └────┬─────┘
                             │            │            │
                             ▼            ▼            ▼
                        ┌──────────┐ ┌──────────┐ ┌──────────┐
                        │  Resend  │ │  Twilio  │ │  HTTP    │
                        │   API    │ │   API    │ │  POST    │
                        └──────────┘ └──────────┘ └──────────┘
                              │            │            │
                              └────────────┼────────────┘
                                           │
                                           ▼
                           ┌─────────────────────────────────────────────┐
                           │           PostgreSQL                        │
                           │  - Update notification status               │
                           │  - Write NotificationLog entry              │
                           │  - Write DeadLetterMessage (on max retries) │
                           └───────────────┬─────────────────────────────┘
                                           │
                                    WebSocket broadcast
                                           │
                                           ▼
                           ┌─────────────────────────────────────────────┐
                           │         React Dashboard                     │
                           │  - Real-time status updates                 │
                           │  - Queue depth charts                       │
                           │  - Analytics & DLQ management               │
                           └─────────────────────────────────────────────┘
```

### Priority Queue System

1. When an event is submitted, a **dispatcher task** is enqueued to the appropriate priority queue (`notifications.high`, `notifications.medium`, or `notifications.low`).
2. Priority queues are consumed with weighted prefetch: high-priority workers have a higher prefetch multiplier.
3. The dispatcher task reads the event, renders templates, and fans out individual notification tasks to the appropriate channel queue (`notifications.email`, `notifications.sms`, `notifications.webhook`).
4. Channel workers consume from their respective queues and attempt delivery.

### Retry / DLQ Flow

1. Worker attempts delivery to the external provider.
2. **Success:** Update status to `delivered`, write log, broadcast via WebSocket.
3. **Transient failure:** Increment `retry_count`. If `retry_count < max_retries`, schedule retry with exponential backoff + jitter. Update status to `failed`, write log.
4. **Permanent failure:** Skip retries, move directly to DLQ.
5. **Max retries exceeded:** Update status to `dead_letter`. Create `DeadLetterMessage` with full retry history. Broadcast via WebSocket.

### WebSocket Real-Time Updates

- FastAPI manages WebSocket connections at `/ws/notifications`.
- A connection manager maintains a set of active connections.
- When a worker updates a notification status in PostgreSQL, it publishes a message to a Redis Pub/Sub channel.
- The FastAPI WebSocket handler subscribes to this Redis Pub/Sub channel and forwards messages to all connected clients.
- This decouples workers from WebSocket connections — workers only publish to Redis, they don't manage WebSocket state.

### Rate Limiting Enforcement

- **API layer:** FastAPI middleware intercepts requests, runs the sliding window check in Redis, and returns `429` if the limit is exceeded.
- **Worker layer:** Before each delivery attempt, the worker checks the channel rate limit. If exceeded, the task is re-enqueued with a short delay (`countdown=5`). This does not count as a retry failure.

### Worker Scaling

- Each worker type is a separate Docker Compose service.
- Scale with: `docker compose up --scale worker-email=N`.
- Workers are stateless — they read configuration from the database and environment variables.
- Redis-backed queues ensure tasks are distributed evenly across workers.
- Health check: each worker sends periodic heartbeats to Redis. The health endpoint aggregates these heartbeats to report worker status.

---

## 7. Non-Functional Requirements

### Scalability

- **Horizontal scaling:** API servers, Celery workers (per channel), and Redis read replicas can be independently scaled.
- **Stateless processes:** No in-memory state in API servers or workers; all state is in PostgreSQL or Redis.
- **Database connection pooling:** SQLAlchemy async connection pool with configurable pool size and overflow.
- **Queue backpressure:** Workers use `prefetch_multiplier` to limit in-flight tasks, preventing memory exhaustion.

### Reliability

- **Graceful shutdown:** Workers handle `SIGTERM` by finishing in-flight tasks before exiting (`worker_shutdown` signal handler). Kubernetes/Docker Compose `stop_grace_period: 30s`.
- **At-least-once delivery:** `acks_late=True` ensures tasks are requeued on worker crash.
- **Idempotent workers:** Re-processing a task produces the same result (delivery is deduplicated via provider-side idempotency or notification status check).
- **Health checks:** `/api/v1/health/live` (liveness), `/api/v1/health/ready` (readiness) for container orchestration.

### Observability

- **Structured logging:** JSON-formatted logs with `structlog`. Every log entry includes `request_id`, `notification_id`, `channel`, `worker_id` as context fields.
- **Request tracing:** Correlation ID (`X-Request-ID` header) propagated through the entire pipeline from API → Queue → Worker → Log.
- **Metrics exposed:** Queue depths, delivery counts, error rates, latencies — queryable via the analytics API.

### Security

- **API key hashing:** Keys are bcrypt-hashed before storage; raw keys are only shown once on creation.
- **Webhook HMAC signing:** All webhook requests are signed with HMAC-SHA256 for receiver-side verification.
- **Sensitive config encryption:** Channel credentials (Resend API keys, Twilio tokens) are stored encrypted at rest in the database.
- **Input validation:** All API inputs validated via Pydantic models with strict type enforcement.
- **Rate limiting:** Prevents abuse and protects downstream providers.

### Development & Deployment

- **Docker Compose:** Full local development stack with a single `docker compose up`:
  - `api` — FastAPI server (hot reload via `uvicorn --reload`)
  - `worker-email` — Celery email worker
  - `worker-sms` — Celery SMS worker
  - `worker-webhook` — Celery webhook worker
  - `redis` — Message broker and cache
  - `postgres` — Primary database
  - `frontend` — Vite dev server with HMR
- **Environment-based configuration:** All settings via environment variables (12-factor). `.env.example` provided with all required variables.
- **Database migrations:** Alembic for schema migrations, versioned and tracked in git.
- **Package management:** **uv** for Python dependency management and virtual environment creation (`uv sync` to install, `uv run` to execute).
- **Seed data:** Management command to seed the database with sample API keys, templates, and test events.

### Testing

| Layer | Framework | Target Coverage |
|-------|-----------|-----------------|
| Backend unit tests | pytest | 85%+ |
| Backend integration tests | pytest + testcontainers | Key flows |
| API endpoint tests | pytest + httpx (async) | All endpoints |
| Celery task tests | pytest + celery.contrib.pytest | All task paths |
| Frontend unit tests | Vitest + React Testing Library | 80%+ |
| Frontend component tests | Vitest + React Testing Library | All pages |
| End-to-end tests | Playwright (stretch goal) | Critical paths |

---

## 8. Project Structure

```
notification-system/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                    # FastAPI app factory, lifespan
│   │   ├── config.py                  # Settings via pydantic-settings
│   │   ├── database.py                # SQLModel engine, session factory
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   ├── deps.py                # Dependency injection (auth, db session)
│   │   │   ├── middleware.py          # Rate limiting, request ID, logging
│   │   │   ├── v1/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── router.py          # Aggregate v1 router
│   │   │   │   ├── events.py          # Event ingestion endpoints
│   │   │   │   ├── notifications.py   # Notification query endpoints
│   │   │   │   ├── templates.py       # Template CRUD endpoints
│   │   │   │   ├── dead_letter.py     # DLQ management endpoints
│   │   │   │   ├── analytics.py       # Analytics query endpoints
│   │   │   │   ├── settings.py        # Settings management endpoints
│   │   │   │   └── health.py          # Health check endpoints
│   │   │   └── websocket.py           # WebSocket handler + connection manager
│   │   ├── models/
│   │   │   ├── __init__.py
│   │   │   ├── event.py               # Event SQLModel
│   │   │   ├── notification.py        # Notification SQLModel
│   │   │   ├── notification_log.py    # NotificationLog SQLModel
│   │   │   ├── dead_letter.py         # DeadLetterMessage SQLModel
│   │   │   ├── template.py            # Template SQLModel
│   │   │   ├── api_key.py             # ApiKey SQLModel
│   │   │   ├── retry_policy.py        # RetryPolicy SQLModel
│   │   │   └── channel_config.py      # ChannelConfig SQLModel
│   │   ├── schemas/
│   │   │   ├── __init__.py
│   │   │   ├── events.py              # Pydantic request/response schemas
│   │   │   ├── notifications.py
│   │   │   ├── templates.py
│   │   │   ├── dead_letter.py
│   │   │   ├── analytics.py
│   │   │   ├── settings.py
│   │   │   └── common.py             # Pagination, error responses
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── event_service.py       # Event processing business logic
│   │   │   ├── notification_service.py
│   │   │   ├── template_service.py    # Template rendering (Jinja2)
│   │   │   ├── analytics_service.py
│   │   │   ├── idempotency.py         # Idempotency key management
│   │   │   └── rate_limiter.py        # Sliding window rate limiter
│   │   ├── workers/
│   │   │   ├── __init__.py
│   │   │   ├── celery_app.py          # Celery app configuration
│   │   │   ├── dispatcher.py          # Priority → channel fan-out task
│   │   │   ├── email_worker.py        # Email delivery task
│   │   │   ├── sms_worker.py          # SMS delivery task
│   │   │   ├── webhook_worker.py      # Webhook delivery task
│   │   │   └── base.py               # Base worker with retry logic
│   │   ├── adapters/
│   │   │   ├── __init__.py
│   │   │   ├── email/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── base.py            # Abstract email adapter
│   │   │   │   └── resend_adapter.py   # Resend HTTP API adapter
│   │   │   ├── sms/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── base.py            # Abstract SMS adapter
│   │   │   │   ├── twilio_adapter.py   # Twilio REST API adapter
│   │   │   │   └── mock_adapter.py     # Console/WebSocket mock (for demos)
│   │   │   └── webhook/
│   │   │       ├── __init__.py
│   │   │       └── http.py            # HTTP webhook adapter with HMAC signing
│   │   └── utils/
│   │       ├── __init__.py
│   │       ├── logging.py             # Structured logging setup (structlog)
│   │       ├── crypto.py              # HMAC signing, API key hashing
│   │       └── datetime.py            # UTC timestamp helpers
│   ├── alembic/
│   │   ├── alembic.ini
│   │   ├── env.py
│   │   └── versions/                  # Migration files
│   ├── tests/
│   │   ├── conftest.py                # Fixtures: test DB, Redis, Celery
│   │   ├── test_api/
│   │   │   ├── test_events.py
│   │   │   ├── test_notifications.py
│   │   │   ├── test_templates.py
│   │   │   ├── test_dead_letter.py
│   │   │   ├── test_analytics.py
│   │   │   ├── test_settings.py
│   │   │   └── test_health.py
│   │   ├── test_workers/
│   │   │   ├── test_dispatcher.py
│   │   │   ├── test_email_worker.py
│   │   │   ├── test_sms_worker.py
│   │   │   └── test_webhook_worker.py
│   │   ├── test_services/
│   │   │   ├── test_event_service.py
│   │   │   ├── test_idempotency.py
│   │   │   ├── test_rate_limiter.py
│   │   │   └── test_template_service.py
│   │   └── test_adapters/
│   │       ├── test_resend.py
│   │       ├── test_twilio.py
│   │       ├── test_mock_sms.py
│   │       └── test_webhook.py
│   ├── pyproject.toml                 # Python project config + dependencies (managed by uv)
│   ├── Dockerfile
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── main.tsx                   # Entry point
│   │   ├── App.tsx                    # Router setup
│   │   ├── api/
│   │   │   ├── client.ts             # Axios/fetch wrapper with auth
│   │   │   ├── events.ts             # Event API hooks
│   │   │   ├── notifications.ts      # Notification API hooks
│   │   │   ├── templates.ts          # Template API hooks
│   │   │   ├── deadLetter.ts         # DLQ API hooks
│   │   │   ├── analytics.ts          # Analytics API hooks
│   │   │   └── settings.ts           # Settings API hooks
│   │   ├── hooks/
│   │   │   ├── useWebSocket.ts       # WebSocket connection hook
│   │   │   └── useRealtimeUpdates.ts # Real-time state updates
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Notifications.tsx
│   │   │   ├── Queues.tsx
│   │   │   ├── DeadLetter.tsx
│   │   │   ├── Analytics.tsx
│   │   │   ├── Templates.tsx
│   │   │   ├── Settings.tsx
│   │   │   └── Playground.tsx
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   ├── Header.tsx
│   │   │   │   └── Layout.tsx
│   │   │   ├── dashboard/
│   │   │   │   ├── MetricCard.tsx
│   │   │   │   ├── ActivityFeed.tsx
│   │   │   │   ├── QueueSparkline.tsx
│   │   │   │   └── HealthIndicator.tsx
│   │   │   ├── notifications/
│   │   │   │   ├── NotificationTable.tsx
│   │   │   │   ├── NotificationFilters.tsx
│   │   │   │   └── DeliveryTimeline.tsx
│   │   │   ├── charts/
│   │   │   │   ├── LineChart.tsx
│   │   │   │   ├── DonutChart.tsx
│   │   │   │   ├── BarChart.tsx
│   │   │   │   └── Sparkline.tsx
│   │   │   ├── templates/
│   │   │   │   ├── TemplateEditor.tsx
│   │   │   │   └── TemplatePreview.tsx
│   │   │   └── common/
│   │   │       ├── StatusBadge.tsx
│   │   │       ├── Pagination.tsx
│   │   │       ├── DataTable.tsx
│   │   │       ├── DateRangePicker.tsx
│   │   │       └── JsonEditor.tsx
│   │   ├── stores/                    # Zustand state stores
│   │   │   ├── notificationStore.ts
│   │   │   └── websocketStore.ts
│   │   ├── types/
│   │   │   └── index.ts              # TypeScript type definitions
│   │   └── utils/
│   │       ├── formatters.ts          # Date, number, status formatters
│   │       └── constants.ts           # API URLs, status enums
│   ├── index.html
│   ├── tailwind.config.ts
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── package.json
│   └── Dockerfile
├── docker/
│   ├── api.Dockerfile
│   ├── worker.Dockerfile
│   ├── frontend.Dockerfile
│   └── nginx.conf                     # Reverse proxy for prod
├── docs/
│   ├── PRD.md                         # This document
│   ├── architecture.md                # System architecture deep-dive
│   └── api-examples.http              # HTTP request examples (VS Code REST Client)
├── scripts/
│   ├── seed.py                        # Database seed script
│   └── generate_api_key.py            # CLI tool to generate API keys
├── docker-compose.yml                 # Full development stack
├── docker-compose.prod.yml            # Production overrides
├── .env.example                       # Environment variable template
├── .gitignore
├── Makefile                           # Common commands (make dev, make test, etc. — uses uv)
└── README.md                          # Project overview and setup instructions
```

---

_This PRD serves as the definitive specification for the Event-Driven Notification System. All implementation should reference this document for feature scope, data models, API contracts, and architectural decisions._
