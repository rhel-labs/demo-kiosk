# Spec: Kiosk Feature Bundle Phase 1 — Categories, Spotlight, Admin Restructure, Display Controls, Footer Fix

## What prompted this

Four features requested after Summit 2026 prep. They share the card metadata schema.
Network log push (a fifth feature) is excluded — needs more spec work.

**This spec covers Phase 1: kiosk-side changes only.** Phase 2 (authoring tool:
card editor UX, bundle type export, `content/index.yaml` generation with categories
and spotlight) follows once Phase 1 is stable and merged.

---

## Schema changes

### Card order refactor

The `order` integer field is removed from individual card YAML files. Card sequence is
defined in `content/index.yaml` alongside the card YAMLs:

```yaml
schema_version: 2
card_order: [intro, security-demo, admin-tour, networking-101]
categories:
  - name: Admin
    cards: [admin-tour, networking-101]
  - name: Security
    cards: [security-demo]
```

- `card_order` — ordered list of card IDs defining the global grid sequence
- `categories` — ordered list of category definitions; each category names its member cards;
  list order defines default section order on the kiosk
- Cards not in `card_order` are excluded from the grid (treated as disabled)
- Cards in `card_order` but not in any category appear in an "Other" section at the end

**Bootstrap:** if `content/index.yaml` does not exist, `serve.py` generates it on startup
from existing card YAMLs sorted by their `order` field. The `order` field in card YAMLs
is ignored once `content/index.yaml` exists.

### New card fields

One optional field added to card YAML (backwards-compatible; missing = `false`):

```yaml
spotlight: true       # boolean; defaults to false
```

Category membership is defined entirely in `content/index.yaml`, not on individual cards.

### Bundle manifest

A `kiosk/bundle.yaml` manifest is added inside uploaded zip files:

```yaml
bundle_type: content   # branding | content | full
schema_version: 2
```

Zips without a manifest are treated as full bundles (backwards compatibility).

### branding.yaml

No changes to branding.yaml. Branding is logos, colors, event name, tagline only.

---

## Features

### 1. Split bundle imports

**Bundle types and what they touch:**
- **Branding bundle** — replaces `content/branding/` only; `faqs/`, `media/`, and
  `content/index.yaml` untouched
- **Content bundle** — touches `content/faqs/`, `content/media/`, and
  `content/index.yaml` only; `content/branding/` untouched
- **Full bundle** — touches all of the above

**Import behavior:**
- **Add mode (default in setup.html):** cards merged additively; conflicting IDs
  auto-renamed with a numeric suffix (`my-demo` → `my-demo-2`); renamed cards appended
  to end of `card_order`; media merged additively; branding replaced when present in bundle;
  `content/index.yaml` merged — incoming `card_order` entries appended after existing cards
- **Overwrite mode (checkbox in setup.html):** replaces all existing cards with only those
  in the bundle; branding replaced when present; media merged additively (overwrite does
  not delete existing media)
- **Main kiosk upload card:** always overwrite mode — intended for initial event setup
  to replace placeholder instruction cards with real content. To add without replacing,
  use `/setup`.

**Upload summary** shown after import: cards added, cards renamed (old→new ID mapping),
media files added.

**Files affected:** `app/serve.py`, `app/setup.html`, `app/index.html`

---

### 2. Content categories and spotlight row

**Kiosk front-end:**
- Cards are physically grouped into named sections on the main grid, each with a
  red-underlined section header (category name in uppercase)
- Section order matches `content/index.yaml` categories list order, overridable via
  display.html
- Cards not in any category appear in an "Other" section at the end of the grid
- If no categories are defined, cards render as a flat grid (no headers)
- Spotlight row appears above the category sections when at least one card has
  `spotlight` = true (YAML default) or is featured via display.html override;
  spotlighted cards appear in BOTH the spotlight row and their normal category section
- Spotlight row is labelled "Featured"

**Display page overrides (see feature 3):**
- Featured status: per-card checkbox in display.html overrides YAML `spotlight` value
- Category visibility: per-category toggle hides an entire section from the kiosk;
  hidden category cards are suppressed entirely (do not fall through to "Other")
- Category order: drag-to-reorder in display.html overrides `content/index.yaml` order
- Per-card category assignment: checkbox table in display.html can move cards between
  categories; unchecking all categories for a card moves it to "Other"

**Files affected:** `app/faqs/faqs.js.j2`, `app/index.html`, `build/build-faqs.py`,
`content/index.yaml`

---

### 3. Admin page restructure — three pages by function

`/manage` removed (returns 404). Three purpose-named pages replace the old two-page
structure. Nav on all admin pages: **Kiosk · Setup · Display · Stats**
(Kiosk always first, no back-arrow labelling).

**Setup (`/setup`, `setup.html`, renamed from `manage.html`):**
- Bundle upload with overwrite checkbox and upload summary
- Card CRUD (add, edit, delete individual cards)
- Branding editor (logo, event name, tagline, colors)
- Category assignment is NOT part of card CRUD — managed in display.html

**Display (`/display`, `display.html`, new):**
- Drag-to-reorder global card sequence
- Card visibility toggle (show/hide per card)
- Featured toggle (per card — overrides YAML `spotlight` field)
- Category assignment — checkbox table; cards × categories; empty = "Other"
- Category sections — drag-to-reorder section order; show/hide per category
- Reset controls for each of the above; resets restore server-side defaults

**Stats (`/stats`, `stats.html`, new — extracted from `index.html #admin`):**
- Views dashboard: total views, avg time open, most viewed, breakdown by type
- View log table: timestamp, card title, demo type, time open
- Download CSV, clear logs
- No visibility or order controls (those live in display.html)

**Files affected:** `app/manage.html` → `app/setup.html`, `app/index.html`,
`app/display.html` (new), `app/stats.html` (new), `app/serve.py`

---

### 4. Remove containerfile page

`containerfile.html` and `generate-containerfile-page.py` removed.
Nav link in `index.html` removed. This page is a container creator artifact,
not relevant at events.

**Files affected:** `app/containerfile.html` (deleted),
`build/generate-containerfile-page.py` (deleted), `app/index.html`

---

### 5. Footer links tap target fix

Increased font size and tap target area for footer links on all kiosk pages.
Links readable at kiosk viewing distance and reliably tappable on touchscreen.

**Files affected:** `app/index.html`, `app/setup.html`, `app/stats.html`,
`app/display.html`

---

## localStorage key map

| Key | Written by | Read by | Purpose |
|-----|------------|---------|---------|
| `faq_view_log` | index.html | stats.html | Per-card view events |
| `faq_visibility` | display.html | index.html | Per-card show/hide override |
| `faq_order` | display.html | index.html | Card sequence override |
| `faq_spotlight` | display.html | index.html | Per-card featured override |
| `faq_categories` | display.html | index.html | Per-card category assignment override |
| `faq_category_order` | display.html | index.html | Category section order override |
| `faq_category_visible` | display.html | index.html | Per-category show/hide override |

All overrides are browser-local. Resetting in display.html removes the key and
restores server-side defaults from `content/faqs.js` / `content/index.yaml`.

---

## What this explicitly does NOT do

- No authoring tool changes (Phase 2)
- No central infrastructure — categories and card order are bundle-local
- No server-side filtering — all category and visibility logic is client-side
- No per-kiosk changes written back to the server (localStorage is sufficient
  for ephemeral kiosk lifecycle)
- No migration tooling for existing card YAMLs — `order` field is ignored once
  `content/index.yaml` exists; bootstrap handles the transition
- No required minimum categories per card
- No media deletion in overwrite mode

---

## How success is verified (as built)

1. **Bootstrap** — deploy with existing cards (no `content/index.yaml`); kiosk starts,
   generates `content/index.yaml` from existing card `order` fields, grid renders
2. **Branding bundle upload** — upload branding-only zip; only branding changes
3. **Content bundle add mode (setup.html)** — upload with one new card and one
   conflicting ID; new card appears, conflicting card renamed, upload summary lists rename
4. **Content bundle overwrite mode (setup.html)** — check overwrite, upload; only bundle
   cards remain; existing media files still present
5. **Main kiosk upload** — upload via the upload card on the main page; existing cards
   replaced; upload card notes "Replaces all existing content"; modal shows link to /setup
   for additive uploads
6. **Category sections** — category section headers appear, cards grouped under them;
   uncategorized cards appear in "Other"; if no categories defined, flat grid renders
7. **Spotlight row** — card with `spotlight: true` in YAML appears in "Featured" row
   above sections AND in its normal category section
8. **Display page — featured** — checking Featured in display.html causes card to appear
   in spotlight row; unchecking removes it; "Reset featured" restores YAML defaults
9. **Display page — category assignment** — moving a card between categories via checkbox
   is reflected on main kiosk on next load; unchecking all moves card to "Other";
   changes persist across display.html page reloads
10. **Display page — category section visibility** — hiding a category removes its section
    from the kiosk; hidden category cards do not appear in "Other"
11. **Display page — category order** — dragging category reorders sections on main kiosk
12. **Three-page structure** — Setup, Display, Stats reachable via nav from any admin page;
    `Kiosk` link always first in nav; `/manage` returns 404
13. **Stats** — no visibility/order controls present; only stats cards, log, CSV download
14. **Idle timer** — upload in progress suppresses idle countdown overlay
15. **Footer** — links readable and tappable on touchscreen at kiosk viewing distance
