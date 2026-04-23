# Plan: Video Loop Card Type

**Branch:** `feature/video-loop-card`
**Base:** `main` (independent of `feature/no-code-admin-ui`)

---

## Purpose

Add a `video-loop` demo type that plays a playlist of videos sequentially, loops forever, and is launched from a persistent button in the kiosk header rather than appearing as a card in the grid.

---

## Context and Use Case

The loop is the **kiosk's resting state**. It runs constantly at a conference booth as ambient/attract content. Staff interrupt it to show an attendee a specific card, then manually relaunch it when done.

```
Loop playing
  → staff hit Escape / click backdrop
    → loop closes, grid visible
      → staff click a card
        → card modal opens
          → staff close card
            → grid visible again
              → staff click loop button in header
                → loop starts from beginning
```

Key decisions:
- **Manual relaunch** — staff click the header button to restart; no auto-relaunch after card close
- **No play state retained** — loop always restarts from the first video on each open
- **Always muted** — no audio; booth ambient use
- **Idle timer suppressed** — `isPlaying = true` for the full session; the loop running is the resting state, not an abandonment signal
- **Staff-operated laptop** — Escape and backdrop click are sufficient to close; no extra close button needed
- **Expert-only configuration** — defined in YAML; not part of the no-code admin UI

---

## Schema

```yaml
id: event-loop
order: 0          # stored but ignored — card never appears in the grid
title: "Watch Our Story"
summary: "A highlights reel for the booth."

demo:
  type: video-loop
  videos:
    - content/media/clip1.mp4
    - content/media/clip2.mp4
    - content/media/clip3.mp4
```

- `videos`: required, non-empty ordered list of media file paths
- `title`: used as the header button label
- `order`, `enabled`: accepted by the schema but have no effect on grid rendering
- No `src` field — the existing single-video field is not used
- No `muted` field — always muted; no configuration needed

---

## Behaviour

### Renderer (`renderVideoLoop`)

- Creates a `<video>` element: `muted`, `autoplay`, `preload="auto"`, no controls
- Maintains a local `index` counter (starts at 0 on every open)
- On `ended`: increments index (mod list length), sets `video.src` to next file, calls `video.play()`
- On `error`: skips the unloadable file silently, advances to next
- Sets `state.isPlaying = true` and calls `IdleTimer.pause()` immediately — idle countdown never fires while loop is open
- `cleanupRenderers()` handles teardown: `video.pause(); video.src = ''` — no extra cleanup needed

### Grid filter

`buildGrid()` filters `video-loop` cards from the grid:

```javascript
const entries = FAQ.all().filter(e => Visibility.get(e) && e.demo?.type !== 'video-loop');
```

Loop cards never appear as grid cards regardless of their `enabled` field or Visibility overrides.

### Header button

Injected once at the end of `buildGrid()`. Scans `FAQ.all()` for the first `video-loop` entry. If found, appends a button to `.pf-v6-c-masthead__main`. If none exists, the header is unchanged — no dead UI for configurations without a loop.

Button is idempotent: removes any existing `#loop-launch-btn` before injecting, so `buildGrid()` can be called multiple times safely.

Clicking the button calls `openModal(loopEntry)` — uses the existing modal machinery unchanged. Logging, cleanup, and modal state all work as-is.

Only one loop button is shown. If multiple `video-loop` cards are defined, only the first is used.

### Idle timer

- While loop is open: suppressed (`state.isPlaying = true`, `IdleTimer.pause()`)
- After loop closes: `closeModal()` sets `state.isPlaying = false`, calls `IdleTimer.reset()` — normal idle behaviour resumes on the grid
- The idle countdown firing on an empty grid (no open modal) is a harmless no-op in the current code

### Close mechanics

No changes to `openModal()`, `closeModal()`, `cleanupRenderers()`, or `IdleTimer`. The existing Escape key and backdrop click are sufficient for a staff-operated laptop.

---

## Files Changed

| File | Change |
|---|---|
| `build/build-faqs.py` | Add `'video-loop'` to `VALID_TYPES`; add validator requiring `videos` to be a non-empty list of strings |
| `app/faqs/faqs.js.j2` | Add Jinja2 block to emit `videos: [...]` for `video-loop` type |
| `app/index.html` | `renderVideoLoop()` function; `video-loop` case in `renderDemo()`; grid filter in `buildGrid()`; header button injection; CSS for `#loop-launch-btn` |
| `content/faqs/_template.yaml` | Document the new type with a commented example |

## Unchanged

Everything else: `serve.py`, `Containerfile`, `demo-kiosk.container`, `start.sh`, `Makefile`, `download-libs.sh`, `branding.js.j2`, all existing demo types and their renderers.

---

## Implementation Commits

### Commit 1 — Schema and template
- `build/build-faqs.py`: `VALID_TYPES` + validator
- `app/faqs/faqs.js.j2`: `videos` array block
- Verify: `python3 build/build-faqs.py` with a test `video-loop` YAML produces correct `faqs.js`

### Commit 2 — Renderer, header button, grid filter, CSS
- `app/index.html`: all JS and CSS changes
- `content/faqs/_template.yaml`: documentation
- Verify: loop button appears in header, loop card absent from grid, loop plays and cycles, idle timer stays suppressed, close returns to grid

---

## Decisions Log

| Question | Decision |
|---|---|
| Auto-relaunch after card close? | No — manual; staff click the header button |
| Play state retained between opens? | No — always restarts from first video |
| Audio? | Always muted — no configuration |
| Idle timer while loop plays? | Suppressed — loop is the resting state |
| Idle timer after loop closes? | Normal — resumes on grid |
| Close button in modal? | Not needed — staff use Escape or backdrop click |
| Multiple loop cards? | One button shown — first `video-loop` entry used |
| Admin UI support? | Expert-only for now — YAML authoring only |
| Branch base? | `main` — independent of `feature/no-code-admin-ui` |
