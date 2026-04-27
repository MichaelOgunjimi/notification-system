.PHONY: dev dev-frontend test lint lint-fix format type-check check setup migrate migrate-create seed docker-up docker-down docker-rebuild docker-rebuild-frontend install worker-dispatcher worker-email worker-sms worker-webhook worker-all celery-beat flower

install:
	cd backend && uv sync

setup:
	cd backend && uv sync
	cd backend && uv run pre-commit install

dev:
	cd backend && uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

dev-frontend:
	cd frontend && npm run dev

test:
	cd backend && uv run pytest -v

lint:
	cd backend && uv run ruff check .

lint-fix:
	cd backend && uv run ruff check --fix .

type-check:
	cd backend && uv run mypy app/

type-check-frontend:
	cd frontend && npx tsc --noEmit

check:
	cd backend && uv run pre-commit run --all-files

format:
	cd backend && uv run ruff format .

migrate:
	cd backend && uv run alembic upgrade head

migrate-create:
	cd backend && uv run alembic revision --autogenerate -m "$(name)"

seed:
	cd backend && uv run python -m scripts.seed

docker-up:
	docker compose up -d

docker-down:
	docker compose down

docker-rebuild:
	docker compose down --rmi all && docker compose up -d --build

docker-rebuild-frontend:
	docker compose up -d --build frontend

worker-dispatcher:
	cd backend && uv run celery -A app.workers.celery_app worker -Q notifications.high,notifications.medium,notifications.low,notifications.reconciliation -l info

worker-email:
	cd backend && uv run celery -A app.workers.celery_app worker -Q notifications.email.high,notifications.email.medium,notifications.email.low -l info

worker-sms:
	cd backend && uv run celery -A app.workers.celery_app worker -Q notifications.sms.high,notifications.sms.medium,notifications.sms.low -l info

worker-webhook:
	cd backend && uv run celery -A app.workers.celery_app worker -Q notifications.webhook.high,notifications.webhook.medium,notifications.webhook.low -l info

worker-all:
	cd backend && uv run celery -A app.workers.celery_app worker -Q notifications.high,notifications.medium,notifications.low,notifications.reconciliation,notifications.email.high,notifications.email.medium,notifications.email.low,notifications.sms.high,notifications.sms.medium,notifications.sms.low,notifications.webhook.high,notifications.webhook.medium,notifications.webhook.low -l info

celery-beat:
	cd backend && uv run celery -A app.workers.celery_app beat -l info --schedule=/tmp/celerybeat-schedule

flower:
	cd backend && uv run celery -A app.workers.celery_app flower --port=5555
