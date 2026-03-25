# System Architecture — Event-Driven Notification System

> **Version:** 1.0  
> **Last Updated:** 2025-07-17  
> **Companion Document:** [PRD.md](./PRD.md)

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Component Diagram](#2-component-diagram)
3. [Data Flow](#3-data-flow)
4. [Queue Architecture](#4-queue-architecture)
5. [Retry & Dead-Letter Queue Flow](#5-retry--dead-letter-queue-flow)
6. [Real-Time Updates (WebSocket)](#6-real-time-updates-websocket)
7. [Rate Limiting Design](#7-rate-limiting-design)
8. [Idempotency Design](#8-idempotency-design)
9. [Scaling Strategy](#9-scaling-strategy)
10. [Docker Compose Stack](#10-docker-compose-stack)

---

## 1. System Overview

The notification system is a distributed, event-driven pipeline that decouples event ingestion from notification delivery. It is designed around three core principles:

1. **Asynchronous processing** — API requests return immediately; all delivery is handled by background workers consuming from message queues.
2. **Failure isolation** — each delivery channel (email, SMS, webhook) runs in independent worker processes; a slow or failing channel does not impact others.
3. **Observable state machines** — every notification progresses through a defined status lifecycle, and every transition is logged, persisted, and broadcast in real time.

The system consists of five major subsystems:

| Subsystem | Responsibility |
|-----------|---------------|
| **API Gateway** | Ingestion, authentication, validation, rate limiting, idempotency |
| **Message Broker** | Task queuing, priority routing, channel routing |
| **Worker Pool** | Channel-specific delivery, retry logic, status updates |
| **Data Store** | Persistent state, audit trail, analytics |
| **Dashboard** | Real-time monitoring, management, analytics visualization |

---

## 2. Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              EXTERNAL CLIENTS                                   │
│                                                                                 │
│    ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────────────┐     │
│    │ Client A │     │ Client B │     │ Client C │     │  React Dashboard │     │
│    └────┬─────┘     └────┬─────┘     └────┬─────┘     └────────┬─────────┘     │
│         │                │                │                     │               │
└─────────┼────────────────┼────────────────┼─────────────────────┼───────────────┘
          │  HTTP/REST     │  HTTP/REST     │  HTTP/REST          │  WS + REST
          │                │                │                     │
┌─────────▼────────────────▼────────────────▼─────────────────────▼───────────────┐
│                                                                                 │
│                            ┌─────────────────────┐                              │
│                            │    NGINX (prod)      │                              │
│                            │    Reverse Proxy     │                              │
│                            └──────────┬──────────┘                              │
│                                       │                                         │
│                            ┌──────────▼──────────┐                              │
│                            │                      │                              │
│                            │   FastAPI Server     │                              │
│                            │                      │                              │
│                            │  ┌────────────────┐  │                              │
│                            │  │  Auth (API Key) │  │                              │
│                            │  ├────────────────┤  │                              │
│                            │  │  Rate Limiter   │  │◄─────┐                     │
│                            │  ├────────────────┤  │      │                     │
│                            │  │  Idempotency    │  │◄──┐  │                     │
│                            │  ├────────────────┤  │   │  │                     │
│                            │  │  Validation     │  │   │  │                     │
│                            │  ├────────────────┤  │   │  │                     │
│                            │  │  REST Handlers  │  │   │  │                     │
│                            │  ├────────────────┤  │   │  │                     │
│                            │  │  WS Handler     │  │◄──┼──┼───┐                 │
│                            │  └────────────────┘  │   │  │   │                 │
│                            └──────────┬──────────┘   │  │   │                 │
│                                       │              │  │   │                 │
│              ┌────────────────────────┼──────────────┼──┼───┼──────┐          │
│              │                        │              │  │   │      │          │
│   ┌──────────▼──────────┐  ┌─────────▼──────────┐   │  │   │      │          │
│   │                      │  │                     │   │  │   │      │          │
│   │     PostgreSQL       │  │       Redis         │───┘  │   │      │          │
│   │                      │  │                     │──────┘   │      │          │
│   │  ┌────────────────┐  │  │  ┌───────────────┐  │         │      │          │
│   │  │ events         │  │  │  │ Celery Broker  │  │         │      │          │
│   │  │ notifications  │  │  │  │ (task queues)  │  │         │      │          │
│   │  │ notif_logs     │  │  │  ├───────────────┤  │         │      │          │
│   │  │ dead_letter    │  │  │  │ Result Backend │  │         │      │          │
│   │  │ templates      │  │  │  ├───────────────┤  │         │      │          │
│   │  │ api_keys       │  │  │  │ Rate Limit     │  │         │      │          │
│   │  │ retry_policies │  │  │  │ Counters       │  │         │      │          │
│   │  │ channel_config │  │  │  ├───────────────┤  │         │      │          │
│   │  └────────────────┘  │  │  │ Idempotency    │  │         │      │          │
│   │                      │  │  │ Cache          │  │         │      │          │
│   └──────────▲──────────┘  │  ├───────────────┤  │         │      │          │
│              │              │  │ Pub/Sub        │──┼─────────┘      │          │
│              │              │  │ (WS events)    │  │                │          │
│              │              │  └───────────────┘  │                │          │
│              │              └─────────▲──────────┘                │          │
│              │                        │                           │          │
│              │    ┌───────────────────┼───────────────────┐       │          │
│              │    │                   │                   │       │          │
│   ┌──────────┼────▼────┐  ┌──────────┼────┐  ┌──────────┼────┐  │          │
│   │          │         │  │          │    │  │          │    │  │          │
│   │  Email Worker      │  │  SMS Worker   │  │ Webhook Worker │  │          │
│   │                    │  │               │  │               │  │          │
│   │  ┌──────────────┐  │  │ ┌───────────┐ │  │ ┌───────────┐ │  │          │
│   │  │ Resend        │  │  │ │ Twilio    │ │  │ │ HTTP POST │ │  │          │
│   │  │ Adapter       │  │  │ │ Adapter   │ │  │ │ + HMAC    │ │  │          │
│   │  │               │  │  │ └───────────┘ │  │ └───────────┘ │  │          │
│   │  └──────────────┘  │  │               │  │               │  │          │
│   └────────────────────┘  └───────────────┘  └───────────────┘  │          │
│              │                   │                   │           │          │
│              └───────────────────┼───────────────────┘           │          │
│                                  │                               │          │
│                    ┌─────────────▼──────────────┐                │          │
│                    │    External Providers       │                │          │
│                    │                             │                │          │
│                    │  Resend API                 │                │          │
│                    │  Twilio API                 │                │          │
│                    │  Client Webhook URLs        │                │          │
│                    └─────────────────────────────┘                │          │
│                                                                  │          │
│                    ┌─────────────────────────────┐               │          │
│                    │  Vite + React Dashboard     │◄──────────────┘          │
│                    │  (served via NGINX or dev)   │                          │
│                    └─────────────────────────────┘                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Technology | Role |
|-----------|-----------|------|
| **FastAPI Server** | Python 3.12, uvicorn, uv | HTTP API gateway, WebSocket server, request pipeline |
| **PostgreSQL** | PostgreSQL 16 | Persistent storage for all domain data |
| **Redis** | Redis 7 | Celery broker, result backend, rate-limit counters, idempotency cache, Pub/Sub |
| **Email Worker** | Celery | Consumes email tasks, delivers via Resend API |
| **SMS Worker** | Celery | Consumes SMS tasks, delivers via Twilio |
| **Webhook Worker** | Celery | Consumes webhook tasks, delivers via HTTP POST with HMAC signing |
| **React Dashboard** | Vite, React 19, TypeScript | Real-time monitoring UI, management interface |
| **NGINX** | nginx | Reverse proxy (production), static file serving, WebSocket upgrade |

---

## 3. Data Flow

### 3.1 Notification Lifecycle — Step by Step

The following traces a single notification from API submission to delivery:

```
Step 1: Client Request
──────────────────────
Client ──POST /api/v1/events/──▶ FastAPI
  Headers: X-API-Key, Idempotency-Key, Content-Type
  Body: { event_type, recipients, priority, template_id, payload }


Step 2: Request Pipeline (FastAPI middleware + deps)
────────────────────────────────────────────────────
  2a. Extract X-API-Key → look up in PostgreSQL → verify active
  2b. Check rate limit (Redis sorted set) → 429 if exceeded
  2c. Check Idempotency-Key (Redis GET) → return cached response if exists
  2d. Validate request body (Pydantic model) → 422 if invalid


Step 3: Event Processing
────────────────────────
  3a. Create Event record in PostgreSQL (status: "accepted")
  3b. For each recipient × channel combination:
      - Render template (if template_id provided) via Jinja2
      - Create Notification record (status: "pending")
      - Write NotificationLog entry (null → pending)
  3c. Store idempotency key → response mapping in Redis (24h TTL)
  3d. Return 202 Accepted with event_id and notification_ids


Step 4: Task Dispatch
─────────────────────
  4a. Enqueue a dispatcher task to the priority queue:
      notifications.high | notifications.medium | notifications.low
  4b. Update Notification status to "queued"
  4c. Write NotificationLog entry (pending → queued)
  4d. Broadcast status change via Redis Pub/Sub → WebSocket


Step 5: Channel Routing (Dispatcher Worker)
───────────────────────────────────────────
  5a. Dispatcher task dequeues from priority queue
  5b. For each notification in the event, routes to channel queue:
      - email → notifications.email
      - sms → notifications.sms
      - webhook → notifications.webhook


Step 6: Delivery (Channel Worker)
─────────────────────────────────
  6a. Worker picks up task from channel queue
  6b. Update Notification status to "processing"
  6c. Write NotificationLog entry (queued → processing)
  6d. Broadcast status change via Redis Pub/Sub → WebSocket
  6e. Check channel rate limit (Redis) — if exceeded, re-enqueue with delay
  6f. Call adapter (Resend/Twilio/HTTP POST)
  6g. On SUCCESS:
      - Update Notification status to "delivered", set delivered_at
      - Store provider_response
      - Write NotificationLog entry (processing → delivered)
      - Broadcast status change via Redis Pub/Sub → WebSocket
  6h. On FAILURE: → See Retry & DLQ Flow (Section 5)


Step 7: Real-Time Dashboard Update
───────────────────────────────────
  7a. Redis Pub/Sub message received by FastAPI WebSocket handler
  7b. WebSocket handler broadcasts to all connected React clients
  7c. React updates local state → UI re-renders with new status
```

### 3.2 Batch Event Flow

```
Client ──POST /api/v1/events/batch──▶ FastAPI

  Request: { recipients: [R1, R2, R3], channels: [email, sms] }

  Processing:
    ┌─── R1 × email → Notification N1
    ├─── R1 × sms   → Notification N2
    ├─── R2 × email → Notification N3
    ├─── R2 × sms   → Notification N4
    ├─── R3 × email → Notification N5
    └─── R3 × sms   → Notification N6

  Fan-out: 6 independent Celery tasks enqueued
  Each notification progresses through the lifecycle independently
  Batch status = aggregate of individual notification statuses
```

---

## 4. Queue Architecture

### 4.1 Queue Topology

```
                              Redis (Celery Broker)
    ┌─────────────────────────────────────────────────────────────────┐
    │                                                                 │
    │  PRIORITY QUEUES (ingestion layer)                              │
    │  ┌─────────────────────────────────────────────────────────┐    │
    │  │  notifications.high     ■■■■■■■■                        │    │
    │  │  notifications.medium   ■■■■■■■■■■■■■■■■                │    │
    │  │  notifications.low      ■■■                              │    │
    │  └─────────────────────────────┬───────────────────────────┘    │
    │                                │                                │
    │                       Dispatcher Worker                         │
    │                      (fan-out by channel)                       │
    │                                │                                │
    │  CHANNEL QUEUES (delivery layer)                                │
    │  ┌─────────────────────────────▼───────────────────────────┐    │
    │  │  notifications.email    ■■■■■■■■■■■■                    │    │
    │  │  notifications.sms      ■■■■■                           │    │
    │  │  notifications.webhook  ■■■■■■■■                        │    │
    │  └─────────────────────────────────────────────────────────┘    │
    │                                                                 │
    │  SYSTEM QUEUES                                                  │
    │  ┌─────────────────────────────────────────────────────────┐    │
    │  │  notifications.dlq      ■■  (manual retry processing)  │    │
    │  └─────────────────────────────────────────────────────────┘    │
    │                                                                 │
    └─────────────────────────────────────────────────────────────────┘
```

### 4.2 Task Routing Configuration

```python
# Celery task routing map
CELERY_TASK_ROUTES = {
    "workers.dispatcher.dispatch_event":     {"queue": "notifications.{priority}"},
    "workers.email_worker.send_email":       {"queue": "notifications.email"},
    "workers.sms_worker.send_sms":           {"queue": "notifications.sms"},
    "workers.webhook_worker.send_webhook":   {"queue": "notifications.webhook"},
    "workers.dispatcher.process_dlq_retry":  {"queue": "notifications.dlq"},
}
```

### 4.3 Worker-to-Queue Binding

```
┌─────────────────────┐     ┌─────────────────────────────────┐
│  worker-dispatcher   │────▶│ notifications.high              │
│  (concurrency: 4)   │────▶│ notifications.medium            │
│                      │────▶│ notifications.low               │
└─────────────────────┘     └─────────────────────────────────┘

┌─────────────────────┐     ┌─────────────────────────────────┐
│  worker-email        │────▶│ notifications.email             │
│  (concurrency: 4)   │     └─────────────────────────────────┘
│  (prefetch: 2)      │
└─────────────────────┘

┌─────────────────────┐     ┌─────────────────────────────────┐
│  worker-sms          │────▶│ notifications.sms               │
│  (concurrency: 4)   │     └─────────────────────────────────┘
│  (prefetch: 4)      │
└─────────────────────┘

┌─────────────────────┐     ┌─────────────────────────────────┐
│  worker-webhook      │────▶│ notifications.webhook           │
│  (concurrency: 6)   │     └─────────────────────────────────┘
│  (prefetch: 4)      │
└─────────────────────┘

┌─────────────────────┐     ┌─────────────────────────────────┐
│  worker-dlq          │────▶│ notifications.dlq               │
│  (concurrency: 1)   │     └─────────────────────────────────┘
└─────────────────────┘
```

### 4.4 Priority Queue Consumption Strategy

The dispatcher worker listens on all three priority queues with a weighted consumption strategy:

```
Queue Priority Weights:
  notifications.high   → weight 6  (consumed first, more aggressively)
  notifications.medium → weight 3  (consumed when high is empty or interleaved)
  notifications.low    → weight 1  (consumed when higher queues are idle)

Implementation:
  Celery worker with -Q notifications.high,notifications.medium,notifications.low
  Combined with task_default_priority and custom consumer configuration.
  High-priority tasks are consumed first due to Redis BRPOP ordering.
```

---

## 5. Retry & Dead-Letter Queue Flow

### 5.1 Retry State Machine

```
                          ┌─────────────────┐
                          │    processing    │
                          └────────┬────────┘
                                   │
                        delivery attempt
                                   │
                    ┌──────────────┼──────────────┐
                    │              │              │
                    ▼              ▼              ▼
             ┌───────────┐  ┌───────────┐  ┌───────────┐
             │ delivered  │  │ transient │  │ permanent │
             │ (success)  │  │  failure  │  │  failure  │
             └───────────┘  └─────┬─────┘  └─────┬─────┘
                                  │              │
                         retry_count++       skip retries
                                  │              │
                          ┌───────▼───────┐      │
                          │ retry_count   │      │
                          │ < max_retries │      │
                          │ ?             │      │
                          └───┬───────┬───┘      │
                              │       │          │
                           yes│       │no        │
                              │       │          │
                    ┌─────────▼──┐    │          │
                    │  schedule  │    │          │
                    │  retry w/  │    │          │
                    │  backoff   │    │          │
                    └─────┬──────┘    │          │
                          │           │          │
                          ▼           │          │
                    ┌───────────┐     │          │
                    │ processing│     │          │
                    │ (retry)   │─────┘          │
                    └───────────┘                │
                                                 │
                              ┌──────────────────▼───┐
                              │                      │
                              │     dead_letter      │
                              │                      │
                              │  - Create DLQ entry  │
                              │  - Store retry hist  │
                              │  - Broadcast via WS  │
                              │                      │
                              └──────────┬───────────┘
                                         │
                              ┌──────────▼───────────┐
                              │  Manual Intervention  │
                              │                       │
                              │  ┌─────┐  ┌────────┐  │
                              │  │Retry│  │Discard │  │
                              │  └──┬──┘  └───┬────┘  │
                              │     │         │       │
                              └─────┼─────────┼───────┘
                                    │         │
                              ┌─────▼──┐  ┌───▼─────┐
                              │ Re-    │  │ Soft    │
                              │ enqueue│  │ deleted │
                              └────────┘  └─────────┘
```

### 5.2 Exponential Backoff with Jitter

```
Algorithm: Full Jitter Exponential Backoff

  delay = random_between(0, min(max_backoff, base_delay × 2^attempt))

Example retry schedule (base_delay=10s, max_backoff=600s):

  Attempt │ Deterministic Delay │ With Jitter (range)
  ────────┼─────────────────────┼─────────────────────
     1    │          20s        │    0s  –   20s
     2    │          40s        │    0s  –   40s
     3    │          80s        │    0s  –   80s
     4    │         160s        │    0s  –  160s
     5    │         320s        │    0s  –  320s

  After attempt 5 (default max_retries=5) → move to dead-letter queue
```

### 5.3 Failure Classification

```
┌─────────────────────────────────────────────────────────────────┐
│                     Failure Classifier                          │
├─────────────────────────────────┬───────────────────────────────┤
│        TRANSIENT (retry)        │     PERMANENT (DLQ now)       │
├─────────────────────────────────┼───────────────────────────────┤
│ Connection timeout              │ 400 Bad Request               │
│ Connection refused              │ 401 Unauthorized              │
│ DNS resolution failure          │ 403 Forbidden                 │
│ HTTP 500 Internal Server Error  │ 404 Not Found                 │
│ HTTP 502 Bad Gateway            │ 410 Gone                      │
│ HTTP 503 Service Unavailable    │ 422 Unprocessable Entity      │
│ HTTP 504 Gateway Timeout        │ Invalid email address         │
│ HTTP 429 Too Many Requests *    │ Invalid phone number          │
│ Resend API rate limit (429)     │ Resend API validation error (422) │
│ Twilio rate limit               │ Twilio invalid number         │
│ SSL/TLS handshake failure       │ Authentication failure        │
└─────────────────────────────────┴───────────────────────────────┘

  * HTTP 429: retry with the Retry-After header value if present,
    otherwise use standard backoff
```

### 5.4 DLQ Entry Structure

```json
{
  "dlq_id": "dlq_abc123",
  "notification_id": "ntf_xyz789",
  "channel": "webhook",
  "recipient_address": "https://hooks.example.com/callback",
  "event_payload": { "event_type": "order.completed", "payload": { ... } },
  "error_type": "ConnectionTimeout",
  "error_message": "Connection to hooks.example.com timed out after 30s",
  "retry_count": 5,
  "retry_history": [
    { "attempt": 1, "timestamp": "...", "error": "ConnectionTimeout", "delay_s": 14 },
    { "attempt": 2, "timestamp": "...", "error": "ConnectionTimeout", "delay_s": 31 },
    { "attempt": 3, "timestamp": "...", "error": "HTTP 503",          "delay_s": 67 },
    { "attempt": 4, "timestamp": "...", "error": "ConnectionTimeout", "delay_s": 142 },
    { "attempt": 5, "timestamp": "...", "error": "ConnectionTimeout", "delay_s": 289 }
  ],
  "status": "active",
  "failed_at": "2025-07-17T12:15:00Z"
}
```

---

## 6. Real-Time Updates (WebSocket)

### 6.1 Architecture

The challenge: Celery workers run in separate processes (potentially separate containers) from the FastAPI server that manages WebSocket connections. Workers cannot directly push to WebSocket clients.

**Solution: Redis Pub/Sub as a bridge.**

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Email Worker │     │  SMS Worker  │     │Webhook Worker│
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       │ PUBLISH            │ PUBLISH            │ PUBLISH
       │                    │                    │
       ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────┐
│                                                         │
│              Redis Pub/Sub Channel:                      │
│              "notifications:status_updates"              │
│                                                         │
└─────────────────────────────┬───────────────────────────┘
                              │
                        SUBSCRIBE
                              │
                              ▼
                   ┌──────────────────────┐
                   │   FastAPI Server      │
                   │                       │
                   │  ┌─────────────────┐  │
                   │  │ Pub/Sub Listener │  │  (background asyncio task)
                   │  └────────┬────────┘  │
                   │           │           │
                   │  ┌────────▼────────┐  │
                   │  │  Connection     │  │  (manages all active WS connections)
                   │  │  Manager        │  │
                   │  └────────┬────────┘  │
                   │           │           │
                   └───────────┼───────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
       ┌────────────┐  ┌────────────┐  ┌────────────┐
       │  Browser 1 │  │  Browser 2 │  │  Browser 3 │
       │  (WS conn) │  │  (WS conn) │  │  (WS conn) │
       └────────────┘  └────────────┘  └────────────┘
```

### 6.2 Message Types

```
Server → Client Messages:

1. notification.status_changed
   Triggered: Every notification status transition
   Data: notification_id, event_id, channel, previous_status, new_status, timestamp

2. queue.depth_update
   Triggered: Every 5 seconds (periodic Celery beat task)
   Data: queue_name, depth, timestamp

3. worker.status_changed
   Triggered: Worker connect/disconnect, idle/busy transition
   Data: worker_id, channel, status, timestamp

4. system.health_update
   Triggered: Every 15 seconds (periodic health check)
   Data: overall_status, component_statuses
```

### 6.3 Connection Manager Design

```python
# Pseudocode for WebSocket connection manager

class ConnectionManager:
    active_connections: dict[str, WebSocket]   # connection_id → WebSocket

    async def connect(ws: WebSocket, api_key: str):
        # Validate API key
        # Accept WebSocket upgrade
        # Register connection

    async def disconnect(connection_id: str):
        # Remove from active set
        # Clean up

    async def broadcast(message: dict):
        # Send to ALL active connections
        # Remove stale connections on send failure

    async def listen_redis():
        # Subscribe to Redis Pub/Sub
        # On message: broadcast to all connections
        # Runs as background asyncio task on FastAPI startup
```

### 6.4 Client-Side Integration

```
React App
┌──────────────────────────────────────────┐
│                                          │
│  useWebSocket() hook                     │
│  ┌────────────────────────────────────┐  │
│  │ 1. Connect to /ws/notifications    │  │
│  │ 2. Auto-reconnect with backoff     │  │
│  │ 3. Parse incoming JSON messages    │  │
│  │ 4. Dispatch to Zustand stores      │  │
│  └────────────────────────────────────┘  │
│                                          │
│  Zustand Stores                          │
│  ┌──────────────────┐ ┌───────────────┐  │
│  │notificationStore │ │ websocketStore│  │
│  │                  │ │               │  │
│  │ - update status  │ │ - conn state  │  │
│  │ - add to feed    │ │ - reconnect   │  │
│  │ - update counts  │ │ - message log │  │
│  └──────────────────┘ └───────────────┘  │
│                                          │
│  Components subscribe to store slices    │
│  and re-render on relevant changes       │
└──────────────────────────────────────────┘
```

---

## 7. Rate Limiting Design

### 7.1 Sliding Window Counter Algorithm

The system uses a **sliding window log** implemented with Redis sorted sets for precise rate limiting without the boundary issues of fixed windows.

```
Example: API rate limit = 100 requests per 60 seconds

Redis Key: rate_limit:api:{api_key_hash}
Redis Type: Sorted Set (ZSET)

Each request:
  Member: unique request ID (UUID or timestamp:random)
  Score:  request timestamp (Unix epoch, milliseconds)

Operations (executed atomically via Lua script):

  1. ZREMRANGEBYSCORE key 0 (now - window_size)
     → Remove entries older than the window

  2. ZCARD key
     → Count remaining entries

  3. If count >= limit:
     → REJECT (return 429)
     → Set Retry-After header = oldest_entry_timestamp + window_size - now

  4. If count < limit:
     → ZADD key now member
     → EXPIRE key window_size
     → ALLOW request
```

### 7.2 Redis Lua Script (Atomic Rate Check)

```
Lua script executed atomically in Redis:

  local key = KEYS[1]
  local window = tonumber(ARGV[1])    -- window size in ms
  local limit = tonumber(ARGV[2])     -- max requests
  local now = tonumber(ARGV[3])       -- current timestamp ms
  local member = ARGV[4]              -- unique request ID

  -- Remove expired entries
  redis.call('ZREMRANGEBYSCORE', key, 0, now - window)

  -- Count current entries
  local count = redis.call('ZCARD', key)

  if count >= limit then
    -- Calculate retry-after
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    local retry_after = 0
    if #oldest > 0 then
      retry_after = (tonumber(oldest[2]) + window - now) / 1000
    end
    return {0, retry_after}  -- rejected
  end

  -- Allow and record
  redis.call('ZADD', key, now, member)
  redis.call('PEXPIRE', key, window)
  return {1, limit - count - 1}  -- allowed, remaining
```

### 7.3 Two-Level Rate Limiting

```
┌─────────────────────────────────────────────────────────┐
│                    API Layer                             │
│                                                         │
│   Client Request                                        │
│        │                                                │
│        ▼                                                │
│   ┌────────────────────────────┐                        │
│   │  Per-API-Key Rate Limit    │                        │
│   │                            │                        │
│   │  Key: rate_limit:api:{key} │     ┌─────┐           │
│   │  Default: 1000 req/min     │────▶│ 429 │  REJECT   │
│   │  Configurable per key      │     └─────┘           │
│   └────────────┬───────────────┘                        │
│                │ PASS                                   │
│                ▼                                        │
│        Process request...                               │
│        Enqueue Celery task                              │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│                    Worker Layer                          │
│                                                         │
│   Channel Worker picks up task                          │
│        │                                                │
│        ▼                                                │
│   ┌─────────────────────────────────┐                   │
│   │  Per-Channel Rate Limit         │                   │
│   │                                 │                   │
│   │  Key: rate_limit:ch:{channel}   │     ┌──────────┐ │
│   │  email:   100/min               │────▶│ Re-queue │ │
│   │  sms:      60/min               │     │ (delay)  │ │
│   │  webhook: 500/min               │     └──────────┘ │
│   └────────────┬────────────────────┘                   │
│                │ PASS                                   │
│                ▼                                        │
│        Deliver notification                             │
└─────────────────────────────────────────────────────────┘

Note: Channel rate limit hits cause a short re-enqueue delay,
NOT a retry failure. retry_count is NOT incremented.
```

---

## 8. Idempotency Design

### 8.1 Flow Diagram

```
Client Request
  Headers: Idempotency-Key: "idem_abc123"
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│                   Idempotency Middleware                     │
│                                                             │
│  1. Extract Idempotency-Key header                          │
│     - If missing → proceed without idempotency              │
│                                                             │
│  2. Compute request fingerprint                             │
│     hash = SHA256(method + path + body)                     │
│                                                             │
│  3. Redis: GET idempotency:{api_key}:{idem_key}             │
│     ┌──────────────────────────────────────────────┐        │
│     │                                              │        │
│     │  Key exists?                                 │        │
│     │  ├── YES                                     │        │
│     │  │   ├── fingerprint matches?                │        │
│     │  │   │   ├── YES → Return cached response    │        │
│     │  │   │   └── NO  → Return 422 (conflict)     │        │
│     │  │   │                                       │        │
│     │  └── NO                                      │        │
│     │      └── Acquire lock (SET NX, TTL=30s)      │        │
│     │          ├── Lock acquired                   │        │
│     │          │   └── Process request             │        │
│     │          │       Store response in Redis     │        │
│     │          │       TTL: 24 hours               │        │
│     │          │       Release lock                │        │
│     │          │       Return response             │        │
│     │          └── Lock NOT acquired               │        │
│     │              └── Wait 100ms, retry GET       │        │
│     │                  (up to 3 attempts)          │        │
│     │                  └── Return cached response  │        │
│     └──────────────────────────────────────────────┘        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 8.2 Redis Key Structure

```
Key Format:
  idempotency:{api_key_prefix}:{idempotency_key}

Value (JSON):
  {
    "fingerprint": "sha256:a1b2c3d4...",
    "status_code": 202,
    "response_body": { "event_id": "...", "notification_ids": [...] },
    "created_at": "2025-07-17T12:00:00Z"
  }

TTL: 86400 seconds (24 hours, configurable)

Lock Key:
  idempotency_lock:{api_key_prefix}:{idempotency_key}
  TTL: 30 seconds (prevents orphaned locks)
```

### 8.3 Sequence Diagram

```
Client              FastAPI             Redis              PostgreSQL
  │                    │                  │                     │
  │  POST /events/     │                  │                     │
  │  Idem-Key: abc     │                  │                     │
  │───────────────────▶│                  │                     │
  │                    │  GET idem:abc    │                     │
  │                    │─────────────────▶│                     │
  │                    │     (nil)        │                     │
  │                    │◀─────────────────│                     │
  │                    │                  │                     │
  │                    │  SET NX lock:abc │                     │
  │                    │─────────────────▶│                     │
  │                    │     (OK)         │                     │
  │                    │◀─────────────────│                     │
  │                    │                  │                     │
  │                    │                  │  INSERT event       │
  │                    │                  │─────────────────────▶
  │                    │                  │     (OK)            │
  │                    │                  │◀────────────────────│
  │                    │                  │                     │
  │                    │  SET idem:abc    │                     │
  │                    │  {response}      │                     │
  │                    │  EX 86400        │                     │
  │                    │─────────────────▶│                     │
  │                    │                  │                     │
  │                    │  DEL lock:abc    │                     │
  │                    │─────────────────▶│                     │
  │                    │                  │                     │
  │  202 Accepted      │                  │                     │
  │◀───────────────────│                  │                     │
  │                    │                  │                     │
  │  POST /events/     │                  │                     │
  │  Idem-Key: abc     │                  │                     │
  │  (DUPLICATE)       │                  │                     │
  │───────────────────▶│                  │                     │
  │                    │  GET idem:abc    │                     │
  │                    │─────────────────▶│                     │
  │                    │  {cached resp}   │                     │
  │                    │◀─────────────────│                     │
  │                    │                  │                     │
  │  202 Accepted      │                  │                     │
  │  (cached response) │                  │                     │
  │◀───────────────────│                  │                     │
```

---

## 9. Scaling Strategy

### 9.1 Component Scalability Matrix

```
┌─────────────────────┬───────────┬─────────────────────────────────────────┐
│ Component           │ Stateless │ Scaling Strategy                        │
├─────────────────────┼───────────┼─────────────────────────────────────────┤
│ FastAPI Server      │    Yes    │ Horizontal: add more containers behind  │
│                     │           │ load balancer. Sticky sessions for WS.  │
├─────────────────────┼───────────┼─────────────────────────────────────────┤
│ Email Worker        │    Yes    │ Horizontal: docker compose --scale N    │
│                     │           │ Limited by provider rate limits.        │
├─────────────────────┼───────────┼─────────────────────────────────────────┤
│ SMS Worker          │    Yes    │ Horizontal: docker compose --scale N    │
│                     │           │ Limited by Twilio rate limits.          │
├─────────────────────┼───────────┼─────────────────────────────────────────┤
│ Webhook Worker      │    Yes    │ Horizontal: docker compose --scale N    │
│                     │           │ Most parallelizable (diverse targets).  │
├─────────────────────┼───────────┼─────────────────────────────────────────┤
│ Redis               │    No     │ Vertical (memory), then Redis Cluster   │
│                     │           │ or Redis Sentinel for HA.              │
├─────────────────────┼───────────┼─────────────────────────────────────────┤
│ PostgreSQL          │    No     │ Vertical first. Read replicas for       │
│                     │           │ analytics queries. Connection pooling.  │
├─────────────────────┼───────────┼─────────────────────────────────────────┤
│ React Dashboard     │    Yes    │ Static build served by CDN/NGINX.       │
│                     │           │ No server-side state.                   │
└─────────────────────┴───────────┴─────────────────────────────────────────┘
```

### 9.2 Bottleneck Analysis

```
Throughput Bottlenecks (likely order of encounter):

1. External Provider Rate Limits
   ┌──────────────┬───────────────────────────┐
   │ Provider     │ Typical Limit             │
   ├──────────────┼───────────────────────────┤
   │ Resend       │ 100 emails/second (free)  │
   │ Twilio SMS   │ 1 msg/sec/number          │
   │ Webhooks     │ Varies by receiver        │
   └──────────────┴───────────────────────────┘
   Mitigation: Channel rate limiting, multiple provider accounts

2. PostgreSQL Write Throughput
   Every notification generates multiple writes (status + log).
   Mitigation: Batch writes, async writes, write-ahead buffering.

3. Redis Memory
   Queues + rate limit counters + idempotency cache.
   Mitigation: TTLs on all keys, monitoring memory usage.

4. Network I/O (Workers)
   Workers are I/O bound (HTTP calls to Resend, Twilio, webhooks).
   Mitigation: Async I/O within workers, connection pooling.
```

### 9.3 Scaling Configurations

```
SMALL (development / demo)
  1× FastAPI server
  1× Dispatcher worker (concurrency 2)
  1× Email worker (concurrency 2)
  1× SMS worker (concurrency 2)
  1× Webhook worker (concurrency 2)
  1× Redis (256MB)
  1× PostgreSQL
  Throughput: ~50 notifications/minute

MEDIUM (staging / moderate load)
  2× FastAPI server (behind load balancer)
  1× Dispatcher worker (concurrency 4)
  2× Email worker (concurrency 4 each)
  1× SMS worker (concurrency 4)
  3× Webhook worker (concurrency 6 each)
  1× Redis (1GB)
  1× PostgreSQL (with connection pooling)
  Throughput: ~500 notifications/minute

LARGE (production / high load)
  4× FastAPI server (behind load balancer)
  2× Dispatcher worker (concurrency 8 each)
  4× Email worker (concurrency 8 each)
  2× SMS worker (concurrency 4 each)
  6× Webhook worker (concurrency 8 each)
  Redis Cluster (3 nodes, 4GB each)
  PostgreSQL primary + 2 read replicas
  Throughput: ~5000 notifications/minute
```

---

## 10. Docker Compose Stack

### 10.1 Service Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        docker-compose.yml                           │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │              │  │              │  │                          │  │
│  │    redis     │  │   postgres   │  │       frontend           │  │
│  │   :6379      │  │   :5432      │  │       :5173              │  │
│  │              │  │              │  │  (Vite dev server)       │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────────────────────┘  │
│         │                 │                                        │
│         │    ┌────────────┤                                        │
│         │    │            │                                        │
│  ┌──────▼────▼───┐       │                                        │
│  │               │       │                                        │
│  │      api      │◀──────┘                                        │
│  │    :8000      │                                                │
│  │  (FastAPI +   │                                                │
│  │   uvicorn)    │                                                │
│  │               │                                                │
│  └───────────────┘                                                │
│         │                                                         │
│  ┌──────▼───────────────────────────────────────────────────┐     │
│  │                  Celery Workers                           │     │
│  │                                                           │     │
│  │  ┌──────────────┐  ┌──────────┐  ┌──────────────────┐    │     │
│  │  │ worker-      │  │ worker-  │  │ worker-          │    │     │
│  │  │ dispatcher   │  │ email    │  │ sms              │    │     │
│  │  └──────────────┘  └──────────┘  └──────────────────┘    │     │
│  │                                                           │     │
│  │  ┌──────────────┐  ┌──────────┐                           │     │
│  │  │ worker-      │  │ celery-  │                           │     │
│  │  │ webhook      │  │ beat     │  (periodic tasks)         │     │
│  │  └──────────────┘  └──────────┘                           │     │
│  │                                                           │     │
│  └───────────────────────────────────────────────────────────┘     │
│                                                                     │
│  Networks: notification-network (bridge)                            │
│  Volumes:  postgres-data, redis-data                                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 10.2 Docker Compose Configuration

```yaml
# docker-compose.yml (structure overview)

services:
  # ─── Infrastructure ───────────────────────────────────
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    volumes: [redis-data:/data]
    healthcheck:
      test: redis-cli ping
      interval: 10s

  postgres:
    image: postgres:16-alpine
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: notifications
      POSTGRES_USER: notif_user
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes: [postgres-data:/var/lib/postgresql/data]
    healthcheck:
      test: pg_isready -U notif_user
      interval: 10s

  # ─── Application ──────────────────────────────────────
  api:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports: ["8000:8000"]
    command: >
      uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
    environment:
      DATABASE_URL: postgresql+asyncpg://notif_user:${POSTGRES_PASSWORD}@postgres/notifications
      REDIS_URL: redis://redis:6379/0
      RESEND_API_KEY: ${RESEND_API_KEY}
      EMAIL_FROM_ADDRESS: ${EMAIL_FROM_ADDRESS}
      SMS_PROVIDER: ${SMS_PROVIDER:-mock}
    depends_on:
      redis: { condition: service_healthy }
      postgres: { condition: service_healthy }

  # ─── Workers ──────────────────────────────────────────
  worker-dispatcher:
    build: ./backend
    command: >
      celery -A app.workers.celery_app worker
      -Q notifications.high,notifications.medium,notifications.low
      --concurrency=4 --loglevel=info
    depends_on: [redis, postgres]

  worker-email:
    build: ./backend
    command: >
      celery -A app.workers.celery_app worker
      -Q notifications.email
      --concurrency=4 --loglevel=info
    depends_on: [redis, postgres]

  worker-sms:
    build: ./backend
    command: >
      celery -A app.workers.celery_app worker
      -Q notifications.sms
      --concurrency=4 --loglevel=info
    depends_on: [redis, postgres]

  worker-webhook:
    build: ./backend
    command: >
      celery -A app.workers.celery_app worker
      -Q notifications.webhook
      --concurrency=6 --loglevel=info
    depends_on: [redis, postgres]

  celery-beat:
    build: ./backend
    command: >
      celery -A app.workers.celery_app beat
      --loglevel=info
    depends_on: [redis]

  # ─── Frontend ─────────────────────────────────────────
  frontend:
    build: ./frontend
    ports: ["5173:5173"]
    command: npm run dev -- --host
    volumes:
      - ./frontend/src:/app/src
    depends_on: [api]

volumes:
  postgres-data:
  redis-data:

networks:
  default:
    name: notification-network
```

### 10.3 Service Dependency Graph

```
                    ┌──────────┐
                    │  redis   │
                    └──┬───┬───┘
                       │   │
          ┌────────────┘   └──────────────────────┐
          │                                        │
          ▼                                        ▼
    ┌──────────┐                          ┌──────────────┐
    │ postgres │                          │ celery-beat  │
    └──┬───────┘                          └──────────────┘
       │
       ├──────────────────┐
       │                  │
       ▼                  ▼
  ┌─────────┐    ┌─────────────────────────────────────────────┐
  │   api   │    │              Celery Workers                  │
  └────┬────┘    │                                              │
       │         │  worker-dispatcher  worker-email             │
       │         │  worker-sms         worker-webhook           │
       │         └──────────────────────────────────────────────┘
       │
       ▼
  ┌──────────┐
  │ frontend │
  └──────────┘

Startup Order:
  1. redis, postgres          (infrastructure, no deps)
  2. api, all workers, beat   (depend on redis + postgres)
  3. frontend                 (depends on api)
```

### 10.4 Development Workflow

```
# Start the full stack
docker compose up -d

# Watch logs
docker compose logs -f api worker-email

# Scale a specific worker
docker compose up -d --scale worker-email=3

# Run database migrations
docker compose exec api alembic upgrade head

# Seed test data
docker compose exec api python scripts/seed.py

# Run backend tests (in Docker)
docker compose exec api pytest

# Run locally with uv (outside Docker)
# uv sync             — install dependencies
# uv run pytest       — run tests
# uv run celery ...   — run workers
# uv run uvicorn ...  — run API server

# Run frontend tests
docker compose exec frontend npm test

# Stop everything
docker compose down

# Stop and remove all data
docker compose down -v
```

### 10.5 Environment Variables

```
# .env.example

# ─── Database ────────────────────────────────────
POSTGRES_PASSWORD=local_dev_password
DATABASE_URL=postgresql+asyncpg://notif_user:local_dev_password@postgres:5432/notifications

# ─── Redis ───────────────────────────────────────
REDIS_URL=redis://redis:6379/0

# ─── API Server ──────────────────────────────────
API_HOST=0.0.0.0
API_PORT=8000
API_WORKERS=1
LOG_LEVEL=info
LOG_FORMAT=json

# ─── Rate Limiting ───────────────────────────────
DEFAULT_RATE_LIMIT_PER_MIN=1000
RATE_LIMIT_WINDOW_SECONDS=60

# ─── Idempotency ─────────────────────────────────
IDEMPOTENCY_TTL_SECONDS=86400

# ─── Email Channel (Resend) ──────────────────────
RESEND_API_KEY=re_xxxxxxxxxxxx
EMAIL_FROM_ADDRESS=notifications@yourdomain.com

# ─── SMS Channel ─────────────────────────────────
SMS_PROVIDER=mock
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=

# ─── Webhook Channel ─────────────────────────────
WEBHOOK_DEFAULT_TIMEOUT_SECONDS=30
WEBHOOK_MAX_REDIRECTS=3

# ─── Retry Defaults ──────────────────────────────
RETRY_MAX_RETRIES=5
RETRY_BASE_DELAY_SECONDS=10
RETRY_MAX_BACKOFF_SECONDS=600
RETRY_JITTER_ENABLED=true

# ─── Celery ──────────────────────────────────────
CELERY_BROKER_URL=redis://redis:6379/0
CELERY_RESULT_BACKEND=redis://redis:6379/1
```

---

_This architecture document is the companion to [PRD.md](./PRD.md). Together, they form the complete specification for implementing the Event-Driven Notification System._
