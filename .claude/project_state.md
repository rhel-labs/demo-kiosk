# Project State

## Current Branch
`feature/event-content-pipeline` — **merged to main as PR #18** (2026-07-21)

## What's on Main

All feature work from this branch is now merged and published:
- Phase 1: categories, spotlight, admin restructure, display controls
- Phase 2: author tool with categories, spotlight, product family, schema v2 bundles
- KIOSK_UI feature flag (default: `classic`; set to `modern` to enable new multi-page UI)
- Lenient rebuild warnings in setup UI
- Partial content runtime rebuild

Post-merge CI and Publish both passed. Multi-arch images pushed to ghcr.io with `latest`, date, and sha tags.

## KIOSK_UI Cutover Checklist (when new UI is approved)
1. `Containerfile` — change `ENV KIOSK_UI=classic` → `ENV KIOSK_UI=modern`
2. `demo-kiosk.container` — change `Environment=KIOSK_UI=classic` → `Environment=KIOSK_UI=modern`
3. `app/serve.py` — change fallback default `'classic'` → `'modern'`
4. Remove `app/index-classic.html` and `app/manage.html`
5. Remove toggle checkbox and `/api/ui-mode` endpoint
6. Update quadlet comments

## What's Next
No tracked backlog — next work items TBD.
