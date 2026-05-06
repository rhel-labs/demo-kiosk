# Demo Kiosk — Platform Team Guide

Platform operators: build kiosk images with event content and publish to registry.

---

## Build & Publish Workflow

### **1. Download Content from Google Drive**

Event team shares Google Drive folder link when content is ready.

```bash
# Access shared Drive folder → Right-click → Download
# Saves as: kiosk-YYYYMMDDTHHMMSSZ-#-###.zip in ~/Downloads/
```

### **2. Build Container**

```bash
cd ~/demo-kiosk

# Move bundle to project root
mv ~/Downloads/kiosk-*.zip ./

# Build with event content
podman build -t demo-kiosk:summit2026 .

# Tag for registry
podman tag demo-kiosk:summit2026 quay.io/rhel-labs/demo-kiosk:summit2026
```

### **3. Test Locally**

```bash
podman run --rm -p 8181:8181 demo-kiosk:summit2026

# Visit http://localhost:8181
# Verify: cards, videos, slides, branding
```

### **4. Push to Registry**

```bash
# Login if needed
podman login quay.io

# Push image
podman push quay.io/rhel-labs/demo-kiosk:summit2026
```

---

## Event Staff Deployment

### **Installer (recommended)**

On the event laptop:

```bash
curl -fsSL red.ht/demo-kiosk-install | bash
```

The installer pulls the image, installs the quadlet, starts the service, and waits for the healthcheck to pass. Opens at http://localhost:8181.

### **Manual setup (fallback)**

```bash
# 1. Create systemd directory
mkdir -p ~/.config/containers/systemd

# 2. Download quadlet file
curl -o ~/.config/containers/systemd/demo-kiosk.container \
  https://raw.githubusercontent.com/rhel-labs/demo-kiosk/main/demo-kiosk.container

# 3. Edit quadlet — set the image URL to the event-specific image
vi ~/.config/containers/systemd/demo-kiosk.container
# Update: Image=quay.io/rhel-labs/demo-kiosk:summit2026

# 4. Pull the image before starting (required — startup timeout won't cover a cold pull)
podman pull quay.io/rhel-labs/demo-kiosk:summit2026

# 5. Enable linger and start service
loginctl enable-linger
systemctl --user daemon-reload
systemctl --user start demo-kiosk
```

> **Note:** `systemctl start` blocks until the container passes its healthcheck (~30–45 seconds). This is expected — the service is ready when the command returns.

### **Verify**

```bash
systemctl --user status demo-kiosk
# Should show: Active: active (running)

# Visit: http://localhost:8181
```

---

## Day-of Content Updates

If the event team provides an updated content bundle on-site, the easiest path is the `/manage` upload — no container knowledge required.

### **Via /manage (recommended)**

1. Get the updated `kiosk-*.zip` from the event team.
2. Open **http://localhost:8181/manage** in a browser.
3. Under **Upload Kiosk Bundle**, select the zip and click **Upload & Rebuild**.
4. The kiosk reloads automatically with the new content.

The zip must contain a `kiosk/` directory with `faqs/`, `branding/`, and `media/` subdirectories. Cards and branding are replaced; existing media files are preserved.

**Note:** Some content types (Arcade demos, external URLs, labs) require internet access to load. If on-site internet is limited, verify the content bundle uses primarily offline demo types (video, slides, asciinema, image-text).

### **Via bind mount (advanced — for local authoring workflow)**

If the event team is editing YAML files directly on the laptop, you can mount the local content directory instead of using the named volume.

No internet required — all tools are bundled in the container image.

```bash
# Extract build tools from running container
podman cp demo-kiosk:/extras/extras.tar.gz ./
tar -xzf extras.tar.gz
# Extracts: build/, content/, AUTHORING.md, start.sh, etc.
```

```bash
# 1. Get updated bundle from event team
mv ~/Downloads/kiosk-*.zip ~/demo-kiosk/

# 2. Extract content
cd ~/demo-kiosk
unzip kiosk-*.zip
mv kiosk content

# 3. Build compiled JavaScript from YAML
python3 build/build-faqs.py
# Outputs: content/faqs.js and content/branding.js

# 4. Switch the quadlet to a bind mount
vi ~/.config/containers/systemd/demo-kiosk.container

# Comment out the named volume line:
#   Volume=kiosk-content:/srv/faq/content:copy
# Uncomment the bind mount line:
#   Volume=%h/demo-kiosk/content:/srv/faq/content:rw

# 5. Restart service
systemctl --user daemon-reload
systemctl --user restart demo-kiosk
```

Kiosk now serves content from `~/demo-kiosk/content/` on the host.

---

## Useful Commands

```bash
# Status
systemctl --user status demo-kiosk

# Restart
systemctl --user restart demo-kiosk

# Stop
systemctl --user stop demo-kiosk

# Logs
journalctl --user -u demo-kiosk -f

# Admin stats
# http://localhost:8181/#admin
```

---

## Troubleshooting

### Build fails: "No content found"
```bash
# Verify zip exists in project root
ls kiosk-*.zip
```

### Service won't start
```bash
# Pull image manually (required before systemctl start)
podman pull quay.io/rhel-labs/demo-kiosk:summit2026

# Check image loaded
podman images | grep demo-kiosk

# Start (blocks ~30-45s while healthcheck runs)
systemctl --user start demo-kiosk
```

### Service times out during start
The healthcheck must pass within `TimeoutStartSec` (120 seconds). If the image hasn't been pulled yet, the pull happens inside that window and may not leave enough time. Always run `podman pull` before `systemctl start`.

### Wrong content showing
```bash
# Check which image is running
podman inspect demo-kiosk | grep Image

# Force fresh pull
podman pull quay.io/rhel-labs/demo-kiosk:summit2026
systemctl --user restart demo-kiosk
```

### /manage shows "read-only" warning
The named volume is not mounted. Verify the `Volume=` line in `~/.config/containers/systemd/demo-kiosk.container` is not commented out, then run `systemctl --user daemon-reload && systemctl --user restart demo-kiosk`.

---

## Event Checklist

**Platform Team (Pre-Event):**
- [ ] Download Drive bundle: `kiosk-*.zip`
- [ ] Build: `podman build -t demo-kiosk:summit2026 .`
- [ ] Test locally: http://localhost:8181
- [ ] Push: `podman push quay.io/rhel-labs/demo-kiosk:summit2026`
- [ ] Share image URL and installer link with event staff

**Event Staff (On-Site):**
- [ ] Run: `curl -fsSL red.ht/demo-kiosk-install | bash`
- [ ] Verify: http://localhost:8181
- [ ] If content update needed: http://localhost:8181/manage → Upload Kiosk Bundle

**Post-Event:**
- [ ] Download stats: http://localhost:8181/#admin → Download CSV
- [ ] Archive logs: `journalctl --user -u demo-kiosk > event-logs.txt`
