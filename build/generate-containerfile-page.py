#!/usr/bin/env python3
"""
generate-containerfile-page.py
================================
Build-time script: reads Containerfile from the current directory,
syntax-highlights it, and writes containerfile.html — a standalone
page styled to match the demo kiosk app (PatternFly 6, Red Hat brand).

Run automatically during `podman build` inside the hummingbird builder
stage (quay.io/hummingbird-hatchling/python:3.14-builder), which has a
shell and Python available. The output (containerfile.html) is copied
into the distroless runtime stage. Can also be run on the host directly:
    python3 generate-containerfile-page.py
"""

import re
import sys
from pathlib import Path
from datetime import datetime, timezone

try:
    import yaml
except ImportError:
    print("ERROR: PyYAML is not installed. Run: pip3 install pyyaml", file=sys.stderr)
    sys.exit(1)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
SCRIPT_DIR    = Path(__file__).parent.resolve()   # build/
PROJECT_ROOT  = SCRIPT_DIR.parent
CONTAINERFILE = PROJECT_ROOT / "Containerfile"
BRANDING_FILE = PROJECT_ROOT / "content" / "branding" / "branding.yaml"
OUTPUT        = PROJECT_ROOT / "app" / "containerfile.html"

if not CONTAINERFILE.exists():
    print(f"ERROR: {CONTAINERFILE} not found", file=sys.stderr)
    sys.exit(1)

raw = CONTAINERFILE.read_text(encoding="utf-8")

# ---------------------------------------------------------------------------
# Load branding configuration
# ---------------------------------------------------------------------------
def load_branding():
    """Load branding from content/branding/branding.yaml or use defaults."""
    if not BRANDING_FILE.exists():
        print(f"  WARNING: {BRANDING_FILE} not found, using defaults", file=sys.stderr)
        return {
            "event": {
                "title": "Demo Kiosk",
                "header": "Demo Kiosk",
                "tagline": None
            },
            "logos": {
                "primary": {"file": "assets/logo-redhat.svg", "alt_text": "Red Hat"},
                "secondary": {"file": "assets/logo-hummingbird.png", "alt_text": "Project Hummingbird"}
            },
            "colors": {
                "brand_primary": "#ee0000",
                "brand_hover": "#c00000",
                "page_background": "#f2f2f2",
                "header_background": "#151515"
            },
            "footer": {"copyright": "Red Hat, Inc."}
        }

    try:
        with open(BRANDING_FILE, encoding="utf-8") as fh:
            return yaml.safe_load(fh)
    except Exception as e:
        print(f"  WARNING: Error loading branding ({e}), using defaults", file=sys.stderr)
        return load_branding.__defaults__[0]

branding = load_branding()

# ---------------------------------------------------------------------------
# Syntax highlighter
# Processes line-by-line; produces a list of <span>-wrapped HTML strings.
# Classes:
#   .cf-comment   — lines starting with #
#   .cf-directive — Dockerfile instructions (FROM, RUN, COPY, …)
#   .cf-string    — quoted strings within a line
#   .cf-value     — remainder of a directive line (the argument)
# ---------------------------------------------------------------------------
DIRECTIVES = {
    "FROM", "RUN", "COPY", "ADD", "WORKDIR", "EXPOSE", "CMD",
    "ENTRYPOINT", "ENV", "ARG", "LABEL", "USER", "VOLUME",
    "STOPSIGNAL", "HEALTHCHECK", "SHELL", "ONBUILD",
}

def esc(text: str) -> str:
    """HTML-escape a string."""
    return (text
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;"))

def highlight_line(line: str) -> str:
    """Return a syntax-highlighted HTML string for one Containerfile line."""
    stripped = line.rstrip("\n")

    # Blank line
    if not stripped.strip():
        return ""

    # Comment line (may be indented)
    if stripped.lstrip().startswith("#"):
        return f'<span class="cf-comment">{esc(stripped)}</span>'

    # Check for a directive at the start of the line
    first_word = stripped.split()[0].upper() if stripped.split() else ""
    if first_word in DIRECTIVES:
        rest = stripped[len(first_word):]  # everything after the keyword

        # Highlight quoted strings within the rest
        def quote_span(m):
            return f'<span class="cf-string">{esc(m.group(0))}</span>'

        rest_esc = esc(rest)
        # re-apply quote highlighting on the escaped string
        rest_highlighted = re.sub(
            r'&quot;[^&]*&quot;|&#x27;[^&]*&#x27;',
            lambda m: f'<span class="cf-string">{m.group(0)}</span>',
            rest_esc,
        )
        # Also highlight [...] array syntax used in CMD/ENTRYPOINT
        rest_highlighted = re.sub(
            r'(\[)([^\]]*)(\])',
            lambda m: (f'<span class="cf-string">{esc("[")}</span>'
                       f'{m.group(2)}'
                       f'<span class="cf-string">{esc("]")}</span>'),
            rest_highlighted,
        )

        return (f'<span class="cf-directive">{esc(first_word)}</span>'
                f'<span class="cf-value">{rest_highlighted}</span>')

    # Continuation line (backslash-continued) or bare value
    return f'<span class="cf-value">{esc(stripped)}</span>'

highlighted_lines = []
for line in raw.splitlines():
    highlighted_lines.append(highlight_line(line))

code_html = "\n".join(highlighted_lines)

# ---------------------------------------------------------------------------
# Build timestamp (UTC, embedded in the page)
# ---------------------------------------------------------------------------
built_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

# ---------------------------------------------------------------------------
# HTML page — uses the same PF6 CSS and brand tokens as index.html.
# patternfly.min.css and assets/ are referenced by relative path so the
# page works whether served from the same directory as index.html or not.
# ---------------------------------------------------------------------------
html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Containerfile — {branding['event'].get('title') or branding['event']['header']}</title>

  <link rel="stylesheet" href="patternfly.min.css" />

  <style>
    /* ── Brand tokens ── */
    :root {{
      --pf-t--global--color--brand--default: {branding['colors']['brand_primary']};
      --pf-t--global--color--brand--hover:   {branding['colors']['brand_hover']};
    }}

    /* ── Page chrome ── */
    body {{
      display: flex;
      flex-direction: column;
      min-height: 100vh;
      background-color: {branding['colors']['page_background']};
    }}

    /* ── Masthead — three-zone layout matching index.html ── */
    #site-header {{
      --pf-v6-c-masthead--BackgroundColor: {branding['colors']['header_background']};
      padding-block: 1.2rem;
      padding-inline: 2rem;
      display: flex;
      align-items: stretch;
    }}
    #site-header .pf-v6-c-masthead__main {{
      flex: 1;
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
    }}
    #header-logo-rh {{
      height: 3rem;
      width: auto;
      justify-self: start;
    }}
    #header-centre {{
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.3rem;
    }}
    #header-title {{
      font-size: 3rem;
      font-weight: 300;
      color: var(--pf-t--global--text--color--on-brand--default);
      opacity: 0.85;
    }}
    #header-tagline {{
      font-size: 1rem;
      font-weight: 300;
      color: var(--pf-t--global--text--color--on-brand--default);
      opacity: 0.7;
    }}
    #header-logo-hummingbird {{
      height: 3rem;
      width: auto;
      justify-self: end;
    }}

    /* ── Main content area ── */
    main {{
      flex: 1;
      padding: 2.5rem 3rem;
      max-width: 1200px;
      width: 100%;
      margin: 0 auto;
    }}

    main h2 {{
      font-size: 1.8rem;
      font-weight: 700;
      margin-bottom: 0.4rem;
    }}

    .page-subtitle {{
      color: var(--pf-t--global--text--color--subtle);
      margin-bottom: 2rem;
      position: relative;
      font-size: 1.35rem;
      line-height: 1.55;
    }}

    /* ── Hummingbird drop cap logo ── */
    .hummingbird-dropcap {{
      float: left;
      margin: 0.2rem 1rem 0.5rem 0;
      display: block;
    }}

    .hummingbird-dropcap img {{
      display: block;
      width: auto;
      height: 6.5rem;
      opacity: 0.9;
      transition: opacity 0.2s ease;
    }}

    .hummingbird-dropcap:hover img {{
      opacity: 1;
    }}

    /* ── Action bar ── */
    .page-actions {{
      display: flex;
      gap: 1rem;
      margin-bottom: 1.5rem;
      flex-wrap: wrap;
      align-items: center;
    }}

    .build-meta {{
      font-size: 0.85rem;
      color: var(--pf-t--global--text--color--subtle);
      margin-left: auto;
    }}

    /* ── Code block ── */
    .cf-code-wrap {{
      background-color: #1e1e1e;
      border-radius: var(--pf-t--global--border--radius--medium, 6px);
      overflow-x: auto;
    }}

    .cf-code-wrap pre {{
      margin: 0;
      padding: 1.5rem 2rem;
      font-family: "Red Hat Mono", "Liberation Mono", "Courier New", monospace;
      font-size: 0.95rem;
      line-height: 1.7;
      color: #d4d4d4;
      white-space: pre;
    }}

    /* ── Syntax token colours (VS Code Dark+ inspired) ── */
    .cf-comment   {{ color: #6a9955; }}   /* green  */
    .cf-directive {{ color: #569cd6; font-weight: 600; }} /* blue   */
    .cf-string    {{ color: #ce9178; }}   /* orange */
    .cf-value     {{ color: #d4d4d4; }}   /* light grey (default) */

    /* ── Footer ── */
    #site-footer {{
      text-align: center;
      padding: 1rem;
      font-size: 0.8rem;
      color: var(--pf-t--global--text--color--subtle);
      border-top: 1px solid var(--pf-t--global--border--color--default);
    }}
  </style>
</head>
<body>

  <header class="pf-v6-c-masthead pf-m-display-stack" id="site-header">
    <div class="pf-v6-c-masthead__main">
      <img id="header-logo-rh" src="{branding['logos']['primary']['file']}" alt="{branding['logos']['primary']['alt_text']}" />
      <div id="header-centre">
        <span id="header-title">{branding['event']['header']}</span>
        {'<span id="header-tagline">' + branding['event']['tagline'] + '</span>' if branding['event'].get('tagline') else ''}
      </div>
      <img id="header-logo-hummingbird" src="{branding['logos']['secondary']['file']}" alt="{branding['logos']['secondary']['alt_text']}" />
    </div>
  </header>

  <main>
    <h2>Containerfile</h2>
    <p class="page-subtitle">
      <a href="https://images.redhat.com/" target="_blank" rel="noopener" class="hummingbird-dropcap" title="Built with Hummingbird — Red Hat's lightweight container images">
        <img src="assets/logo-hummingbird.png" alt="Hummingbird" />
      </a>
      Container-native kiosk running on Red Hat's distroless Hummingbird images — hardened, minimal, and secure by design.<br>
      Built with <a href="https://podman.io" target="_blank" rel="noopener">Podman</a> from
      <code>registry.access.redhat.com/hi/python:3.14</code>.<br>
      Styled with <a href="https://www.patternfly.org" target="_blank" rel="noopener">PatternFly</a>, Red Hat's enterprise design system.
    </p>

    <div class="page-actions">
      <a class="pf-v6-c-button pf-m-primary" href="index.html">&#8592; Back to Kiosk</a>
      <span class="build-meta">Image built: {built_at}</span>
    </div>

    <div class="cf-code-wrap">
      <pre>{code_html}</pre>
    </div>
  </main>

  <footer id="site-footer">
    <a href="index.html">Kiosk</a> &nbsp;&middot;&nbsp;
    <a href="index.html#admin">Statistics</a> &nbsp;&middot;&nbsp;
    Containerfile &nbsp;&middot;&nbsp;
    &copy; {branding['footer']['copyright']}
  </footer>

</body>
</html>
"""

OUTPUT.write_text(html, encoding="utf-8")
print(f"  generated: {OUTPUT}")
