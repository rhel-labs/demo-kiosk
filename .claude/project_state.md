# Project State

## Current Branch
`feature/phase1-categories-admin`

## What Was Done

Phase 1 complete and committed (b826ffb).

### Features shipped:
- **Categories**: `content/index.yaml` categories → `window.KIOSK_INDEX` → main kiosk groups cards into named sections with red underline headers; "Other" section for uncategorized cards
- **Spotlight/Featured**: YAML `spotlight: true` default, overridable at runtime from display.html; Featured row appears above category sections
- **Admin routes**: `/setup` (replaces `/manage` → 404), `/stats`, `/display`; consistent nav on all pages: `Kiosk · Setup · Display · Stats`
- **setup.html**: upload with overwrite checkbox + summary; card CRUD; branding editor
- **stats.html**: view statistics + CSV download only (visibility controls removed)
- **display.html**: card visibility + order (drag), featured toggle, category assignment (checkbox table), category section show/hide + reorder; all via localStorage overrides
- **Bundle upload**: main kiosk upload card uses overwrite mode; setup.html uses add mode with collision rename (`{id}-2`, `{id}-3`, …) and summary JSON
- **Containerfile**: `content/index.yaml` now copied into builder stage so categories survive the build
- **Idle timer**: `stop()` instead of `pause()` when upload starts
- **Category hide fix**: hidden categories still claim their cards (no bleed into "Other")

### localStorage key map

| Key | Written by | Read by |
|-----|------------|---------|
| `faq_view_log` | index.html | stats.html |
| `faq_visibility` | display.html | index.html |
| `faq_order` | display.html | index.html |
| `faq_spotlight` | display.html | index.html |
| `faq_categories` | display.html | index.html |
| `faq_category_order` | display.html | index.html |
| `faq_category_visible` | display.html | index.html |

## What's Next
1. Open PR from `feature/phase1-categories-admin` → `main`
2. Phase 2: author tool changes
   **FIRST STEP: Write the Phase 2 spec before any implementation.**
   a. Write Phase 2 spec (required before anything else)
   b. Add `build-author` / `push-author` targets to Makefile
   c. Export `content/index.yaml` with `card_order` and `categories` in zip
   d. Add `spotlight` toggle per card in editor UI + card YAML export
   e. Include `kiosk/bundle.yaml` manifest (`bundle_type`, `schema_version: 2`)
