.PHONY: install setup dev dev-api dev-web dev-docs test lint lint-fix format type-check check migrate migrate-create seed docker-up docker-down docker-rebuild docker-rebuild-web worker-dispatcher worker-email worker-sms worker-webhook worker-all celery-beat flower

API_DIR := apps/api

install:
	cd $(API_DIR) && uv sync
	npm ci

setup: install
	cd $(API_DIR) && uv run pre-commit install

dev:
	npm run dev

dev-api:
	cd $(API_DIR) && uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

dev-web:
	npm run dev:web

dev-docs:
	npm run dev:docs

test:
	cd $(API_DIR) && uv run pytest -v

lint:
	cd $(API_DIR) && uv run ruff check .
	npm run lint

lint-fix:
	cd $(API_DIR) && uv run ruff check --fix .

type-check:
	cd $(API_DIR) && uv run mypy app/
	npm run type-check

check:
	cd $(API_DIR) && uv run pre-commit run --all-files

format:
	cd $(API_DIR) && uv run ruff format .

migrate:
	cd $(API_DIR) && uv run alembic upgrade head

migrate-create:
	cd $(API_DIR) && uv run alembic revision --autogenerate -m "$(name)"

seed:
	cd $(API_DIR) && uv run python -m scripts.seed

docker-up:
	docker compose up -d

docker-down:
	docker compose down

docker-rebuild:
	docker compose down --rmi all && docker compose up -d --build

docker-rebuild-web:
	docker compose up -d --build web docs

worker-dispatcher:
	cd $(API_DIR) && uv run celery -A app.workers.celery_app worker -Q notifications.high,notifications.medium,notifications.low,notifications.reconciliation -l info

worker-email:
	cd $(API_DIR) && uv run celery -A app.workers.celery_app worker -Q notifications.email.high,notifications.email.medium,notifications.email.low -l info

worker-sms:
	cd $(API_DIR) && uv run celery -A app.workers.celery_app worker -Q notifications.sms.high,notifications.sms.medium,notifications.sms.low -l info

worker-webhook:
	cd $(API_DIR) && uv run celery -A app.workers.celery_app worker -Q notifications.webhook.high,notifications.webhook.medium,notifications.webhook.low -l info

worker-all:
	cd $(API_DIR) && uv run celery -A app.workers.celery_app worker -Q notifications.high,notifications.medium,notifications.low,notifications.reconciliation,notifications.email.high,notifications.email.medium,notifications.email.low,notifications.sms.high,notifications.sms.medium,notifications.sms.low,notifications.webhook.high,notifications.webhook.medium,notifications.webhook.low -l info

celery-beat:
	cd $(API_DIR) && uv run celery -A app.workers.celery_app beat -l info --schedule=/tmp/celerybeat-schedule

flower:
	cd $(API_DIR) && uv run celery -A app.workers.celery_app flower --port=5555
