.PHONY: dev stop logs clean build test lint help

# Default target
.DEFAULT_GOAL := help

# Variables
DOCKER_DIR := docker
DEV_COMPOSE := $(DOCKER_DIR)/docker-compose.dev.yml

## Development
dev: ## Start in development mode (hot reload)
	@docker-compose -f $(DEV_COMPOSE) down --remove-orphans 2>/dev/null || true
	@sleep 1
	docker-compose -f $(DEV_COMPOSE) up --build; docker-compose -f $(DEV_COMPOSE) down

## Container management
stop: ## Stop all containers
	docker-compose -f $(DEV_COMPOSE) down --remove-orphans

logs: ## Show logs (follow mode)
	docker-compose -f $(DEV_COMPOSE) logs -f api

restart: ## Restart api container
	docker-compose -f $(DEV_COMPOSE) restart api

## Build & Clean
build: ## Build production image
	docker build -t user-sync-service -f $(DOCKER_DIR)/Dockerfile .

prod: build ## Run production build with 128MB limit (requires Redis + legacy-api)
	@docker-compose -f $(DEV_COMPOSE) up -d redis legacy-api
	@mkdir -p data
	@sleep 2
	docker run --rm -m 128m --network user-sync-service_default \
		-p 3000:3000 \
		-v $(PWD)/data:/app/data \
		-e NODE_ENV=production \
		-e DATABASE_PATH=/app/data/database.sqlite \
		-e REDIS_HOST=redis \
		-e REDIS_PORT=6379 \
		-e LEGACY_API_URL=http://legacy-api:3001 \
		-e LEGACY_API_KEY=test-api-key-2024 \
		-e TYPEORM_LOGGING=false \
		user-sync-service

clean: stop ## Remove containers, volumes and data
	docker-compose -f $(DEV_COMPOSE) down -v --rmi local 2>/dev/null || true
	rm -rf data/*.sqlite

## Local development (without Docker)
install: ## Install dependencies
	npm ci

start: ## Start locally (requires Redis)
	npm run start:dev

## Testing & Quality
test: ## Run tests
	npm test

test-cov: ## Run tests with coverage
	npm run test:cov

lint: ## Run linter
	npm run lint

## Help
help: ## Show this help
	@echo "Usage: make [target]"
	@echo ""
	@echo "Targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'
