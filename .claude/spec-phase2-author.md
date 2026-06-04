# Spec: Author Tool Phase 2 — Spotlight, Family, Categories, and Schema v2 Bundles

## Who this is for

The **author** — someone building or updating a demo bundle for an event kiosk.
They use the authoring tool to create cards, set metadata, and export a zip that
gets uploaded to the kiosk. They may also load an existing bundle to make changes
before re-exporting.

---

## What the author can now do

### Mark a card as featured (spotlight)

When editing a card, the author can check a "Featured" checkbox. A featured card
appears in the kiosk's "Featured" spotlight row above the main card grid, in addition
to its normal position in the grid. Unchecked means the card only appears in the grid.

This is optional — most cards will not be featured. The default is unchecked.

### Tag a card with a product family

When editing a card, the author can select a product family from a dropdown. The
selected family appears as a label badge at the bottom of the card tile on the kiosk.
If no family is selected, the card shows no badge and no empty space.

Allowed values: RHEL, RHEL AI, OpenShift, OpenShift AI, OpenShift Virt, AAP, RHACS,
Satellite, Lightspeed, Developer Hub, Quay, Red Hat AI, Edge.

This is optional — not every card needs a family tag.

### Assign cards to categories

The editor has a Categories tab (alongside Cards and Branding). From this tab the
author can:

- **Add a category** — type a name and confirm; the category appears as a row
- **Delete a category** — removes the category; cards that were in it are unassigned
  (they will appear in "Other" on the kiosk unless assigned elsewhere)
- **Assign cards to a category** — each category row shows a checklist of all cards;
  checking a card assigns it to that category; a card can belong to multiple categories
- **Reorder categories** — drag-to-reorder the category rows; order here determines
  the default section order on the kiosk

**Default categories:** Innovate, Protect, Simplify, Trust — in that order. These
four are pre-populated wherever categories would otherwise be empty: on fresh start,
and when importing a bundle that has no categories defined (old bundles, or bundles
exported with an empty categories list). The author can rename, delete, or reorder
them like any other category.

Cards not assigned to any category appear in an "Other" section at the bottom of
the kiosk grid. If all categories are deleted, cards render as a flat grid.

### Export a bundle the kiosk understands

When the author clicks "Download Bundle," the exported zip is in the format the
Phase 1 kiosk expects. The card sequence matches the order cards appear in the
editor. Category definitions and assignments from the Categories tab are included.
The kiosk will load cards in that order and grouped into those sections.

### Load and edit an existing bundle

When the author imports a bundle zip — whether it was exported from this tool or
uploaded to and downloaded from a kiosk — the cards load in the correct sequence,
with spotlight and family already filled in from the bundle. The author can then
make changes and re-export.

Older bundles (created before Phase 1) also load correctly. Because they carry
no category data, the default categories (Innovate, Protect, Simplify, Trust)
are applied — cards start unassigned and the author assigns them before re-exporting.

---

## Bundle interface contract

The kiosk (`serve.py`) and the author tool share a zip format. This section is the
agreed contract between them. Neither side can be verified without the other.

### Zip structure

The kiosk walks the zip to find a directory named `kiosk/` at any nesting depth.
Everything the kiosk reads is relative to that `kiosk/` root:

```
kiosk/
  bundle.yaml              ← bundle type manifest
  index.yaml               ← card order and categories
  faqs/
    {card-id}.yaml         ← one file per card
  media/
    {filename}             ← media files referenced by card YAMLs
  branding/
    branding.yaml
    {logo files}
```

`index.yaml` sits at the `kiosk/` root. The kiosk moves it to `content/index.yaml`
on the server. It is explicitly excluded from the generic file-copy loop so that
add-mode uploads do not overwrite the server's existing `index.yaml` — only
overwrite-mode uploads replace it from the bundle.

### `kiosk/bundle.yaml`

```yaml
bundle_type: content
schema_version: 2
```

`bundle_type` controls which content areas the kiosk touches on upload:
`content` — touches faqs, media, and index.yaml only; leaves branding alone.
If `bundle.yaml` is absent or unreadable, the kiosk defaults to `full`.

### `kiosk/index.yaml`

```yaml
schema_version: 2
card_order: [id-one, id-two, id-three]
categories:
  - name: Innovate
    cards: [id-one, id-three]
  - name: Protect
    cards: [id-two]
```

`card_order` is an ordered list of card IDs defining grid sequence.
`categories` reflects the author's category definitions and card assignments.
An empty list is valid — the kiosk renders a flat grid when no categories are defined.
The kiosk's Display admin page can override category assignments after upload.

### `kiosk/faqs/{id}.yaml` — card fields

| Field | Required | Notes |
|-------|----------|-------|
| `id` | yes | slug; must match filename |
| `title` | yes | |
| `summary` | yes | |
| `enabled` | yes | boolean |
| `demo` | yes | demo block (type, src/url/etc.) |
| `spotlight` | no | `true` when featured; omit when false |
| `family` | no | one of the 13 allowed values; omit when not set |
| `order` | **removed** | no longer emitted by the author tool; kiosk ignores it when `index.yaml` is present; kiosk bootstrap reads it only for old bundles with no `index.yaml` |

### Who owns what

| Artifact | Written by | Read by |
|----------|-----------|---------|
| `bundle.yaml` | author tool | kiosk upload handler |
| `index.yaml` — `card_order` | author tool | kiosk serve.py |
| `index.yaml` — `categories` (initial) | author tool | kiosk serve.py |
| `index.yaml` — `categories` (override) | kiosk display.html | kiosk serve.py |
| card YAMLs (`spotlight`, `family`) | author tool | kiosk faqs.js |
| card order in editor | author tool UI | author tool export |

---

## What it does NOT do

- No category reordering of cards within a category — card sequence is global
  (set in the Cards tab via drag-to-reorder); categories group cards, not sequence them
- No validation that a family value is "correct" — the kiosk build will catch
  invalid values; the tool just passes through whatever the author selects
- No branding changes in this phase

---

## How the author knows it worked

1. **Featured checkbox is visible and saves** — when adding or editing a card, a
   "Featured" checkbox is present; checking it and saving, then reopening the card,
   shows it still checked
2. **Family dropdown is visible and saves** — a "Product family" dropdown is present;
   selecting a value and saving, then reopening, shows the same value selected; saving
   with no selection leaves it blank
3. **Categories tab exists** — a "Categories" tab appears in the editor alongside
   Cards and Branding
4. **Category add and delete** — typing a name and adding creates a new category row;
   clicking delete removes it
5. **Card assignment via checklist** — each category row shows all cards as checkboxes;
   checking a card assigns it; unchecking removes it; a card can be checked in multiple
   categories simultaneously
6. **Category reorder** — dragging category rows changes their order; the new order
   is preserved in the editor
7. **Exported bundle contains categories** — open the exported zip; `kiosk/index.yaml`
   shows the correct category names and their assigned card IDs in the defined order
8. **Round-trip import preserves everything** — export a bundle, import the same zip
   back; spotlight, family, categories, and card assignments all survive the round-trip
9. **Exported bundle works on a Phase 1 kiosk** — uploading the zip: cards appear in
   editor order; category sections appear with correct cards; Featured cards appear in
   the Featured row; family badges show on tiles
10. **Old bundles still import** — importing a pre-Phase-1 bundle loads cards without
    errors and shows the Categories tab with the four default categories, no cards
    assigned
