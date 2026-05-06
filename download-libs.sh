#!/usr/bin/env bash
# ================================================================
# download-libs.sh — Download required third-party libraries
# ================================================================
# Run this script once before using the FAQ for the first time,
# or any time you want to update the libraries to their latest
# versions.
#
# USAGE:
#   chmod +x download-libs.sh   (run once to make executable)
#   ./download-libs.sh
#
# REQUIREMENTS:
#   curl must be available (it is pre-installed on macOS and most
#   Linux distributions; on Windows use Git Bash or WSL)
#
# WHAT THIS DOWNLOADS:
#   PatternFly 6      — CSS design system (patternfly.min.css + fonts/icons)
#   Red Hat logo      — official on-dark SVG from static.redhat.com
#   asciinema-player  — for playing terminal (.cast) recordings
#   PDF.js            — for rendering Google Slides exported as PDF
#
# File layout after download:
#   app/patternfly.min.css          ← app root (font paths are relative to here)
#   app/assets/logo-redhat.svg      ← Red Hat logo (horizontal, on-dark colorway)
#   app/assets/logo-hummingbird.png ← Project Hummingbird logo (192×192 RGBA PNG)
#   app/assets/fonts/RedHatText/    ← Red Hat Text variable font
#   app/assets/fonts/RedHatDisplay/ ← Red Hat Display variable font
#   app/assets/fonts/RedHatMono/    ← Red Hat Mono variable font
#   app/assets/fonts/webfonts/      ← FontAwesome woff2
#   app/assets/pficon/              ← PatternFly icon font
#   app/assets/asciinema-player.*   ← asciinema player
#   app/assets/pdf*.mjs / pdf*.js   ← PDF.js
#
# No network access is needed after this script has been run.
# ================================================================

set -euo pipefail

# ── Colour output helpers ────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
RESET='\033[0m'

info()    { echo -e "${CYAN}  →${RESET} $*"; }
success() { echo -e "${GREEN}  ✓${RESET} $*"; }
warn()    { echo -e "${YELLOW}  !${RESET} $*"; }
error()   { echo -e "${RED}  ✗${RESET} $*"; }

# ── Resolve paths ────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ASSETS_DIR="${SCRIPT_DIR}/app/assets"

echo ""
echo "================================================================"
echo " Demo Kiosk Library Downloader"
echo "================================================================"
echo " Project root:   ${SCRIPT_DIR}"
echo " Assets folder:  ${ASSETS_DIR} (app/assets/)"
echo ""

# ── Check for curl ───────────────────────────────────────────────
if ! command -v curl &>/dev/null; then
  error "curl is not installed or not on your PATH."
  echo ""
  echo "  Install curl and try again:"
  echo "    macOS:   curl is built in — if missing, install Xcode Command Line Tools"
  echo "    Ubuntu:  sudo apt install curl"
  echo "    Fedora:  sudo dnf install curl"
  echo "    Windows: use Git Bash, WSL, or install curl from https://curl.se"
  echo ""
  exit 1
fi

# ── Ensure assets/ directory exists ─────────────────────────────
mkdir -p "${ASSETS_DIR}"

# ── Download helpers ─────────────────────────────────────────────
# download_to <label> <url> <absolute-dest-path>
download_to() {
  local label="$1"
  local url="$2"
  local dest="$3"

  mkdir -p "$(dirname "${dest}")"
  info "Downloading ${label} ..."
  if curl \
      --location \
      --silent \
      --show-error \
      --fail \
      --connect-timeout 15 \
      --max-time 120 \
      --output "${dest}" \
      "${url}"; then
    success "${label} → ${dest#"${SCRIPT_DIR}/"}"
  else
    error "Failed to download ${label}"
    error "URL: ${url}"
    warn  "Check your network connection and try again."
    ERRORS=$((ERRORS + 1))
  fi
}

# download <label> <url> <filename-relative-to-assets/>
download() {
  local label="$1"
  local url="$2"
  download_to "${label}" "${url}" "${ASSETS_DIR}/$3"
}

ERRORS=0

# ================================================================
# PatternFly 6 (HTML/CSS design system)
# Used for all UI components: masthead, cards, modal, table, buttons.
# Project: https://github.com/patternfly/patternfly
#
# patternfly.min.css is placed in app/ (not inside app/assets/)
# because its @font-face rules use relative paths like:
#   url(assets/fonts/RedHatText/RedHatTextVF.woff2)
# which resolve correctly only when the CSS is at the app root level.
#
# Fonts and icons are placed inside assets/ to match those paths.
# ================================================================
echo "── PatternFly 6 ────────────────────────────────────────────────"

PF_VERSION="6.4.0"
PF_BASE="https://unpkg.com/@patternfly/patternfly@${PF_VERSION}"

# Main CSS — placed at project root
download_to \
  "patternfly.min.css (v${PF_VERSION})" \
  "${PF_BASE}/patternfly.min.css" \
  "${SCRIPT_DIR}/app/patternfly.min.css"

# Red Hat Text variable font (body text)
download \
  "RedHatTextVF.woff2" \
  "${PF_BASE}/assets/fonts/RedHatText/RedHatTextVF.woff2" \
  "fonts/RedHatText/RedHatTextVF.woff2"

download \
  "RedHatTextVF-Italic.woff2" \
  "${PF_BASE}/assets/fonts/RedHatText/RedHatTextVF-Italic.woff2" \
  "fonts/RedHatText/RedHatTextVF-Italic.woff2"

# Red Hat Display variable font (headings)
download \
  "RedHatDisplayVF.woff2" \
  "${PF_BASE}/assets/fonts/RedHatDisplay/RedHatDisplayVF.woff2" \
  "fonts/RedHatDisplay/RedHatDisplayVF.woff2"

download \
  "RedHatDisplayVF-Italic.woff2" \
  "${PF_BASE}/assets/fonts/RedHatDisplay/RedHatDisplayVF-Italic.woff2" \
  "fonts/RedHatDisplay/RedHatDisplayVF-Italic.woff2"

# Red Hat Mono variable font (code/terminal)
download \
  "RedHatMonoVF.woff2" \
  "${PF_BASE}/assets/fonts/RedHatMono/RedHatMonoVF.woff2" \
  "fonts/RedHatMono/RedHatMonoVF.woff2"

download \
  "RedHatMonoVF-Italic.woff2" \
  "${PF_BASE}/assets/fonts/RedHatMono/RedHatMonoVF-Italic.woff2" \
  "fonts/RedHatMono/RedHatMonoVF-Italic.woff2"

# FontAwesome solid (used by PF icons)
download \
  "fa-solid-900.woff2" \
  "${PF_BASE}/assets/fonts/webfonts/fa-solid-900.woff2" \
  "fonts/webfonts/fa-solid-900.woff2"

# PF icon font
download \
  "pf-v6-pficon.woff2" \
  "${PF_BASE}/assets/pficon/pf-v6-pficon.woff2" \
  "pficon/pf-v6-pficon.woff2"

echo ""

# ================================================================
# Red Hat brand assets
# The on-dark logo SVG (horizontal: red hat + white wordmark) is
# publicly served from static.redhat.com with no authentication.
# It is used in the masthead against the dark PF6 masthead background.
# SVG uses two fill classes: .cls-1 (#ee0000 hat) .cls-2 (#fff wordmark)
#
# The Project Hummingbird logo is extracted from hummingbird-project.io
# where it is embedded as a base64 PNG in the site navbar SVG.
# ================================================================
echo "── Red Hat brand assets ────────────────────────────────────────"

download_to \
  "Red Hat logo (on-dark SVG)" \
  "https://static.redhat.com/libs/redhat/brand-assets/2/corp/logo--on-dark.svg" \
  "${ASSETS_DIR}/logo-redhat.svg"

info "Downloading Project Hummingbird logo ..."
if curl \
    --location \
    --silent \
    --show-error \
    --fail \
    --connect-timeout 15 \
    --max-time 30 \
    "https://hummingbird-project.io/" | \
  python3 -c "
import sys, re, base64
html = sys.stdin.read()
m = re.search(r'data:image/png;base64,([^\"]+)', html)
if not m: sys.stderr.write('Logo not found\n'); sys.exit(1)
open('${ASSETS_DIR}/logo-hummingbird.png', 'wb').write(base64.b64decode(m.group(1)))
"; then
  success "Project Hummingbird logo → assets/logo-hummingbird.png"
else
  error "Failed to extract Project Hummingbird logo"
  ERRORS=$((ERRORS + 1))
fi

echo ""

# ================================================================
# asciinema player v3
# Used to play .cast terminal recordings inside the FAQ viewer.
# Project: https://github.com/asciinema/asciinema-player
# ================================================================
echo "── asciinema player ────────────────────────────────────────────"

ASCIINEMA_VERSION="3.15.1"
ASCIINEMA_BASE="https://github.com/asciinema/asciinema-player/releases/download/v${ASCIINEMA_VERSION}"

download \
  "asciinema-player.min.js (v${ASCIINEMA_VERSION})" \
  "${ASCIINEMA_BASE}/asciinema-player.min.js" \
  "asciinema-player.min.js"

download \
  "asciinema-player.css (v${ASCIINEMA_VERSION})" \
  "${ASCIINEMA_BASE}/asciinema-player.css" \
  "asciinema-player.css"

echo ""

# ================================================================
# PDF.js v4
# Used to render Google Slides PDFs inside the FAQ viewer.
# Project: https://github.com/mozilla/pdf.js
#
# PDF.js v4 ships as ES modules (.mjs). pdf.min.mjs is downloaded
# and then stripped of its trailing ES module export statement so
# it can be loaded as a classic script. The resulting file is
# saved as pdf.min.js. The worker (pdf.worker.min.mjs) is kept
# as-is — PDF.js loads it internally as a module worker.
# ================================================================
echo "── PDF.js ──────────────────────────────────────────────────────"

PDFJS_VERSION="4.10.38"
PDFJS_BASE="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}"

download \
  "pdf.min.mjs (v${PDFJS_VERSION})" \
  "${PDFJS_BASE}/pdf.min.mjs" \
  "pdf.min.mjs"

download \
  "pdf.worker.min.mjs (v${PDFJS_VERSION})" \
  "${PDFJS_BASE}/pdf.worker.min.mjs" \
  "pdf.worker.min.mjs"

# Strip the trailing ES module export statement from pdf.min.mjs so it
# can be loaded as a plain classic <script> tag. The IIFE inside the file
# already sets globalThis.pdfjsLib synchronously — the export line is the
# only thing preventing classic script execution.
info "Stripping ES module export from pdf.min.mjs → pdf.min.js ..."
# The export{...} statement is embedded at the end of a single long minified
# line. sed line-anchors won't work — use python3 to truncate at the last
# occurrence of 'export{' which is the only top-level ES module syntax.
if python3 -c "
import sys
code = open('${ASSETS_DIR}/pdf.min.mjs', encoding='utf-8').read()
idx = code.rfind('export{')
if idx == -1:
    sys.stderr.write('export{ not found in pdf.min.mjs\n')
    sys.exit(1)
open('${ASSETS_DIR}/pdf.min.js', 'w', encoding='utf-8').write(code[:idx])
"; then
  # Verify the output file exists and is non-empty
  if [ -s "${ASSETS_DIR}/pdf.min.js" ]; then
    success "pdf.min.js (classic script) created"
  else
    error "pdf.min.js was created but is empty"
    ERRORS=$((ERRORS + 1))
  fi
else
  error "Failed to create pdf.min.js from pdf.min.mjs"
  ERRORS=$((ERRORS + 1))
fi

echo ""

# ================================================================
# Summary
# ================================================================
echo "================================================================"
if [ "${ERRORS}" -eq 0 ]; then
  echo -e "${GREEN} All libraries downloaded successfully.${RESET}"
  echo ""
  echo " You can now launch the FAQ with:  ./start.sh"
else
  echo -e "${RED} ${ERRORS} download(s) failed.${RESET}"
  echo ""
  echo " Partial downloads may cause some features to not work:"
  echo "   Missing PatternFly files  → page will look unstyled"
  echo "   Missing asciinema files   → terminal recordings won't play"
  echo "   Missing PDF.js files      → slide decks won't render"
  echo ""
  echo " Fix your network connection and re-run this script."
  echo " It is safe to run multiple times — files will be overwritten."
  exit 1
fi
echo "================================================================"
echo ""
