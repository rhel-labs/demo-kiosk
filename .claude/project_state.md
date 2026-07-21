# Project State

## Current Branch
`main` — no active feature branch

## What's on Main

All work from PR #18 and PR #20 is merged and published.

**PR #20** (2026-07-21) — project layout cleanup and test redesign:
- `build/` → `scripts/`, local dev tools → `dev/`, `start.sh`/`healthcheck.py` → `scripts/`
- Image registry URLs fixed: `quay.io/mmicene` → `ghcr.io/rhel-labs`
- CI and Publish workflows: `paths:` filters added to avoid spurious runs
- CI upload test: uses `tests/fixtures/bundles/valid-full-bundle.zip` (no ad-hoc bundle creation)
- `make test-upload`: no implicit `build` dep; forwards `HOST`/`BIND_ADDR` for devenv use
- `author/.gitignore` added to suppress `dist/` and `node_modules/`

**PR #18** — all feature work:
- Phase 1: categories, spotlight, admin restructure, display controls
- Phase 2: author tool with categories, spotlight, product family, schema v2 bundles
- KIOSK_UI feature flag (default: `classic`; set to `modern` to enable new multi-page UI)
- Lenient rebuild warnings in setup UI, partial content runtime rebuild

## KIOSK_UI Cutover Checklist (when new UI is approved)
1. `Containerfile` — change `ENV KIOSK_UI=classic` → `ENV KIOSK_UI=modern`
2. `demo-kiosk.container` — change `Environment=KIOSK_UI=classic` → `Environment=KIOSK_UI=modern`
3. `app/serve.py` — change fallback default `'classic'` → `'modern'`
4. Remove `app/index-classic.html` and `app/manage.html`
5. Remove toggle checkbox and `/api/ui-mode` endpoint
6. Update quadlet comments

## What's Next
No tracked backlog — next work items TBD.
