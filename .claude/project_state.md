# Project State

## Current Branch
`feature/event-content-pipeline` — 11 commits ahead of main. Contains both
backend improvements and new multi-page UI (setup/display/stats).

## What Was Done

### Feature flag for UI mode (uncommitted)
Added `KIOSK_UI` environment variable (`classic` or `modern`, default `classic`)
to gate the new multi-page UI while keeping all backend improvements active.

**Files changed:**
- `app/serve.py` — module-level `_kiosk_ui_mode` from env var, conditional routing
  in `do_GET`, `PUT /api/ui-mode` handler for runtime toggle, `_redirect` helper
- `app/index-classic.html` — restored from `main:app/index.html` (old index with
  inline #admin section)
- `app/manage.html` — restored from `main:app/manage.html` + "Try new UI" toggle
  checkbox in header
- `Containerfile` — `ENV KIOSK_UI=classic` with CUTOVER comment
- `demo-kiosk.container` — `Environment=KIOSK_UI=classic` with CUTOVER comment,
  updated URL references for both modes
- `.containerignore` — removed `app/manage.html` so it ships in container

**Routing behavior:**
- Classic (default): `/` → `index-classic.html`, `/manage` → `manage.html`,
  `/setup` → 302 to `/manage`
- Modern: `/setup` → `setup.html`, `/display` → `display.html`,
  `/stats` → `stats.html`, `/manage` → 302 to `/setup`
- All `/api/*` endpoints identical in both modes
- `GET/PUT /api/ui-mode` toggles at runtime without restart

**Verified:** all routes tested in both modes, env var override works, invalid
mode rejected with 400.

### Cutover checklist (for when new UI is approved)
1. `Containerfile` — change `ENV KIOSK_UI=classic` → `ENV KIOSK_UI=modern`
2. `demo-kiosk.container` — change `Environment=KIOSK_UI=classic` → `Environment=KIOSK_UI=modern`
3. `app/serve.py` — change fallback default `'classic'` → `'modern'`
4. Remove `app/index-classic.html` and `app/manage.html`
5. Remove toggle checkbox and `/api/ui-mode` endpoint
6. Update quadlet comments

## What's Next

1. **User review** — visual check of manage.html toggle, confirm classic UI matches
   production expectations
2. **Commit** — commit the feature flag changes
3. **Merge to main** — PR from feature branch
4. **User testing** — event staff test modern UI via toggle or `KIOSK_UI=modern`
5. **Cutover** — when approved, flip defaults per checklist above
