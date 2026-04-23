# ── Stage 1: asset-builder ───────────────────────────────────────
# node:22-alpine installs npm-managed third-party libraries and
# extracts only the runtime distribution files into dist/.
# Nothing from this stage enters the Python builder — it feeds the
# runtime stage directly, keeping the asset layer independent of
# Python tooling changes.
FROM node:22-alpine AS asset-builder

WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Extract runtime distribution files from node_modules into dist/.
# pdf.min.js is derived from pdf.min.mjs by stripping its trailing
# ES module export so it can be loaded as a classic <script> tag;
# the IIFE already sets globalThis.pdfjsLib so the export is the
# only thing preventing classic execution.
RUN mkdir -p dist/assets/fonts dist/assets/pficon && \
    cp node_modules/@patternfly/patternfly/patternfly.min.css dist/ && \
    cp -r node_modules/@patternfly/patternfly/assets/fonts dist/assets/ && \
    cp -r node_modules/@patternfly/patternfly/assets/pficon dist/assets/ && \
    cp node_modules/asciinema-player/dist/bundle/asciinema-player.min.js dist/assets/ && \
    cp node_modules/asciinema-player/dist/bundle/asciinema-player.css    dist/assets/ && \
    cp node_modules/pdfjs-dist/build/pdf.min.mjs        dist/assets/ && \
    cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs dist/assets/ && \
    node -e " \
        const fs  = require('fs'); \
        const src = 'node_modules/pdfjs-dist/build/pdf.min.mjs'; \
        const code = fs.readFileSync(src, 'utf-8'); \
        const idx  = code.lastIndexOf('export{'); \
        if (idx < 0) { console.error('export{ not found in ' + src); process.exit(1); } \
        fs.writeFileSync('dist/assets/pdf.min.js', code.slice(0, idx)); \
    "


# ── Stage 2: builder ─────────────────────────────────────────────
# hummingbird python:3.14-builder has a shell and pip; it is the
# purpose-built counterpart to the distroless runtime image.
# Used only to run the generators — nothing else carries forward.
# Uses default /tmp as working directory.
FROM quay.io/hummingbird/python:3.14-builder AS builder

# Install build-time dependencies (unzip for content bundles; pip handles Python deps)
USER root
RUN dnf install -y unzip && dnf clean all

USER 65532
# Copy requirements first so pip install is a separate cached layer
COPY --chown=65532:65532 build/requirements.txt ./build/
RUN pip3 install --quiet -r build/requirements.txt

# App source — templates read by generators.
# (.containerignore excludes library files; only app source enters from build context)
COPY --chown=65532:65532 app/ ./app/

# Build tools
COPY --chown=65532:65532 build/ ./build/

# generate-containerfile-page.py reads only the Containerfile — run it early
# so Containerfile edits don't invalidate the content layers that follow.
# Writes to app/containerfile.html.
COPY --chown=65532:65532 Containerfile ./
RUN python3 build/generate-containerfile-page.py

# Content acquisition — local YAML, branding, and media.
# The kiosk zip (Google Drive bundle) overlays the full content/ tree, so
# build-faqs.py and lint must run after the bundle extraction to see the
# final YAML and media rather than local placeholders.
#
# Zip format: Google Drive exports kiosk-*.zip with a timestamped wrapper
# directory (kiosk-<timestamp>/kiosk/). find locates kiosk/ at any depth so
# both that layout and a flat kiosk/ at the zip root are handled.
COPY --chown=65532:65532 content/faqs/     ./content/faqs/
COPY --chown=65532:65532 content/branding/ ./content/branding/
COPY --chown=65532:65532 content/media/    ./content/media/
RUN --mount=type=bind,source=.,target=/buildctx \
    ZIP=$(ls /buildctx/kiosk*.zip 2>/dev/null | head -1); \
    if [ -n "$ZIP" ]; then cp "$ZIP" ./kiosk-bundle.zip; else touch kiosk-bundle.zip; fi

RUN if [ -f kiosk-bundle.zip ] && [ -s kiosk-bundle.zip ]; then \
      echo "Overlaying content from Google Drive bundle..."; \
      unzip -q kiosk-bundle.zip && \
      KIOSK_DIR=$(find . -maxdepth 2 -name kiosk -type d | head -1) && \
      cp -r "$KIOSK_DIR"/* content/ && \
      rm -rf kiosk kiosk-* kiosk-bundle.zip; \
      echo "Bundle overlay complete"; \
    else \
      echo "No bundle found - using local content files"; \
      rm -f kiosk-bundle.zip; \
    fi && \
    echo "Content loaded: $(find content/faqs -name '*.yaml' ! -name '_*' | wc -l) FAQ files"

# Generate faqs.js and branding.js from the final content state, then lint.
# Both steps see bundle-provided YAML and media if a bundle was present.
RUN python3 build/build-faqs.py
RUN python3 build/lint-content.py

# Author-facing files for the extras bundle.
# Copied here (builder only) so they are not present in the runtime stage
# except as part of the tarball — /srv/faq stays clean.
COPY --chown=65532:65532 AUTHORING.md        ./
COPY --chown=65532:65532 demo-kiosk.container ./
COPY --chown=65532:65532 package.json         ./
COPY --chown=65532:65532 start.sh             ./

# Bundle all author tooling into a single tarball for `podman cp` extraction.
# content/faqs.js is excluded — authors generate it themselves after editing.
# Uses python3 tarfile (stdlib) — tar is not available in this builder image.
RUN python3 - << 'EOF'
import tarfile, os

WORKDIR = "/tmp"
EXCLUDE = {"content/faqs/faqs.js"}
MEMBERS = [
    "build",
    "app/faqs",
    "content/faqs",
    "AUTHORING.md",
    "demo-kiosk.container",
    "package.json",
    "start.sh",
]

def filter_fn(info):
    return None if info.name in EXCLUDE else info

with tarfile.open(os.path.join(WORKDIR, "extras.tar.gz"), "w:gz") as tf:
    for member in MEMBERS:
        tf.add(os.path.join(WORKDIR, member), arcname=member, filter=filter_fn)
EOF


# ── Stage 3: runtime ─────────────────────────────────────────────
# hummingbird python:3.14 — distroless, no shell, no package manager.
# Runs as UID 65532. WorkingDir defaults to /tmp; overridden below.
FROM quay.io/hummingbird/python:3.14

# Set WORKDIR before COPY so relative destinations resolve to /srv/faq.
WORKDIR /srv/faq

# Layers ordered stable → volatile to minimise bytes pulled on update.

# Python packages needed by lint-content.py.
# Copied from the builder stage — distroless has no pip or package manager.
# pip3 install runs as UID 65532 (home=/tmp), so packages land in
# /tmp/.local/lib/python3.14/site-packages — the user site dir for both stages.
COPY --from=builder --chown=65532:65532 \
     /tmp/.local/lib/python3.14/site-packages/yaml \
     /tmp/.local/lib/python3.14/site-packages/yaml
COPY --from=builder --chown=65532:65532 \
     /tmp/.local/lib/python3.14/site-packages/_yaml \
     /tmp/.local/lib/python3.14/site-packages/_yaml
COPY --from=builder --chown=65532:65532 \
     /tmp/.local/lib/python3.14/site-packages/yamllint \
     /tmp/.local/lib/python3.14/site-packages/yamllint
COPY --from=builder --chown=65532:65532 \
     /tmp/.local/lib/python3.14/site-packages/pathspec \
     /tmp/.local/lib/python3.14/site-packages/pathspec

# Linter script — available for manual invocation against a mounted content directory.
# Usage: podman run --rm -v ./content:/mnt/content:ro IMAGE \
#          python3 /srv/faq/lint-content.py --content-dir /mnt/content
COPY --from=builder --chown=65532:65532 /tmp/build/lint-content.py ./lint-content.py

# Third-party libraries from the asset-builder npm stage.
# These change only when package.json version pins are bumped — stable across
# all feature and content updates.
# patternfly.min.css must sit at the app root; its @font-face paths are relative here.
COPY --from=asset-builder --chown=65532:65532 /build/dist/patternfly.min.css ./
COPY --from=asset-builder --chown=65532:65532 /build/dist/assets/ ./assets/

# Large media files — campaign cadence, stable during a conference run.
COPY --from=builder --chown=65532:65532 /tmp/content/media/ ./content/media/

# First-party app source — feature cadence.
# (.containerignore excludes library files; logo-summit.svg and pdf-init.mjs come through here)
COPY --chown=65532:65532 app/ ./
COPY --from=builder --chown=65532:65532 /tmp/app/containerfile.html ./

# FAQ content — changes with demo updates.
COPY --from=builder --chown=65532:65532 /tmp/content/faqs/   ./content/faqs/
COPY --from=builder --chown=65532:65532 /tmp/content/faqs.js ./content/

# Branding — most volatile; changes per event even when demo content is stable.
COPY --from=builder --chown=65532:65532 /tmp/content/branding/    ./content/branding/
COPY --from=builder --chown=65532:65532 /tmp/content/branding.js  ./content/

# Extras bundle — not part of the served app; lives at /extras/ for `podman cp`.
# See AUTHORING.md for extraction instructions.
COPY --from=builder --chown=65532:65532 /tmp/extras.tar.gz /extras/extras.tar.gz

EXPOSE 8181

# serve.py (like python3 -m http.server) does not handle SIGTERM; SIGKILL stops it immediately.
STOPSIGNAL SIGKILL

# No shell in distroless — CMD must be JSON exec form.
CMD ["python3", "/srv/faq/serve.py", "8181", \
     "--directory", "/srv/faq"]
