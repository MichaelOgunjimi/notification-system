.DEFAULT_GOAL := help
-include .env

.PHONY: help install setup new-worktree inherit-env status dev dev-api dev-web dev-docs infra test-db test lint lint-fix format type-check check migrate migrate-create seed smoke load-test up up-tunnel stop-tunnel down clean stop-all docker-migrate docker-seed rebuild rebuild-web worker-dispatcher worker-email worker-sms worker-webhook worker-all celery-beat flower

API_DIR := apps/api
# Host-run API commands must reach this checkout's own containers, not the
# canonical ports. .env is not exported, so pass them explicitly.
HOST_ENV := POSTGRES_SERVER=localhost POSTGRES_PORT=$(or $(POSTGRES_HOST_PORT),5433) REDIS_URL=redis://localhost:$(or $(REDIS_HOST_PORT),6379)/0 CELERY_BROKER_URL=redis://localhost:$(or $(REDIS_HOST_PORT),6379)/0 CELERY_RESULT_BACKEND=redis://localhost:$(or $(REDIS_HOST_PORT),6379)/1

help: ## Show available commands
	@printf 'Usage: make <command>\n'
	@awk 'BEGIN {FS = ":.*## "} /^##@/ {printf "\n%s\n", substr($$0, 5)} /^[a-zA-Z0-9_-]+:.*## / {printf "  %-22s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

##@ Setup

install: ## Install API and frontend dependencies
	cd $(API_DIR) && uv sync
	npm ci

setup: install ## Install dependencies and pre-commit hooks
	cd $(API_DIR) && uv run pre-commit install

new-worktree: ## Configure this checkout's Compose project, ports, and shared credentials
	./scripts/setup-worktree.py $(if $(name),$(name),) $(if $(suffix),--suffix $(suffix),)

inherit-env: ## Fill unset shared credentials from the primary checkout; optional key="A B"
	./scripts/setup-worktree.py --inherit $(foreach k,$(key),--key $(k))

status: ## Show service URLs, ports, and container health
	@printf 'Compose project: %s\n' '$(or $(COMPOSE_PROJECT_NAME),notification-system)'
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

dev-api: infra ## Run the API against this checkout's local infrastructure
	cd $(API_DIR) && $(HOST_ENV) uv run uvicorn app.main:app --reload --host 0.0.0.0 --port $(or $(API_PORT),8000)

dev-web: ## Run the web development server
	npm run dev:web

dev-docs: ## Run the docs development server
	npm run dev:docs

infra: ## Start the infrastructure used by host development
	docker compose up -d --wait db redis mailpit

##@ Quality

test-db: infra ## Create this checkout's test database if it is missing
	@docker compose exec -T db psql -U $(or $(POSTGRES_USER),postgres) -tAc "SELECT 1 FROM pg_database WHERE datname = 'notification_system_test'" | grep -q 1 \
		|| docker compose exec -T db createdb -U $(or $(POSTGRES_USER),postgres) notification_system_test

test: test-db ## Run API tests
	cd $(API_DIR) && $(HOST_ENV) uv run pytest -v

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

load-test: ## Load test ingestion; use API_KEY="nk_..." or API_KEYS="nk_...,nk_..."
	@cd $(API_DIR) && $(HOST_ENV) BEACO_LOAD_TEST_API_KEYS="$${API_KEYS:-$$API_KEY}" uv run python -m scripts.load_test --api http://localhost:$(or $(API_PORT),8000) $(ARGS)

##@ Database

migrate: ## Apply database migrations locally
	cd $(API_DIR) && $(HOST_ENV) uv run alembic upgrade head

migrate-create: ## Create a migration; pass name="description"
	cd $(API_DIR) && $(HOST_ENV) uv run alembic revision --autogenerate -m "$(name)"

seed: ## Seed the local database
	cd $(API_DIR) && $(HOST_ENV) uv run python -m scripts.seed

##@ Docker

up: ## Build, migrate, and start this checkout's complete stack
	docker compose up -d --build
	docker compose exec -T api alembic upgrade head

up-tunnel: stop-tunnel ## Move the shared Cloudflare tunnel to this checkout
	docker compose --profile tunnel up -d cloudflared

stop-tunnel: ## Stop the shared Cloudflare tunnel from any checkout
	docker compose --profile tunnel stop cloudflared
	@containers="$$(docker ps -q --filter label=com.beaco.shared-tunnel=true)"; \
		if [ -n "$$containers" ]; then docker stop $$containers; fi
	@containers="$$(docker ps -q --filter label=com.docker.compose.project=notification-system --filter label=com.docker.compose.service=cloudflared)"; \
		if [ -n "$$containers" ]; then docker stop $$containers; fi

stop-all: COMPOSE_PROFILE_ARGS := --profile "*"
stop-all: down ## Stop all services for this worktree; keep volumes and images

down: ## Stop the isolated Compose stack
	docker compose $(COMPOSE_PROFILE_ARGS) down

clean: ## Remove a linked worktree's containers, volumes, networks, and built images
	@git_dir="$$(git rev-parse --path-format=absolute --git-dir)"; \
		git_common_dir="$$(git rev-parse --path-format=absolute --git-common-dir)"; \
		if [ "$$git_dir" = "$$git_common_dir" ]; then \
			echo 'Refusing to clean Docker from the primary checkout.' >&2; \
			exit 1; \
		fi
	docker compose --profile "*" down --volumes --remove-orphans
	@images="$$(docker image ls -q --filter label=com.docker.compose.project='$(COMPOSE_PROJECT_NAME)' | sort -u)"; \
		if [ -n "$$images" ]; then docker image rm $$images; fi

docker-migrate: ## Apply migrations inside Compose
	docker compose exec -T api alembic upgrade head

docker-seed: ## Seed the database inside Compose
	docker compose exec -T api python -m scripts.seed

rebuild: ## Rebuild this checkout's complete stack
	docker compose --profile "*" down --rmi all
	$(MAKE) up

rebuild-web: ## Rebuild only web and docs containers
	docker compose up -d --build web docs

##@ Workers

worker-dispatcher: ## Run the dispatcher worker
	cd $(API_DIR) && $(HOST_ENV) uv run celery -A app.workers.celery_app worker -Q notifications.high,notifications.medium,notifications.low,notifications.reconciliation -l info

worker-email: ## Run the email worker
	cd $(API_DIR) && $(HOST_ENV) uv run celery -A app.workers.celery_app worker -Q notifications.email.high,notifications.email.medium,notifications.email.low,notifications.email.lifecycle -l info

worker-sms: ## Run the SMS worker
	cd $(API_DIR) && $(HOST_ENV) uv run celery -A app.workers.celery_app worker -Q notifications.sms.high,notifications.sms.medium,notifications.sms.low -l info

worker-webhook: ## Run the webhook worker
	cd $(API_DIR) && $(HOST_ENV) uv run celery -A app.workers.celery_app worker -Q notifications.webhook.high,notifications.webhook.medium,notifications.webhook.low -l info

worker-all: ## Run every worker queue in one process
	cd $(API_DIR) && $(HOST_ENV) uv run celery -A app.workers.celery_app worker -Q notifications.high,notifications.medium,notifications.low,notifications.reconciliation,notifications.email.high,notifications.email.medium,notifications.email.low,notifications.email.lifecycle,notifications.sms.high,notifications.sms.medium,notifications.sms.low,notifications.webhook.high,notifications.webhook.medium,notifications.webhook.low -l info

celery-beat: ## Run the Celery scheduler
	cd $(API_DIR) && $(HOST_ENV) uv run celery -A app.workers.celery_app beat -l info --schedule=/tmp/celerybeat-schedule

flower: ## Run the Flower worker dashboard
	cd $(API_DIR) && $(HOST_ENV) uv run celery -A app.workers.celery_app flower --port=$(or $(FLOWER_PORT),5555)
