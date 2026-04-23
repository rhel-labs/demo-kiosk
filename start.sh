#!/usr/bin/env bash
# ================================================================
# start.sh — Launch the Interactive FAQ
# ================================================================
# Starts a local HTTP server (Python 3, built into RHEL 10) and
# opens the FAQ in a browser. The HTTP server is required because
# browsers block local asset loading (PDF, .cast files) when
# opening HTML directly as a file:// URL.
#
# USAGE:
#   ./start.sh               # auto-detect browser, port 8181
#   ./start.sh --port 9090   # use a different port
#   ./start.sh --kiosk       # open browser in kiosk/fullscreen mode
#   ./start.sh --browser firefox
#   ./start.sh --browser chrome
#
# REQUIREMENTS:
#   python3   — pre-installed on RHEL 10
#   firefox   — or google-chrome / google-chrome-stable
#
# Press Ctrl+C to stop the server and close when done.
# ================================================================

set -euo pipefail

# ── Defaults ─────────────────────────────────────────────────────
PORT=8181
KIOSK=false
BROWSER=""   # empty = auto-detect

# ── Argument parsing ──────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)     PORT="$2";    shift 2 ;;
    --kiosk)    KIOSK=true;   shift   ;;
    --browser)  BROWSER="$2"; shift 2 ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--port N] [--kiosk] [--browser firefox|chrome]"
      exit 1
      ;;
  esac
done

# ── Colour helpers ────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
RESET='\033[0m'

info()    { echo -e "${CYAN}  →${RESET} $*"; }
success() { echo -e "${GREEN}  ✓${RESET} $*"; }
warn()    { echo -e "${YELLOW}  !${RESET} $*"; }
error()   { echo -e "${RED}  ✗${RESET} $*"; }

# ── Resolve project root ──────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FAQ_URL="http://localhost:${PORT}"

echo ""
echo "================================================================"
echo " Interactive FAQ — Launcher"
echo "================================================================"
echo ""

# ── Check Python 3 ────────────────────────────────────────────────
if ! command -v python3 &>/dev/null; then
  error "python3 is not available."
  echo ""
  echo "  python3 is required to run the local HTTP server."
  echo "  On RHEL 10:  sudo dnf install python3"
  echo ""
  exit 1
fi

PYTHON_VERSION=$(python3 --version 2>&1)
success "Found ${PYTHON_VERSION}"

# ── Lint YAML content before building ────────────────────────────
info "Linting YAML content ..."
if ! python3 "${SCRIPT_DIR}/build/lint-content.py"; then
  error "lint-content.py failed — fix the errors above and try again."
  exit 1
fi

# ── Build FAQ JS from YAML sources ────────────────────────────────
info "Building content/faqs.js from YAML sources ..."
if ! python3 "${SCRIPT_DIR}/build/build-faqs.py"; then
  error "build/build-faqs.py failed — fix the errors above and try again."
  exit 1
fi

# ── Generate containerfile.html for local dev ─────────────────────
info "Generating app/containerfile.html ..."
if ! python3 "${SCRIPT_DIR}/build/generate-containerfile-page.py"; then
  warn "generate-containerfile-page.py failed — containerfile.html may be stale."
fi

# ── Check the port is free ────────────────────────────────────────
if ss -tlnH "sport = :${PORT}" 2>/dev/null | grep -q .; then
  error "Port ${PORT} is already in use."
  warn  "Try a different port:  ./start.sh --port 9090"
  exit 1
fi

# ── Detect browser ────────────────────────────────────────────────
find_browser() {
  for candidate in "$@"; do
    if command -v "$candidate" &>/dev/null; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

if [ -n "${BROWSER}" ]; then
  # User specified a browser — verify it exists
  if ! command -v "${BROWSER}" &>/dev/null; then
    error "Specified browser not found: ${BROWSER}"
    exit 1
  fi
  BROWSER_BIN="${BROWSER}"
  # Detect type for flag handling
  if [[ "${BROWSER}" == *firefox* ]]; then
    BROWSER_TYPE="firefox"
  else
    BROWSER_TYPE="chrome"
  fi
else
  # Auto-detect: prefer Firefox, fall back to Chrome
  if BROWSER_BIN=$(find_browser firefox); then
    BROWSER_TYPE="firefox"
  elif BROWSER_BIN=$(find_browser google-chrome google-chrome-stable chromium-browser chromium); then
    BROWSER_TYPE="chrome"
  else
    error "No supported browser found."
    echo ""
    echo "  Install Firefox or Chrome, or specify the browser binary:"
    echo "    ./start.sh --browser /path/to/browser"
    echo ""
    echo "  You can also open this URL manually in any browser:"
    echo "    ${FAQ_URL}"
    echo ""
    BROWSER_BIN=""
    BROWSER_TYPE="none"
  fi
fi

if [ "${BROWSER_TYPE}" != "none" ]; then
  success "Found browser: ${BROWSER_BIN}"
fi

# ── Start HTTP server ─────────────────────────────────────────────
info "Starting HTTP server on port ${PORT} ..."

# Launch Python HTTP server in background, output suppressed
python3 "${SCRIPT_DIR}/app/serve.py" "${PORT}" \
  --directory "${SCRIPT_DIR}/app" \
  --bind 127.0.0.1 \
  >/dev/null 2>&1 &

SERVER_PID=$!

# Ensure server is killed when this script exits (Ctrl+C, error, etc.)
cleanup() {
  echo ""
  info "Shutting down HTTP server (PID ${SERVER_PID}) ..."
  kill "${SERVER_PID}" 2>/dev/null || true
  wait "${SERVER_PID}" 2>/dev/null || true
  success "Server stopped."
  echo ""
}
trap cleanup EXIT

# Wait briefly for the server to be ready
sleep 0.5

# Verify server is actually running
if ! kill -0 "${SERVER_PID}" 2>/dev/null; then
  error "HTTP server failed to start."
  exit 1
fi

success "HTTP server running at ${FAQ_URL}"
echo ""

# ── Open browser ──────────────────────────────────────────────────
if [ "${BROWSER_TYPE}" != "none" ]; then
  info "Opening ${FAQ_URL} in ${BROWSER_BIN} ..."
  echo ""

  if [ "${BROWSER_TYPE}" = "firefox" ]; then
    if [ "${KIOSK}" = "true" ]; then
      "${BROWSER_BIN}" --kiosk "${FAQ_URL}" &>/dev/null &
    else
      "${BROWSER_BIN}" "${FAQ_URL}" &>/dev/null &
    fi

  else
    # Chrome / Chromium — no --allow-file-access-from-files needed
    # because we are serving over HTTP, not file://
    CHROME_FLAGS=(
      "--no-first-run"
      "--disable-translate"
      "--disable-infobars"
    )
    if [ "${KIOSK}" = "true" ]; then
      CHROME_FLAGS+=("--kiosk")
    fi
    "${BROWSER_BIN}" "${CHROME_FLAGS[@]}" "${FAQ_URL}" &>/dev/null &
  fi

  success "Browser launched"
fi

# ── Running — wait for Ctrl+C ─────────────────────────────────────
echo ""
echo "================================================================"
echo " FAQ is running at: ${FAQ_URL}"
echo " Admin stats at:    ${FAQ_URL}#admin"
echo ""
echo " Press Ctrl+C to stop."
echo "================================================================"
echo ""

# Wait for the server process — keeps the script alive until Ctrl+C
wait "${SERVER_PID}"
