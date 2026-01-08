.PHONY: help odoo19_check odoo19_check_strict test build lint format clean

help:
	@echo "Claude Code Spec Workflow - Odoo Edition"
	@echo ""
	@echo "Available targets:"
	@echo ""
	@echo "  Build & Development:"
	@echo "    make build           - Build the project"
	@echo "    make dev             - Run development mode"
	@echo "    make watch           - Watch for changes"
	@echo "    make lint            - Run ESLint"
	@echo "    make format          - Format code with Prettier"
	@echo "    make clean           - Remove build artifacts"
	@echo ""
	@echo "  Testing:"
	@echo "    make test            - Run all tests"
	@echo "    make test:odoo       - Run Odoo-specific tests"
	@echo "    make test:patterns   - Run pattern tests"
	@echo ""
	@echo "  Odoo 19 Compliance:"
	@echo "    make odoo19_check    - Scan for Odoo 19 compliance violations"
	@echo "    make odoo19_check_strict - Fail on any violations (CI mode)"
	@echo ""
	@echo "Examples:"
	@echo "    make odoo19_check /path/to/module"
	@echo "    make odoo19_check_strict /path/to/module"
	@echo ""

# Build and development
build:
	npm run build

dev:
	npm run dev

watch:
	npm run watch:frontend

lint:
	npm run lint

format:
	npm run format

clean:
	npm run clean

# Testing
test:
	npm run test

test\:odoo:
	npm run test:odoo

test\:patterns:
	npm run test:patterns

# Odoo 19 Compliance Checks
# Usage: make odoo19_check [path] or make odoo19_check_strict [path]
# Default path: current directory
odoo19_check:
	./scripts/odoo19_check.sh $(if $(filter-out $@,$(MAKECMDGOALS)),$(filter-out $@,$(MAKECMDGOALS)),.)

odoo19_check_strict:
	./scripts/odoo19_check.sh $(if $(filter-out $@,$(MAKECMDGOALS)),$(filter-out $@,$(MAKECMDGOALS)),.) --strict

# Odoo 19 compliance with detailed output
odoo19_check\:help:
	./scripts/odoo19_check.sh --help

# Default target
.DEFAULT_GOAL := help

# Shorthand aliases
test-odoo: test\:odoo
check: odoo19_check
check-strict: odoo19_check_strict
