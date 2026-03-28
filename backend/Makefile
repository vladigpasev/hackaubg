SHELL := /bin/zsh

ARCHIVE ?= $(shell ls -1t example-output/*.tar.br 2>/dev/null | head -n 1)

.PHONY: help example dearchive

help:
	@echo "Targets:"
	@echo "  make example                      Run the example script"
	@echo "  make dearchive                    Extract latest archive in example-output"
	@echo "  make dearchive ARCHIVE=<path>     Extract a specific archive"

example:
	npm run example

dearchive:
	@if [ -z "$(ARCHIVE)" ]; then \
		echo "No archive found. Run 'make example' first or pass ARCHIVE=<path>."; \
		exit 1; \
	fi
	node ./scripts/dearchive.mjs "$(ARCHIVE)"
