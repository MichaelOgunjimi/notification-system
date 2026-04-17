# Architecture

Beacon is an event-driven Notification-as-a-Service system designed for reliable, asynchronous, multi-channel delivery at project scale.

For endpoint-level details, see [API Reference](/docs/api-reference).

## System Overview

At a high level, Beacon follows this architecture:

**FastAPI (async API layer) → PostgreSQL + Redis → Celery workers → Channel adapters (Resend, Twilio, HTTP webhook)**.

Primary design goals:

- **Async-first ingestion:** clients get fast `202 Accepted` responses while delivery happens in workers.
- **Channel isolation:** email, SMS, and webhook processing are separated by queue and worker pool.
- **Multi-tenant security:** API key scope controls data visibility and write permissions.
- **Operational visibility:** every state transition is persisted and queryable.

## Component Diagram (Text)

Think of Beacon as seven cooperating components.

### 1) API Server (FastAPI)

Responsibilities:

- Accept authenticated API requests.
- Validate payloads and permissions.
- Persist event/notification records.
- Publish Celery tasks to Redis-backed queues.
- Expose read APIs for status, analytics, and operations.

Why it exists:

- Keeps request handling fast and stateless.
- Centralizes auth and schema validation.
- Avoids synchronous dependency on provider latency.

### 2) PostgreSQL

Responsibilities:

- System-of-record for all durable state.
- Stores lifecycle data for events and notifications.
- Stores templates, suppressions, alert rules, API key metadata, audit records, and usage aggregates.

Why it exists:

- Durable relational model with rich indexing and filtering.
- Strong fit for timeline queries, admin reporting, and auditability.

### 3) Redis

Responsibilities:

- Celery message broker.
- Fast lookup cache for idempotency deduplication window.
- Optional short-lived counters and transient operational keys.

Why it exists:

- Low-latency queueing and key/value operations.
- Decouples ingestion from delivery execution.

### 4) Celery Workers

Responsibilities:

- Consume queued notification tasks asynchronously.
- Resolve template content and runtime variables.
- Call channel adapters and record outcomes.
- Execute retry strategy with backoff and dead-letter handoff.

Why it exists:

- Horizontal scaling for throughput.
- Failure containment per queue and per channel.

### 5) Celery Beat (Scheduler)

Responsibilities:

- Periodic dispatch of scheduled events.
- Background maintenance tasks (cleanup, metrics rollups, expired cache cleanup).

Why it exists:

- Keeps periodic orchestration outside request path.

### 6) Channel Adapters

Pluggable delivery integration layer:

- **EmailAdapter** → Resend API
- **SMSAdapter** → Twilio API
- **WebhookAdapter** → outbound HTTP POST

Responsibilities:

- Normalize provider API calls.
- Map provider errors to Beacon status semantics.
- Return structured provider responses for logs and troubleshooting.

Why it exists:

- Isolates third-party API specifics from domain logic.
- Makes provider substitution possible with minimal core changes.

### 7) Frontend (Next.js)

Responsibilities:

- Display events, notifications, dead-letter entries, templates, and system health.
- Provide operational workflows (retry, discard, suppress, key management).

Why it exists:

- Gives operators and developers visibility without requiring direct database access.

## End-to-End Data Flow

This is the full lifecycle of one event.

### 1) Client submits event

Client calls `POST /events` with `X-API-Key`, `event_type`, recipients, payload, and optional template/idempotency values.

### 2) API validates and persists event

FastAPI:

- Authenticates key scope.
- Validates request schema.
- Checks idempotency (if provided).
- Inserts `events` row.

### 3) API fans out notifications in storage

For each `(recipient × channel)` pair, API inserts one `notifications` row with initial status `pending`.

Example:

- 2 recipients × 3 channels = 6 notification records.

### 4) API dispatches tasks to channel queues

Notification tasks are published to Redis/Celery queues based on channel and priority.

### 5) Worker executes task

Worker:

- Pulls message from queue.
- Loads notification + related event/template state.
- Renders template when applicable.
- Invokes adapter (Resend, Twilio, or HTTP webhook).

### 6) Adapter calls provider

Provider response is normalized:

- Success path → provider message ID and metadata.
- Failure path → error type, retryability, provider payload.

### 7) Success updates

On successful delivery:

- `notifications.status` becomes `delivered`.
- Delivery timestamp and provider response are persisted.
- `notification_logs` gets attempt history entry.

### 8) Retry path on transient failure

On retryable failure:

- `retry_count` increments.
- Exponential backoff delay is calculated.
- Task is requeued for next attempt.

### 9) Terminal failure to dead letter

When retries exceed policy:

- `notifications.status` becomes `dead_letter`.
- `dead_letter_messages` row is created.
- Operators can retry/discard later.

## Queue Architecture

Beacon uses Redis as Celery broker with named queues:

- `email`
- `sms`
- `webhook`
- `default`

Priority-aware routing:

- High-priority events are routed first (or to dedicated high-priority queue variant, depending on deployment).
- Medium/low follow normal routing.

Isolation guarantees:

- Email provider incidents do not block SMS/webhook throughput.
- Channel-specific concurrency and scaling can be tuned independently.

Operational implication:

- You can scale workers by bottlenecked channel instead of scaling all workers uniformly.

## Multi-Tenancy Model

Beacon is multi-tenant by API key.

### Project key isolation

- Project keys can only read/write their own events, notifications, templates, and related operational data.
- Query filters are always scoped by owning API key identity.

### Master key capabilities

- Full visibility across projects.
- Access to admin/system endpoints (`/settings/*`, `/admin/*`).
- Key management and cross-project analytics.

### Data sharing rules

- Project data is isolated.
- Shared/global system templates may be visible across projects depending on policy.

> Multi-tenancy is enforced in the API layer and query layer together, not by frontend-only filtering.

## Idempotency Strategy

Beacon provides application-level exactly-once semantics for event creation requests.

### Core mechanism

- Client supplies `idempotency_key`.
- Beacon computes/stores a SHA-256 hash.
- Dedup cache entry is stored in Redis for a defined TTL window.

### Request handling

- First request with key → normal create flow.
- Duplicate request within dedup window → returns original event result without creating new rows/tasks.

### Why Redis + database

- Redis gives low-latency duplicate detection.
- Database record provides durable source-of-truth and replay-safe behavior.

## Database Design

Beacon favors explicit relational modeling with JSONB where payload flexibility is required.

### Core tables

| Table | Purpose |
| --- | --- |
| `api_keys` | Key metadata, scope, active/revoked state |
| `events` | Client-submitted business events |
| `notifications` | Per recipient-channel delivery units |
| `notification_logs` | Per-attempt status transitions and provider outcomes |
| `templates` | Channel templates with variable definitions |
| `dead_letter_messages` | Terminal delivery failures for manual operation |
| `suppressions` | Recipient/channel suppression list |
| `alert_rules` | Configurable monitoring and alert thresholds |
| `audit_log` | Security and admin action history |
| `api_key_usage` | Endpoint usage metrics per key/time bucket |

### Data modeling decisions

- **UUID primary keys** for all major entities.
- **JSONB** for payload/metadata and flexible provider response blobs.
- **Soft deletes for templates** to preserve references and historical reproducibility.
- **Status fields + timestamps** to model lifecycle transitions explicitly.

### Indexing strategy (typical)

- Time-series and filtering indexes (`created_at`, `status`, `channel`, `api_key_id`).
- Foreign key indexes for event-to-notification and notification-to-log joins.
- Optional composite indexes for frequent dashboard queries.

## Reliability and Failure Handling

Beacon treats failure as a core runtime state.

Key practices:

- Retries with exponential backoff.
- Structured delivery attempt logs.
- Dead-letter queue as explicit terminal state.
- Manual replay/discard operations for operator control.

Result:

- Better delivery success under transient failures.
- Better incident diagnosis under persistent failures.

## Security Boundaries

Key security controls:

- Header-based API key authentication (`X-API-Key`).
- Permission checks by key type and endpoint.
- Per-key data scoping for non-admin routes.
- Audit logs for sensitive operations.

Webhook-specific considerations:

- Outbound allowlist and timeout policy can be enforced at adapter/network edge.
- Signature headers can be included for receiver-side verification where configured.

## Scalability Characteristics

Beacon scales by component:

- API servers scale horizontally (stateless).
- Workers scale by queue/channel throughput.
- Redis scales as broker/cache tier.
- PostgreSQL scales vertically first, then with read replicas/partitioning patterns as needed.

This separation keeps read/write APIs responsive during provider disruptions or queue spikes.

## Summary

Beacon’s architecture is intentionally simple in composition but strong in operational behavior:

- Async ingress for low latency.
- Durable state for observability.
- Queue/worker isolation for resilience.
- Adapter boundaries for provider flexibility.
- API key tenancy model for secure multi-project usage.

For integration details, continue to [API Reference](/docs/api-reference) and [Self-Hosting](/docs/self-hosting).
