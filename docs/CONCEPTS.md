# Distributed Systems Concepts Guide

> A companion guide to the Event-Driven Notification System
> For the full implementation spec, see [PRD.md](./PRD.md) and [architecture.md](./architecture.md)

This guide explains **every distributed systems concept** used in this project. It's written for a developer who knows Python and basic web dev but is new to message queues, async architecture, and system design. Each section includes real-world analogies, failure scenarios, and interview talking points.

---

## Table of Contents

1. [Synchronous vs Asynchronous Processing](#1-synchronous-vs-asynchronous-processing)
2. [Event-Driven Architecture](#2-event-driven-architecture)
3. [Message Queues](#3-message-queues)
4. [Celery: Distributed Task Queue](#4-celery-distributed-task-queue)
5. [The Adapter Pattern (Provider Abstraction)](#5-the-adapter-pattern-provider-abstraction)
6. [Retry Logic & Exponential Backoff](#6-retry-logic--exponential-backoff)
7. [Dead-Letter Queues (DLQ)](#7-dead-letter-queues-dlq)
8. [Idempotency](#8-idempotency)
9. [Rate Limiting](#9-rate-limiting)
10. [WebSockets & Real-Time Updates](#10-websockets--real-time-updates)
11. [Database Design for Event Systems](#11-database-design-for-event-systems)
12. [Docker Compose & Service Orchestration](#12-docker-compose--service-orchestration)
13. [API Design Best Practices](#13-api-design-best-practices)
14. [Observability & Monitoring](#14-observability--monitoring)
15. [Putting It All Together: System Design Interview Walkthrough](#15-putting-it-all-together-system-design-interview-walkthrough)

---

## 1. Synchronous vs Asynchronous Processing

### What Is Synchronous Processing?

In a synchronous system, the client sends a request and **waits** until the entire operation completes before getting a response. The server does everything in-line: validate the request, render the email template, connect to the email provider, send the email, wait for confirmation, then finally respond.

```
Synchronous (what NOT to do):

Client ──POST /send-email──► API Server ──connect──► Email Provider
  │                            │ (rendering...)         │
  │        (waiting...)        │ (sending...)            │
  │                            │ (waiting for reply...)  │
  │                            ◄──── 200 OK ────────────┘
  ◄──── 200 OK ───────────────┘
  
Total client wait: 2-15 seconds (or timeout)
```

### Why This Breaks at Scale

Imagine your API server has 4 worker threads. If each email takes 3 seconds to send synchronously, you can handle exactly **80 emails per minute**. Request #5 waits in line. At 100 concurrent requests, your server is overwhelmed — threads are exhausted, new requests get queued or dropped, and users see timeouts. One slow email provider response cascades into your entire API becoming unresponsive.

This is **thread exhaustion** — every connection holds a thread hostage while waiting for an external service you don't control.

### The Async Alternative

The async pattern separates **accepting work** from **doing work**:

```
Asynchronous (what we do):

Client ──POST /events──► API Server                     (later...)
  │                        │                        Celery Worker
  │                        ├─ Validate request          │
  │                        ├─ Save to database          │
  │                        ├─ Enqueue to Redis ────►  picks up task
  ◄──── 202 Accepted ─────┘                             │
                                                        ├─ Render template
(client is free!)                                       ├─ Call email provider
                                                        ├─ Update DB status
                                                        └─ Broadcast via WebSocket
```

The API responds in **milliseconds** (just validate + enqueue), and a separate worker handles the slow part. The client gets a 202 Accepted with a tracking ID to check status later.

### Real-World Analogy

Think of a restaurant. When you order food, the waiter doesn't go into the kitchen and cook it while you sit there staring at them. The waiter **writes down your order** (accepts the event), **hands it to the kitchen** (enqueues it), and **comes back to you immediately** (202 Accepted). The kitchen processes orders in parallel. When your food is ready, a runner brings it out (notification callback). The waiter is free to serve other tables — they're not blocked.

### How This Project Uses It

When a client POSTs to `/api/v1/events`, the API server validates the payload, writes an `Event` record (status: `accepted`), and pushes a task to a Redis-backed Celery queue. It returns `202 Accepted` with the event ID. The Celery dispatcher worker picks up the task, fans it out to channel-specific workers (email, SMS, webhook), and those workers handle the slow external API calls independently.

> **🎯 Interview Talking Points**
> - "We decoupled ingestion from processing — the API returns 202 in ~50ms regardless of how long delivery takes"
> - "This eliminates thread exhaustion — API throughput is independent of provider latency"
> - "If the email provider is down for 5 minutes, our API keeps accepting events. They queue up and drain when the provider recovers"
> - "The tradeoff is eventual consistency — the client doesn't know the result immediately, so we provide status-tracking endpoints and WebSocket updates"

---

## 2. Event-Driven Architecture

### What Is an Event?

An event is an **immutable record of something that happened**. Not a command ("send this email"), but a fact ("a user signed up"). Events are past-tense, append-only, and never modified.

The distinction matters: a command tells a system what to do (and can fail), but an event records what already occurred. In our system, when a client submits a notification request, we create an `Event` record — an immutable fact that "a notification was requested at this time with this payload."

### Producers vs Consumers

In event-driven architecture, the producer doesn't know or care who processes the event. It just announces: "this happened." One or more consumers independently react to that event.

```
Event-Driven Architecture:

  ┌─────────────┐       ┌──────────────┐       ┌──────────────────┐
  │  API Server  │       │              │       │  Email Worker     │
  │  (Producer)  ├──────►│  Event Bus   ├──────►│  (Consumer)       │
  │              │       │  (Redis)     │       ├──────────────────┤
  └─────────────┘       │              ├──────►│  SMS Worker       │
                        │              │       ├──────────────────┤
                        │              ├──────►│  Webhook Worker   │
                        └──────────────┘       └──────────────────┘
  
  Producer doesn't know about consumers.
  Consumers don't know about each other.
  They're decoupled through the event bus.
```

This **decoupling** is the key advantage. If you add a push-notification channel next month, the API doesn't change at all — you add a new consumer that subscribes to the same events.

### Event-Driven vs Request-Driven

Request-driven: "Service A calls Service B directly and waits for a response." Simple, but creates tight coupling. If B is down, A fails.

Event-driven: "Service A publishes an event. Services B, C, and D react independently." More complex, but services are isolated. If the SMS worker is down, the email worker keeps running.

Use request-driven for simple, low-latency, strongly-consistent operations (e.g., user login). Use event-driven when you need decoupling, scalability, or fan-out to multiple consumers (e.g., notifications).

### How This Project Uses It

The dispatcher worker consumes an event and fans it out: one event might produce three notifications (email + SMS + webhook). Each channel worker processes independently. If the SMS provider is down, email delivery continues unaffected. The `NotificationLog` table creates an immutable audit trail of every status change — an append-only event log you can replay to reconstruct the full history of any notification.

> **🎯 Interview Talking Points**
> - "Events are immutable facts — we never update an event, we append new status records in `notification_logs`"
> - "The dispatcher pattern lets one event fan out to multiple channels without the channels knowing about each other"
> - "Decoupling through events means we can scale channels independently — 3 email workers, 1 SMS worker — based on actual load"
> - "The tradeoff is complexity: debugging async event flows is harder than tracing a synchronous call stack"

---

## 3. Message Queues

### What Is a Message Queue?

A message queue is a **buffer** between producers and consumers. The producer puts a message on the queue and moves on. The consumer picks it up when it's ready. The queue holds the message safely in between.

Why not just call the function directly? Three reasons: (1) the consumer might be busy or down, (2) the producer shouldn't wait for the consumer, and (3) you might want multiple consumers processing from the same queue in parallel.

### Key Properties

**Durability**: Messages survive crashes. If Redis restarts, your queued tasks aren't lost (with proper configuration). **Ordering**: Messages are generally processed in order (FIFO), though priority queues can override this. **Acknowledgment**: A consumer signals "I processed this successfully" — until then, the message stays in the queue so it can be redelivered if the consumer crashes.

### Backpressure

What happens when producers are faster than consumers? The queue grows. This is called **backpressure**. A healthy system monitors queue depth and either scales up consumers, rate-limits producers, or both. In our system, the dashboard shows real-time queue depths so you can see backpressure building.

```
Backpressure Scenario:

  Producer: 100 events/sec ──►  Queue: ████████████████ (growing!)  ──► Consumer: 20 events/sec
  
  Solutions:
  1. Scale consumers: add more workers (docker compose up --scale worker-email=3)
  2. Rate-limit producers: return 429 when queue depth exceeds threshold
  3. Prioritize: process high-priority messages first, delay low-priority
```

### Real-World Analogy

A message queue is like a **post office**. You drop off a letter (message), and you leave. The postal system (broker) holds it safely. The recipient (consumer) picks it up from their mailbox when they're available. You don't stand at the post office waiting for confirmation that they read it.

### How This Project Uses It

Redis serves as the message broker with **seven queues** organized in two tiers:

**Priority tier** — The dispatcher consumes from these with weighted priority:
- `notifications.high` (weight 6) — Password resets, security alerts
- `notifications.medium` (weight 3) — Transactional emails
- `notifications.low` (weight 1) — Marketing, digests

**Channel tier** — Specialized workers consume from these:
- `notifications.email`, `notifications.sms`, `notifications.webhook`

**System tier** — `notifications.dlq` for failed messages awaiting manual review

The dispatcher reads from priority queues and routes tasks to the appropriate channel queue, creating a two-stage pipeline that separates prioritization from delivery.

> **🎯 Interview Talking Points**
> - "We use a two-tier queue architecture: priority queues for ingestion ordering, channel queues for delivery specialization"
> - "Priority weighting (6:3:1) means high-priority messages are consumed ~6x faster than low-priority, but low never starves completely"
> - "Queue depth monitoring on the dashboard lets us detect backpressure before it becomes a problem"
> - "Redis gives us sub-millisecond enqueue latency — the API's response time doesn't depend on queue depth"

---

## 4. Celery: Distributed Task Queue

### What Is Celery?

Celery is a Python framework for running tasks asynchronously across multiple worker processes. It has three components:

```
Celery Architecture:

  ┌──────────┐         ┌──────────┐         ┌──────────────┐
  │  Client   │         │  Broker   │         │   Worker     │
  │ (FastAPI) │────────►│ (Redis)   │────────►│  (Celery)    │
  │           │  push   │           │  pull   │              │
  │ .delay()  │  task   │  stores   │  task   │  executes    │
  └──────────┘         │  messages │         │  the function│
                       └──────────┘         └──────────────┘
```

**Client**: Your FastAPI code that calls `task.delay()` to enqueue work. **Broker**: Redis, which stores the task messages. **Worker**: Separate Python processes that pick up tasks and execute them.

### Tasks: Defining, Routing, Executing

A Celery task is a decorated Python function. Task routing maps task names to specific queues:

```
Task Routing in This Project:

  dispatch_event      ──► notifications.{priority}    (dispatcher picks up)
  send_email           ──► notifications.email         (email worker picks up)
  send_sms             ──► notifications.sms           (SMS worker picks up)
  send_webhook         ──► notifications.webhook       (webhook worker picks up)
  process_dlq_retry    ──► notifications.dlq           (DLQ worker picks up)
```

### Critical Configuration Decisions

**`acks_late = True`** — This is the most important setting. By default, Celery acknowledges a task the moment a worker picks it up. If the worker crashes mid-processing, the task is lost forever. With `acks_late`, acknowledgment happens **after** the task completes successfully. If the worker crashes, the broker redelivers the task to another worker. This gives us **at-least-once delivery** (a task might run twice, but never zero times).

**`task_reject_on_worker_lost = True`** — If a worker process is killed by the OS (e.g., OOM kill), the task is rejected and returned to the queue instead of being marked as failed. Combined with `acks_late`, this ensures tasks survive worker crashes.

**Prefetch multiplier** — Controls how many tasks a worker pre-fetches from the broker. Our email worker uses `prefetch=2` (conservative, because Resend API calls have rate limits) while the webhook worker uses `prefetch=4` (higher throughput since HTTP requests are stateless). Lower prefetch = fairer distribution across workers; higher prefetch = better throughput but risk of uneven load.

### Real-World Analogy

Celery is like an **assembly line with specialized stations**. Orders (tasks) come in on a conveyor belt (broker). The dispatcher station reads each order and routes it to the right specialist — the email station, the SMS station, or the webhook station. Each station has multiple workers (concurrency) processing in parallel. If a worker drops a part (crashes), the part goes back on the belt (redelivered).

> **🎯 Interview Talking Points**
> - "`acks_late=True` gives us at-least-once delivery — tasks survive worker crashes at the cost of requiring idempotent task handlers"
> - "We run separate worker processes per channel so a slow email provider can't block SMS delivery"
> - "Prefetch tuning is channel-specific: low for rate-limited providers (Resend) and higher for self-hosted webhooks"
> - "The dispatcher pattern decouples priority routing from delivery logic — we can change prioritization without touching channel workers"

---

## 5. The Adapter Pattern (Provider Abstraction)

### What Is the Adapter Pattern?

The adapter pattern defines an **interface** (a contract of methods) and then implements that interface with different providers. Your business logic talks to the interface, never to a specific provider. If you need to swap providers, you write a new adapter — zero changes to business logic.

```
Adapter Pattern:

  Business Logic (workers)
         │
         ▼
  ┌─────────────────┐
  │  EmailAdapter    │  ◄── Abstract base class (the contract)
  │  - send()       │
  │  - validate()   │
  └────────┬────────┘
           │
     ┌─────┴──────┐
     ▼            ▼
  ┌────────┐  ┌──────────┐
  │ Resend │  │  Future  │    ◄── Concrete implementations
  │Adapter │  │ Provider │
  └────────┘  └──────────┘

  Worker calls: adapter.send(to, subject, body)
  Worker doesn't know or care WHICH adapter it's using.
```

### Why Abstract Over Providers?

Real-world reasons: (1) Your email provider has an outage — switch to the backup in a config change, not a code change. (2) A cheaper SMS provider enters the market — try it without touching business logic. (3) Testing — use a mock adapter in tests instead of actually sending emails.

### How This Project Uses It

Three adapter hierarchies in `backend/app/adapters/`:

- **`email/base.py`** → `AbstractEmailAdapter` (ABC) with `send()` and `validate_config()`
  - `resend_adapter.py` → Resend HTTP API
- **`sms/base.py`** → `AbstractSmsAdapter`
  - `twilio_adapter.py` → Twilio REST API with E.164 validation
  - `mock_adapter.py` → Console/WebSocket logging for demos (zero cost)
- **`webhook/http.py`** → HTTP POST with HMAC-SHA256 signing

Each adapter returns a standardized `(status, provider_response)` tuple. The worker doesn't parse provider-specific responses — the adapter normalizes them.

A factory function in the service layer reads configuration (`ChannelConfig` table) and instantiates the correct adapter. This is the **factory pattern** — creating objects without specifying the exact class.

> **🎯 Interview Talking Points**
> - "The adapter pattern lets us swap providers (e.g., Resend → another email service) with a config change, not a code change"
> - "Each adapter normalizes provider responses into a standard format, so the retry logic doesn't need provider-specific error handling"
> - "We use Python ABCs to enforce the interface contract at import time, not at runtime"
> - "Mock adapters make testing deterministic — no network calls, predictable responses, injectable failures"

---

## 6. Retry Logic & Exponential Backoff

### Why Retries Are Necessary

External services fail. Networks have blips. Rate limits get hit. A single failed API call doesn't mean the operation is impossible — it might work 500 milliseconds later. Retries handle **transient failures**: temporary conditions that resolve on their own.

### Why Naive Retries Are Terrible

Imagine retrying immediately 5 times. If the provider is overloaded, you just hit it 5 more times in rapid succession, making the overload worse. If 1,000 clients all retry at the same instant, you create a **thundering herd** — a flood of retry traffic that compounds the original problem.

### Exponential Backoff with Jitter

The solution: wait **longer** between each retry, and add **randomness** so clients don't retry in sync.

```
Exponential Backoff (base_delay=10s):

  Attempt 1: wait 10s  × 2⁰ = 10s   (with jitter: random 0-10s)
  Attempt 2: wait 10s  × 2¹ = 20s   (with jitter: random 0-20s)
  Attempt 3: wait 10s  × 2² = 40s   (with jitter: random 0-40s)
  Attempt 4: wait 10s  × 2³ = 80s   (with jitter: random 0-80s)
  Attempt 5: wait 10s  × 2⁴ = 160s  (with jitter: random 0-160s)
  After 5:   ──► Dead-Letter Queue

  Formula: delay = min(base_delay × 2^attempt + random(0, jitter_max), max_delay)
  Our max_delay cap: 600 seconds (10 minutes)
```

**Jitter** is the randomness component. Without it, 1,000 failed tasks all retry at exactly T+10s, T+20s, T+40s — synchronized waves. Full jitter (random between 0 and the computed delay) spreads retries uniformly across the window, smoothing the load.

### Failure Classification: Retry or Don't

Not all failures deserve a retry. Our system classifies errors into two categories:

**Retryable** (transient): Connection timeouts, HTTP 500/502/503/504, rate limit responses (429), provider temporary errors, SSL handshake failures. These are "try again later" problems.

**Permanent** (non-retryable): HTTP 400/401/403/404/422, invalid email address, invalid phone number, authentication failures, provider validation errors. Retrying won't help — the request is fundamentally wrong. These go straight to the DLQ.

### Real-World Analogy

You're calling a friend who's on another call. You don't redial every second (naive retry) — you wait 1 minute, then 2 minutes, then 5 minutes (exponential backoff). And you don't set a timer for the exact minute mark — you check "sometime around 5 minutes later" (jitter). If they still don't answer after 5 tries, you leave a voicemail (dead-letter queue).

> **🎯 Interview Talking Points**
> - "We use exponential backoff with full jitter: `min(base × 2^attempt + random(0, jitter), 600s)` — this prevents thundering herds"
> - "Failure classification is critical — retrying a 401 (bad API key) forever wastes resources and never succeeds"
> - "Retry policies are configurable per channel via the `RetryPolicy` table — SMS might get fewer retries than email because of per-message costs"
> - "The backoff cap (600s) prevents absurd delays — attempt 10 would be 10,240s without a cap"
> - "Each retry attempt is recorded in `retry_history` JSONB for debugging — you can see every attempt, its timestamp, and what error occurred"

---

## 7. Dead-Letter Queues (DLQ)

### What Is a Dead-Letter Queue?

A DLQ is where messages go when they've **exhausted all retry attempts** or encountered a permanent failure. It's not a trash can — it's a holding area for human review. Every message in the DLQ represents a notification that a user expected to receive but didn't.

```
DLQ Lifecycle:

  Task fails ──► Retry 1 (10s) ──► Retry 2 (20s) ──► ... ──► Retry 5 (160s)
                                                                    │
                                                              All retries failed
                                                                    │
                                                                    ▼
                                                          ┌─────────────────┐
                                                          │  Dead-Letter     │
                                                          │  Queue           │
                                                          │                  │
                                                          │  notifications   │
                                                          │  .dlq            │
                                                          └────────┬────────┘
                                                                   │
                                          ┌────────────────────────┼────────────────┐
                                          ▼                        ▼                ▼
                                    Manual Retry            Investigate         Discard
                                   (after fix)             (read logs)      (mark resolved)
```

### Why Not Just Drop Failed Messages?

**Data loss**: A user's password reset email failed 5 times — dropping it means they can't log in. **Debugging**: The DLQ with its error history tells you exactly what went wrong and when. **Compliance**: Some industries require proof that you attempted delivery. **Pattern detection**: 500 SMS messages failing with the same error? That's a provider outage, not individual failures.

### What Metadata to Store

Our `DeadLetterMessage` model captures everything needed for diagnosis and replay: the original event payload (snapshot, not a reference — the original event might change), the complete `retry_history` (array of `{attempt, timestamp, error, response, delay_s}`), the final error type and message, and the channel and recipient address.

### Replaying from the DLQ

When you fix the root cause (deploy a config fix, resolve a provider outage), you can **replay** messages from the DLQ. The API endpoint triggers `process_dlq_retry` which picks up `active` DLQ entries, resubmits them as fresh tasks, and marks the DLQ entry as `retried`. This is manual and intentional — automatic DLQ replay can cause infinite loops if the root cause isn't actually fixed.

### Real-World Analogy

The DLQ is the **return-to-sender desk** at the post office. A letter bounced back three times — wrong address, nobody home, mailbox full. Instead of throwing it away, the post office puts it at a special desk. A clerk reviews it: maybe the address has a typo (fixable), maybe the person moved (permanent failure), or maybe the mail carrier was just sick that day (transient, retry).

> **🎯 Interview Talking Points**
> - "We never silently drop failed messages — they go to `notifications.dlq` with full retry history for manual review"
> - "The `DeadLetterMessage` table stores a snapshot of the original payload, not a reference — so we can replay even if the original event is modified"
> - "DLQ replay is intentionally manual — automatic replay without fixing the root cause creates infinite retry loops"
> - "DLQ monitoring is a key operational metric — a growing DLQ means something systemic is wrong"

---

## 8. Idempotency

### What Is Idempotency?

An operation is **idempotent** if performing it multiple times produces the same result as performing it once. `DELETE /users/123` is idempotent — deleting an already-deleted user is a no-op. `POST /transfer?amount=100` is NOT idempotent — running it twice transfers $200.

In distributed systems, idempotency is essential because **messages can be delivered more than once**. Network timeouts, client retries, and Celery's `acks_late` all mean your handler might run twice for the same request.

### The Idempotency Key Pattern

The client includes a unique `Idempotency-Key` header (typically a UUID) with each request. The server uses this key to detect duplicates:

```
Idempotency Flow:

  Request #1 (Idempotency-Key: abc-123)
  ┌──────────────────────────────────────────────────┐
  │ 1. Check Redis: "idempotency:{api_key}:abc-123" │
  │ 2. Key not found → this is NEW                   │
  │ 3. Compute fingerprint: SHA256(method+path+body) │
  │ 4. Process the request                           │
  │ 5. Cache response in Redis (TTL: 24 hours)       │
  │ 6. Return 202 Accepted                           │
  └──────────────────────────────────────────────────┘
  
  Request #2 (same Idempotency-Key: abc-123)
  ┌──────────────────────────────────────────────────┐
  │ 1. Check Redis: "idempotency:{api_key}:abc-123" │
  │ 2. Key FOUND → check fingerprint                 │
  │ 3. Fingerprint matches → this is a DUPLICATE     │
  │ 4. Return cached response (202 Accepted)         │
  │    (event NOT created again, no duplicate notif)  │
  └──────────────────────────────────────────────────┘

  Request #3 (same key, DIFFERENT body)
  ┌──────────────────────────────────────────────────┐
  │ 1. Key FOUND but fingerprint DIFFERS → CONFLICT  │
  │ 2. Return 422 Unprocessable Entity               │
  │    (client reused a key for a different request)  │
  └──────────────────────────────────────────────────┘
```

### Why 24-Hour TTL?

The Redis cache expires after 24 hours because idempotency keys are for **recent duplicates** (network retries, client bugs), not historical deduplication. A 24-hour window catches reasonable retry scenarios without unbounded memory growth.

### Real-World Analogy

When you tap your credit card and the terminal says "processing..." then times out, you tap again. The payment system uses a transaction ID (the idempotency key) to recognize: "I already processed this charge — don't charge them twice." You get one charge, not two.

### How This Project Uses It

The `Idempotency-Key` header on `POST /api/v1/events` prevents duplicate notifications. The implementation lives in `backend/app/services/idempotency.py` and uses Redis hashes to store the key, fingerprint, and cached response. Combined with `acks_late` (which can cause duplicate task execution), idempotency at the API layer ensures **exactly-once semantics at the business level** even though the infrastructure provides at-least-once delivery.

> **🎯 Interview Talking Points**
> - "We implement idempotency at the API layer because `acks_late` gives us at-least-once delivery — without idempotency, a user could get the same notification twice"
> - "The fingerprint check (SHA256 of method+path+body) catches key reuse for different requests, which is a client bug"
> - "Redis TTL of 24 hours balances duplicate protection against unbounded memory growth"
> - "This is the standard pattern used by Stripe, AWS, and other APIs that need safe client retries"

---

## 9. Rate Limiting

### What Is Rate Limiting?

Rate limiting controls **how many operations** are allowed within a time window. It protects your system from abuse, prevents you from overwhelming downstream providers, and ensures fair resource sharing across API consumers.

### Algorithms Overview

**Fixed window**: Count requests in fixed intervals (e.g., minute 0:00-0:59, 1:00-1:59). Simple but has a burst problem — 1,000 requests at 0:59 and 1,000 at 1:00 = 2,000 in 2 seconds.

**Sliding window**: Tracks each request's timestamp and counts within a rolling window. No burst problem, but more memory-intensive. **This is what our project uses.**

**Token bucket**: Tokens refill at a steady rate; each request costs a token. Allows controlled bursts up to the bucket size. Used by AWS API Gateway.

**Leaky bucket**: Requests drain at a fixed rate like water from a bucket. Smoothest output rate, but adds latency to all requests.

### Sliding Window Counter (Our Implementation)

We use Redis sorted sets (ZSETs) where each entry is a request timestamp:

```
Sliding Window with Redis Sorted Sets:

  Time ──────────────────────────────────────────────►
  
  Window (60 seconds):  [─────────────────────────────]
                         ▲                             ▲
                     now - 60s                        now
  
  Redis ZSET "rate_limit:api:{key_hash}":
  ┌─────────────────────────────────────────────────┐
  │ Score (timestamp)    │ Member (unique request ID)│
  │ 1700000001.123       │ req_a1b2c3               │
  │ 1700000002.456       │ req_d4e5f6               │
  │ 1700000003.789       │ req_g7h8i9               │
  │ ...                  │ ...                       │
  └─────────────────────────────────────────────────┘
  
  Steps (atomic Lua script):
  1. ZREMRANGEBYSCORE — remove entries older than (now - window)
  2. ZCARD — count remaining entries
  3. If count >= limit → REJECT (return 0 + retry_after seconds)
  4. If count < limit  → ZADD this request, set PEXPIRE, return ALLOWED
```

The Lua script runs **atomically** in Redis — no race conditions between check and increment. This is critical because two concurrent requests checking "am I under the limit?" could both see "yes" and both proceed, exceeding the limit.

### Two Levels of Rate Limiting

**API-level** (per API key): Protects our system. Default: 1,000 requests/minute, configurable per key via the dashboard. Exceeding returns `429 Too Many Requests` with a `Retry-After` header.

**Channel-level** (per provider): Respects external limits. Email: 100/min, SMS: 60/min, Webhook: 500/min. When hit, the task is **re-enqueued with a delay** — it doesn't count as a retry attempt because this isn't a failure, it's flow control.

### Real-World Analogy

Highway on-ramp metering lights. During rush hour, a traffic light on the on-ramp lets one car through every few seconds. The highway (your system) can only handle so many cars (requests). Without metering, cars flood the highway and everything stops. The metering light doesn't reject cars — it paces them.

> **🎯 Interview Talking Points**
> - "We use sliding window counters with Redis sorted sets — no burst problem like fixed windows, and the Lua script ensures atomicity"
> - "Two-level rate limiting: API-level protects us, channel-level respects provider limits (e.g., Twilio's rate limits)"
> - "When channel rate limits are hit, we re-enqueue with a delay instead of counting it as a retry — it's flow control, not a failure"
> - "The Lua script is critical — without atomic check-and-increment, concurrent requests create a race condition that allows the limit to be exceeded"
> - "We return `Retry-After` headers so well-behaved clients know exactly when to retry"

---

## 10. WebSockets & Real-Time Updates

### HTTP vs WebSocket

Normal HTTP is **request-response**: the client always initiates. The server can't push data to the client unless the client asks for it. For a live dashboard showing notifications flowing through the system, polling every second creates unnecessary load and still has up to 1 second of latency.

**WebSocket** establishes a persistent, bidirectional connection. Once opened, both sides can send messages at any time. The server can push updates the instant something happens.

```
HTTP Polling (wasteful):           WebSocket (efficient):

Client: "Any updates?" ──► Server  Client ◄──────────► Server
Server: "No." ◄───────── Server        (persistent connection)
Client: "Any updates?" ──► Server
Server: "No." ◄───────── Server  Server: "Email delivered!" ──► Client
Client: "Any updates?" ──► Server  Server: "SMS queued!" ──► Client
Server: "Yes, 1 update" ◄─ Server  Server: "Webhook failed!" ──► Client
                                   (instant, no wasted requests)
```

### The Pub/Sub Bridge Problem

Here's the challenge: Celery workers are **separate processes** (often in separate containers). They can't directly push to WebSocket connections managed by the FastAPI process. The solution is **Redis Pub/Sub** as a bridge:

```
Real-Time Update Flow:

  Celery Worker                     Redis                    FastAPI              Browser
  (email_worker)                  (Pub/Sub)                (WebSocket)          (Dashboard)
       │                             │                        │                     │
       ├─ Email delivered!           │                        │                     │
       ├─ PUBLISH to ───────────────►│                        │                     │
       │  "notifications:            │                        │                     │
       │   status_updates"           ├─ Forward to ──────────►│                     │
       │                             │  subscriber            ├─ Broadcast to ─────►│
       │                             │                        │  all connections     │
       │                             │                        │                     │
       │                             │                        │              Dashboard updates!
```

A FastAPI background task subscribes to the Redis Pub/Sub channel. When a Celery worker publishes a status change, Redis forwards it to the FastAPI subscriber, which broadcasts it to all connected WebSocket clients through a `ConnectionManager`.

### Message Types

Our WebSocket sends four types of messages: **notification.status_changed** (every delivery status transition), **queue.depth_update** (every 5 seconds via Celery Beat, for monitoring charts), **worker.status_changed** (worker connect/disconnect), and **system.health_update** (every 15 seconds, overall system health).

### Real-World Analogy

HTTP is like sending text messages — you always initiate, you ask a question, you get an answer. WebSocket is like a **phone call** — once connected, both sides can talk freely. Redis Pub/Sub is like a **radio broadcast** — the DJ (worker) speaks into the microphone, the radio tower (Redis) amplifies the signal, and every tuned-in radio (WebSocket client) hears it simultaneously.

> **🎯 Interview Talking Points**
> - "We use Redis Pub/Sub as a bridge between Celery workers (separate processes) and FastAPI WebSocket connections"
> - "This is a common pattern in distributed systems — workers can't hold WebSocket connections, so you need a message bus in between"
> - "The ConnectionManager tracks active connections and handles disconnects gracefully — if a client drops, we clean up without crashing"
> - "We chose WebSocket over SSE (Server-Sent Events) because we need bidirectional communication — the dashboard can send filter preferences back to the server"

---

## 11. Database Design for Event Systems

### Why PostgreSQL?

PostgreSQL gives us **ACID transactions** (atomic operations that never leave data in an inconsistent state), native JSONB support (for flexible fields like `payload`, `metadata`, `provider_response`), powerful indexing (B-tree, GIN for JSONB), and battle-tested reliability. For an event system where every notification must be accounted for, ACID guarantees are non-negotiable.

### SQLModel: The Best of Both Worlds

SQLModel combines SQLAlchemy (ORM, migrations, connection management) with Pydantic (data validation, serialization). One class definition serves as both a database model and an API schema — no more maintaining two parallel definitions that drift apart.

### Event Sourcing Lite

The `NotificationLog` table implements a form of event sourcing. Instead of updating a notification's status in place, we **append a new log record** for every transition: `pending → queued → processing → delivered`. The `Notification` table holds the current status (for fast queries), but the log table holds the **complete history** (for debugging and auditing).

```
NotificationLog — Immutable Audit Trail:

  notification_id: abc-123
  
  ┌────┬──────────┬────────────┬───────────┬────────────────────────┐
  │ #  │ previous │ new_status │ worker_id │ created_at             │
  ├────┼──────────┼────────────┼───────────┼────────────────────────┤
  │ 1  │ (null)   │ pending    │ api-1     │ 2024-01-15T10:00:00Z   │
  │ 2  │ pending  │ queued     │ api-1     │ 2024-01-15T10:00:01Z   │
  │ 3  │ queued   │ processing │ email-w2  │ 2024-01-15T10:00:03Z   │
  │ 4  │ process. │ delivered  │ email-w2  │ 2024-01-15T10:00:05Z   │
  └────┴──────────┴────────────┴───────────┴────────────────────────┘
  
  You can reconstruct the FULL lifecycle of any notification from this log.
```

### UUID Primary Keys

We use UUIDs instead of auto-incrementing integers for three reasons: (1) **No coordination needed** — any worker can generate a UUID without consulting the database for the next ID. (2) **Merge-safe** — no ID collisions when combining data from multiple sources. (3) **Non-enumerable** — attackers can't guess IDs by incrementing (`/notifications/1`, `/notifications/2`).

The tradeoff: UUIDs are larger (16 bytes vs 4 bytes) and slightly slower to index. Worth it for a distributed system.

### Indexing Strategy

Every field used in a `WHERE` clause or `ORDER BY` gets an index: `status` (filtering active notifications), `created_at` (sorting by time), `channel` (filtering by type), `api_key_id` (tenant isolation), `celery_task_id` (correlating with worker logs). Composite index on `(channel, status)` for the common query "show me all pending email notifications."

> **🎯 Interview Talking Points**
> - "We use an append-only `notification_logs` table as an event sourcing pattern — the current status lives on the notification, but the full history is in the log"
> - "UUID primary keys avoid coordination overhead in a distributed system — workers generate IDs locally without database round-trips"
> - "JSONB columns (`payload`, `provider_response`, `retry_history`) give us schema flexibility for provider-specific data without schema migrations"
> - "Composite indexes on `(channel, status)` optimize the most common dashboard query pattern"

---

## 12. Docker Compose & Service Orchestration

### What Is Containerization?

A container packages your application with **all its dependencies** into an isolated, reproducible unit. "Works on my machine" becomes "works everywhere" because the container IS the machine — same OS libraries, same Python version, same system config.

### Docker Compose: Multi-Container Applications

Our system isn't one process — it's **eight services** that need to start together, connect to each other, and be managed as a unit:

```
Docker Compose Services:

  ┌─────────────────────────────────────────────────────────────┐
  │                    notification-network                      │
  │                                                              │
  │  ┌─────────┐  ┌──────────┐  ┌───────────────────────────┐  │
  │  │ postgres │  │  redis   │  │         api               │  │
  │  │  :5432   │  │  :6379   │  │       :8000               │  │
  │  └────┬─────┘  └────┬─────┘  └───────────┬───────────────┘  │
  │       │              │                    │                  │
  │       │    ┌─────────┴────────────────────┤                  │
  │       │    │                              │                  │
  │  ┌────┴────┴──┐ ┌───────────┐ ┌──────────┴───┐             │
  │  │ worker-    │ │ worker-   │ │ worker-      │             │
  │  │ dispatcher │ │ email     │ │ sms/webhook  │             │
  │  └───────────┘ └───────────┘ └──────────────┘             │
  │                                                              │
  │  ┌─────────────┐  ┌────────────┐                            │
  │  │ celery-beat  │  │  frontend  │                            │
  │  │ (scheduler)  │  │   :5173    │                            │
  │  └─────────────┘  └────────────┘                            │
  └─────────────────────────────────────────────────────────────┘
```

### Service Dependencies and Health Checks

Services declare dependencies with health checks: the API won't start until `redis` and `postgres` are **healthy** (not just "started"). Redis health: `redis-cli ping`. Postgres health: `pg_isready -U notif_user`. This prevents race conditions where the API starts before the database is ready to accept connections.

### Scaling

```bash
# Scale email workers to handle a marketing blast
docker compose up --scale worker-email=3

# Now three email worker containers consume from notifications.email in parallel
```

This is horizontal scaling — adding more workers to process more tasks. The message queue makes this seamless because workers are stateless consumers competing for tasks.

### Networking

Docker Compose creates a shared bridge network (`notification-network`). Containers reference each other by service name: the API connects to `redis:6379` and `postgres:5432` — Docker's internal DNS resolves these to the right container IPs. No hardcoded IP addresses.

### Real-World Analogy

Docker Compose is like an **apartment building**. Each apartment (container) is isolated — its own space, its own stuff. But they share infrastructure: plumbing (networking), electrical (host CPU/memory), and common areas (shared volumes). The building manager (Compose) ensures everyone moves in at the right time and that the elevator (dependencies) is working before tenants arrive.

> **🎯 Interview Talking Points**
> - "Health checks with `depends_on` condition prevent race conditions — the API waits for Redis and Postgres to be ready, not just started"
> - "Horizontal scaling is trivial with message queues: `--scale worker-email=3` adds capacity without any code changes"
> - "Service-name DNS (`redis:6379`) means zero hardcoded IPs — containers find each other through Docker's internal DNS"
> - "Volume mounts for `postgres-data` and `redis-data` ensure data persists across container restarts"

---

## 13. API Design Best Practices

### The 202 Accepted Pattern

Most APIs return 200 ("here's your result") or 201 ("created your resource"). Our event submission endpoint returns **202 Accepted**: "I received your request and will process it asynchronously." This is the correct status code for async operations — it tells the client "your request is valid and queued, but not yet completed."

The response includes a tracking URL (`/api/v1/events/{id}`) where the client can poll for status, plus a WebSocket channel for real-time updates.

### API Versioning

All endpoints live under `/api/v1/`. When we inevitably need breaking changes, we deploy `/api/v2/` alongside v1. Old clients keep working; new clients use v2. No big-bang migration.

### Request Validation with Pydantic

Every request is validated against a Pydantic schema before touching business logic. Invalid phone numbers, missing required fields, and malformed payloads are caught at the API boundary and return `422 Unprocessable Entity` with detailed error messages. This is **fail-fast** — don't let bad data propagate into your queue and fail at the worker level where debugging is harder.

### Consistent Error Format

Every error response follows the same structure regardless of the error type. Clients parse one format, not a different shape for validation errors vs auth errors vs rate limit errors. Predictable APIs are usable APIs.

### API Key Authentication

The `X-API-Key` header authenticates requests. Keys are stored as bcrypt hashes in the `ApiKey` table (never plaintext). Each key has configurable rate limits and can be deactivated instantly without rotation. This is simpler than OAuth for machine-to-machine communication while still providing per-consumer isolation and rate limiting.

> **🎯 Interview Talking Points**
> - "We use 202 Accepted for async operations — it's semantically correct and tells clients the request was received but not yet processed"
> - "Pydantic validation at the API boundary ensures bad data never enters the queue — fail fast, fail cheaply"
> - "API versioning under `/api/v1/` lets us evolve the API without breaking existing integrations"
> - "API keys are bcrypt-hashed in the database — even a database breach doesn't expose plaintext keys"

---

## 14. Observability & Monitoring

### The Three Pillars

**Logs**: What happened. Structured JSON logs with correlation IDs so you can trace a single notification across the API server, dispatcher, and channel worker. Every log entry includes `event_id`, `notification_id`, and `worker_id`.

**Metrics**: How much and how fast. Queue depths, delivery success rates, P99 latency per channel, retry rates. These power dashboards and alerts.

**Traces**: The journey. A single request traced across service boundaries — from API receipt through queue, through worker, through provider API call. Shows exactly where time is spent.

### What to Log (and What NOT to Log)

**Log**: Status transitions, retry attempts (with attempt number and delay), provider response codes, task durations, queue depths, worker lifecycle events.

**Never log**: Email addresses, phone numbers, message content, API keys, passwords, or any PII. If you need to identify a recipient in logs, use a hashed or anonymized identifier. A log aggregation system breach shouldn't become a data breach.

### Health Check Endpoints

Two endpoints serve different purposes:

**`/api/v1/health/live`** — Liveness: "Is the process running?" Returns 200 if the API server is up. Used by container orchestrators to know when to restart a crashed container.

**`/api/v1/health/ready`** — Readiness: "Can this instance serve traffic?" Checks database connectivity, Redis connectivity, and worker availability. Returns 503 if any dependency is down. Used by load balancers to stop sending traffic to unhealthy instances.

### Real-World Analogy

A car dashboard. The speedometer (metrics) shows how fast you're going. The trip computer (logs) records your journey. The GPS trace (traces) shows your exact path. Warning lights (alerts) only activate when something needs attention — check engine, low fuel, oil pressure. You don't stare at the dashboard constantly, but when something goes wrong, it tells you exactly what.

> **🎯 Interview Talking Points**
> - "Structured JSON logs with correlation IDs let us trace a notification's journey across the API, dispatcher, and channel workers"
> - "We separate liveness from readiness health checks — liveness tells the orchestrator to restart crashed containers, readiness tells the load balancer to stop sending traffic"
> - "We never log PII (emails, phone numbers) — logs should be safe to ship to any aggregation service"
> - "Real-time queue depth metrics on the dashboard are our early warning system for backpressure"

---

## 15. Putting It All Together: System Design Interview Walkthrough

### "Design a Notification System"

Here's how to answer this classic interview question using everything in this project.

**Step 1: Clarify Requirements** (2 minutes)

"What channels? Email, SMS, push, in-app? What scale — thousands per day or millions per hour? Do we need delivery guarantees? Real-time tracking? What about retries? Rate limits from providers?"

**Step 2: High-Level Architecture** (3 minutes)

```
System Design Sketch:

  Clients ──► API Gateway ──► Event Service ──► Message Queue ──► Workers ──► Providers
                  │                │                                  │
                  │           PostgreSQL                         Redis Pub/Sub
                  │          (events, notifications,                  │
                  │           logs, DLQ)                         WebSocket
                  │                                                  │
                  └──────────────────────────────────────────── Dashboard
```

"The API accepts notification events and returns 202 immediately. Events flow through a priority-based message queue. Specialized workers per channel process deliveries asynchronously. Failed messages retry with exponential backoff and eventually land in a dead-letter queue. A real-time dashboard shows system status via WebSocket."

**Step 3: Deep Dive** (10 minutes)

Walk through the concepts from this guide, adapted to the interviewer's follow-up questions:

- **"How do you handle failures?"** → Retry with exponential backoff + jitter, failure classification (transient vs permanent), DLQ for exhausted retries (Sections 6 & 7)
- **"What about duplicates?"** → Idempotency keys at the API layer, at-least-once delivery with deduplication (Section 8)
- **"How do you handle provider rate limits?"** → Two-level rate limiting: API-level per consumer, channel-level per provider, sliding window with Redis sorted sets (Section 9)
- **"How do you scale?"** → Stateless workers, horizontal scaling via message queue, independent channel scaling (Section 12)
- **"How do you monitor?"** → Structured logs with correlation IDs, health checks (live vs ready), real-time queue depth monitoring, DLQ growth alerts (Section 14)

**Step 4: Discuss Tradeoffs** (3 minutes)

"We chose eventual consistency over strong consistency — the API doesn't confirm delivery, just acceptance. This means clients need to poll or subscribe to WebSocket for status. The benefit is that our API latency is independent of provider latency."

"We chose at-least-once delivery over exactly-once because true exactly-once is impossible in distributed systems. Instead, we make handlers idempotent so duplicate execution is harmless."

**Step 5: Scale Discussion**

At **10x**: Add more workers per channel, increase Redis memory, add read replicas for PostgreSQL.

At **100x**: Shard queues by tenant/region, introduce a dedicated message broker (RabbitMQ/Kafka), separate read/write databases.

At **1,000x**: Multi-region deployment, per-region queues with cross-region replication, circuit breakers per provider, message schema registry for contract enforcement.

### What You'd Add With More Time

- **Circuit breakers**: Stop calling a provider that's returning 500s — let it recover instead of hammering it
- **Multi-region**: Deploy in multiple regions for latency and redundancy
- **Message schema registry**: Validate event schemas at publish time, not consumer time
- **Batch optimization**: Aggregate individual SMS messages into provider batch APIs
- **Cost tracking**: Track per-notification cost by channel and provider

> **🎯 Interview Talking Points**
> - Start with requirements — don't jump into architecture before understanding scale, channels, and guarantees
> - Draw the architecture first, then dive deep into the component the interviewer cares most about
> - Always discuss tradeoffs — interviewers want to see you weigh options, not just pick the "right" answer
> - Show you understand operational concerns: monitoring, debugging, failure modes — not just the happy path
> - End with "here's what I'd add at 100x scale" — shows you think beyond the immediate requirements

---

*This guide is a living document. As the project evolves, update sections to reflect implementation decisions and lessons learned. For implementation details, see [PRD.md](./PRD.md). For architecture diagrams and data flow, see [architecture.md](./architecture.md).*
