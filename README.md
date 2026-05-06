# Demo Kiosk

Interactive kiosk application for demos, designed for Red Hat events.

---

## Event Staff Installation

On an event laptop with Podman:

```bash
curl -fsSL red.ht/demo-kiosk-install | bash
```

Opens at http://localhost:8181

---

## Managing Content at Runtime

Visit **http://localhost:8181/manage** to update the kiosk without rebuilding the image.

From there you can:

- **Upload a kiosk zip** — update content from a `kiosk-*.zip` bundle provided by the platform team. Cards and branding are fully replaced if included in the zip; media files are always additive.
- **Upload a media file** — add a video, PDF, image, or terminal recording, then create a card for it.
- **Add a new card** — create cards for non-media demo types (Arcade, lab, external URL).
- **Edit existing cards** — click **Edit** on any card row to expand an inline editor. Change title, summary, order, enabled state, or the media file. Changes rebuild the kiosk grid immediately.
- **Delete a card** — permanently removes the card from the kiosk.
- **Update branding** — change the event header, tagline, browser tab title, and event logo. Colors and the Red Hat logo require a rebuild (see [PLATFORM-TEAM.md](PLATFORM-TEAM.md)).

### Persistence

Uploads write to the named volume (`kiosk-content`) that is mounted by default. Content survives container restarts and image updates. The kiosk is pre-loaded with baked-in content on first start — no blank slate.

> **Read-only mode:** If the `/manage` page shows a yellow banner, the content directory is not writable and uploads will be rejected. This usually means the volume is not configured. See the volume options in `demo-kiosk.container`.

---

## Quick Start (Platform Team)

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

```bash
make test-volume
```

Lints and builds content locally, then starts the container with `./content` mounted in.

Or manually:

```bash
podman run --rm -p 8181:8181 \
  -v ./content:/srv/faq/content:ro \
  demo-kiosk:latest
```

### **Runtime Uploads with a Named Volume**

To enable `/manage` uploads outside of the systemd Quadlet service:

```bash
podman run --rm -p 8181:8181 \
  -v kiosk-content:/srv/faq/content:copy \
  demo-kiosk:latest
```

Podman creates the `kiosk-content` volume automatically on first run and seeds it with the baked-in content from the image (`:copy`). Uploaded content persists across restarts.

---

## Documentation

- **[PLATFORM-TEAM.md](PLATFORM-TEAM.md)** — Build, publish, deploy, and day-of operations
- **[AUTHORING.md](AUTHORING.md)** — Create and manage content, event branding
