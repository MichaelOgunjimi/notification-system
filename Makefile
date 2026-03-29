.PHONY: dev test lint format migrate migrate-create seed docker-up docker-down docker-rebuild install worker-dispatcher worker-email worker-sms worker-webhook worker-all

install:
	cd backend && uv sync

dev:
	cd backend && uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

test:
	cd backend && uv run pytest -v

lint:
	cd backend && uv run ruff check .

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

worker-dispatcher:
	cd backend && uv run celery -A app.workers.celery_app worker -Q notifications.high,notifications.medium,notifications.low -l info

worker-email:
	cd backend && uv run celery -A app.workers.celery_app worker -Q notifications.email -l info

worker-sms:
	cd backend && uv run celery -A app.workers.celery_app worker -Q notifications.sms -l info

worker-webhook:
	cd backend && uv run celery -A app.workers.celery_app worker -Q notifications.webhook -l info

worker-all:
	cd backend && uv run celery -A app.workers.celery_app worker -Q notifications.high,notifications.medium,notifications.low,notifications.email,notifications.sms,notifications.webhook -l info