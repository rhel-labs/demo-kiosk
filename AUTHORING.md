# Demo Kiosk — Guide

This guide covers creating demo content, rebranding for events, and deploying the kiosk.

## Pick Your Role

| Role | You want to... | Start here |
|------|----------------|------------|
| 📝 **Content Author** | Add/edit FAQ cards and media files | [Content Authoring](#content-authoring) |
| 🎨 **Event Coordinator** | Rebrand for Summit, AnsibleFest, etc. | [Event Branding](#event-branding) |
| 🚀 **Platform Operator** | Build, deploy, and run the kiosk | [Deployment & Operations](#deployment--operations) |

---

## How It Works

Content lives entirely in the `content/` directory:

```
content/
  branding/       ← event branding (logos, colors, event name)
  faqs/           ← YAML files, one per FAQ card
  media/          ← videos, PDFs, images, terminal recordings
  branding.js     ← compiled output (generated — do not edit)
  faqs.js         ← compiled output (generated — do not edit)
```

The app files (`app/assets/`, `app/faqs/`, `serve.py`) are never touched by content authors or event coordinators.

When you are ready to publish changes, run:

```bash
python3 build/build-faqs.py
```

This reads `content/faqs/*.yaml` and `content/branding/branding.yaml`, validates them, and writes `content/faqs.js` and `content/branding.js`. Those files are what the browser loads.

---

# Content Authoring

**Audience:** Content authors creating FAQ cards and managing media files  
**Skills needed:** Basic YAML editing, file management  
**No coding or container knowledge required**

---

## Adding a FAQ Card

1. Copy the template:
   ```bash
   cp content/faqs/_template.yaml content/faqs/my-topic.yaml
   ```

2. Edit the file — fill in the required fields and choose a demo type (see [Demo Types](#demo-types) below).

3. Place any media files in `content/media/`.

4. Run the build:
   ```bash
   python3 build/build-faqs.py
   ```

5. Start the local server to preview (or see [Previewing Locally](#previewing-locally)):
   ```bash
   ./start.sh
   ```

---

## YAML File Format

Every file in `content/faqs/` (except those starting with `_`) becomes a card.

### Required fields

```yaml
id: my-topic
order: 10
title: "How do I do the thing?"
summary: "One sentence shown on the card under the title."

demo:
  type: video          # see Demo types below
  src: content/media/my-video.mp4
```

| Field | Description |
|---|---|
| `id` | Unique identifier. No spaces — use hyphens. |
| `order` | Integer. Cards are sorted lowest-first. Use multiples of 10 (10, 20, 30…) so you can insert between existing cards without renumbering. |
| `title` | The question shown on the card. Keep it concise. |
| `summary` | One sentence shown under the title on the card. |
| `enabled` | `true` or `false`. Controls whether the card appears on the kiosk grid. Defaults to `true` if omitted. Can be overridden from the admin view without a rebuild. |
| `demo` | A mapping with at least a `type` field. See below. |

### Rules

- Files starting with `_` are ignored by the build script — use them for drafts or the template.
- `id` must be unique across all files. The build script will error if two files share an id.
- `order` must be unique. The build script will error on duplicates.
- Only one `demo` block per file.

---

## Demo Types

### `video` — MP4 screen recording

```yaml
demo:
  type: video
  src: content/media/my-recording.mp4
```

Best for: product walkthroughs, installation demos, anything recorded with a screen recorder.

**Supported formats:** MP4 (H.264 recommended for broadest browser compatibility). WebM also works.

**Tips:**
- Keep videos under 5 minutes for kiosk use.
- Record at 1280×720 or 1920×1080.
- The player shows native browser controls. The modal auto-pauses the idle timer while the video plays.

---

### `slides` — PDF presentation

```yaml
demo:
  type: slides
  src: content/media/my-slides.pdf
```

Best for: step-by-step guides, annotated screenshots, anything authored in Google Slides, LibreOffice Impress, or Keynote.

**How to export from Google Slides:** File → Download → PDF Document (.pdf)

**Tips:**
- Use 16:9 slide dimensions for best fit.
- The viewer renders one slide at a time with Previous / Next buttons.
- A fullscreen button is available for presenting directly from the kiosk screen.
- Arrow keys (← →) navigate slides when in fullscreen.

---

### `asciinema` — Terminal recording

```yaml
demo:
  type: asciinema
  src: content/media/my-recording.cast
```

Best for: command-line demos, shell walkthroughs, scripted terminal sessions.

**How to record:**
```bash
# Install asciinema (if not already installed)
sudo dnf install asciinema        # RHEL/Fedora
# or: pip3 install asciinema

# Record a session
asciinema rec content/media/my-recording.cast
# ... do your demo ...
# Press Ctrl+D to stop

# Optional: replay to verify
asciinema play content/media/my-recording.cast
```

**Tips:**
- Keep the terminal narrow (80 columns) so it fits the modal without horizontal scrolling.
- The player auto-plays and loops. The idle timer is paused while a recording is playing.

---

### `image-text` — Screenshot with caption

```yaml
demo:
  type: image-text
  image: content/media/my-screenshot.png
  caption: >
    Describe what is shown in the image.
    This text appears below the image in the modal.
    You can write multiple sentences — the > means they are joined into one paragraph.
```

Best for: architecture diagrams, annotated screenshots, reference images with explanatory text.

**Supported formats:** PNG, JPG, SVG, WebP.

**Tips:**
- Use PNG for screenshots, JPG for photos.
- The image is displayed at full modal width, scaled to fit.
- The `caption` field uses YAML block scalar (`>`), which joins wrapped lines into a single paragraph. Start the text on the next line, indented.

---

### `external-url` — Link to a website

```yaml
summary: "One sentence shown on the card."

demo:
  type: external-url
  url: https://example.com
  long_description: |
    Full description shown in the modal before the visitor opens the link.
    Supports **bold text**, [hyperlinks](https://example.com), and bullet lists:
    - First item
    - Second item
```

Best for: documentation portals, support sites, product pages, any external resource.

**Tips:**
- `summary` is the short text shown on the card grid.
- `long_description` is shown in the modal body. Use it to tell the visitor what they will find at the URL.
- The "Open Link" button opens the URL in a new browser tab. The modal stays open.
- `long_description` supports basic formatting: `**bold**`, `[link text](url)`, and `- bullet lists`.

---

### `lab` — Hands-on lab (Red Hat Demo Platform)

```yaml
demo:
  type: lab
  url: https://zero.rhdp.net/lab/your-lab-slug.prod
  long_description: |
    Describe what the visitor will do in this lab.
    Supports **bold text**, [hyperlinks](https://example.com), and bullet lists:
    - First step
    - Second step
  duration: "30 minutes"   # optional
```

Best for: self-paced, hands-on labs hosted on the Red Hat Demo Platform (RHDP).

**How to find the URL and duration:**
- Browse to [redhat.com/en/interactive-labs](https://www.redhat.com/en/interactive-labs) and find your lab.
- Copy the full RHDP lab URL from the "Start" button (it will begin with `https://zero.rhdp.net/lab/…`).
- The estimated duration is shown on the lab's listing page — copy it as a freeform string, e.g. `"15 minutes"`.

**Tips:**
- `url` and `long_description` are required. `duration` is optional.
- The "Launch Lab" button opens the URL in a new tab. Visitors need a Red Hat account to proceed.
- `long_description` supports the same formatting as `external-url`: `**bold**`, `[link text](url)`, and `- bullet lists`.
- If `duration` is provided it is displayed as "Estimated time: X" in the modal.

---

### `arcade` — Embedded interactive demo (Arcade)

```yaml
demo:
  type: arcade
  share_url: https://interact.redhat.com/share/YOUR_FLOW_ID
```

Best for: click-through product demos and interactive walkthroughs created with [Arcade](https://arcade.software).

**How to get the share URL:**

Option A — Red Hat branded link (recommended):
1. Open your Arcade flow and click **Share**.
2. Copy the `interact.redhat.com` link, e.g. `https://interact.redhat.com/share/abcXYZ123`.

Option B — Standard Arcade link:
1. Copy the `app.arcade.software/share/…` link instead.

**What happens at build time:**
The build script fetches the share page automatically and extracts the demo title and aspect ratio — no manual copy-paste needed. An internet connection is required at build time (not at runtime).

**Optional overrides** (useful for offline builds or when the fetch would fail):

```yaml
demo:
  type: arcade
  share_url: https://interact.redhat.com/share/YOUR_FLOW_ID
  title: "Product walkthrough — getting started"
  aspect_ratio: "56.25%"
```

**Tips:**
- `share_url` is the only required field.
- `title` sets the accessible label on the iframe. If omitted, it is fetched from the Arcade share page.
- `aspect_ratio` controls the embed height as a CSS percentage (`"56.25%"` = 16:9). If omitted, it is fetched from the Arcade share page and defaults to `"56.25%"` if unavailable.
- The idle timer is paused while the Arcade modal is open so the kiosk does not reset mid-demo.

---

## Ordering Cards

Cards appear in ascending `order` value. Lower numbers appear first (top-left).

Use multiples of 10 so you can insert cards between existing ones:

```
order: 10   ← first
order: 20   ← second
order: 25   ← inserted between second and third without renumbering
order: 30   ← third
```

To reorder: change the `order` value and re-run `python3 build/build-faqs.py`.

---

## Hiding and Showing Cards

Set `enabled: false` in a card's YAML file to hide it from the kiosk grid by default:

```yaml
enabled: false   # card exists in the catalog but does not appear on screen
```

Cards can also be toggled without a rebuild from the admin view (`#admin`). Admin toggles are stored in the browser and override the YAML default immediately — no page reload required. Use **Reset all to defaults** to clear overrides and restore the YAML state.

---

# Event Branding

**Audience:** Event coordinators rebranding the kiosk for different Red Hat events  
**Skills needed:** Basic YAML editing, file management  
**No coding or container knowledge required**

---

The kiosk can be easily rebranded for different Red Hat events (Summit, AnsibleFest, etc.) by editing one YAML file.

## Quick Rebrand Using Presets

Preset configurations are available in `content/branding/presets/`:

```bash
# For Red Hat Summit:
cp content/branding/presets/summit.yaml content/branding/branding.yaml

# For AnsibleFest:
cp content/branding/presets/ansiblefest.yaml content/branding/branding.yaml

# Rebuild to apply changes:
python3 build/build-faqs.py
```

---

## Custom Branding

Edit `content/branding/branding.yaml` to customize all event branding:

```yaml
# Event Information
event:
  # Browser tab title (optional — if omitted, uses header)
  title: Your Event 2026 - Demo Kiosk
  
  # Main header display (required — large centered text in masthead)
  header: Your Event
  
  # Marketing tagline (optional — appears below header)
  tagline: Your event tagline or description

# Logo Configuration
logos:
  # Left logo (typically Red Hat corporate logo)
  primary:
    file: content/branding/logo-redhat.svg
    alt_text: Red Hat

  # Right logo (event-specific logo)
  secondary:
    file: content/branding/logo-your-event.svg
    alt_text: Your Event

# Brand Colors (use hex codes)
colors:
  brand_primary: "#ee0000"    # Primary brand color (buttons, links)
  brand_hover: "#c00000"      # Hover state
  page_background: "#f2f2f2"  # Main page background
  header_background: "#151515" # Header background

# Display Settings
layout:
  card_columns: 3
  idle_timeout_seconds: 30
  countdown_seconds: 10

# Footer
footer:
  copyright: Red Hat, Inc.
```

**Field guide:**

| Field | Required? | Purpose |
|-------|-----------|---------|
| `event.title` | Optional | Browser tab title. Falls back to `header` if omitted. |
| `event.header` | **Required** | Large text shown in masthead center. |
| `event.tagline` | Optional | Smaller text shown below header. Hidden if omitted. |

---

## Adding Custom Logos

1. Download your event logo (SVG format recommended for scalability)
2. Save it to `content/branding/` (e.g., `logo-your-event.svg`)
3. Update the `logos.secondary.file` path in `branding.yaml`
4. Run `python3 build/build-faqs.py`

**Supported formats:** SVG (recommended), PNG

---

## YAML Gotcha

If your text contains a colon (`:`), wrap it in quotes:

```yaml
title: "Your Event 2026: Demo Kiosk"  ← correct
title: Your Event 2026: Demo Kiosk    ← will fail (YAML parse error)
```

---

# Deployment & Operations

**Audience:** Platform operators building, deploying, and maintaining the kiosk  
**Skills needed:** Containers (Podman), systemd, Linux system administration

---

## Getting Started (Extracting from Container)

If you have a container image but not the source repository, you can extract all authoring tools directly from the image:

```bash
# Extract the authoring bundle from the image
podman create --name faq-tmp demo-kiosk:latest
podman cp faq-tmp:/extras/extras.tar.gz ./
podman rm faq-tmp
tar -xzf extras.tar.gz
```

The bundle contains:
- `AUTHORING.md` — this guide
- `build/` — build scripts
- `content/faqs/` — sample FAQ cards and template
- `app/faqs/` — Jinja2 templates
- `download-libs.sh` — script to download third-party libraries
- `start.sh` — local development server launcher
- `demo-kiosk.container` — systemd Quadlet service definition

After extraction, content authors can proceed with [Adding a FAQ card](#adding-a-faq-card).

---

## Previewing Locally

```bash
./start.sh
```

This runs `build-faqs.py` automatically, then starts a local HTTP server at `http://localhost:8181` and opens a browser.

Options:
```bash
./start.sh --port 9090          # use a different port
./start.sh --kiosk              # open browser in fullscreen/kiosk mode
./start.sh --browser firefox    # specify a browser
```

---

## Building the Container Image

The container build is **fully self-contained** — all dependencies (libraries, fonts, build tools) are downloaded and built inside the container. No host setup required beyond `podman`.

```bash
# Build the image (downloads libraries and builds content automatically)
podman build -t demo-kiosk:latest .

# Or use the Makefile
make build
```

The builder stage automatically:
1. Downloads third-party libraries (PatternFly, fonts, asciinema-player, PDF.js)
2. Builds content from YAML sources (`build-faqs.py`)
3. Generates the Containerfile viewer page

```bash
# Run the container
podman run --rm -p 8181:8181 demo-kiosk:latest

# Or use the Makefile
make test
```

The kiosk serves on **port 8181** by default.

---

## Deploying as a systemd Service

For production deployments, use systemd Quadlet to run the kiosk as a persistent service:

```bash
# Install the Quadlet unit file (user service)
mkdir -p ~/.config/containers/systemd
cp demo-kiosk.container ~/.config/containers/systemd/

# Reload systemd and start the service
systemctl --user daemon-reload
systemctl --user start demo-kiosk
systemctl --user enable demo-kiosk  # auto-start on login
```

Check status:
```bash
systemctl --user status demo-kiosk
journalctl --user -u demo-kiosk -f  # follow logs
```

See `demo-kiosk.container` for the full Quadlet configuration and customization options.

---

## Deploying with a Volume Mount

If you want to update content without rebuilding the image, mount your `content/` directory into the container at runtime.

### Steps

1. Prepare your content directory:
   ```bash
   mkdir -p /path/to/my-content/faqs /path/to/my-content/media /path/to/my-content/branding
   ```

2. Copy the template and branding config:
   ```bash
   cp content/faqs/_template.yaml /path/to/my-content/faqs/my-topic.yaml
   cp content/branding/branding.yaml /path/to/my-content/branding/
   # edit my-topic.yaml and branding.yaml ...
   ```

3. Place all media files and logos in their respective subdirectories **before** running the build — the build script embeds paths verbatim and does not copy files:
   ```bash
   cp my-video.mp4 /path/to/my-content/media/
   cp logo-event.svg /path/to/my-content/branding/
   ```

4. Symlink or copy your content directory into the project so the build script can find it, then run the build:
   ```bash
   # From the project root (where build/ lives):
   ln -sfn /path/to/my-content content   # or copy it
   python3 build/build-faqs.py
   # Reads  content/faqs/*.yaml and content/branding/branding.yaml
   # Writes content/faqs.js and content/branding.js
   ```
   > **Note:** `build/build-faqs.py` always reads and writes `content/` relative to the project root. The generated `content/faqs.js` and `content/branding.js` must be present in your content directory before you start the container.

5. Run the container with the volume:
   ```bash
   podman run --rm -p 8181:8181 \
     -v /path/to/my-content:/srv/faq/content:ro \
     demo-kiosk:latest
   ```

The image provides the app framework; the volume provides the content. The baked-in placeholder content in the image is replaced entirely by the volume mount.

### Updating Content

1. Edit your YAML files and ensure any new media files are in `content/media/`.
2. Run `python3 build/build-faqs.py` (from the project root) to regenerate `content/faqs.js` and `content/branding.js`.
3. Restart the container (or reload the browser — the server serves files directly, so a browser refresh picks up the new files immediately).

---

# Shared Resources

**Audience:** All roles

---

## Requirements

`build-faqs.py` requires Python 3 with two libraries:

```bash
pip3 install pyyaml jinja2
```

These are build-time dependencies only — nothing is installed in the container.

---

## Troubleshooting

**Cards do not appear**
- Check that `python3 build/build-faqs.py` ran without errors.
- Verify `content/faqs.js` exists and is not empty.
- Open the browser console — a `[FAQ]` error message will indicate the problem.

**Media file does not load**
- Check the `src` or `image` path in your YAML exactly matches the filename in `content/media/` (paths are case-sensitive).
- Verify the file was copied to `content/media/` before running the build.

**Branding does not apply**
- Verify `content/branding.js` exists and is not empty.
- Check that `content/branding/branding.yaml` has no YAML syntax errors.
- Open the browser console — a `[FAQ]` warning will indicate if branding failed to load.

**Build script errors**
- `Missing required field` — add the missing field to your YAML file.
- `Duplicate id` or `Duplicate order` — each file must have a unique `id` and `order` value.
- `Unknown demo type` — valid types are `video`, `slides`, `asciinema`, `image-text`, `external-url`, `lab`, `arcade`.
- `YAML parse error` — check for incorrect indentation or unquoted special characters. YAML is indentation-sensitive.

**YAML special characters**
Wrap `title` and `summary` in double quotes if they contain colons, question marks, or other punctuation:
```yaml
title: "How do I configure it?"   # safe
title: How do I configure it?     # also safe for simple strings
title: "Error: what now?"         # must quote — contains a colon
```
