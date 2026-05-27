#!/usr/bin/env python3
# ================================================================
# build-faqs.py — FAQ YAML → content/faqs.js
# ================================================================
# Reads all content/faqs/*.yaml files (skipping those starting
# with _), validates them, orders by content/index.yaml card_order,
# and renders content/faqs.js via the Jinja2 template
# app/faqs/faqs.js.j2.
#
# Directory layout:
#   content/faqs/*.yaml   — author-owned FAQ entries  (source)
#   content/media/        — author-owned media files
#   content/faqs.js       — generated output          (do not edit)
#   app/faqs/faqs.js.j2   — Jinja2 template           (app machinery)
#
# USAGE:
#   python3 build/build-faqs.py
#
# Run this before starting the local dev server, or let the
# Containerfile builder stage run it automatically.
#
# REQUIREMENTS (build-time only):
#   pip3 install pyyaml jinja2
# ================================================================

import sys
import os
import re
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import URLError
from urllib.parse import quote as urlquote

try:
    import yaml
except ImportError:
    print("ERROR: PyYAML is not installed. Run: pip3 install pyyaml", file=sys.stderr)
    sys.exit(1)

try:
    from jinja2 import Environment, FileSystemLoader, StrictUndefined
except ImportError:
    print("ERROR: Jinja2 is not installed. Run: pip3 install jinja2", file=sys.stderr)
    sys.exit(1)

# ── Paths ─────────────────────────────────────────────────────────
SCRIPT_DIR        = Path(__file__).parent.resolve()   # build/
PROJECT_ROOT      = SCRIPT_DIR.parent
CONTENT_DIR       = PROJECT_ROOT / "content"
FAQS_DIR          = CONTENT_DIR / "faqs"              # author YAML lives here
BRANDING_FILE     = CONTENT_DIR / "branding" / "branding.yaml"  # branding config
TEMPLATE          = PROJECT_ROOT / "app" / "faqs" / "faqs.js.j2"  # app machinery
BRANDING_TEMPLATE = PROJECT_ROOT / "app" / "faqs" / "branding.js.j2"
OUTPUT            = CONTENT_DIR / "faqs.js"           # generated output
BRANDING_OUTPUT   = CONTENT_DIR / "branding.js"

def encode_media_path(raw):
    """Percent-encode a content/media/ path for use as a browser URL src."""
    return urlquote(raw, safe='./:@!$&\'()*+,;=')

# ── Spec loading ──────────────────────────────────────────────────

def load_spec():
    """Load build/bundle-spec.yaml relative to this script's location."""
    spec_path = SCRIPT_DIR / "bundle-spec.yaml"
    try:
        return yaml.safe_load(spec_path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as exc:
        print(f"ERROR: cannot load bundle-spec.yaml — {exc}", file=sys.stderr)
        sys.exit(1)

_SPEC = load_spec()

# ── Schema constants derived from spec ───────────────────────────
VALID_TYPES    = set(_SPEC["card"]["demo_types"].keys())
REQUIRED_FIELDS = set(_SPEC["card"]["required_fields"])

# ── Colour helpers ────────────────────────────────────────────────
GREEN  = "\033[0;32m"
YELLOW = "\033[1;33m"
RED    = "\033[0;31m"
CYAN   = "\033[0;36m"
RESET  = "\033[0m"

def ok(msg):   print(f"{GREEN}  ✓{RESET} {msg}")
def info(msg): print(f"{CYAN}  →{RESET} {msg}")
def warn(msg): print(f"{YELLOW}  !{RESET} {msg}", file=sys.stderr)
def err(msg):  print(f"{RED}  ✗{RESET} {msg}", file=sys.stderr)

# ── content/index.yaml bootstrap and loader ──────────────────────

INDEX_FILE = CONTENT_DIR / "index.yaml"

def bootstrap_content_index():
    """Generate content/index.yaml from existing card order fields if absent."""
    if INDEX_FILE.exists():
        return

    yaml_files = sorted(FAQS_DIR.glob("*.yaml"))
    yaml_files = [f for f in yaml_files if not f.stem.startswith("_")]

    cards = []
    for path in yaml_files:
        try:
            data = yaml.safe_load(path.read_text(encoding="utf-8"))
            if isinstance(data, dict) and "id" in data:
                order = data.get("order", 0)
                cards.append((order, path.stem, data["id"]))
        except Exception:
            continue

    cards.sort(key=lambda x: (x[0], x[1]))
    card_order = [c[2] for c in cards]

    index = {"schema_version": 2, "card_order": card_order, "categories": []}
    INDEX_FILE.write_text(yaml.dump(index, default_flow_style=False), encoding="utf-8")
    info(f"Bootstrapped content/index.yaml with {len(card_order)} card(s)")


def load_content_index():
    """Load card sequence and categories from content/index.yaml, bootstrapping if absent."""
    bootstrap_content_index()
    try:
        data = yaml.safe_load(INDEX_FILE.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return [], []
        return data.get("card_order", []), data.get("categories", [])
    except Exception:
        return [], []


# ── Arcade share URL resolver ─────────────────────────────────────
# Accepted share URL patterns:
#   https://interact.redhat.com/share/<ID>
#   https://app.arcade.software/share/<ID>
#   https://demo.arcade.software/<ID>         (already an embed src)
ARCADE_SHARE_RE = re.compile(
    r'^https://(?:interact\.redhat\.com|app\.arcade\.software)/share/([A-Za-z0-9_-]+)'
)
ARCADE_DEMO_RE = re.compile(
    r'^https://demo\.arcade\.software/([A-Za-z0-9_-]+)'
)
ARCADE_ASPECT_RATIO_DEFAULT = "56.25%"

def resolve_arcade(demo, filename):
    """
    Given a demo dict for type 'arcade', resolve share_url into the three
    fields the renderer needs: url, title, aspect_ratio.

    Authors supply:
      share_url    — required  (interact.redhat.com/share/<ID> or similar)
      title        — optional override (falls back to Arcade flow name)
      aspect_ratio — optional override (falls back to Arcade metadata or 56.25%)

    Returns a list of error strings (empty = success).
    Mutates demo in-place, adding url / title / aspect_ratio.
    """
    errors = []

    share_url = demo.get("share_url", "")

    # --- Extract flow ID ---
    m = ARCADE_SHARE_RE.match(share_url)
    if not m:
        m = ARCADE_DEMO_RE.match(share_url)
        if m:
            # Author pasted an embed src directly — accept it, extract ID
            flow_id = m.group(1)
            # Strip any query string from the ID match
            flow_id = flow_id.split("?")[0]
        else:
            errors.append(
                f"demo 'share_url' must be an Arcade share link "
                f"(e.g. https://interact.redhat.com/share/<ID>), got: {share_url!r}"
            )
            return errors
    else:
        flow_id = m.group(1)

    # --- Construct the canonical embed src ---
    demo["url"] = f"https://demo.arcade.software/{flow_id}?embed="

    # --- Determine which fields still need fetching ---
    need_title  = "title"        not in demo
    need_ratio  = "aspect_ratio" not in demo

    fetched_title = None
    fetched_ratio = None

    if need_title or need_ratio:
        # Fetch the share page and parse __NEXT_DATA__ JSON
        fetch_url = f"https://interact.redhat.com/share/{flow_id}"

        try:
            req = Request(fetch_url, headers={"User-Agent": "faq-kiosk-builder/1.0"})
            with urlopen(req, timeout=10) as resp:
                html = resp.read().decode("utf-8", errors="replace")

            m2 = re.search(
                r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>',
                html, re.DOTALL
            )
            if m2:
                data = json.loads(m2.group(1))
                flow = (
                    data.get("props", {})
                        .get("pageProps", {})
                        .get("_serializablePublicFlow", {})
                )
                fetched_title = flow.get("name")
                ar = flow.get("aspectRatio")   # float e.g. 0.5625
                if isinstance(ar, (int, float)):
                    fetched_ratio = f"{round(ar * 100, 4):g}%"
            else:
                warn(f"{filename}: could not find __NEXT_DATA__ in Arcade share page")

        except URLError as exc:
            warn(f"{filename}: could not fetch Arcade metadata ({exc}) — "
                 f"using defaults; add 'title' and 'aspect_ratio' manually if needed")

    if need_title:
        if fetched_title:
            demo["title"] = fetched_title
            info(f"{filename}: arcade title from share page: {fetched_title!r}")
        else:
            errors.append(
                "demo type 'arcade' requires a 'title' field "
                "(could not fetch it automatically — add it manually)"
            )

    if need_ratio:
        demo["aspect_ratio"] = fetched_ratio or ARCADE_ASPECT_RATIO_DEFAULT
        if fetched_ratio:
            info(f"{filename}: arcade aspect_ratio from share page: {fetched_ratio}")
        else:
            info(f"{filename}: arcade aspect_ratio defaulting to {ARCADE_ASPECT_RATIO_DEFAULT}")

    return errors

# ── Load and validate YAML files ──────────────────────────────────
def load_entries():
    yaml_files = sorted(FAQS_DIR.glob("*.yaml"))
    # Skip any file whose stem starts with _
    yaml_files = [f for f in yaml_files if not f.stem.startswith("_")]

    if not yaml_files:
        err(f"No .yaml files found in {FAQS_DIR}/")
        err("Create at least one FAQ entry. See content/faqs/_template.yaml for the format.")
        sys.exit(1)

    info(f"Found {len(yaml_files)} YAML file(s) in content/faqs/")

    entries = []
    errors  = []
    seen_ids = {}

    for path in yaml_files:
        try:
            with open(path, encoding="utf-8") as fh:
                data = yaml.safe_load(fh)
        except yaml.YAMLError as exc:
            errors.append(f"{path.name}: YAML parse error — {exc}")
            continue
        except OSError as exc:
            errors.append(f"{path.name}: Cannot read file — {exc}")
            continue

        if not isinstance(data, dict):
            errors.append(f"{path.name}: Top-level value must be a YAML mapping")
            continue

        file_errors = []

        # Required fields (order is not required in v2 — sequence from content/index.yaml)
        missing = REQUIRED_FIELDS - data.keys()
        if missing:
            file_errors.append(f"Missing required field(s): {', '.join(sorted(missing))}")

        # id must be unique
        if "id" in data:
            fid = data["id"]
            if fid in seen_ids:
                file_errors.append(
                    f"Duplicate id '{fid}' (also used in {seen_ids[fid]})"
                )
            else:
                seen_ids[fid] = path.name

        # enabled must be a boolean if present; default true if omitted
        if "enabled" in data:
            if not isinstance(data["enabled"], bool):
                file_errors.append(
                    f"'enabled' must be true or false, got {type(data['enabled']).__name__}"
                )
        else:
            data["enabled"] = True   # backwards-compatible default

        # demo block — spec-driven required field checks
        if "demo" in data:
            demo = data["demo"]
            if not isinstance(demo, dict):
                file_errors.append("'demo' must be a YAML mapping")
            else:
                if "type" not in demo:
                    file_errors.append("'demo' is missing required field 'type'")
                elif demo["type"] not in VALID_TYPES:
                    file_errors.append(
                        f"Unknown demo type '{demo['type']}'. "
                        f"Valid types: {', '.join(sorted(VALID_TYPES))}"
                    )
                else:
                    dtype = demo["type"]
                    type_spec = _SPEC["card"]["demo_types"][dtype]
                    for field in type_spec.get("required", []):
                        if field not in demo:
                            file_errors.append(
                                f"demo type '{dtype}' requires a '{field}' field"
                            )
                    # Arcade: resolve share_url to embed url (complex logic, kept explicit)
                    if dtype == "arcade" and "share_url" in demo:
                        arcade_errors = resolve_arcade(demo, path.name)
                        file_errors.extend(arcade_errors)
                    # video-loop: videos must be a non-empty list of strings
                    if dtype == "video-loop" and "videos" in demo:
                        if not isinstance(demo["videos"], list) or not demo["videos"]:
                            file_errors.append(
                                "demo type 'video-loop': 'videos' must be a non-empty list"
                            )
                        else:
                            for i, v in enumerate(demo["videos"]):
                                if not isinstance(v, str):
                                    file_errors.append(
                                        f"demo type 'video-loop': videos[{i}] must be a string path, "
                                        f"got {type(v).__name__}"
                                    )

        if file_errors:
            for e in file_errors:
                errors.append(f"{path.name}: {e}")
        else:
            demo = data.get("demo", {})
            dtype = demo.get("type", "")
            if dtype in ("video", "slides", "asciinema") and "src" in demo:
                demo["src"] = encode_media_path(demo["src"])
            elif dtype == "image-text" and "image" in demo:
                demo["image"] = encode_media_path(demo["image"])
            elif dtype == "video-loop" and isinstance(demo.get("videos"), list):
                demo["videos"] = [encode_media_path(v) for v in demo["videos"]]
            entries.append(data)
            hidden_label = "" if data["enabled"] else "  [hidden]"
            ok(f"{path.name}  (id={data['id']!r}){hidden_label}")

    return entries, errors

# ── Load and validate branding YAML ───────────────────────────────
def load_branding():
    """Load branding configuration from content/branding/branding.yaml."""
    if not BRANDING_FILE.exists():
        warn(f"Branding file not found: {BRANDING_FILE.relative_to(PROJECT_ROOT)}")
        warn("Using default branding. Create content/branding/branding.yaml to customize.")
        return None, []

    try:
        with open(BRANDING_FILE, encoding="utf-8") as fh:
            branding = yaml.safe_load(fh)
    except yaml.YAMLError as exc:
        return None, [f"Branding YAML parse error: {exc}"]
    except OSError as exc:
        return None, [f"Cannot read branding file: {exc}"]

    if not isinstance(branding, dict):
        return None, ["Branding file must contain a YAML mapping"]

    errors = []
    # Validate structure (basic check for required keys)
    required_sections = set(_SPEC["branding"]["required_sections"])
    missing = required_sections - branding.keys()
    if missing:
        errors.append(f"Branding file missing sections: {', '.join(sorted(missing))}")

    if errors:
        return None, errors

    ok(f"Loaded branding: {branding['event']['header']}")
    return branding, []

# ── Main ──────────────────────────────────────────────────────────
def main():
    print()
    print("================================================================")
    print(" build-faqs.py — FAQ YAML → content/faqs.js")
    print("================================================================")
    print()

    entries, errors = load_entries()

    if errors:
        print()
        err(f"{len(errors)} error(s) found — content/faqs.js was NOT written:")
        for e in errors:
            err(f"  {e}")
        print()
        sys.exit(1)

    # Sort by content/index.yaml card_order sequence
    card_order, categories = load_content_index()
    order_map = {card_id: i for i, card_id in enumerate(card_order)}
    entries.sort(key=lambda e: order_map.get(e["id"], len(card_order)))
    info(f"Card order: {' → '.join(e['id'] for e in entries)}")

    # Ensure each entry has spotlight and family fields (defaults if absent from YAML)
    for entry in entries:
        entry.setdefault("spotlight", False)
        entry.setdefault("family", None)

    # Render via Jinja2 (template lives in app/faqs/)
    env = Environment(
        loader=FileSystemLoader(str(PROJECT_ROOT / "app" / "faqs")),
        undefined=StrictUndefined,
        autoescape=False,
    )
    template = env.get_template("faqs.js.j2")
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    output = template.render(entries=entries, categories=categories, generated_at=generated_at)

    OUTPUT.write_text(output, encoding="utf-8")

    print()
    ok(f"Wrote {OUTPUT.relative_to(PROJECT_ROOT)}  ({len(entries)} card(s))")

    # Generate branding.js
    branding, branding_errors = load_branding()
    if branding_errors:
        print()
        err(f"{len(branding_errors)} branding error(s) found — content/branding.js was NOT written:")
        for e in branding_errors:
            err(f"  {e}")
        print()
        sys.exit(1)

    if branding:
        branding_template = env.get_template("branding.js.j2")
        branding_output = branding_template.render(branding=branding, generated_at=generated_at)
        BRANDING_OUTPUT.write_text(branding_output, encoding="utf-8")
        ok(f"Wrote {BRANDING_OUTPUT.relative_to(PROJECT_ROOT)}")

    print()

if __name__ == "__main__":
    main()
