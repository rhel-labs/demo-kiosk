#!/usr/bin/env bash
# test-upload.sh — end-to-end upload API smoke test
#
# Starts a fresh container, waits for the server, POSTs a zip bundle to
# /api/upload/zip, and verifies the response is a success JSON.  Prints
# container logs on any failure so the root cause is visible immediately.
#
# Usage:
#   ./test-upload.sh [path/to/kiosk.zip]
#   UPLOAD_ZIP=/path/to/kiosk.zip make test-upload
#
# Environment:
#   IMAGE      — image to test (default: quay.io/mmicene/demo-kiosk:latest)
#   PORT       — host port to bind  (default: 8181)

set -euo pipefail

PORT="${PORT:-8181}"
IMAGE="${IMAGE:-quay.io/mmicene/demo-kiosk:latest}"
ZIP="${UPLOAD_ZIP:-${1:-kiosk.zip}}"

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; RESET='\033[0m'
pass() { echo -e "${GREEN}  PASS${RESET}  $*"; }
fail() { echo -e "${RED}  FAIL${RESET}  $*" >&2; }
info() { echo -e "${CYAN}  →${RESET}    $*"; }

if [[ ! -f "$ZIP" ]]; then
    fail "Zip not found: $ZIP"
    echo "  Usage: $0 /path/to/kiosk.zip"
    echo "  Or:    UPLOAD_ZIP=/path/to/kiosk.zip make test-upload"
    exit 1
fi

CNAME="demo-kiosk-upload-test-$$"

cleanup() {
    podman rm -f "$CNAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# ── Start container ───────────────────────────────────────────────
info "Starting container $CNAME from $IMAGE"
podman run -d --name "$CNAME" -p "127.0.0.1:${PORT}:8181" "$IMAGE" >/dev/null

# ── Wait for /api/status ──────────────────────────────────────────
info "Waiting for server on port $PORT"
READY=0
for i in $(seq 1 30); do
    if curl -sf "http://127.0.0.1:${PORT}/api/status" >/dev/null 2>&1; then
        READY=1
        break
    fi
    sleep 1
done

if [[ $READY -ne 1 ]]; then
    fail "Server did not become ready within 30 s"
    echo "--- Container logs ---"
    podman logs "$CNAME"
    exit 1
fi
info "Server ready"

# ── Upload ────────────────────────────────────────────────────────
ZIP_SIZE=$(du -sh "$ZIP" | cut -f1)
info "Uploading $ZIP  ($ZIP_SIZE)"

# curl flags:
#   -s         silent progress
#   -w '\n'    trailing newline so the JSON and status don't run together
#   --max-time 600   allow 10 min for very large bundles over loopback
#   no -f      we want the body even on HTTP error; we check it ourselves
RESP_FILE="/tmp/upload-resp-$$.json"
CURL_ERR="/tmp/upload-curl-err-$$.txt"

HTTP_CODE=$(curl -s -o "$RESP_FILE" \
    -w "%{http_code}" \
    --max-time 600 \
    -X POST "http://127.0.0.1:${PORT}/api/upload/zip" \
    -F "file=@${ZIP}" 2>"$CURL_ERR") || {
    fail "curl exited non-zero — connection dropped before any HTTP response"
    echo "  curl error: $(cat "$CURL_ERR")"
    echo "--- Container logs ---"
    podman logs "$CNAME"
    rm -f "$RESP_FILE" "$CURL_ERR"
    exit 1
}
rm -f "$CURL_ERR"

echo "  HTTP $HTTP_CODE"
python3 -m json.tool "$RESP_FILE" 2>/dev/null \
    || echo "  (non-JSON body: $(cat "$RESP_FILE"))"

# ── Check result ──────────────────────────────────────────────────
# Pass the response file as argv so stdin (used by the heredoc for the
# script itself) is not also needed to supply the data to check.
python3 - "$HTTP_CODE" "$RESP_FILE" <<'PYEOF'
import sys, json

http_code, path = sys.argv[1], sys.argv[2]
try:
    with open(path) as f:
        data = json.load(f)
except (json.JSONDecodeError, OSError) as e:
    print(f"  FAIL: could not parse response — {e}")
    sys.exit(1)

if 'error' in data:
    print(f"  FAIL: server returned error: {data['error']}")
    sys.exit(1)

if 'message' not in data:
    print("  FAIL: success response missing 'message' field")
    sys.exit(1)

if not http_code.startswith('2'):
    print(f"  FAIL: unexpected HTTP {http_code}")
    sys.exit(1)

fixes = data.get('order_fixes', [])
if fixes:
    print(f"  WARN: {len(fixes)} order value(s) auto-fixed")

print(f"  OK: {data['message']}")
PYEOF
STATUS=$?
rm -f "$RESP_FILE"
exit $STATUS

pass "Upload round-trip succeeded"
