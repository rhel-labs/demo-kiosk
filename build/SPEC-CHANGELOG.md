# Bundle Spec Changelog

## 2.0.0 (breaking)

- Removed `order` field from card YAML — card sequence is now defined in `content/index.yaml`
- Added `spotlight` optional boolean field to card YAML
- Added `content/index.yaml` — defines `card_order` list and optional `categories` definitions
- Added `kiosk/bundle.yaml` bundle manifest — declares `bundle_type` (branding, content, full) and `schema_version`
- Bundles without a manifest are treated as full bundles for backwards compatibility
- `summary` is now explicitly optional for `video-loop` cards (matches author-side behavior)
