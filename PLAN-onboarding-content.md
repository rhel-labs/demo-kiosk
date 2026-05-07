# Plan: Default Onboarding Content + Quick-Upload Card Type

## Context

With a dedicated authoring tool now handling content creation, shipping event-specific demo cards in the kiosk image no longer makes sense. A fresh kiosk deployment should guide whoever set it up toward loading real content rather than displaying stale placeholder demos. This branch replaces all existing default cards with a minimal instructional card set and introduces a hidden `upload` card type that lets staff drop a bundle zip directly from the kiosk card view — no navigation to `/manage` required. A successful upload replaces the onboarding cards with real content, making the instructions self-removing.

## What changes

### 1. New hidden card type: `upload`

**Kiosk front-end** — the card modal already switches on `demo.type` to decide what to render. Add a new branch for `type: upload` that renders:
- Drag-and-drop zone for a `.zip` file
- "Choose file" button fallback
- Progress indicator during POST to `/api/upload/zip` (relative URL, works regardless of hostname)
- Success message ("Content loaded — reloading…") followed by `window.location.reload()`
- Error message with the server's error text if upload fails

The type is **not** added to the authoring tool's `FILE_TYPES` or `URL_TYPES` lists (`author/src/components/CardList.jsx`) and **not** to the authoring tool's validation known-types list (`author/src/utils/validation.js`). It is kiosk-internal only.

**serve.py** — no changes needed. `/api/upload/zip` already exists and handles zip replacement.

**Key files to modify:**
- `app/kiosk/faq-card.js` (or wherever the modal renders per-type content — confirm exact file during implementation)
- `app/kiosk/faq-card.css` or equivalent for upload zone styles

### 2. Default onboarding cards (4 cards, zero media files)

Replace all existing `content/faqs/*.yaml` cards. No placeholder media. All cards are lightweight YAML only.

**`content/faqs/00-welcome.yaml`** (order: 10)
```yaml
id: welcome
order: 10
title: "This kiosk has no content yet"
summary: "Use the authoring tool to build a bundle, then load it here."
demo:
  type: upload
```

**`content/faqs/01-how-to-load.yaml`** (order: 20)
```yaml
id: how-to-load
order: 20
title: "How to load your content"
summary: "Run the authoring tool, build your bundle, and upload it from this card or /manage."
demo:
  type: external-url
  url: https://github.com/rhel-labs/demo-kiosk
  long_description: |
    1. Run the authoring tool container (see the repo README for the podman/quadlet command).
    2. Add your cards — video, slides, terminal recordings, interactive demos, and more.
    3. Configure event branding (header, logo, tagline).
    4. Click "Download Bundle" to get a kiosk-*.zip file.
    5. Upload the zip using the first card on this page, or go to /manage.

    All media is bundled in the zip — no separate uploads needed.
```

**`content/faqs/02-card-types.yaml`** (order: 30)
```yaml
id: card-types
order: 30
title: "What kinds of demos can this kiosk show?"
summary: "Eight card types are supported — from videos to interactive walkthroughs."
demo:
  type: external-url
  url: https://github.com/rhel-labs/demo-kiosk
  long_description: |
    • Video — MP4 or WebM screen recordings
    • Slides — PDF presentations
    • Terminal — Asciinema .cast recordings
    • Image — Annotated screenshot with caption
    • External URL — Link with description (opens modal)
    • Lab — Hands-on lab from Red Hat Demo Platform
    • Arcade — Interactive demo from Arcade.software
    • Video Loop — Ambient booth reel (plays continuously)

    Use the authoring tool to create cards of any of these types.
```

**`content/faqs/03-manage.yaml`** (order: 40)
```yaml
id: manage
order: 40
title: "Managing this kiosk"
summary: "The /manage panel lets you upload content, check status, and configure the kiosk."
demo:
  type: external-url
  url: https://github.com/rhel-labs/demo-kiosk
  long_description: |
    Navigate to /manage on this kiosk to:
    • Upload a new content bundle (zip)
    • View currently loaded cards and branding
    • Restart the server if needed

    See the repo README for Quadlet/systemd deployment and update instructions.
```

### 3. Default branding

Replace Summit-specific defaults in `content/branding/branding.yaml`:
- `event.header`: `"Demo Kiosk"`
- `event.tagline`: `"Ready for your content"`
- `event.title`: omit (defaults to header)
- `logos.secondary`: remove Summit logo reference; use a neutral placeholder or omit
- Colors, layout, footer: unchanged (Red Hat defaults)

Remove branding presets — event-specific, don't belong in the generic default image. Recreatable from the authoring tool.

### 4. Remove old content and placeholder media

Delete:
- `content/faqs/q01-what-is-this.yaml` through `q07-lab-demo.yaml`
- All Summit demo cards (`ai_assisted_upg.yaml`, `digital_sov.yaml`, etc.)
- `content/faqs/loop-booth-reel.yaml`
- Placeholder media files in `content/media/`
- `content/media/build.cast`
- `content/branding/logo-summit.svg`
- `content/branding/presets/`

Keep:
- `content/branding/logo-redhat.svg`
- `content/faqs/_template.yaml` (filtered from card list by serve.py's `_template` check)

## Verification

1. Build the kiosk image on this branch — no missing media references
2. Run locally — 4 onboarding cards appear with generic branding
3. Click "This kiosk has no content yet" card — upload modal renders, accepts zip, POSTs to `/api/upload/zip`, reloads on success
4. Upload a real bundle from the authoring tool — onboarding cards replaced with real content
5. Confirm authoring tool has no knowledge of `upload` type (not in type lists, not in validation)
6. `build/lint-content.py` passes on the new default cards
