.PHONY: dev stop logs clean build test lint help

# Default target
.DEFAULT_GOAL := help

# Variables
DOCKER_DIR := docker
DEV_COMPOSE := $(DOCKER_DIR)/docker-compose.dev.yml

## Development
dev: ## Start in development mode (hot reload)
	docker-compose -f $(DEV_COMPOSE) up --build

## Container management
stop: ## Stop all containers
	docker-compose -f $(DEV_COMPOSE) down

logs: ## Show logs (follow mode)
	docker-compose -f $(DEV_COMPOSE) logs -f api

restart: ## Restart api container
	docker-compose -f $(DEV_COMPOSE) restart api

## Build & Clean
build: ## Build production image
	docker build -t user-sync-service -f $(DOCKER_DIR)/Dockerfile .

clean: ## Remove containers, volumes and images
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
