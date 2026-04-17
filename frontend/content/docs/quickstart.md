# Quickstart

This guide gets Beacon running locally and walks you through your first end-to-end event.

By the end, you will:

- start all required services
- create a project API key
- submit an event
- inspect event and notification status
- verify the dashboard is reachable

## Prerequisites

Install the following before you begin:

- Docker
- Docker Compose

Verify your environment:

```bash
docker --version
docker compose version
```

If both commands return versions, you are ready.

## 1) Start Beacon

From the project root, start all services:

```bash
docker compose up --build -d
```

This builds images (if needed) and starts containers in detached mode.

Check container status:

```bash
docker compose ps
```

## 2) Confirm Running Services

Beacon starts these core services:

| Service | Purpose | Port |
| --- | --- | --- |
| PostgreSQL | Primary relational storage | `5433` |
| Redis | Queue broker and cache | `6379` |
| API | REST ingestion and query API | `8000` |
| Celery Worker | Async notification delivery | internal |
| Celery Beat | Scheduled/background jobs | internal |
| Frontend | Dashboard UI | `3001` |

> Internal worker processes usually do not expose host ports. Use API endpoints and logs to verify activity.

Optional health check:

```bash
curl -s http://localhost:8000/api/v1/health | jq
```

## 3) Get the Master API Key

Beacon uses `X-API-Key` for authentication on all protected endpoints.

Key types:

- **Master key**: admin-level key, used for setup and privileged operations.
- **Project API key**: regular key used by applications to send events.

The master key is configured in environment variable `MASTER_API_KEY`.

If running through Docker Compose, inspect env values from your configuration source (for example `.env` or compose env settings).

## 4) Create a Project API Key

Use the master key to mint a project-scoped key:

```bash
curl -X POST http://localhost:8000/api/v1/settings/api-keys \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_MASTER_KEY" \
  -d '{
    "name": "my-app"
  }'
```

Example response:

```json
{
  "id": "ak_01hzxyz123",
  "name": "my-app",
  "api_key": "beacon_pk_live_abc123...",
  "created_at": "2026-01-12T10:30:45Z"
}
```

Save `api_key` from the response as `YOUR_PROJECT_KEY`.

> The plaintext project key may only be shown once depending on configuration. Store it securely.

## 5) Send Your First Event

Submit an event using the project key:

```bash
curl -X POST http://localhost:8000/api/v1/events \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_PROJECT_KEY" \
  -d '{
    "event_type": "user.welcome",
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

- HTTP status: `202 Accepted`
- Response includes an event ID for tracking

Example response:

```json
{
  "id": "evt_01j4y8q9w6v0m9xk7k3x7a2p8m",
  "status": "accepted",
  "event_type": "user.welcome",
  "created_at": "2026-01-12T10:34:11Z"
}
```

## 6) Query the Event

Fetch event details by ID:

```bash
curl -X GET http://localhost:8000/api/v1/events/EVENT_ID \
  -H "X-API-Key: YOUR_PROJECT_KEY"
```

Sample response:

```json
{
  "id": "evt_01j4y8q9w6v0m9xk7k3x7a2p8m",
  "event_type": "user.welcome",
  "status": "processing",
  "priority": "medium",
  "created_at": "2026-01-12T10:34:11Z"
}
```

Event status will move as workers process notifications.

## 7) Check Notifications

List notifications created from your events:

```bash
curl -X GET http://localhost:8000/api/v1/notifications \
  -H "X-API-Key: YOUR_PROJECT_KEY"
```

Sample response:

```json
{
  "items": [
    {
      "id": "ntf_01j4y8r0j3f0j6g6v9q3m0d2a1",
      "event_id": "evt_01j4y8q9w6v0m9xk7k3x7a2p8m",
      "channel": "email",
      "status": "delivered",
      "created_at": "2026-01-12T10:34:11Z"
    }
  ],
  "total": 1
}
```

## 8) Open the Dashboard

Open:

```text
http://localhost:3001
```

Use the dashboard to:

- inspect event timelines
- filter notifications by status/channel
- review failures and retry outcomes

## Request and Response Conventions

### Base URL

Use this base URL for all API examples:

```text
http://localhost:8000/api/v1
```

### Authentication Header

Send API keys in:

```text
X-API-Key: <your key>
```

### Common Status Codes

| Code | Meaning |
| --- | --- |
| `200` | Success (including idempotent replays) |
| `201` | Resource created |
| `202` | Accepted for async processing |
| `400` | Validation or request shape error |
| `401` | Missing or invalid API key |
| `404` | Resource not found |
| `429` | Rate-limited |
| `500` | Internal server error |

## Quick Debug Checklist

If your first event does not deliver:

1. Confirm API key type and value.
2. Confirm request JSON is valid.
3. Confirm recipient fields match selected channel.
4. Confirm workers are running in Docker.
5. Check API and worker logs.

Useful commands:

```bash
docker compose logs api --tail=100
docker compose logs worker --tail=100
docker compose logs redis --tail=50
```

## End-to-End Smoke Test (Copy/Paste)

Use this flow to validate quickly:

```bash
# 1) Create project key
curl -s -X POST http://localhost:8000/api/v1/settings/api-keys \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_MASTER_KEY" \
  -d '{"name":"quickstart-app"}' | jq

# 2) Send event with returned project key
curl -s -X POST http://localhost:8000/api/v1/events \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_PROJECT_KEY" \
  -d '{"event_type":"user.welcome","recipients":[{"channels":["email"],"email":"user@example.com"}],"payload":{"user_name":"Alice"}}' | jq

# 3) List notifications
curl -s -X GET http://localhost:8000/api/v1/notifications \
  -H "X-API-Key: YOUR_PROJECT_KEY" | jq
```

## Next Steps

Now that Beacon is running locally, continue with:

- [Introduction](/docs/introduction) for system overview and architecture.
- [Events](/docs/events) for event schema, lifecycle, priority, and idempotency.
- [Channels](/docs/channels) for provider-specific requirements and retry behavior.
- [Templates](/docs/templates) for reusable content with variables.
- [Delivery Pipeline](/docs/delivery) for retries, DLQ, and suppressions.
