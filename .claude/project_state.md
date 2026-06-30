# Project State

## Current Branch
`feature/kiosk-phase1-phase2` — consolidated from phase1 + phase2; 6 existing
commits from those branches plus new improvement commits. Not yet committed or pushed.

## What Was Done

### Branch consolidation
Created `feature/kiosk-phase1-phase2` from `feature/phase2-author-tool` tip
(commit `4184b1d`). This carries all 6 existing commits from both phases.

### PR #17 merged — GitHub Actions CI workflow
- `.github/workflows/ci.yml`: lint, build-kiosk (podman + upload test), build-author (Node 24)
- `test-upload.sh` moved to `tests/test-upload.sh`
- Containerfile heredoc scripts extracted to `build/apply-faststart.py` and `build/make-extras.py`

### PR #16 merged — Makefile build convention
- `devel` tag default for all build targets; `latest` reserved for stable releases
- Author tool targets: `build-author`, `push-author`, `clean-author`, `run-author`

### Improvements on consolidated branch (pending commit)

1. **yamlGen.js** — removed vestigial `order` field from `cardToYaml()`;
   function no longer takes `index` parameter

2. **zipHandler.js** — updated `cardToYaml(card, index)` → `cardToYaml(card)`;
   removed unused `index` parameter from forEach; added `kiosk/bundle.yaml`
   emission (`bundle_type: full`, `schema_version: 2`)

3. **validation.js** — rewritten with spec-driven validation: `DEMO_TYPE_SPEC`
   map replaces per-type if/else chain; `FAMILY_VALUES` set added; image-text
   caption validation added; all rules derived from `bundle-spec.yaml`

4. **CardEditModal.jsx** — added sync comment on `FAMILY_VALUES` noting
   `bundle-spec.yaml` as source of truth

5. **build-faqs.py** — added `--lenient` flag: skips invalid cards instead of
   aborting, warns on stderr, exits 0 so runtime uploads succeed with partial
   content

6. **serve.py** — `_rebuild()` now passes `--lenient` to `build-faqs.py`

7. **spec.md** — consolidated from spec.md + spec-phase2-author.md into single
   spec reflecting combined feature; spec-phase2-author.md removed

## What's Next

1. **Commit changes** — 4 commits per plan:
   - Drop vestigial order field and emit bundle manifest (yamlGen + zipHandler)
   - Add spec-complete validation to author tool (validation.js + CardEditModal)
   - Accept partial content in runtime rebuild (build-faqs.py + serve.py)
   - Consolidate specs for combined feature (spec files + project_state)
2. **Test** — build author tool, verify export/import round-trip; build container,
   verify lenient upload behavior
3. **PR** — open PR from `feature/kiosk-phase1-phase2` to `main`
4. **After merge** — delete `feature/phase1-categories-admin` and
   `feature/phase2-author-tool` (local + remote)
5. **After merge** — push `devel` images to quay.io
