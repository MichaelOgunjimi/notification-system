# Self-Hosting

This guide explains how to run Beacon locally or in your own infrastructure using Docker Compose.

For API usage after deployment, see [API Reference](/docs/api-reference).

## Prerequisites

Before you start:

- Docker installed and running
- Docker Compose v2 available (`docker compose version`)
- At least **2 GB RAM** available for containers

> Beacon runs multiple services (API, frontend, workers, Redis, PostgreSQL). If your machine is memory constrained, startup may be slow.

## Quick Start

```bash
git clone https://github.com/your-org/beacon.git
cd beacon
cp .env.example .env  # or create from scratch
docker compose up --build -d
```

After startup:

- API: `http://localhost:8000/api/v1`
- Dashboard: `http://localhost:3001`

## Service Topology

Beacon’s default `docker-compose.yml` defines the following services:

| Service | Port | Description |
| --- | --- | --- |
| api | 8000 | FastAPI backend (REST API + auth + orchestration) |
| frontend | 3001 | Next.js dashboard |
| postgres | 5433 | PostgreSQL primary data store |
| redis | 6379 | Redis broker/cache |
| celery-worker | — | Async notification workers |
| celery-beat | — | Periodic task scheduler |

### Verify Running Services

```bash
docker compose ps
```

You should see all services in `Up` state.

## Environment Variables

Define these in `.env`:

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis connection string |
| `MASTER_API_KEY` | Yes | Admin key for system-level operations |
| `RESEND_API_KEY` | For email | Resend API key for email delivery |
| `TWILIO_ACCOUNT_SID` | For SMS | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | For SMS | Twilio auth token |
| `TWILIO_FROM_NUMBER` | For SMS | Twilio sender number (E.164) |
| `CORS_ORIGINS` | Yes | Comma-separated allowed frontend origins |
| `MAX_PAYLOAD_BYTES` | No | Max event payload size (default: `102400`) |
| `MAX_BATCH_SIZE` | No | Max events per batch (default: `50`) |
| `IDEMPOTENCY_TTL_HOURS` | No | Idempotency dedup TTL (default: `24`) |

### Example `.env` Values

```bash
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/beacon
REDIS_URL=redis://redis:6379/0
MASTER_API_KEY=bk_master_dev_replace_me
RESEND_API_KEY=re_xxxxx
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_FROM_NUMBER=+15551234567
CORS_ORIGINS=http://localhost:3001
MAX_PAYLOAD_BYTES=102400
MAX_BATCH_SIZE=50
IDEMPOTENCY_TTL_HOURS=24
```

> Never commit real provider credentials or production master keys.

## Database Migrations

Run migrations after first startup (or after schema changes):

```bash
docker compose exec api uv run alembic upgrade head
```

If migration fails, verify:

- `api` container is healthy
- `DATABASE_URL` points to running PostgreSQL service
- target revision exists in `alembic/versions`

## Creating Your First API Key

Use the master key to mint a project key:

```bash
curl -X POST http://localhost:8000/api/v1/settings/api-keys \
  -H "X-API-Key: YOUR_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "my-project"}'
```

Expected response:

```json
{
  "id": "3d0c4b31-e2d0-47cb-8f31-bd2b96d66a71",
  "name": "my-project",
  "api_key": "bk_live_...",
  "created_at": "2026-04-17T14:00:00Z"
}
```

> Save the returned `api_key` immediately. Raw key material is typically shown only once.

## Monitoring and Health

Key runtime checks:

- Dashboard: `http://localhost:3001`
- Public health: `GET http://localhost:8000/api/v1/health`
- Admin health: `GET http://localhost:8000/api/v1/admin/health` (master key required)

### Health Check Examples

```bash
curl http://localhost:8000/api/v1/health
```

```json
{
  "status": "healthy"
}
```

```bash
curl -X GET http://localhost:8000/api/v1/admin/health \
  -H "X-API-Key: YOUR_MASTER_KEY"
```

```json
{
  "status": "healthy",
  "database": {"status": "ok"},
  "redis": {"status": "ok"},
  "queues": {"email": {"depth": 0}, "sms": {"depth": 0}, "webhook": {"depth": 1}}
}
```

## Rebuilding

For a full rebuild with image cleanup:

```bash
make docker-rebuild  # Full rebuild with image cleanup
```

If you don’t have that Make target available, use:

```bash
docker compose down --remove-orphans
docker compose build --no-cache
docker compose up -d
```

## Operational Tips

### Tail Logs

```bash
docker compose logs -f api
docker compose logs -f celery-worker
```

### Restart a Single Service

```bash
docker compose restart api
```

### Scale Workers

```bash
docker compose up -d --scale celery-worker=3
```

This helps absorb channel backlog without scaling API/frontend containers.

## Troubleshooting

### API not reachable on port 8000

- Check `docker compose ps`
- Confirm no host port conflict
- Inspect API logs: `docker compose logs api`

### Dashboard not loading

- Confirm frontend container is up
- Verify `CORS_ORIGINS` includes dashboard origin
- Check API base URL config used by frontend

### Notifications stuck in pending/queued

- Verify `celery-worker` is running
- Confirm Redis connectivity from worker
- Check provider credentials (`RESEND_API_KEY`, Twilio vars)

### Migration errors

- Ensure Postgres service is healthy
- Confirm `DATABASE_URL` uses service hostname in container network
- Re-run migrations after fixing connection settings

## Production Notes

For production self-hosting:

- Use managed PostgreSQL/Redis where possible.
- Set strong, rotated `MASTER_API_KEY`.
- Restrict network access to admin endpoints.
- Enable centralized logs/metrics.
- Run multiple worker replicas for high availability.

Next: integrate your app with [API Reference](/docs/api-reference), then model event contracts in [Events](/docs/events).
