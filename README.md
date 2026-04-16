# Demo Kiosk

Interactive kiosk application for demos and FAQs, designed for Red Hat events.

## Quick Start

```bash
make build  # Build container image
make test   # Run locally on port 8181
```

Or using `podman` directly:

```bash
podman build -t demo-kiosk:latest .
podman run --rm -p 8181:8181 demo-kiosk:latest
```

Visit http://localhost:8181

**Zero host dependencies** — everything (libraries, fonts, build tools) is downloaded and built inside the container.

## Volume Mounting for Development

Update content without rebuilding the image by mounting a local content directory:

```bash
# Build content locally
python3 build/build-faqs.py

# Run with mounted content
podman run --rm -p 8181:8181 \
  -v ./content:/srv/faq/content:ro \
  demo-kiosk:latest
```

This separates the app framework (in the image) from content (on your host).

## Documentation

See **[AUTHORING.md](AUTHORING.md)** for complete documentation on:
- Creating and editing FAQ content
- Event branding customization
- Deployment options

## Local Development

For iterative content development:

```bash
./start.sh  # Local Python server with auto-rebuild
```
