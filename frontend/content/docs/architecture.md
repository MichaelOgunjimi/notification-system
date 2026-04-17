# Architecture

Beacon is a hosted, event-driven notification platform built for reliable multi-channel delivery.

For endpoint-level details, see [API Reference](/docs/api-reference).

## System Overview

Beacon’s public API endpoint is:

`https://beacon.michaelogunjimi.com/api/v1`

From there, Beacon handles validation, queuing, delivery, retries, and audit history.

Primary design goals:

- **Fast async ingestion:** clients receive `202 Accepted` quickly.
- **Reliability by default:** retries and dead-letter handling are built in.
- **Channel isolation:** Email, SMS, and Webhook are processed independently.
- **Auditability:** event and notification state transitions are queryable.

## High-Level Flow

```text
Your App -> Beacon API -> Queue -> Delivery Workers -> Providers (Resend, Twilio, Webhook endpoints)
                                   \-> Event + Notification state store
```

## End-to-End Data Flow

### 1) Ingest event

You call `POST /events` with `X-API-Key`, recipients, payload, and optional `template_id` / `idempotency_key`.

### 2) Validate and persist

Beacon validates schema and key scope, enforces idempotency when provided, then stores the event.

### 3) Fan-out notifications

Beacon creates one notification per recipient-channel pair.

### 4) Queue delivery work

Notifications are queued by channel and priority for asynchronous processing.

### 5) Deliver via provider

Workers send through:

- Email → Resend
- SMS → Twilio
- Webhook → outbound HTTP POST

### 6) Update lifecycle state

Beacon stores each status transition (queued, processing, delivered, failed, dead_letter) so clients can query complete history.

## Reliability Model

### Retry logic

Transient failures are retried with exponential backoff and jitter.

### Dead-letter queue

When retry limits are exceeded, notifications enter dead-letter state for operator review and optional replay.

### Idempotency

Client-provided idempotency keys prevent duplicate event creation during request retries.

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

## Security Boundaries

Key security controls:

- Header-based API key authentication (`X-API-Key`).
- Permission checks by key type and endpoint.
- Per-key data scoping for non-admin routes.
- Audit logs for sensitive operations.

## Scalability Characteristics

Beacon scales by component:

- API servers scale horizontally (stateless).
- Workers scale by queue/channel throughput.
- Queue and cache tiers scale independently from API.
- Data storage scales independently from delivery workers.

This separation keeps read/write APIs responsive during provider disruptions or queue spikes.

## Summary

Beacon’s architecture is intentionally simple in composition but strong in operational behavior:

- Async ingestion for low latency.
- Queue-based execution for resilience.
- Retry + dead-letter workflows for reliability.
- API key tenancy for secure project isolation.

For integration details, continue to [API Reference](/docs/api-reference), [Delivery Pipeline](/docs/delivery), and [Webhooks](/docs/webhooks).
