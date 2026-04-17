# Delivery Pipeline

Beacon delivery is asynchronous, queue-driven, and designed for failure recovery.

This page explains how notifications move from accepted events to delivered (or dead-letter) outcomes.

## Delivery Pipeline Overview

Lifecycle:

1. Event accepted by API.
2. Notifications created (one per recipient × channel).
3. Notifications queued to Redis-backed Celery queues.
4. Channel workers process delivery attempts.
5. Notification status updated after each attempt.

Pipeline summary:

```text
Event accepted
  -> Notification records created
  -> Enqueued to Redis
  -> Celery worker picks task
  -> Channel adapter delivers
  -> Status persisted and observable
```

## Notification Status Model

Notifications move through these statuses:

| Status | Meaning |
| --- | --- |
| `pending` | Created but not yet queued |
| `queued` | Enqueued for worker pickup |
| `processing` | Worker actively attempting delivery |
| `delivered` | Delivery confirmed successful |
| `failed` | Attempt failed (may still retry) |
| `dead_letter` | Retries exhausted; moved to DLQ path |

> Event status is aggregate. Notification status is per delivery unit and should be used for operational detail.

## Async Processing with Celery + Redis

Beacon uses Celery workers with Redis queues for background processing.

Key characteristics:

- API returns quickly after enqueue.
- Worker execution is decoupled from request thread.
- Channel queues isolate provider incidents.

### Queue Isolation by Channel

Each channel has dedicated queue/worker routing:

- email queue -> email worker
- sms queue -> sms worker
- webhook queue -> webhook worker

Isolation benefits:

- one channel outage does not halt others
- per-channel scaling and tuning
- clearer failure blast radius

## Retry Logic

Transient failures are retried automatically.

### Backoff Formula

Beacon uses exponential backoff with jitter:

```text
delay = base_delay × 2^retry_count + jitter
```

Where:

- `base_delay` is configurable per channel
- `retry_count` starts at 0 for first retry
- `jitter` adds random spread to reduce synchronized retries

### Per-Channel Retry Policy Fields

| Field | Description |
| --- | --- |
| `max_retries` | Maximum retry attempts before dead-letter |
| `base_delay_seconds` | Initial retry delay |
| `max_backoff_seconds` | Upper bound for backoff delay |
| `jitter` | Enables random delay variance |

### Retry Decision Rules

Policies can be configured to retry on:

- timeout
- 5xx responses
- 4xx responses

Recommended defaults:

- retry on timeout: enabled
- retry on 5xx: enabled
- retry on 4xx: disabled unless explicitly needed

> Enabling retries for all 4xx errors can create noisy loops for permanent failures (invalid recipient, auth errors).

### Example Retry Timeline

Assume:

- `base_delay_seconds=10`
- `max_retries=4`
- jitter enabled

Possible schedule:

- attempt 1 fails -> retry in ~10s
- attempt 2 fails -> retry in ~20s
- attempt 3 fails -> retry in ~40s
- attempt 4 fails -> retry in ~80s
- final failure -> dead letter

## Dead Letter Queue (DLQ)

If all retries are exhausted, notification enters `dead_letter`.

A DLQ entry is created for operator review and action.

### DLQ Entry Contains

- original notification reference
- terminal error message
- retry/failure details

This data supports root-cause analysis and controlled recovery.

### DLQ Operations

Manual retry:

```text
POST /dead-letter/{id}/retry
```

Discard entry:

```text
POST /dead-letter/{id}/discard
```

### DLQ Statuses

| Status | Meaning |
| --- | --- |
| `active` | Awaiting operator action |
| `retried` | Re-enqueued for another attempt cycle |
| `discarded` | Acknowledged as terminal and intentionally not retried |

### Example: Retry a Dead-Letter Message

```bash
curl -X POST http://localhost:8000/api/v1/dead-letter/dlq_01j4zdh4k2x9m6f2p7r9w3s8ab/retry \
  -H "X-API-Key: YOUR_MASTER_KEY"
```

### Example: Discard a Dead-Letter Message

```bash
curl -X POST http://localhost:8000/api/v1/dead-letter/dlq_01j4zdh4k2x9m6f2p7r9w3s8ab/discard \
  -H "X-API-Key: YOUR_MASTER_KEY"
```

## Suppressions

Suppressions prevent sends to specific recipients.

Typical use cases:

- hard bounce
- spam complaint
- manual compliance action

### Create Suppression

Endpoint:

```text
POST /suppressions
```

Example:

```bash
curl -X POST http://localhost:8000/api/v1/suppressions \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_MASTER_KEY" \
  -d '{
    "channel": "email",
    "recipient": "user@example.com",
    "reason": "hard_bounce"
  }'
```

Suppressed notifications are skipped during delivery attempts.

### Suppression Reasons

| Reason | Description |
| --- | --- |
| `hard_bounce` | Recipient mailbox/number is permanently unreachable |
| `spam_complaint` | Recipient reported unwanted communication |
| `manual` | Explicit operator suppression |

## Idempotency in Delivery Context

Idempotency prevents duplicate processing when producers retry submissions.

How it works:

1. Producer sends event with `idempotency_key`.
2. Beacon stores first successful event response.
3. Duplicate submission with same key returns original event (`200 OK`).
4. No duplicate notifications are created.

This is especially important under network retries and at-least-once transport conditions.

## Observability and Operations

Track delivery using:

- `GET /events/{id}` for event-level state
- `GET /notifications` for delivery-level status
- dashboard at `http://localhost:3001`

Operational checks:

1. monitor queue depth
2. monitor retry volume
3. inspect DLQ growth
4. watch channel-specific failure rates

## Failure Modes and Recommended Actions

| Failure Pattern | Likely Cause | Recommended Action |
| --- | --- | --- |
| Spikes in `failed` for one channel | Provider incident | Reduce send rate, monitor provider status, allow retries |
| DLQ growth over time | Permanent validation/config issues | Inspect DLQ payloads and fix root cause |
| Repeated timeout retries | Network instability | Increase timeout and tune backoff policy |
| High 4xx retry volume | Misconfigured retry rules | Disable retry-on-4xx for permanent error classes |

## End-to-End Example Flow

```bash
# 1) Submit idempotent event
curl -X POST http://localhost:8000/api/v1/events \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_PROJECT_KEY" \
  -d '{
    "event_type":"order.shipped",
    "idempotency_key":"order-shipped-10019-v1",
    "recipients":[{"channels":["email"],"email":"user@example.com"}],
    "payload":{"order_id":"ord_10019"}
  }'

# 2) Inspect notification states
curl -X GET http://localhost:8000/api/v1/notifications \
  -H "X-API-Key: YOUR_PROJECT_KEY"

# 3) Retry dead-letter item if needed
curl -X POST http://localhost:8000/api/v1/dead-letter/DLQ_ID/retry \
  -H "X-API-Key: YOUR_MASTER_KEY"
```

## Best Practices

1. Use idempotency keys for all producer requests.
2. Tune retry policies by channel, not globally.
3. Keep retry-on-4xx disabled unless error classes are known transient.
4. Monitor DLQ and suppression trends as first-class SLO indicators.
5. Use queue isolation to scale bottleneck channels independently.

## Related Docs

- [Introduction](/docs/introduction) for platform architecture overview.
- [Events](/docs/events) for event submission and lifecycle.
- [Channels](/docs/channels) for channel constraints and configuration.
- [Templates](/docs/templates) for render-time content behavior.
- [Quickstart](/docs/quickstart) for local setup and first event.
