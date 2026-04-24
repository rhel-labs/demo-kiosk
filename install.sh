#!/bin/bash
# Demo Kiosk Installer - curl|bash installer for event laptops
set -euo pipefail

success() { echo -e "\033[0;32m  ✓\033[0m $*"; }
error()   { echo -e "\033[0;31m  ✗\033[0m $*"; }

echo "Installing Demo Kiosk..."

# Check for podman (only critical dependency)
if ! command -v podman >/dev/null; then
    error "This laptop cannot run the kiosk (missing container support)"
    echo "Try a different laptop"
    exit 1
fi

# Check for existing installation and prompt for overwrite
if podman quadlet list 2>/dev/null | grep -q demo-kiosk; then
    echo "Demo Kiosk is already installed. This may be a working installation."
    echo ""
    read -p "Replace with latest version? [y/N]: " -n 1 -r </dev/tty
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Installation cancelled."
        echo ""
        echo "Check your existing kiosk at: http://localhost:8181"
        echo "If content is wrong, re-run installer and choose 'y' to replace."
        exit 0
    fi
    # Remove existing installation before reinstalling
    systemctl --user stop demo-kiosk 2>/dev/null || true
    podman quadlet rm demo-kiosk 2>/dev/null || true
fi

# Install quadlet (suppress errors for internal script logic)
if ! podman quadlet install https://raw.githubusercontent.com/rhel-labs/demo-kiosk/refs/heads/fix/healthcheck-oci-cleanup/demo-kiosk.container >/dev/null 2>&1; then
    # Check if it actually installed despite error
    if ! podman quadlet list 2>/dev/null | grep -q demo-kiosk; then
        error "Installation failed - try a different laptop"
        exit 1
    fi
fi

# Start service (always needed after quadlet install)
if ! systemctl --user start demo-kiosk 2>/dev/null; then
    error "Service failed to start - try restarting this laptop"
    exit 1
fi

# Wait for container pull and startup
echo "Starting up (may take 20 seconds for first run)..."
sleep 15

# Verify using healthcheck
if podman healthcheck run demo-kiosk >/dev/null 2>&1; then
    success "Demo Kiosk running at: http://localhost:8181"
    exit 0
fi

# Healthcheck failed - provide diagnostic info and reinstall option
error "Installation completed but kiosk is not responding"
echo ""

# Quick diagnostic check
if curl -f -s --max-time 2 http://localhost:8181/ >/dev/null 2>&1; then
    if curl -s --max-time 2 http://localhost:8181/ 2>/dev/null | grep -q "window.FAQ = FAQ"; then
        echo "Demo kiosk appears to be running but not healthy"
    else
        echo "Another application is using port 8181"
    fi
else
    echo "No service responding on port 8181"
fi

echo ""
read -p "Try reinstalling? [y/N]: " -n 1 -r </dev/tty
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Reinstalling..."
    
    # Complete reinstall: stop, remove, fresh install, start
    systemctl --user stop demo-kiosk 2>/dev/null || true
    podman quadlet rm demo-kiosk 2>/dev/null || true
    
    if podman quadlet install https://raw.githubusercontent.com/rhel-labs/demo-kiosk/refs/heads/fix/healthcheck-oci-cleanup/demo-kiosk.container >/dev/null 2>&1; then
        systemctl --user start demo-kiosk 2>/dev/null
        sleep 10
        if podman healthcheck run demo-kiosk >/dev/null 2>&1; then
            success "Demo Kiosk running at: http://localhost:8181"
            exit 0
        fi
    fi
    
    error "Reinstall failed - try restarting laptop or use different one"
else
    echo "Check: http://localhost:8181"
    echo "If still not working, try restarting laptop or use different one"
fi

exit 1