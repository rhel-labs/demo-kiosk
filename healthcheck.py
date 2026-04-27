#!/usr/bin/env python3
"""Demo Kiosk Healthcheck - Validates stable functional components"""

import http.client
import sys
import signal
from contextlib import contextmanager


@contextmanager
def timeout(seconds):
    def timeout_handler(signum, frame):
        raise TimeoutError("Healthcheck timed out")

    old_handler = signal.signal(signal.SIGALRM, timeout_handler)
    signal.alarm(seconds)
    try:
        yield
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, old_handler)


def healthcheck():
    try:
        with timeout(5):
            conn = http.client.HTTPConnection("127.0.0.1", 8181, timeout=3)
            conn.request("GET", "/")
            response = conn.getresponse()

            if response.status != 200:
                return 1

            # Validate our custom serve.py (unique cache header)
            if response.getheader("Cache-Control") != "no-store":
                return 1

            # Validate FAQ application architecture is loaded
            content = response.read().decode("utf-8", errors="ignore")

            # Check stable functional components
            required_components = [
                "window.FAQ = FAQ;",  # Core application global
                "FAQ.register(",  # FAQ system functionality
            ]

            for component in required_components:
                if component not in content:
                    return 1

            conn.close()
            return 0

    except Exception:
        return 1


if __name__ == "__main__":
    sys.exit(healthcheck())
