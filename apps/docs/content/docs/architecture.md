# Architecture

Beaco is a hosted, event-driven notification platform built for reliable multi-channel delivery.

For endpoint-level details, see [API Reference](/api-reference).

## System Overview

Beaco’s public API endpoint is:

`https://beaco.michaelogunjimi.com/api/v1`

From there, Beaco handles validation, queuing, delivery, retries, and audit history.

Primary design goals:

- **Fast async ingestion:** clients receive `202 Accepted` quickly.
- **Reliability by default:** retries and dead-letter handling are built in.
- **Channel isolation:** Email, SMS, and Webhook are processed independently.
- **Auditability:** event and notification state transitions are queryable.

## High-Level Flow

```text
Your App -> Beaco API -> Queue -> Delivery Workers -> Providers (Resend, Twilio, Webhook endpoints)
                                   \-> Event + Notification state store
```

## End-to-End Data Flow

### 1) Ingest event

You call `POST /events` with `X-API-Key`, recipients, payload, and optional `template_id` / `idempotency_key`.

### 2) Validate and persist

Beaco validates schema and key scope, enforces idempotency when provided, then stores the event.

### 3) Fan-out notifications

Beaco creates one notification per recipient-channel pair.

### 4) Queue delivery work

Notifications are queued by channel and priority for asynchronous processing.

### 5) Deliver via provider

Workers send through:

- Email → Resend
- SMS → Twilio
- Webhook → outbound HTTP POST

### 6) Update lifecycle state

Beaco stores each status transition (queued, processing, delivered, failed, dead_letter) so clients can query complete history.

## Reliability Model

### Retry logic

Transient failures are retried with exponential backoff and jitter.

### Dead-letter queue

When retry limits are exceeded, notifications enter dead-letter state for operator review and optional replay.

### Idempotency

Client-provided idempotency keys prevent duplicate event creation during request retries.

## Tenancy and Access Model

Beaco separates the human control plane from the notification data plane.

### Organizations and projects

- Users join organizations through memberships with viewer, member, admin, or owner roles.
- Organizations contain projects, which form the operational boundary for integrations.
- Projects own API keys and the events, notifications, templates, suppressions, and observability data created through them.

### Project API keys

- Applications authenticate with `X-API-Key`.
- Each key belongs to one project and has explicit read or write scopes.
- API queries are filtered by the authenticated key so one integration cannot inspect another key's data.

### Human and platform administration

- Human users authenticate with bearer access tokens created through magic-link or GitHub sign-in.
- Organization roles control member, project, invitation, and API-key administration.
- Platform administration uses separately permissioned admin users and system credentials; there is no shared master API key.

> Multi-tenancy is enforced in the API layer and query layer together, not by frontend-only filtering.

## Security Boundaries

Key security controls:

- Bearer authentication and role checks for the human control plane.
- Header-based project API-key authentication (`X-API-Key`) for notification operations.
- Scope checks plus per-key data filtering for project resources.
- Audit logs for sensitive operations.

## Scalability Characteristics

Beaco scales by component:

- API servers scale horizontally (stateless).
- Workers scale by queue/channel throughput.
- Queue and cache tiers scale independently from API.
- Data storage scales independently from delivery workers.

This separation keeps read/write APIs responsive during provider disruptions or queue spikes.

## Summary

Beaco’s architecture is intentionally simple in composition but strong in operational behavior:

- Async ingestion for low latency.
- Queue-based execution for resilience.
- Retry + dead-letter workflows for reliability.
- Organization roles and scoped project API keys for isolation.

For integration details, continue to [API Reference](/api-reference), [Delivery Pipeline](/delivery), and [Webhooks](/webhooks).
