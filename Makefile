.PHONY: build push clean test test-volume test-upload lint \
        build-author push-author clean-author help

# Tag convention:
#   devel  — active development / unreleased work (default for all targets here)
#   latest — stable release; set manually after a PR merges and is verified

IMAGE_REGISTRY ?= ghcr.io/rhel-labs
IMAGE_TAG      ?= devel

KIOSK_IMAGE  := $(IMAGE_REGISTRY)/demo-kiosk:$(IMAGE_TAG)
AUTHOR_IMAGE := $(IMAGE_REGISTRY)/demo-kiosk-author:$(IMAGE_TAG)

PORT        := 8181
AUTHOR_PORT := 8082
CONTENT_DIR ?= $(PWD)/content
UPLOAD_ZIP  ?= $(PWD)/tests/fixtures/bundles/valid-full-bundle.zip
HOST        ?= 127.0.0.1
BIND_ADDR   ?= 127.0.0.1

# ── Kiosk ────────────────────────────────────────────────────────────

build: ## Build kiosk image
	podman build -t $(KIOSK_IMAGE) .

push: build ## Build and push kiosk image
	podman push $(KIOSK_IMAGE)

clean: ## Remove kiosk image
	podman rmi $(KIOSK_IMAGE)

test: build ## Build and run kiosk locally
	podman run --rm -p 127.0.0.1:$(PORT):8181 $(KIOSK_IMAGE)

lint: ## Lint YAML content files (requires: pip3 install -r dev/requirements.txt)
	python3 scripts/lint-content.py

test-volume: build ## Build and run kiosk with local content volume
	@echo "Linting content..."
	@python3 scripts/lint-content.py
	@echo "Building content locally..."
	@python3 scripts/build-faqs.py
	@echo "Starting kiosk with volume mount: $(CONTENT_DIR)"
	podman run --rm -p 127.0.0.1:$(PORT):8181 \
	  -v $(CONTENT_DIR):/srv/faq/content:ro \
	  $(KIOSK_IMAGE)

test-upload: ## End-to-end upload test: POST $(UPLOAD_ZIP) to a fresh container
	IMAGE=$(KIOSK_IMAGE) PORT=$(PORT) UPLOAD_ZIP=$(UPLOAD_ZIP) \
	  HOST=$(HOST) BIND_ADDR=$(BIND_ADDR) bash tests/test-upload.sh

# ── Author tool ──────────────────────────────────────────────────────

build-author: ## Build author tool image
	podman build -t $(AUTHOR_IMAGE) author/

push-author: build-author ## Build and push author tool image
	podman push $(AUTHOR_IMAGE)

clean-author: ## Remove author tool image
	podman rmi $(AUTHOR_IMAGE)

run-author: build-author ## Build and run author tool locally on port $(AUTHOR_PORT)
	podman run --rm -p 127.0.0.1:$(AUTHOR_PORT):8080 $(AUTHOR_IMAGE)

# ────────────────────────────────────────────────────────────────────

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-20s %s\n", $$1, $$2}'
