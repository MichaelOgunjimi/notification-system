# 🔔 Event-Driven Notification System

A production-grade, event-driven notification system that demonstrates mastery of distributed systems concepts — message queues, async workers, retry logic, dead-letter queues, idempotency, and real-time monitoring.

Built with FastAPI, Celery, Redis, and PostgreSQL, it accepts events via a REST API, processes them asynchronously through priority queues, and delivers notifications across email, SMS, and webhook channels — with full observability via a React dashboard.

## Architecture

```text
┌──────────┐     ┌─────────────┐     ┌─────────────┐     ┌──────────────────┐
│  Client   │────▶│  FastAPI API │────▶│ Redis Queue  │────▶│  Celery Workers  │
│           │     │  (REST)     │     │  (Priority)  │     │                  │
└──────────┘     └──────┬──────┘     └─────────────┘     │  ┌─────────────┐ │
                        │                                 │  │ Email (SMTP / │ │
                        │                                 │  │ Resend)       │ │
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

| Concept                      | Implementation                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------- |
| Async message processing     | Celery workers consuming from Redis-backed queues                               |
| Priority queues              | Multiple Celery queues with priority routing (`high`, `medium`, `low`)          |
| At-least-once delivery       | `acks_late` with idempotent workers — tasks survive crashes                     |
| Exactly-once semantics       | Idempotency keys with Redis `SET NX` deduplication                              |
| Exponential backoff + jitter | Configurable retry policies per channel (`delay = random(0, base * 2^attempt)`) |
| Dead-letter queues           | Failed tasks routed to PostgreSQL-backed DLQ after max retries                  |
| Fan-out pattern              | Batch events decomposed into individual channel tasks                           |
| Rate limiting                | Sliding window counters in Redis (Lua scripts for atomicity)                    |
| Real-time streaming          | WebSocket push for live notification status updates                             |
| Horizontal scalability       | Stateless workers, independently scalable per channel                           |
| Circuit breakers             | Graceful degradation with health checks and fallback behavior                   |

## Tech Stack

| Layer              | Technology                                                         |
| ------------------ | ------------------------------------------------------------------ |
| **API**            | FastAPI, Pydantic v2, SQLModel, Alembic                            |
| **Task Queue**     | Celery, Redis (broker + result backend)                            |
| **Database**       | PostgreSQL                                                         |
| **Delivery**       | SMTP/Mailpit or Resend (email), Twilio (SMS), HMAC-signed webhooks |
| **Frontend**       | Next.js 16, React 19, TypeScript, Tailwind CSS v4                  |
| **Infrastructure** | Docker Compose, uv (package manager)                               |

## Features

### Core Backend

- **Event Ingestion** — REST API with JSON Schema validation, API key auth, and idempotency support
- **Priority Queue Routing** — Events dispatched to `high`, `medium`, `low` queues with channel fan-out
- **Email Worker** — SMTP or Resend adapter with HTML/plain-text Jinja2 templates
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
- **Settings** — Project-scoped API keys, channel configuration, retry and rate limit policies
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

# Install Python and JavaScript workspace dependencies
make install

# Start the complete Docker stack
make docker-up

# Run database migrations
make migrate

# Seed sample data
make seed

# Or run each application locally in separate terminals
make dev-api   # http://localhost:8000
make dev-web   # http://localhost:3000
make dev-docs  # http://localhost:3001
```

### Interactive API Docs

Once the server is running, visit <http://localhost:8000/docs> for the Swagger UI.

### GitHub login

Human accounts can register with GitHub OAuth or an emailed magic link. The first
verified login creates an owner organization with a default project. External identities
are stored as generic OAuth accounts, so more providers can be enabled later without
changing the user model. Create a GitHub OAuth App with this callback URL:

```text
http://localhost:8000/api/v1/oauth/github/callback
```

Set `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and a strong `JWT_SECRET` in `.env`,
then open `http://localhost:8000/api/v1/oauth/github/login`. The callback redirects to
the configured frontend `/auth/callback` route with access and refresh tokens in the URL
fragment. An authenticated magic-link user can open `/api/v1/oauth/github/connect` to
attach GitHub and add its verified email as a secondary login address.

Magic links use `POST /api/v1/auth/magic-link/request` followed by
`POST /api/v1/auth/magic-link/verify`. A new user is created only after consuming the
one-time link. Docker Compose routes development email to Mailpit; inspect captured mail
at <http://localhost:8025>. Production can use `EMAIL_PROVIDER=resend` with
`RESEND_API_KEY`, or another SMTP server through the `SMTP_*` settings.

Access tokens authenticate `/api/v1/auth/me`; `/api/v1/auth/refresh` renews an access
token, and `/api/v1/auth/logout` revokes the refresh-token JTI in Redis and PostgreSQL.

### Project API keys

Organization owners and admins manage scoped credentials with a user access token:

```text
POST   /api/v1/projects/{project_id}/api-keys
GET    /api/v1/projects/{project_id}/api-keys
PATCH  /api/v1/projects/{project_id}/api-keys/{api_key_id}
POST   /api/v1/projects/{project_id}/api-keys/{api_key_id}/rotate
DELETE /api/v1/projects/{project_id}/api-keys/{api_key_id}
```

The secret is returned only when a key is created or rotated. Keys belong to one project,
are marked `test` or `live`, and can be independently revoked. Scopes control read
and write access to events, templates, notifications, scheduled events, suppressions,
alerts, analytics, dead letters, usage, audit history, and settings.

### SaaS control plane

Authenticated users can edit and archive organizations and projects, invite members,
manage member roles, inspect project audit logs, and roll project usage up across an
organization. Invitations require the recipient to prove ownership of the verified email
address that received the invitation.

Platform administration does not use a shared master key. Platform admins are normal
authenticated users with an `AdminUser` role and explicit permissions. After the first
administrator has registered and verified their email, bootstrap that account once:

```bash
cd apps/api
uv run python -m scripts.bootstrap_admin --email me@michaelogunjimi.com
```

Admins can provision separate scoped `nsk_` credentials for internal workers through
the system-account endpoints. These secrets are returned once, stored as hashes, and can
be revoked without affecting customer project keys.

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
├── apps/
│   ├── api/                    # FastAPI API, Celery workers, migrations, tests
│   ├── web/                    # Main site, authentication, and SaaS dashboard
│   └── docs/                   # Documentation site for the docs subdomain
├── packages/
│   └── typescript-config/      # Shared strict Next.js TypeScript configuration
├── docker-compose.yml          # Apps, workers, Postgres, Redis, and Mailpit
├── package.json                # npm workspace commands
├── Makefile                    # Repository-wide development commands
└── README.md
```

## Documentation

The documentation application lives in `apps/docs`. Its Markdown source is under
`apps/docs/content/docs`, and the deployed app is intended to run at a dedicated
documentation subdomain.

## License

MIT
