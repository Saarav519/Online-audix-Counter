"""Deployment-config regression tests (Railway phase 1).

Live-server tests guard the SPA catch-all in server.py: if it were registered
before the API routers, or its api/ guard were wrong, every API call would
return index.html and both the portal and scanner sync would die silently.

Static tests guard against hardcoded /app/ paths and a wildcard CORS config.
"""
import os
from pathlib import Path

import pytest
import requests

BACKEND_DIR = Path(__file__).resolve().parents[1]


def test_health(base_url):
    r = requests.get(f"{base_url}/health", timeout=30)
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "healthy"


def test_portal_api_returns_json_not_html(base_url):
    r = requests.get(f"{base_url}/api/audit/portal/clients", timeout=30)
    assert r.status_code == 200
    ctype = r.headers.get("Content-Type", "")
    assert "application/json" in ctype, f"expected JSON, got {ctype!r}"
    assert "text/html" not in ctype


def test_unknown_api_route_is_404_json_not_spa(base_url):
    r = requests.get(f"{base_url}/api/definitely-not-a-real-route", timeout=30)
    assert r.status_code == 404
    ctype = r.headers.get("Content-Type", "")
    assert "application/json" in ctype, f"expected JSON 404, got {ctype!r}"
    assert not r.text.lstrip().lower().startswith("<!doctype"), "unknown /api/ route fell through to index.html"


def test_spa_fallback_serves_portal_route(base_url):
    r = requests.get(f"{base_url}/portal/dashboard", timeout=30)
    assert r.status_code == 200
    assert "text/html" in r.headers.get("Content-Type", "")


def test_sync_endpoint_reachable_not_html(base_url):
    r = requests.get(f"{base_url}/api/audit/sync/master-products", params={"client_id": "x"}, timeout=30)
    ctype = r.headers.get("Content-Type", "")
    assert "text/html" not in ctype, f"sync endpoint shadowed by SPA catch-all (got {ctype!r})"
    assert r.status_code < 500


def test_no_hardcoded_app_paths_in_backend():
    offenders = []
    for pattern in ("*.py", "shared/*.py"):
        for f in sorted(BACKEND_DIR.glob(pattern)):
            for i, line in enumerate(f.read_text(encoding="utf-8").splitlines(), 1):
                if "/app/" in line:
                    offenders.append(f"{f.relative_to(BACKEND_DIR)}:{i}: {line.strip()}")
    assert not offenders, "hardcoded /app/ paths remain:\n" + "\n".join(offenders)


def test_cors_origins_not_wildcard():
    cors = os.environ.get("CORS_ORIGINS")
    if cors is None:
        pytest.skip("CORS_ORIGINS not set in this environment")
    origins = [o.strip() for o in cors.split(",")]
    assert "*" not in origins, "CORS_ORIGINS must not contain '*' (allow_credentials=True makes browsers reject it)"
