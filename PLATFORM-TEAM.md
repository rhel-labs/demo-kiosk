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

The installer checks for Podman, installs the quadlet, starts the service, and verifies the healthcheck. Opens at http://localhost:8181.

### **Manual setup (fallback)**

```bash
# 1. Create systemd directory
mkdir -p ~/.config/containers/systemd

# 2. Download quadlet file
curl -o ~/.config/containers/systemd/demo-kiosk.container \
  https://raw.githubusercontent.com/rhel-labs/demo-kiosk/main/demo-kiosk.container

# 3. Edit quadlet - set image URL
vi ~/.config/containers/systemd/demo-kiosk.container

# Update these lines:
#   Image=quay.io/rhel-labs/demo-kiosk:summit2026
#   Pull=newer

# 4. Enable linger and start service
loginctl enable-linger
systemctl --user daemon-reload
systemctl --user enable --now demo-kiosk
```

### **Verify**

```bash
systemctl --user status demo-kiosk
# Should show: Active: active (running)

# Visit: http://localhost:8181
```

---

## Day-of Content Updates

If event team provides updated content bundle on-site, serve it via volume mount.

**Note:** Some content types (Arcade demos, external URLs, labs) require internet access to load. If on-site internet is limited, verify the content bundle uses primarily offline demo types (video, slides, asciinema, image-text).

### **Setup (extract from running container)**

No internet required — all tools are bundled in the container image.

```bash
# Create working directory
mkdir -p ~/demo-kiosk
cd ~/demo-kiosk

# Extract build tools from running container
podman cp demo-kiosk:/extras/extras.tar.gz ./
tar -xzf extras.tar.gz
# Extracts: build/, content/, AUTHORING.md, start.sh, etc.
```

### **Use Updated Content Bundle**

```bash
# 1. Get updated bundle from event team
#    (They download from Drive and give you the kiosk-*.zip file)
mv ~/Downloads/kiosk-*.zip ~/demo-kiosk/

# 2. Extract content
cd ~/demo-kiosk
unzip kiosk-*.zip
mv kiosk content

# 3. Build compiled JavaScript from YAML
python3 build/build-faqs.py
# Outputs: content/faqs.js and content/branding.js

# 4. Enable volume mount in quadlet
vi ~/.config/containers/systemd/demo-kiosk.container

# Uncomment this line:
Volume=%h/demo-kiosk/content:/srv/faq/content:ro

# 5. Restart service
systemctl --user daemon-reload
systemctl --user restart demo-kiosk
```

Kiosk now serves content from `~/demo-kiosk/content/` on host.

---

## Useful Commands

```bash
# Status
systemctl --user status demo-kiosk

# Restart
systemctl --user restart demo-kiosk

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
# Pull image manually
podman pull quay.io/rhel-labs/demo-kiosk:summit2026

# Check image loaded
podman images | grep demo-kiosk

# Restart
systemctl --user restart demo-kiosk
```

### Wrong content showing
```bash
# Check which image is running
podman inspect demo-kiosk | grep Image

# Force fresh pull
podman pull quay.io/rhel-labs/demo-kiosk:summit2026
systemctl --user restart demo-kiosk
```

---

## Event Checklist

**Platform Team (Pre-Event):**
- [ ] Download Drive bundle: `kiosk-*.zip`
- [ ] Build: `podman build -t demo-kiosk:summit2026 .`
- [ ] Test locally: http://localhost:8181
- [ ] Push: `podman push quay.io/rhel-labs/demo-kiosk:summit2026`
- [ ] Share image URL and quadlet with event staff

**Event Staff (On-Site):**
- [ ] Run: `curl -fsSL red.ht/demo-kiosk-install | bash`
- [ ] Verify: http://localhost:8181

**Post-Event:**
- [ ] Download stats: http://localhost:8181/#admin → Download CSV
- [ ] Archive logs: `journalctl --user -u demo-kiosk > event-logs.txt`
