# Demo Kiosk

Interactive kiosk application for demos and FAQs, designed for Red Hat events.

## Content Management

**Event teams** manage all content (FAQs, branding, media) in Google Drive.  
**Platform team** downloads bundles and builds container images.

Content structure tracked in git, large media files (videos) provided via Google Drive.

## Quick Start

### **Build with Google Drive Content**

```bash
# 1. Download content bundle from Google Drive
#    (Event team provides shared folder link)
#    Right-click folder → Download → saves as kiosk-*.zip

# 2. Move to project root
mv ~/Downloads/kiosk-*.zip ./

# 3. Build container
podman build -t demo-kiosk:latest .

# 4. Run locally
podman run --rm -p 8181:8181 demo-kiosk:latest
```

Visit http://localhost:8181

### **Development (Local Content)**

If you have content already extracted locally:

```bash
make test-volume
```

This lints and builds the content locally, then starts the container with `./content` mounted in. The app framework stays in the image; only the content directory is replaced.

Or manually:

```bash
podman run --rm -p 8181:8181 \
  -v ./content:/srv/faq/content:ro \
  demo-kiosk:latest
```

**Zero host dependencies** — libraries, fonts, and build tools are downloaded and built inside the container.

## Documentation

- **[PLATFORM-TEAM.md](PLATFORM-TEAM.md)** — Build, publish, and deploy kiosk images
- **[AUTHORING.md](AUTHORING.md)** — Create FAQ content and customize branding
