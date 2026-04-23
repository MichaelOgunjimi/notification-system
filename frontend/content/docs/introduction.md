# Introduction

Beacon is a notification infrastructure platform. Send events via our REST API and Beacon handles multi-channel delivery.

Instead of building email, SMS, and webhook orchestration inside every service, publish events to Beacon and let us manage fan-out, retries, and status tracking.

Beacon is delivered as a hosted SaaS service.

## What Is Beacon?

Beacon accepts notification events through a REST API and asynchronously delivers notifications across supported channels.

At a high level, Beacon gives you:

- A single ingestion API for all notification use cases.
- Multi-channel delivery (Email, SMS, Webhook).
- Template-based content rendering.
- Queue-backed async processing.
- Durable event and delivery history.
- Delivery reliability features like retries and dead-letter handling.

If your product needs transactional alerts, account lifecycle messages, or machine-to-machine callbacks, Beacon can be your notification control plane.

## Why Teams Use Beacon

Most applications eventually need all of the following:

- A way to notify users when meaningful events happen.
- A way to retry transient failures safely.
- A way to inspect delivery history and failure reasons.
- A way to isolate projects or environments by API key.
- A way to avoid duplicate sends during retries.

Beacon packages those concerns behind one API contract so your product teams can move faster.

## Key Capabilities

### Multi-Channel Delivery

Beacon currently supports:

- Email delivery via Resend.
- SMS delivery via Twilio.
- Outbound webhook delivery to third-party endpoints.

You can send to one channel or many channels from a single event payload.

### Template Engine

Beacon supports reusable templates with Jinja-style variables.

This lets you keep message content and business events separate.

Create a template once, then reuse it across many event submissions.

### Retry Logic

Delivery failures are expected in distributed systems.

Beacon retries failed notifications with configurable backoff.

Retry behavior can be configured per channel.

### Dead-Letter Queue (DLQ)

When retries are exhausted, failed notifications are moved to dead-letter state.

You can inspect root causes and decide whether to retry or discard.

This keeps failure handling explicit and auditable.

### Idempotency

Beacon supports idempotency keys to prevent duplicate event processing.

If the same request is submitted twice with the same key, Beacon returns the original result rather than creating duplicate notifications.

### Real-Time Monitoring

Beacon is designed to be observable, not opaque.

Track events and notifications through lifecycle statuses using API endpoints and the dashboard.

Use these records for troubleshooting, auditing, and delivery analytics.

## How Beacon Works

### 1) You Send an Event

Your service sends a `POST /events` request to:

`https://beacon.michaelogunjimi.com/api/v1`

with:

- `event_type`
- recipient definitions
- payload data
- optional `template_id`
- optional `idempotency_key`

### 2) Beacon Resolves Content and Fan-Out

Beacon validates the request, resolves template content (if provided), and creates notification records.

Each recipient-channel pair becomes one notification.

### 3) Notifications Are Queued

Notifications are queued in Beacon’s delivery pipeline.

Priority and channel routing determine ordering and worker isolation.

### 4) Workers Deliver Asynchronously

Celery workers pick jobs from queues and call channel providers:

- Resend for email
- Twilio for SMS
- HTTP POST for webhooks

Statuses are updated as work progresses.

### 5) You Monitor and Operate

Use the dashboard or API to:

- inspect event and notification status
- review failures and retries
- manage dead-letter operations
- analyze delivery outcomes

## Who Beacon Is For

Beacon is for any application that needs dependable notifications:

- SaaS applications sending user lifecycle and billing messages.
- Internal tools triggering operational alerts.
- Marketplaces coordinating multi-party updates.
- Platforms posting signed webhooks to downstream systems.

If your system emits business events, Beacon provides a consistent way to deliver related notifications.

## Key Differentiators

### Reliability by Default

Beacon treats failure handling as a core feature.

Retries and dead-letter workflows are first-class parts of the product, not bolt-ons.

### Multi-Tenant Isolation

API keys isolate projects and access patterns.

Master and project key scopes make it possible to separate admin operations from regular event publishing.

### Strong Observability

Beacon emphasizes auditability and operator visibility:

- event and notification lifecycles
- usage tracking
- analytics-friendly status history

> Beacon is designed for teams that care about successful delivery **and** fast incident debugging when delivery fails.

## Core Concepts at a Glance

| Concept | What it means in Beacon |
| --- | --- |
| Event | A trigger payload that describes what happened |
| Recipient | A destination definition with one or more channels |
| Notification | A single delivery unit for one recipient-channel pair |
| Template | Reusable content with variable substitution |
| Retry policy | Rules for how failed delivery attempts are retried |
| Dead letter | Terminal failure state after retries are exhausted |
| Idempotency key | Duplicate-prevention token for event creation |

## Minimal Event Example

```bash
curl -X POST https://beacon.michaelogunjimi.com/api/v1/events \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_PROJECT_KEY" \
  -d '{
    "event_type": "account.created",
    "recipients": [{
      "channels": ["email"],
      "email": "user@example.com"
    }],
    "payload": {
      "user_name": "Alice"
    }
  }'
```

Expected behavior:

- API accepts quickly.
- Event is queued for async processing.
- Notification status can be queried immediately.

## What You'll Learn

Continue with:

- [Quickstart](/docs/quickstart) to get an API key and send your first event.
- [Events](/docs/events) to understand payload structure, lifecycle, and idempotency.
- [Channels](/docs/channels) to configure Email, SMS, and Webhook behavior.
- [Templates](/docs/templates) to build reusable content and preview rendered output.
- [Delivery Pipeline](/docs/delivery) to operate retries, DLQ, and suppressions.

## Design Principles

Beacon documentation and APIs follow a few principles:

- Explicit over implicit.
- Async-first workflows with clear status transitions.
- Operational visibility for every message.
- Safe defaults with configurable policies.

These principles make Beacon easier to integrate, operate, and trust in production.

## Next Step

Start with [Quickstart](/docs/quickstart) and send a real event in under five minutes.
