.DEFAULT_GOAL := help
-include .env

.PHONY: help install setup new-worktree status dev dev-api dev-web dev-docs test lint lint-fix format type-check check migrate migrate-create seed smoke docker-up docker-up-tunnel docker-stop-tunnel docker-down stop-all docker-migrate docker-seed docker-rebuild docker-rebuild-web worker-dispatcher worker-email worker-sms worker-webhook worker-all celery-beat flower

API_DIR := apps/api

help: ## Show available commands
	@printf 'Usage: make <command>\n'
	@awk 'BEGIN {FS = ":.*## "} /^##@/ {printf "\n%s\n", substr($$0, 5)} /^[a-zA-Z0-9_-]+:.*## / {printf "  %-22s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

##@ Setup

install: ## Install API and frontend dependencies
	cd $(API_DIR) && uv sync
	npm ci

setup: install ## Install dependencies and pre-commit hooks
	cd $(API_DIR) && uv run pre-commit install

new-worktree: ## Configure isolated ports for this worktree
	./scripts/setup-worktree.py $(if $(name),$(name),) $(if $(suffix),--suffix $(suffix),)

status: ## Show service URLs, ports, and container health
	@printf 'Compose project: %s\n' '$(COMPOSE_PROJECT_NAME)'
	@printf '\nApplication\n'
	@printf '  %-12s \033]8;;%s\033\\%s\033]8;;\033\\\n' 'Web' 'http://localhost:$(or $(FRONTEND_PORT),3000)' 'http://localhost:$(or $(FRONTEND_PORT),3000)'
	@printf '  %-12s \033]8;;%s\033\\%s\033]8;;\033\\\n' 'Docs' 'http://localhost:$(or $(DOCS_PORT),3001)' 'http://localhost:$(or $(DOCS_PORT),3001)'
	@printf '  %-12s \033]8;;%s\033\\%s\033]8;;\033\\\n' 'API' 'http://localhost:$(or $(API_PORT),8000)' 'http://localhost:$(or $(API_PORT),8000)'
	@printf '  %-12s \033]8;;%s\033\\%s\033]8;;\033\\\n' 'Mailpit Web' 'http://localhost:$(or $(MAILPIT_UI_PORT),8025)' 'http://localhost:$(or $(MAILPIT_UI_PORT),8025)'
	@printf '  %-12s \033]8;;%s\033\\%s\033]8;;\033\\\n' 'Flower' 'http://localhost:$(or $(FLOWER_PORT),5555)' 'http://localhost:$(or $(FLOWER_PORT),5555)'
	@printf '\nInfrastructure\n'
	@printf '  %-12s localhost:%s\n' 'SMTP' '$(or $(MAILPIT_SMTP_PORT),1025)' 'PostgreSQL' '$(or $(POSTGRES_HOST_PORT),5432)' 'Redis' '$(or $(REDIS_HOST_PORT),6379)'
	@printf '\nContainers\n'
	@docker compose ps --format 'table {{.Service}}\t{{.State}}\t{{.Status}}\t{{.Ports}}'

##@ Development

dev: ## Run web and docs development servers
	npm run dev

dev-api: ## Run the API development server
	cd $(API_DIR) && uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

dev-web: ## Run the web development server
	npm run dev:web

dev-docs: ## Run the docs development server
	npm run dev:docs

##@ Quality

test: ## Run API tests
	cd $(API_DIR) && uv run pytest -v

lint: ## Lint API and frontend code
	cd $(API_DIR) && uv run ruff check .
	npm run lint

lint-fix: ## Automatically fix API lint errors
	cd $(API_DIR) && uv run ruff check --fix .

type-check: ## Type-check API and frontend code
	cd $(API_DIR) && uv run mypy app/
	npm run type-check

check: ## Run all pre-commit checks
	cd $(API_DIR) && uv run pre-commit run --all-files

format: ## Format API code
	cd $(API_DIR) && uv run ruff format .

smoke: ## Run the end-to-end smoke test
	./scripts/smoke-test.py

##@ Database

migrate: ## Apply database migrations locally
	cd $(API_DIR) && uv run alembic upgrade head

migrate-create: ## Create a migration; pass name="description"
	cd $(API_DIR) && uv run alembic revision --autogenerate -m "$(name)"

seed: ## Seed the local database
	cd $(API_DIR) && uv run python -m scripts.seed

##@ Docker

docker-up: ## Start the isolated Compose stack
	docker compose up -d

docker-up-tunnel: docker-stop-tunnel ## Move the shared Cloudflare tunnel to this checkout
	docker compose --profile tunnel up -d cloudflared

docker-stop-tunnel: ## Stop the shared Cloudflare tunnel from any checkout
	docker compose --profile tunnel stop cloudflared
	@containers="$$(docker ps -q --filter label=com.beaco.shared-tunnel=true)"; \
		if [ -n "$$containers" ]; then docker stop $$containers; fi

stop-all: COMPOSE_PROFILE_ARGS := --profile "*"
stop-all: docker-down ## Stop all services for this worktree; keep volumes and images

docker-down: ## Stop the isolated Compose stack
	docker compose $(COMPOSE_PROFILE_ARGS) down

docker-migrate: ## Apply migrations inside Compose
	docker compose exec -T api alembic upgrade head

docker-seed: ## Seed the database inside Compose
	docker compose exec -T api python -m scripts.seed

docker-rebuild: ## Rebuild the complete Compose stack
	docker compose down --rmi all && docker compose up -d --build

docker-rebuild-web: ## Rebuild only web and docs containers
	docker compose up -d --build web docs

##@ Workers

worker-dispatcher: ## Run the dispatcher worker
	cd $(API_DIR) && uv run celery -A app.workers.celery_app worker -Q notifications.high,notifications.medium,notifications.low,notifications.reconciliation -l info

worker-email: ## Run the email worker
	cd $(API_DIR) && uv run celery -A app.workers.celery_app worker -Q notifications.email.high,notifications.email.medium,notifications.email.low,notifications.email.lifecycle -l info

worker-sms: ## Run the SMS worker
	cd $(API_DIR) && uv run celery -A app.workers.celery_app worker -Q notifications.sms.high,notifications.sms.medium,notifications.sms.low -l info

worker-webhook: ## Run the webhook worker
	cd $(API_DIR) && uv run celery -A app.workers.celery_app worker -Q notifications.webhook.high,notifications.webhook.medium,notifications.webhook.low -l info

worker-all: ## Run every worker queue in one process
	cd $(API_DIR) && uv run celery -A app.workers.celery_app worker -Q notifications.high,notifications.medium,notifications.low,notifications.reconciliation,notifications.email.high,notifications.email.medium,notifications.email.low,notifications.email.lifecycle,notifications.sms.high,notifications.sms.medium,notifications.sms.low,notifications.webhook.high,notifications.webhook.medium,notifications.webhook.low -l info

celery-beat: ## Run the Celery scheduler
	cd $(API_DIR) && uv run celery -A app.workers.celery_app beat -l info --schedule=/tmp/celerybeat-schedule

flower: ## Run the Flower worker dashboard
	cd $(API_DIR) && uv run celery -A app.workers.celery_app flower --port=5555
