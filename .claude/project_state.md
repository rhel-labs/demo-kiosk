# Project State

## Current Branch
`feature/phase1-categories-admin` — pushed, image pushed to quay.io

## What Was Done (this branch, all committed)

Phase 1 kiosk-side features:
- **Categories and spotlight row** — Innovate/Protect/Simplify/Trust/Kiosk sections; Featured row; empty category suppression
- **Product family label** — constrained badge at card bottom (13 values); lint validation; Add/Edit card form dropdowns
- **Admin restructure** — Setup / Display / Stats three-page structure; `/manage` → 404; nav order Kiosk · Display · Stats · Setup
- **Split bundle imports** — branding/content/full types; add and overwrite modes; upload summary
- **Containerfile page removed** — `manage.html` and `generate-containerfile-page.py` deleted
- **Footer tap target fix** — larger font and tap area on all admin pages
- **display.html** — Reset all display overrides button (clears all 6 localStorage keys at once)
- **setup.html** — stale `order` field removed from Edit Card form; family dropdown in both Add and Edit forms
- **Tech debt cleared** — 3 blocking bugs + 12 debt items fixed

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

1. **Waiting on Phase 1 review** — PR open, 1 of N stakeholders has reviewed; blocked on remaining approvals before merge
2. **Phase 2 complete** — needs commit, then PR
   - Spec: `.claude/spec-phase2-author.md`
   - `app/serve.py` — fixed `kiosk/index.yaml` path (was `kiosk/content/index.yaml`); added `index.yaml` to generic-loop exclusion list
   - `author/src/utils/yamlGen.js` — dropped `order`, added `spotlight`/`family` emit, added `indexToYaml()`
   - `author/src/utils/zipHandler.js` — export emits `kiosk/bundle.yaml` + `kiosk/index.yaml`; import reads `index.yaml` for card order, reads `spotlight`/`family`
   - `author/src/components/CardEditModal.jsx` — Featured checkbox + Product family dropdown
3. **Still needed**: Makefile targets `build-author`, `push-author`

## Image State
- `quay.io/mmicene/demo-kiosk:latest` — current Phase 1 build (2026-05-27)
- `quay.io/mmicene/demo-kiosk:summit` — Summit 2026 event image (digest dae55d4f377f, preserved)
- `quay.io/mmicene/demo-kiosk-author:latest` — current author tool build
