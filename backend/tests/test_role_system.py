"""
Prompt 3 — Role System Backend Tests (admin vs supervisor)

Covers:
  - Migration idempotency (viewer→supervisor, missing role→supervisor, admin preserved)
  - /me endpoint (401 / 403 disabled / 403 unapproved / 200 valid)
  - Admin-only gating on approve / reject / toggle-active / role / delete (401 / 403 / 200)
  - /role endpoint validation (admin / supervisor / viewer-alias / invalid)
  - Shared data endpoints (users list, audit-logs search, reco-adjustments) accessible to both roles
  - End-to-end: supervisor promoted to admin gains user-management powers immediately
  - Default admin row protected by migrate_legacy_roles
"""
import os
import sys
import uuid
import asyncio
import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

# Ensure /app/backend is importable (for `shared.auth_middleware`)
_BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://counter-app-demo-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api/audit/portal"

from conftest import get_admin_password

ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = get_admin_password()

# ---------- module-level helpers (sync, using requests) ----------

def _post(path, **kw):
    return requests.post(f"{API}{path}", timeout=30, **kw)

def _get(path, **kw):
    return requests.get(f"{API}{path}", timeout=30, **kw)

def _put(path, **kw):
    return requests.put(f"{API}{path}", timeout=30, **kw)

def _del(path, **kw):
    return requests.delete(f"{API}{path}", timeout=30, **kw)


def _admin_id_from_db_sync():
    """Read admin user id directly from Mongo so we don't trip rate-limit
    on /login (which is 5 / 15 minutes)."""
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    if not mongo_url or not db_name:
        # Fallback: try the /users list endpoint
        r = _get("/users")
        if r.status_code == 200:
            for u in r.json():
                if u.get("username") == "admin":
                    return u["id"]
        return None

    async def _go():
        client = AsyncIOMotorClient(mongo_url)
        try:
            doc = await client[db_name].portal_users.find_one(
                {"username": "admin"}, {"_id": 0, "id": 1, "role": 1}
            )
            return doc
        finally:
            client.close()
    doc = asyncio.run(_go())
    return doc.get("id") if doc else None


ADMIN_ID = _admin_id_from_db_sync()


# ---------- fixtures ----------

@pytest.fixture(scope="module")
def admin_id():
    if not ADMIN_ID:
        pytest.skip("Default admin user not seeded — cannot run role tests")
    return ADMIN_ID


@pytest.fixture(scope="module")
def admin_headers(admin_id):
    return {"X-User-Id": admin_id, "X-Username": "admin"}


def _register_user(prefix="TEST_role"):
    uname = f"{prefix}_{uuid.uuid4().hex[:8]}"
    r = _post("/register", json={"username": uname, "password": "passwd123"})
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    data = r.json()
    return {"id": data["user_id"], "username": uname, "password": "passwd123"}


@pytest.fixture
def new_supervisor(admin_headers):
    """Create and approve a fresh supervisor user. Teardown deletes it."""
    u = _register_user("TEST_sup")
    # Approve so they can call /me
    r = _put(f"/users/{u['id']}/approve", headers=admin_headers)
    assert r.status_code == 200, f"approve failed: {r.text}"
    yield u
    # Teardown
    _del(f"/users/{u['id']}", headers=admin_headers)


@pytest.fixture
def pending_user():
    """Registered but NOT approved."""
    u = _register_user("TEST_pending")
    yield u
    # cleanup via admin
    if ADMIN_ID:
        _del(f"/users/{u['id']}", headers={"X-User-Id": ADMIN_ID})


# ============================================================
# 1. Migration tests (run direct on DB)
# ============================================================
def _run_async(coro):
    """Run an async coroutine in a fresh event loop (pytest-asyncio not installed)."""
    return asyncio.run(coro)


class TestMigration:
    """migrate_legacy_roles idempotency + admin protection (sync wrappers around async ops)."""

    def test_admin_preserved_after_manual_role_corruption(self):
        from shared.auth_middleware import migrate_legacy_roles  # type: ignore

        async def _go():
            client = AsyncIOMotorClient(os.environ["MONGO_URL"])
            db = client[os.environ["DB_NAME"]]
            try:
                await db.portal_users.update_one(
                    {"username": "admin"}, {"$set": {"role": "viewer"}}
                )
                stats = await migrate_legacy_roles(db)
                admin = await db.portal_users.find_one({"username": "admin"}, {"_id": 0})
                return stats, admin
            finally:
                client.close()

        stats, admin = _run_async(_go())
        assert admin is not None
        assert admin.get("role") == "admin", f"admin role not restored: {admin.get('role')}"
        assert stats["viewer_to_supervisor"] >= 1

    def test_migration_idempotent_no_viewers_remaining(self):
        from shared.auth_middleware import migrate_legacy_roles  # type: ignore

        async def _go():
            client = AsyncIOMotorClient(os.environ["MONGO_URL"])
            db = client[os.environ["DB_NAME"]]
            try:
                await migrate_legacy_roles(db)
                stats2 = await migrate_legacy_roles(db)
                n_viewers = await db.portal_users.count_documents({"role": "viewer"})
                n_missing = await db.portal_users.count_documents({"role": {"$exists": False}})
                return stats2, n_viewers, n_missing
            finally:
                client.close()

        stats2, n_viewers, n_missing = _run_async(_go())
        assert stats2["viewer_to_supervisor"] == 0
        assert stats2["missing_to_supervisor"] == 0
        assert n_viewers == 0
        assert n_missing == 0

    def test_missing_role_migrated(self):
        from shared.auth_middleware import migrate_legacy_roles  # type: ignore

        async def _go():
            client = AsyncIOMotorClient(os.environ["MONGO_URL"])
            db = client[os.environ["DB_NAME"]]
            try:
                test_id = f"TEST_mig_{uuid.uuid4().hex[:8]}"
                await db.portal_users.insert_one({
                    "id": test_id, "username": test_id, "password_hash": "x",
                    "is_active": True, "is_approved": False,
                })  # no 'role' field
                stats = await migrate_legacy_roles(db)
                doc = await db.portal_users.find_one({"id": test_id}, {"_id": 0})
                await db.portal_users.delete_one({"id": test_id})
                return stats, doc
            finally:
                client.close()

        stats, doc = _run_async(_go())
        assert stats["missing_to_supervisor"] >= 1
        assert doc["role"] == "supervisor"


# ============================================================
# 2. /register defaults
# ============================================================
class TestRegister:
    def test_register_creates_supervisor_unapproved(self, admin_headers):
        u = _register_user("TEST_reg")
        try:
            r = _get("/users")
            assert r.status_code == 200
            row = next((x for x in r.json() if x["id"] == u["id"]), None)
            assert row is not None
            assert row["role"] == "supervisor"
            assert row["is_approved"] is False
            assert row["is_active"] is True
        finally:
            _del(f"/users/{u['id']}", headers=admin_headers)


# ============================================================
# 3. /me endpoint
# ============================================================
class TestMeEndpoint:
    def test_me_no_header_401(self):
        r = _get("/me")
        assert r.status_code == 401

    def test_me_invalid_id_401(self):
        r = _get("/me", headers={"X-User-Id": "nonexistent-id"})
        assert r.status_code == 401

    def test_me_valid_supervisor(self, new_supervisor):
        r = _get("/me", headers={"X-User-Id": new_supervisor["id"]})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["id"] == new_supervisor["id"]
        assert data["username"] == new_supervisor["username"]
        assert data["role"] == "supervisor"
        assert "password_hash" not in data  # sensitive field excluded

    def test_me_unapproved_403(self, pending_user):
        r = _get("/me", headers={"X-User-Id": pending_user["id"]})
        assert r.status_code == 403
        assert "approval" in r.json().get("detail", "").lower()

    def test_me_disabled_403(self, new_supervisor, admin_headers):
        # Disable the user
        r = _put(f"/users/{new_supervisor['id']}/toggle-active", headers=admin_headers)
        assert r.status_code == 200
        try:
            r = _get("/me", headers={"X-User-Id": new_supervisor["id"]})
            assert r.status_code == 403
            assert "disabled" in r.json().get("detail", "").lower()
        finally:
            # Re-enable so teardown can delete
            _put(f"/users/{new_supervisor['id']}/toggle-active", headers=admin_headers)

    def test_me_admin_returns_admin_role(self, admin_headers):
        r = _get("/me", headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["role"] == "admin"


# ============================================================
# 4. Admin-only endpoints — gating
# ============================================================
class TestAdminGating:
    ENDPOINTS = [
        ("PUT", "/users/{id}/approve"),
        ("PUT", "/users/{id}/reject"),
        ("PUT", "/users/{id}/toggle-active"),
    ]

    def test_no_header_401_on_admin_endpoints(self, new_supervisor):
        # approve
        r = _put(f"/users/{new_supervisor['id']}/approve")
        assert r.status_code == 401
        # reject
        r = _put(f"/users/{new_supervisor['id']}/reject")
        assert r.status_code == 401
        # toggle-active
        r = _put(f"/users/{new_supervisor['id']}/toggle-active")
        assert r.status_code == 401
        # role
        r = _put(f"/users/{new_supervisor['id']}/role", json={"role": "supervisor"})
        assert r.status_code == 401
        # delete
        r = _del(f"/users/{new_supervisor['id']}")
        assert r.status_code == 401

    def test_supervisor_blocked_with_403(self, new_supervisor, admin_headers):
        # create a target user that supervisor will try to manage
        target = _register_user("TEST_target")
        try:
            sup_h = {"X-User-Id": new_supervisor["id"]}
            for verb, path in [
                ("PUT", f"/users/{target['id']}/approve"),
                ("PUT", f"/users/{target['id']}/reject"),
                ("PUT", f"/users/{target['id']}/toggle-active"),
            ]:
                r = _put(path, headers=sup_h)
                assert r.status_code == 403, f"{path}: {r.status_code} {r.text}"
                assert "admin" in r.json().get("detail", "").lower()
            # role
            r = _put(f"/users/{target['id']}/role", json={"role": "admin"}, headers=sup_h)
            assert r.status_code == 403
            # delete
            r = _del(f"/users/{target['id']}", headers=sup_h)
            assert r.status_code == 403
        finally:
            _del(f"/users/{target['id']}", headers=admin_headers)

    def test_admin_can_approve_reject_toggle(self, admin_headers):
        target = _register_user("TEST_admin_actions")
        try:
            # Approve
            r = _put(f"/users/{target['id']}/approve", headers=admin_headers)
            assert r.status_code == 200
            # Reject
            r = _put(f"/users/{target['id']}/reject", headers=admin_headers)
            assert r.status_code == 200
            # Toggle active
            r = _put(f"/users/{target['id']}/toggle-active", headers=admin_headers)
            assert r.status_code == 200
            assert r.json()["is_active"] is False
        finally:
            _del(f"/users/{target['id']}", headers=admin_headers)


# ============================================================
# 5. /role endpoint validation
# ============================================================
class TestRoleEndpoint:
    def test_invalid_role_400(self, admin_headers, new_supervisor):
        r = _put(f"/users/{new_supervisor['id']}/role",
                 json={"role": "random"}, headers=admin_headers)
        assert r.status_code == 400
        detail = r.json().get("detail", "").lower()
        assert "admin" in detail and "supervisor" in detail

    def test_viewer_alias_accepted(self, admin_headers, new_supervisor):
        # First bump the user to 'admin' so that setting 'viewer' (→supervisor)
        # actually changes the doc (modified_count>0, otherwise endpoint returns 404).
        _put(f"/users/{new_supervisor['id']}/role",
             json={"role": "admin"}, headers=admin_headers)
        r = _put(f"/users/{new_supervisor['id']}/role",
                 json={"role": "viewer"}, headers=admin_headers)
        assert r.status_code == 200, r.text
        # Verify DB has 'supervisor' not 'viewer'
        users = _get("/users").json()
        row = next(u for u in users if u["id"] == new_supervisor["id"])
        assert row["role"] == "supervisor"

    def test_set_role_admin(self, admin_headers, new_supervisor):
        r = _put(f"/users/{new_supervisor['id']}/role",
                 json={"role": "admin"}, headers=admin_headers)
        assert r.status_code == 200
        users = _get("/users").json()
        row = next(u for u in users if u["id"] == new_supervisor["id"])
        assert row["role"] == "admin"

    def test_set_role_supervisor(self, admin_headers, new_supervisor):
        # first bump to admin
        _put(f"/users/{new_supervisor['id']}/role",
             json={"role": "admin"}, headers=admin_headers)
        # now back down
        r = _put(f"/users/{new_supervisor['id']}/role",
                 json={"role": "supervisor"}, headers=admin_headers)
        assert r.status_code == 200
        users = _get("/users").json()
        row = next(u for u in users if u["id"] == new_supervisor["id"])
        assert row["role"] == "supervisor"


# ============================================================
# 6. Shared data-access endpoints (both roles allowed)
# ============================================================
class TestSharedAccess:
    def test_users_list_accessible_to_supervisor(self, new_supervisor):
        # /users currently has no auth wrapper — anyone can read.
        # But supervisor MUST still be able to read.
        r = _get("/users", headers={"X-User-Id": new_supervisor["id"]})
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_audit_logs_search_accessible_to_supervisor(self, new_supervisor):
        r = _post("/audit-logs/search",
                  headers={"X-User-Id": new_supervisor["id"]},
                  json={"limit": 5})
        # endpoint not admin-gated → should be 200 (possibly empty list)
        assert r.status_code in (200, 422), r.text

    def test_reco_adjustments_accessible_to_supervisor(self, new_supervisor):
        # Just hit GET to validate no admin gate. Pick any client_id (404 ok).
        r = _get(f"/reco-adjustments/{uuid.uuid4()}",
                 headers={"X-User-Id": new_supervisor["id"]})
        # Endpoint not admin-gated. Acceptable: 200 (empty list)
        assert r.status_code == 200, r.text


# ============================================================
# 7. End-to-end: register → approve → role-promote → live powers
# ============================================================
class TestE2EPromotion:
    def test_supervisor_promoted_to_admin_can_approve(self, admin_headers):
        alice = _register_user("TEST_alice")
        bob = _register_user("TEST_bob")
        try:
            # admin approves alice
            r = _put(f"/users/{alice['id']}/approve", headers=admin_headers)
            assert r.status_code == 200

            # alice (supervisor) tries to approve bob — should 403
            alice_h = {"X-User-Id": alice["id"]}
            r = _put(f"/users/{bob['id']}/approve", headers=alice_h)
            assert r.status_code == 403

            # admin promotes alice to admin
            r = _put(f"/users/{alice['id']}/role",
                     json={"role": "admin"}, headers=admin_headers)
            assert r.status_code == 200

            # alice immediately gains approve powers (no re-login needed)
            r = _put(f"/users/{bob['id']}/approve", headers=alice_h)
            assert r.status_code == 200

            # verify bob is now approved + still supervisor
            bob_row = next(u for u in _get("/users").json() if u["id"] == bob["id"])
            assert bob_row["is_approved"] is True
            assert bob_row["role"] == "supervisor"
        finally:
            _del(f"/users/{alice['id']}", headers=admin_headers)
            _del(f"/users/{bob['id']}", headers=admin_headers)


# ============================================================
# 8. Edge: 404 on admin endpoints for missing user
# ============================================================
class TestAdminEndpointEdgeCases:
    def test_approve_missing_user_404(self, admin_headers):
        r = _put(f"/users/{uuid.uuid4()}/approve", headers=admin_headers)
        assert r.status_code == 404

    def test_delete_admin_username_forbidden(self, admin_headers, admin_id):
        r = _del(f"/users/{admin_id}", headers=admin_headers)
        # endpoint returns 400 "Cannot delete the default admin user"
        assert r.status_code == 400
