.PHONY: build test test-volume clean push help

# Configuration
IMAGE_REGISTRY ?=
IMAGE_NAME := demo-kiosk
IMAGE_TAG ?= latest
PORT := 8181
CONTENT_DIR ?= $(PWD)/content

# Construct full image reference
ifdef IMAGE_REGISTRY
  IMAGE := $(IMAGE_REGISTRY)/$(IMAGE_NAME):$(IMAGE_TAG)
else
  IMAGE := $(IMAGE_NAME):$(IMAGE_TAG)
endif

build: ## Build container image (downloads all dependencies internally)
	podman build -t $(IMAGE) .

test: build ## Build and test container locally
	podman run --rm -p $(PORT):8181 $(IMAGE)

test-volume: build ## Test with local content volume mount
	@echo "Building content locally..."
	@python3 build/build-faqs.py
	@echo "Starting container with volume mount: $(CONTENT_DIR)"
	podman run --rm -p $(PORT):8181 \
	  -v $(CONTENT_DIR):/srv/faq/content:ro \
	  $(IMAGE)

push: build ## Build and push to registry
	podman push $(IMAGE)

clean: ## Remove container image
	podman rmi $(IMAGE)

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-10s %s\n", $$1, $$2}'
