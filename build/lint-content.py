#!/usr/bin/env python3
# ================================================================
# lint-content.py — YAML content linter for demo-kiosk
# ================================================================
# Validates all author-owned YAML files in content/ for:
#   1. General YAML correctness (via yamllint)
#   2. FAQ schema correctness (required fields, types, formats)
#   3. Branding schema correctness (nested fields, colors, layout)
#
# Runs in the Containerfile build stage to catch content errors
# before the image is finalised.
#
# USAGE:
#   python3 build/lint-content.py
#   python3 build/lint-content.py --content-dir /mnt/content
#
# From a running container with a mounted content directory:
#   podman run --rm \
#     -v ./content:/mnt/content:ro \
#     demo-kiosk:latest \
#     python3 /srv/faq/lint-content.py --content-dir /mnt/content
#
# REQUIREMENTS:
#   pip3 install -r build/requirements.txt
#   (pyyaml, yamllint)
# ================================================================

import sys
import re
import argparse
from pathlib import Path
from urllib.parse import urlparse

try:
    import yaml
except ImportError:
    print("ERROR: PyYAML is not installed. Run: pip3 install pyyaml", file=sys.stderr)
    sys.exit(1)

try:
    import yamllint
    import yamllint.config
    import yamllint.linter
except ImportError:
    print("ERROR: yamllint is not installed. Run: pip3 install yamllint", file=sys.stderr)
    sys.exit(1)

# ── Colour helpers (matches build-faqs.py style) ─────────────────
GREEN  = "\033[0;32m"
YELLOW = "\033[1;33m"
RED    = "\033[0;31m"
RESET  = "\033[0m"

def ok(msg):   print(f"{GREEN}  ✓{RESET} {msg}")
def warn(msg): print(f"{YELLOW}  !{RESET} {msg}")
def err(msg):  print(f"{RED}  ✗{RESET} {msg}")


# ── Spec loading ──────────────────────────────────────────────────

def load_spec():
    """Load build/bundle-spec.yaml relative to this script's location."""
    spec_path = Path(__file__).parent / "bundle-spec.yaml"
    try:
        return yaml.safe_load(spec_path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as exc:
        print(f"ERROR: cannot load bundle-spec.yaml — {exc}", file=sys.stderr)
        sys.exit(1)

_SPEC = load_spec()

# ── Schema constants derived from spec ───────────────────────────
VALID_TYPES           = set(_SPEC["card"]["demo_types"].keys())
REQUIRED_FAQ_FIELDS   = set(_SPEC["card"]["required_fields"])
SUMMARY_OPTIONAL_FOR  = set(_SPEC["card"].get("summary_optional_for_types", []))
ID_PATTERN            = _SPEC["card"]["id_pattern"]
REQUIRED_COLOR_FIELDS = set(_SPEC["branding"]["colors"]["required"])
REQUIRED_LAYOUT_FIELDS = set(_SPEC["branding"]["layout"]["required"])

# ── Arcade share URL patterns ─────────────────────────────────────
ARCADE_SHARE_RE = re.compile(
    r'^https://(?:interact\.redhat\.com|app\.arcade\.software)/share/([A-Za-z0-9_-]+)'
)
ARCADE_DEMO_RE = re.compile(
    r'^https://demo\.arcade\.software/([A-Za-z0-9_-]+)'
)

# ── ID format: compiled from spec pattern ────────────────────────
ID_RE = re.compile(ID_PATTERN)

# ── Hex color: #rgb or #rrggbb ────────────────────────────────────
HEX_COLOR_RE = re.compile(r'^#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?$')

# ── yamllint configuration ────────────────────────────────────────
# Line length 120 to accommodate long URLs and long_description blocks.
# truthy check disabled — YAML booleans (true/false) are unambiguous here.
YAMLLINT_CONFIG = yamllint.config.YamlLintConfig("""
extends: default
rules:
  line-length:
    max: 120
    level: warning
  truthy:
    allowed-values: ['true', 'false']
    check-keys: false
  comments:
    min-spaces-from-content: 1
  document-start: disable
""")


# ── Helpers ───────────────────────────────────────────────────────

def is_valid_url(value):
    """Return True if value is a plausible http/https URL or a hash anchor (no network call)."""
    s = str(value)
    if s.startswith('#'):
        return bool(s[1:])  # '#admin' is valid; bare '#' is not
    try:
        p = urlparse(s)
        return p.scheme in ("http", "https") and bool(p.netloc)
    except Exception:
        return False


def is_valid_hex_color(value):
    """Return True if value is a valid CSS hex color (#rgb or #rrggbb)."""
    return bool(HEX_COLOR_RE.match(str(value)))


def resolve_path(raw, content_dir):
    """
    Resolve a path written by an author relative to the project root
    (e.g. 'content/media/foo.mp4') against the actual content_dir on disk.

    Authors always write paths starting with 'content/' because the browser
    loads them relative to the web root.  When running with --content-dir the
    'content/' prefix maps to that directory.
    """
    raw = str(raw)
    # Strip leading 'content/' prefix so we resolve inside content_dir
    if raw.startswith("content/"):
        relative = raw[len("content/"):]
        return content_dir / relative
    # Fallback: treat as relative to content_dir
    return content_dir / raw


# ── yamllint pass ─────────────────────────────────────────────────

def lint_yaml_style(yaml_files):
    """
    Run yamllint on each file.  Returns a list of error strings.
    Warnings are printed but do not cause a failure.
    """
    errors = []
    for path in yaml_files:
        try:
            text = path.read_text(encoding="utf-8")
        except OSError as exc:
            errors.append(f"{path.name}: cannot read file — {exc}")
            continue

        problems = list(yamllint.linter.run(text, YAMLLINT_CONFIG))
        for p in problems:
            if p.level == "error":
                errors.append(f"{path.name}:{p.line}:{p.column}  {p.message}")
            else:
                warn(f"{path.name}:{p.line}:{p.column}  {p.message}")

    return errors


# ── FAQ schema validation ─────────────────────────────────────────

def validate_faq_entry(path, data, seen_ids, content_dir):
    """
    Validate a single FAQ YAML dict.  Returns a list of error strings.
    Does NOT make network calls (arcade URL validated by regex only).
    """
    errors = []

    if not isinstance(data, dict):
        return [f"{path.name}: top-level value must be a YAML mapping"]

    # Determine demo type early so summary requirement can be adjusted
    demo_type = ""
    if isinstance(data.get("demo"), dict):
        demo_type = data["demo"].get("type", "")

    # Required fields — summary optional for certain demo types
    required = set(REQUIRED_FAQ_FIELDS)
    if demo_type in SUMMARY_OPTIONAL_FOR:
        required.discard("summary")
    missing = required - data.keys()
    if missing:
        errors.append(f"missing required field(s): {', '.join(sorted(missing))}")

    # id: must be a string, unique, and match format
    if "id" in data:
        fid = data["id"]
        if not isinstance(fid, str):
            errors.append(f"'id' must be a string, got {type(fid).__name__}")
        else:
            if not ID_RE.match(fid):
                errors.append(
                    f"'id' must be lowercase alphanumeric with hyphens "
                    f"and start with a letter or digit, got {fid!r}"
                )
            if fid in seen_ids:
                errors.append(
                    f"duplicate id {fid!r} (also used in {seen_ids[fid]})"
                )
            else:
                seen_ids[fid] = path.name

    # enabled: must be bool if present
    if "enabled" in data:
        if not isinstance(data["enabled"], bool):
            errors.append(
                f"'enabled' must be true or false, got {type(data['enabled']).__name__}"
            )

    # spotlight: must be bool if present
    if "spotlight" in data:
        if not isinstance(data["spotlight"], bool):
            errors.append(
                f"'spotlight' must be true or false, got {type(data['spotlight']).__name__}"
            )

    # title / summary: must be non-empty strings
    for field in ("title", "summary"):
        if field in data:
            if not isinstance(data[field], str) or not data[field].strip():
                errors.append(f"'{field}' must be a non-empty string")

    # demo block
    if "demo" in data:
        demo = data["demo"]
        if not isinstance(demo, dict):
            errors.append("'demo' must be a YAML mapping")
        else:
            demo_errors = _validate_demo(demo, path, content_dir)
            errors.extend(demo_errors)

    return [f"{path.name}: {e}" for e in errors]


def _validate_demo(demo, path, content_dir):
    errors = []

    if "type" not in demo:
        return ["'demo' is missing required field 'type'"]

    dtype = demo["type"]
    if dtype not in VALID_TYPES:
        return [
            f"unknown demo type {dtype!r}. "
            f"Valid types: {', '.join(sorted(VALID_TYPES))}"
        ]

    type_spec = _SPEC["card"]["demo_types"][dtype]

    # Required fields for this demo type
    for field in type_spec.get("required", []):
        if field not in demo:
            errors.append(f"demo type {dtype!r} requires a '{field}' field")

    # Media file existence checks
    for field in type_spec.get("media_fields", []):
        if field in demo:
            p = resolve_path(demo[field], content_dir)
            if not p.exists():
                errors.append(f"demo '{field}' file not found: {demo[field]!r}")

    # URL format checks
    for field in type_spec.get("url_fields", []):
        if field in demo and not is_valid_url(demo[field]):
            errors.append(
                f"demo '{field}' does not look like a valid http/https URL: {demo[field]!r}"
            )

    # Arcade URL pattern checks
    for field in type_spec.get("arcade_url_fields", []):
        if field in demo:
            url = demo[field]
            if not (ARCADE_SHARE_RE.match(url) or ARCADE_DEMO_RE.match(url)):
                errors.append(
                    f"demo '{field}' must be an Arcade share link "
                    f"(e.g. https://interact.redhat.com/share/<ID>), got: {url!r}"
                )

    # Media list fields (video-loop videos)
    for field in type_spec.get("media_list_fields", []):
        if field in demo:
            items = demo[field]
            if not isinstance(items, list) or not items:
                errors.append(f"demo '{field}' must be a non-empty list")
            else:
                for entry in items:
                    p = resolve_path(entry, content_dir)
                    if not p.exists():
                        errors.append(f"demo '{field}' file not found: {entry!r}")

    return errors


def lint_faq_schema(yaml_files, content_dir):
    """
    Validate all FAQ YAML files against the schema.
    Returns a list of error strings.
    """
    errors = []
    seen_ids = {}

    for path in yaml_files:
        try:
            text = path.read_text(encoding="utf-8")
            data = yaml.safe_load(text)
        except yaml.YAMLError as exc:
            errors.append(f"{path.name}: YAML parse error — {exc}")
            continue
        except OSError as exc:
            errors.append(f"{path.name}: cannot read file — {exc}")
            continue

        file_errors = validate_faq_entry(path, data, seen_ids, content_dir)
        errors.extend(file_errors)

    return errors


# ── Branding schema validation ────────────────────────────────────

def lint_branding_schema(branding_file, content_dir):
    """
    Deep-validate content/branding/branding.yaml.
    Returns a list of error strings.
    """
    errors = []

    if not branding_file.exists():
        # Not an error — build-faqs.py handles the missing-file case with a warning
        warn(f"Branding file not found: {branding_file} — skipping branding lint")
        return []

    try:
        text = branding_file.read_text(encoding="utf-8")
        data = yaml.safe_load(text)
    except yaml.YAMLError as exc:
        return [f"{branding_file.name}: YAML parse error — {exc}"]
    except OSError as exc:
        return [f"{branding_file.name}: cannot read file — {exc}"]

    if not isinstance(data, dict):
        return [f"{branding_file.name}: top-level value must be a YAML mapping"]

    branding_spec = _SPEC["branding"]

    # Top-level sections
    required_sections = set(branding_spec["required_sections"])
    missing = required_sections - data.keys()
    if missing:
        errors.append(
            f"{branding_file.name}: missing top-level section(s): "
            f"{', '.join(sorted(missing))}"
        )
        # Can't validate subsections if parent keys are missing
        if errors:
            return errors

    # event section
    event = data.get("event", {})
    if not isinstance(event, dict):
        errors.append(f"{branding_file.name}: 'event' must be a mapping")
    else:
        header_val = event.get("header")
        if not header_val or not str(header_val).strip():
            errors.append(
                f"{branding_file.name}: 'event.header' is required and must be non-empty"
            )

    # logos section
    logos = data.get("logos", {})
    if not isinstance(logos, dict):
        errors.append(f"{branding_file.name}: 'logos' must be a mapping")
    else:
        for logo_key in ("primary", "secondary"):
            logo = logos.get(logo_key)
            if not isinstance(logo, dict):
                errors.append(
                    f"{branding_file.name}: 'logos.{logo_key}' must be a mapping"
                )
                continue
            logo_file = logo.get("file")
            if not logo_file:
                errors.append(
                    f"{branding_file.name}: 'logos.{logo_key}.file' is required"
                )
            else:
                p = resolve_path(logo_file, content_dir)
                if not p.exists():
                    errors.append(
                        f"{branding_file.name}: 'logos.{logo_key}.file' not found: "
                        f"{logo_file!r}"
                    )
            if not logo.get("alt_text"):
                errors.append(
                    f"{branding_file.name}: 'logos.{logo_key}.alt_text' is required"
                )

    # colors section
    colors = data.get("colors", {})
    if not isinstance(colors, dict):
        errors.append(f"{branding_file.name}: 'colors' must be a mapping")
    else:
        missing_colors = REQUIRED_COLOR_FIELDS - colors.keys()
        if missing_colors:
            errors.append(
                f"{branding_file.name}: 'colors' missing field(s): "
                f"{', '.join(sorted(missing_colors))}"
            )
        for field in REQUIRED_COLOR_FIELDS & colors.keys():
            val = colors[field]
            if not is_valid_hex_color(val):
                errors.append(
                    f"{branding_file.name}: 'colors.{field}' must be a hex color "
                    f"(e.g. '#ee0000' or '#f2f'), got {val!r}"
                )

    # layout section
    layout = data.get("layout", {})
    if not isinstance(layout, dict):
        errors.append(f"{branding_file.name}: 'layout' must be a mapping")
    else:
        missing_layout = REQUIRED_LAYOUT_FIELDS - layout.keys()
        if missing_layout:
            errors.append(
                f"{branding_file.name}: 'layout' missing field(s): "
                f"{', '.join(sorted(missing_layout))}"
            )
        for field in REQUIRED_LAYOUT_FIELDS & layout.keys():
            val = layout[field]
            if not isinstance(val, int) or val <= 0:
                errors.append(
                    f"{branding_file.name}: 'layout.{field}' must be a positive integer, "
                    f"got {val!r}"
                )

    # footer section
    footer = data.get("footer", {})
    if not isinstance(footer, dict):
        errors.append(f"{branding_file.name}: 'footer' must be a mapping")
    else:
        if not footer.get("copyright"):
            errors.append(
                f"{branding_file.name}: 'footer.copyright' is required and must be non-empty"
            )

    return errors


# ── Main ──────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Lint YAML content files for demo-kiosk."
    )
    parser.add_argument(
        "--content-dir",
        metavar="PATH",
        help="Path to the content/ directory (default: content/ relative to project root)",
    )
    args = parser.parse_args()

    # Resolve content directory
    if args.content_dir:
        content_dir = Path(args.content_dir).resolve()
    else:
        script_dir  = Path(__file__).parent.resolve()   # build/
        content_dir = script_dir.parent / "content"     # project root / content

    faqs_dir      = content_dir / "faqs"
    branding_file = content_dir / "branding" / "branding.yaml"

    if not content_dir.is_dir():
        err(f"Content directory not found: {content_dir}")
        sys.exit(1)

    if not faqs_dir.is_dir():
        err(f"FAQs directory not found: {faqs_dir}")
        sys.exit(1)

    yaml_files = sorted(faqs_dir.glob("*.yaml"))
    yaml_files = [f for f in yaml_files if not f.stem.startswith("_")]

    if not yaml_files:
        err(f"No .yaml files found in {faqs_dir}/")
        err("Create at least one FAQ entry. See content/faqs/_template.yaml for the format.")
        sys.exit(1)

    all_errors = []
    all_files = yaml_files + ([branding_file] if branding_file.exists() else [])
    all_errors.extend(lint_yaml_style(all_files))
    all_errors.extend(lint_faq_schema(yaml_files, content_dir))
    all_errors.extend(lint_branding_schema(branding_file, content_dir))

    if all_errors:
        for e in all_errors:
            err(e)
        sys.exit(1)
    else:
        ok("All content is valid.")


if __name__ == "__main__":
    main()
