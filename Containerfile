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

# Content acquisition — YAML sources and branding needed by lint + generators.
# Copied before generators so they can read the author content.
# Containerfile is copied here (not earlier) so an edit to this file does not
# invalidate the content COPY layers above it.
#
# Media is intentionally copied AFTER the generators: a video swap does not
# invalidate lint or generation. The kiosk zip (Google Drive bundle) overlays
# real media files onto content/media/ and is also placed after generators for
# the same reason.
#
# Zip format: event teams provide kiosk-*.zip containing a nested kiosk/media/
# directory. cp -r kiosk/* content/ overlays media into the existing tree.
COPY --chown=65532:65532 content/faqs/     ./content/faqs/
COPY --chown=65532:65532 content/branding/ ./content/branding/
COPY --chown=65532:65532 Containerfile ./

# Lint all YAML content before generating JS — fails the build fast on content errors
RUN python3 build/lint-content.py

# generate-containerfile-page.py writes to app/containerfile.html
# build-faqs.py writes to content/faqs.js and content/branding.js
RUN python3 build/generate-containerfile-page.py \
 && python3 build/build-faqs.py

# Media and Google Drive bundle — after generators, decoupled from lint/generation.
COPY --chown=65532:65532 content/media/ ./content/media/
COPY --chown=65532:65532 kiosk*.zip ./kiosk-bundle.zip

RUN if [ -f kiosk-bundle.zip ] && [ -s kiosk-bundle.zip ]; then \
      echo "Overlaying media from Google Drive bundle..."; \
      unzip -q kiosk-bundle.zip && \
      cp -r kiosk/* content/ && \
      rm -rf kiosk kiosk-bundle.zip; \
      echo "Media overlay complete"; \
    else \
      echo "No media bundle found - using local media files"; \
      rm -f kiosk-bundle.zip; \
    fi && \
    echo "Content loaded: $(find content/faqs -name '*.yaml' ! -name '_*' | wc -l) FAQ files"

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
# pip3 install in the builder stage writes to /usr/local/lib/python3.14/site-packages.
COPY --from=builder --chown=65532:65532 \
     /usr/local/lib/python3.14/site-packages/yaml \
     /usr/local/lib/python3.14/site-packages/yaml
COPY --from=builder --chown=65532:65532 \
     /usr/local/lib/python3.14/site-packages/yamllint \
     /usr/local/lib/python3.14/site-packages/yamllint
COPY --from=builder --chown=65532:65532 \
     /usr/local/lib/python3.14/site-packages/pathspec \
     /usr/local/lib/python3.14/site-packages/pathspec

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
