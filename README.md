# Demo Kiosk

Interactive kiosk application for demos and FAQs, designed for Red Hat events.

## Content Management

**Event teams** manage all content (FAQs, branding, media) in Google Drive.  
**Platform team** downloads bundles and builds container images.

Content structure tracked in git, large media files (videos) provided via Google Drive.

## Event Staff Installation

On an event laptop with Podman:

```bash
curl -fsSL red.ht/demo-kiosk-install | bash
```

Opens at http://localhost:8181

---

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

---

## Runtime Uploads

The `/manage` page lets you upload content and edit cards while the container is running, without rebuilding the image.

Visit **http://localhost:8181/manage**

From there you can:
- **Upload a kiosk zip** — replace all content (FAQs, branding, media) from a `kiosk-*.zip` bundle
- **Upload a media file** — add a video, PDF, image, or terminal recording, then create a card for it
- **Add a new card** — create cards for non-media demo types (Arcade, lab, external URL)
- **Edit existing cards** — update any card field; the kiosk grid rebuilds immediately

### Persistence across restarts

Uploads write to `/srv/faq/content` inside the container. Without a volume mount that path is on the read-only container filesystem, so uploads are rejected with a clear error. Mount a writable volume to persist changes:

**Option A — Named volume** (recommended; data survives image rebuilds):
```bash
podman volume create kiosk-content
podman run --rm -p 8181:8181 \
  -v kiosk-content:/srv/faq/content \
  demo-kiosk:latest
```

On first run the named volume starts empty. The container serves its baked-in content from the image. After the first upload the volume holds your changes.

**Option B — Writable bind mount** (local authoring workflow; changes visible on host):
```bash
podman run --rm -p 8181:8181 \
  -v ./content:/srv/faq/content:rw \
  demo-kiosk:latest
```

The host directory must already contain a valid `faqs.js` (run `python3 build/build-faqs.py` locally first, or use `make test-volume`).

**Read-only bind mount** (original pattern, no uploads):
```bash
podman run --rm -p 8181:8181 \
  -v ./content:/srv/faq/content:ro \
  demo-kiosk:latest
```

The `/manage` upload and edit actions are rejected; the kiosk runs normally.

For the systemd Quadlet service, see the volume mount options documented in `demo-kiosk.container`.

---

## Documentation

- **[PLATFORM-TEAM.md](PLATFORM-TEAM.md)** — Build, publish, and deploy kiosk images
- **[AUTHORING.md](AUTHORING.md)** — Create FAQ content and customize branding
