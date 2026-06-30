# Spec: Demo Kiosk — Categories, Spotlight, Admin Restructure, Author Tool, Validation

## Overview

Event demo kiosk with containerized display, admin pages, and a browser-based
authoring tool. Content travels as ZIP bundles between the author tool and the kiosk.

---

## Schema

### Card YAML (`content/faqs/*.yaml`)

| Field | Required | Notes |
|-------|----------|-------|
| `id` | yes | lowercase alphanumeric with hyphens, starts with letter or digit |
| `title` | yes | non-empty string |
| `summary` | yes | non-empty string (optional for video-loop type) |
| `enabled` | yes | boolean; defaults to true if omitted |
| `demo` | yes | demo block — see demo types below |
| `spotlight` | no | `true` when featured; omit when false |
| `family` | no | one of the allowed values; omit when not set |

Family allowed values: RHEL, RHEL AI, OpenShift, OpenShift AI, OpenShift Virt,
AAP, RHACS, Satellite, Lightspeed, Developer Hub, Quay, Red Hat AI, Edge.

### Demo types

Defined in `build/bundle-spec.yaml`. Each type has required and optional fields,
with field categories (media, URL, arcade URL, media list) that determine
validation behavior.

| Type | Required fields | Category |
|------|----------------|----------|
| video | src | media |
| slides | src | media |
| asciinema | src | media |
| image-text | image, caption | media (image), text (caption) |
| external-url | url, long_description | URL |
| lab | url, long_description | URL; optional: duration |
| arcade | share_url | arcade URL; optional: title, aspect_ratio |
| video-loop | videos | media list |
| upload | (none) | kiosk-reserved; not available in author tool |

### Content index (`content/index.yaml`)

```yaml
schema_version: 2
card_order: [card-a, card-b, card-c]
categories:
  - name: Innovate
    cards: [card-a]
  - name: Protect
    cards: [card-b, card-c]
```

Card sequence is defined here, not on individual cards. Categories group cards
into sections on the kiosk display.

### Bundle manifest (`kiosk/bundle.yaml`)

```yaml
bundle_type: full
schema_version: 2
```

`bundle_type` values: branding, content, full. Controls which content areas the
kiosk touches on upload. Author tool always emits `full`. Missing manifest
defaults to `full` for backwards compatibility.

### Branding (`content/branding/branding.yaml`)

Required sections: event, logos, colors, layout, footer. Author tool hardcodes
valid defaults for colors, layout, and footer. Only event header/tagline/title
and secondary logo are author-editable.

---

## Validation model

Source of truth: `build/bundle-spec.yaml`. All validation code is synced
manually — when the spec changes, validation code updates in the same commit.

| Consumer | When | Mode | Purpose |
|----------|------|------|---------|
| `build/lint-content.py` | Container build | Strict | Full spec + yamllint; catches everything before image is finalized |
| `build/build-faqs.py` | Container build | Strict | Validates and renders YAML → JS |
| `build/build-faqs.py --lenient` | Runtime (serve.py) | Lenient | Skips invalid cards, emits valid ones, warnings on stderr |
| `author/src/utils/validation.js` | Author export | Strict | Spec-complete pre-export check; blocks export on errors |
| `app/serve.py` | Runtime CRUD | Minimal | ID format + required fields for single-card edits |

### Runtime behavior (lenient mode)

At runtime, event staff cannot fix bundles. The kiosk must:
- Accept everything uploaded
- Display cards that validate successfully
- Skip cards that don't, with warnings in the upload response
- Never abort entirely due to one bad card

`build-faqs.py --lenient` implements this: errors are warned, not fatal. Valid
cards are emitted to `faqs.js`; invalid cards are skipped. Branding errors fall
back to the previous `branding.js` if available.

### Author tool validation

The author tool performs full spec validation on export. Since the author is the
only person who can fix content errors, validation blocks export until all cards
pass. Validation rules in `author/src/utils/validation.js` are derived from
`bundle-spec.yaml` — update together.

---

## Kiosk features

### Categories and spotlight

- Cards grouped into named sections with red-underlined headers
- Spotlight row ("Featured") above sections when any card has spotlight
- Spotlighted cards appear in both Featured row and their category section
- Cards not in any category appear in "Other" section
- Empty categories suppressed (no header rendered)
- No categories defined → flat grid

### Admin pages

Three pages: Setup, Display, Stats. Nav order: Kiosk · Display · Stats · Setup.

- **Setup** — bundle upload (add/overwrite modes), card CRUD, branding editor
- **Display** — card order, visibility, featured toggles, category assignment
  and ordering, per-category show/hide
- **Stats** — view counts, log table, CSV download

All display overrides are browser-local (localStorage). Resets restore
server-side defaults.

### Bundle import

- **Add mode** — cards merged additively; conflicting IDs auto-renamed;
  index.yaml merged (incoming cards appended)
- **Overwrite mode** — replaces all cards; branding replaced; media additive
- Missing `bundle.yaml` → treated as full bundle

---

## Author tool

React/Vite browser app. Three tabs: Cards, Branding, Categories.

- Card editor: title, summary, ID, demo type and fields, spotlight checkbox,
  family dropdown
- Branding editor: event header/tagline/title, secondary logo
- Categories editor: add/delete/reorder categories, per-category card checklist
- Default categories: Innovate, Protect, Simplify, Trust
- Export: validates all cards, generates ZIP with kiosk/ structure including
  bundle.yaml, index.yaml, card YAMLs, branding, media
- Import: reads ZIP bundles (from author tool or kiosk), reconstructs editor
  state. Old bundles (pre-categories) get default categories.

---

## What this explicitly does NOT do

- No server-side filtering — category/visibility logic is client-side
- No per-kiosk state written back to server (localStorage is sufficient)
- No media deletion in overwrite mode
- No partial bundle type selection in author tool (always exports full)
- No branding overwrite protection (future enhancement)
- No dynamic loading of bundle-spec.yaml — it's a code artifact

---

## How success is verified

1. **Container build** — `make build` with valid content succeeds; with invalid
   content, lint-content.py catches errors and build fails
2. **Runtime upload (valid)** — upload bundle via setup.html; cards appear on
   kiosk in correct order with categories and spotlight
3. **Runtime upload (partial invalid)** — upload bundle with one bad card and
   one good card; good card renders, bad card skipped, response includes warnings
4. **Author export** — export with valid cards succeeds; with invalid card
   (e.g. missing caption on image-text), export blocked with error message
5. **Author round-trip** — export bundle, re-import; spotlight, family,
   categories, card order all preserved
6. **Old bundle import** — pre-category bundle imports with default categories
7. **Family validation** — invalid family value blocked at author export;
   at build time caught by lint-content.py
