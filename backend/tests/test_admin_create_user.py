"""Admin-created portal users.

Self-registration was the only way an account could come into existence, and it
lands unapproved — so the portal offered an admin no way to produce a user that
could be picked as an assignee. These cover POST /portal/users.

Style note: the admin id is read straight from Mongo (with a /users fallback)
rather than through /login, which is rate limited to 5 per 15 minutes — the same
approach test_role_system.py uses.
"""
import asyncio
import os
import uuid

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

from conftest import get_base_url

API = f"{get_base_url()}/api/audit/portal"


def _post(path, **kw):
    return requests.post(f"{API}{path}", timeout=30, **kw)


def _del(path, **kw):
    return requests.delete(f"{API}{path}", timeout=30, **kw)


def _get(path, **kw):
    return requests.get(f"{API}{path}", timeout=30, **kw)


def _admin_id_from_db_sync():
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    if not mongo_url or not db_name:
        r = _get("/users")
        if r.status_code == 200:
            for u in r.json():
                if u.get("username") == "admin":
                    return u["id"]
        return None

    async def _go():
        client = AsyncIOMotorClient(mongo_url)
        try:
            return await client[db_name].portal_users.find_one(
                {"username": "admin"}, {"_id": 0, "id": 1}
            )
        finally:
            client.close()

    doc = asyncio.run(_go())
    return doc.get("id") if doc else None


ADMIN_ID = _admin_id_from_db_sync()


@pytest.fixture(scope="module")
def admin_headers():
    if not ADMIN_ID:
        pytest.skip("Default admin user not seeded — cannot run these tests")
    return {"X-User-Id": ADMIN_ID, "X-Username": "admin"}


def _username():
    return f"TEST_mk_{uuid.uuid4().hex[:8]}"


@pytest.fixture
def created_user(admin_headers):
    """A user made through the endpoint under test. Teardown deletes it."""
    username = _username()
    r = _post("/users", headers=admin_headers,
              json={"username": username, "password": "passwd123", "role": "supervisor"})
    assert r.status_code == 200, r.text
    user = r.json()["user"]
    yield {**user, "password": "passwd123"}
    _del(f"/users/{user['id']}", headers=admin_headers)


def test_created_user_is_approved_active_and_assignable(admin_headers, created_user):
    """The whole point: no second approval step before the assignee dropdown
    will show them."""
    assert created_user["is_approved"] is True
    assert created_user["is_active"] is True
    assert created_user["role"] == "supervisor"
    assert "password_hash" not in created_user

    assignable = _get("/assignments/users", headers=admin_headers)
    assert assignable.status_code == 200, assignable.text
    assert any(u["id"] == created_user["id"] for u in assignable.json()["users"])


def test_created_user_can_log_in(created_user):
    r = _post("/login", json={"username": created_user["username"], "password": created_user["password"]})
    assert r.status_code == 200, r.text
    assert r.json()["user"]["username"] == created_user["username"]


def test_admin_role_can_be_created(admin_headers):
    r = _post("/users", headers=admin_headers,
              json={"username": _username(), "password": "passwd123", "role": "admin"})
    assert r.status_code == 200, r.text
    user = r.json()["user"]
    try:
        assert user["role"] == "admin"
    finally:
        _del(f"/users/{user['id']}", headers=admin_headers)


def test_duplicate_username_is_rejected_case_insensitively(admin_headers, created_user):
    r = _post("/users", headers=admin_headers,
              json={"username": created_user["username"].upper(), "password": "passwd123"})
    assert r.status_code == 400, r.text
    assert "exists" in r.json()["detail"].lower()


@pytest.mark.parametrize("username,password,role,expected", [
    ("   ", "passwd123", "supervisor", "username"),
    (None, "abc", "supervisor", "4 characters"),
    (None, "passwd123", "superuser", "role"),
])
def test_invalid_payloads_are_rejected(admin_headers, username, password, role, expected):
    payload = {"username": _username() if username is None else username,
               "password": password, "role": role}
    r = _post("/users", headers=admin_headers, json=payload)
    assert r.status_code == 400, r.text
    assert expected in r.json()["detail"].lower()


def test_supervisor_cannot_create_users(admin_headers, created_user):
    """A supervisor must not be able to mint accounts."""
    sup_headers = {"X-User-Id": created_user["id"], "X-Username": created_user["username"]}
    r = _post("/users", headers=sup_headers, json={"username": _username(), "password": "passwd123"})
    assert r.status_code == 403, r.text


def test_unauthenticated_request_is_rejected():
    r = _post("/users", json={"username": _username(), "password": "passwd123"})
    assert r.status_code == 401, r.text
