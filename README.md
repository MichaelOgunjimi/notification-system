# 🔔 Event-Driven Notification System

A production-grade, event-driven notification system that demonstrates mastery of distributed systems concepts — message queues, async workers, retry logic, dead-letter queues, idempotency, and real-time monitoring.

Built with FastAPI, Celery, Redis, and PostgreSQL, it accepts events via a REST API, processes them asynchronously through priority queues, and delivers notifications across email, SMS, and webhook channels — with full observability via a React dashboard.

## Architecture

```text
┌──────────┐     ┌─────────────┐     ┌─────────────┐     ┌──────────────────┐
│  Client   │────▶│  FastAPI API │────▶│ Redis Queue  │────▶│  Celery Workers  │
│           │     │  (REST)     │     │  (Priority)  │     │                  │
└──────────┘     └──────┬──────┘     └─────────────┘     │  ┌─────────────┐ │
                        │                                 │  │ Email (Resend)│ │
                        │                                 │  ├─────────────┤ │
                        │                                 │  │ SMS (Twilio) │ │
                        │                                 │  ├─────────────┤ │
                        │                                 │  │ Webhook      │ │
                        │                                 │  └─────────────┘ │
                        │                                 └────────┬─────────┘
                   ┌────▼────┐                                     │
                   │PostgreSQL│◀────────────────────────────────────┘
                   └────┬────┘          Status Updates
                        │
                   ┌────▼─────────┐
                   │React Dashboard│
                   │  (WebSocket)  │
                   └──────────────┘
```

## Key Concepts Demonstrated

| Concept | Implementation |
| --- | --- |
| Async message processing | Celery workers consuming from Redis-backed queues |
| Priority queues | Multiple Celery queues with priority routing (`high`, `medium`, `low`) |
| At-least-once delivery | `acks_late` with idempotent workers — tasks survive crashes |
| Exactly-once semantics | Idempotency keys with Redis `SET NX` deduplication |
| Exponential backoff + jitter | Configurable retry policies per channel (`delay = random(0, base * 2^attempt)`) |
| Dead-letter queues | Failed tasks routed to PostgreSQL-backed DLQ after max retries |
| Fan-out pattern | Batch events decomposed into individual channel tasks |
| Rate limiting | Sliding window counters in Redis (Lua scripts for atomicity) |
| Real-time streaming | WebSocket push for live notification status updates |
| Horizontal scalability | Stateless workers, independently scalable per channel |
| Circuit breakers | Graceful degradation with health checks and fallback behavior |

## Tech Stack

| Layer | Technology |
| --- | --- |
| **API** | FastAPI, Pydantic v2, SQLModel, Alembic |
| **Task Queue** | Celery, Redis (broker + result backend) |
| **Database** | PostgreSQL |
| **Delivery** | Resend (email), Twilio (SMS), HMAC-signed webhooks |
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS v4 |
| **Infrastructure** | Docker Compose, uv (package manager) |

## Features

### Core Backend

- **Event Ingestion** — REST API with JSON Schema validation, API key auth, and idempotency support
- **Priority Queue Routing** — Events dispatched to `high`, `medium`, `low` queues with channel fan-out
- **Email Worker** — Resend adapter with HTML/plain-text Jinja2 templates and bounce tracking
- **SMS Worker** — Twilio adapter with E.164 validation and mock adapter for local dev
- **Webhook Worker** — HMAC-SHA256 signed payloads with configurable timeouts and redirect following
- **Retry Engine** — Exponential backoff with jitter, per-channel policies, transient vs. permanent failure detection
- **Dead-Letter Queue** — PostgreSQL-backed DLQ with manual/bulk retry and full error forensics
- **Idempotency** — Redis-backed deduplication with TTL, request hash binding, and concurrent request locking
- **Rate Limiting** — Sliding window counters (Redis sorted sets + Lua) at API and channel levels
- **Batch Processing** — Up to 1,000 recipients per request with aggregate status tracking

### Dashboard (Frontend)

- **Overview** — Live metric cards, activity feed, queue depth sparklines, system health indicators
- **Notification History** — Searchable table with expandable delivery timelines and bulk actions
- **Queue Monitor** — Real-time queue depth charts, active workers, processing rate
- **Dead Letter Manager** — DLQ browser with retry/discard actions and error forensics
- **Analytics** — Delivery success rates, latency percentiles (p50/p95/p99), channel breakdown
- **Template Editor** — Jinja2 editor with live preview, variable validation, and version history
- **Settings** — API key management, channel configuration, retry and rate limit policies
- **Event Playground** — Interactive request builder with live flow visualization

## Quick Start

### Prerequisites

- Python 3.12+
- [uv](https://docs.astral.sh/uv/) (Python package manager)
- Docker & Docker Compose
- Node.js 20+ (for frontend)

### Development

```bash
# Clone the repo
git clone https://github.com/yourusername/notification-system.git
cd notification-system

# Install Python dependencies
make install

# Start infrastructure (PostgreSQL, Redis)
make docker-up

# Run database migrations
make migrate

# Seed sample data
make seed

# Start the API server (http://localhost:8000)
make dev
```

### Interactive API Docs

Once the server is running, visit <http://localhost:8000/docs> for the Swagger UI.

## API Overview

```bash
# Submit a notification event
curl -X POST http://localhost:8000/api/v1/events/ \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "event_type": "order.completed",
    "recipients": [{
      "user_id": "usr_abc123",
      "channels": ["email"],
      "email": "user@example.com"
    }],
    "priority": "high",
    "template_id": "tmpl_order_complete",
    "payload": { "order_id": "ord_789", "total": "$149.99" }
  }'

# Check notification status
curl http://localhost:8000/api/v1/notifications/{notification_id} \
  -H "X-API-Key: your-api-key"

# Health check
curl http://localhost:8000/api/v1/health/
```

## Project Structure

```text
notification-system/
├── backend/
│   ├── app/              # FastAPI application
│   ├── alembic/          # Database migrations
│   ├── scripts/          # Seed data and utilities
│   └── tests/            # Test suite
├── docs/
│   ├── PRD.md            # Full product requirements
│   ├── architecture.md   # System design deep-dive
│   └── CONCEPTS.md       # Distributed systems concepts explained
├── docker-compose.yml
├── Makefile              # Dev commands (install, dev, test, lint, migrate, seed)
└── README.md
```

## Documentation

| Document | Description |
| --- | --- |
| [PRD](docs/PRD.md) | Full product requirements document |
| [Architecture](docs/architecture.md) | System design and component deep-dive |
| [Concepts Guide](docs/CONCEPTS.md) | Distributed systems concepts with interview talking points |

## License

MIT
