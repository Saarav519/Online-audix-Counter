"""Central BASE_URL resolution for backend tests.

Order: REACT_APP_BACKEND_URL env var first, then frontend/.env in the repo,
then fail loudly. No hardcoded fallback URL — tests must never silently hit
a stale deployment.
"""
import os
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]


def _read_frontend_env():
    try:
        with open(REPO_ROOT / "frontend" / ".env") as f:
            for line in f:
                line = line.strip()
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    except OSError:
        return None
    return None


def get_base_url() -> str:
    url = os.environ.get("REACT_APP_BACKEND_URL") or _read_frontend_env() or ""
    url = url.rstrip("/")
    if not url:
        raise RuntimeError(
            "REACT_APP_BACKEND_URL is not configured — set the env var "
            "(or frontend/.env) to the base URL of a running backend"
        )
    return url


def get_admin_password() -> str:
    """Portal admin password for live-server tests.

    The server seeds the admin from ADMIN_INITIAL_PASSWORD, so the credential is
    per-deployment. ADMIN_PASSWORD overrides it here; the default keeps local
    runs against a seeded dev backend unchanged.
    """
    return os.environ.get("ADMIN_PASSWORD") or "admin123"


@pytest.fixture(scope="session")
def base_url():
    return get_base_url()


@pytest.fixture(scope="session")
def admin_password():
    return get_admin_password()
