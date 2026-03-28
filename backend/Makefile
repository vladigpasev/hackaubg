SHELL := /bin/sh

ARCHIVE ?= $(shell ls -1t archives/*.tar.br archives/*.tar.gz archives/*.tar.zst archives/*.tar 2>/dev/null | head -n 1)

.PHONY: help dearchive

help:
	@echo "Targets:"
	@echo "  make dearchive                    Extract the latest archive in archives/"
	@echo "  make dearchive ARCHIVE=<path>     Extract a specific archive"

dearchive:
	@if [ -z "$(ARCHIVE)" ]; then \
		echo "No archive found. Pass ARCHIVE=<path> or create an archive under archives/."; \
		exit 1; \
	fi
	node ./scripts/dearchive.mjs "$(ARCHIVE)"
