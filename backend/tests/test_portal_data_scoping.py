"""A portal user only sees their own work.

Every portal list endpoint used to return everything in the database, so a
freshly approved user opened the portal onto somebody else's clients, reports,
sync logs and movement history. Visibility is now the clients you own
(clients.created_by) plus the ones an active assignment grants you.

Callers that send no identity — scanners, cron jobs, legacy scripts — are
deliberately left unscoped, so those cases are pinned here too.
"""
import asyncio
import os
import uuid

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

from conftest import get_base_url

API = f"{get_base_url()}/api/audit/portal"


def _get(path, **kw):
    return requests.get(f"{API}{path}", timeout=30, **kw)


def _post(path, **kw):
    return requests.post(f"{API}{path}", timeout=30, **kw)


def _del(path, **kw):
    return requests.delete(f"{API}{path}", timeout=30, **kw)


def _admin_id():
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
        cl = AsyncIOMotorClient(mongo_url)
        try:
            return await cl[db_name].portal_users.find_one({"username": "admin"}, {"_id": 0, "id": 1})
        finally:
            cl.close()

    doc = asyncio.run(_go())
    return doc.get("id") if doc else None


ADMIN_ID = _admin_id()


def _headers(user):
    return {"X-User-Id": user["id"], "X-Username": user["username"]}


@pytest.fixture(scope="module")
def admin_headers():
    if not ADMIN_ID:
        pytest.skip("Default admin user not seeded — cannot run these tests")
    return {"X-User-Id": ADMIN_ID, "X-Username": "admin"}


@pytest.fixture
def scene(admin_headers):
    """An owner with a client + session, and a freshly created user with nothing."""
    r = _post("/users", headers=admin_headers,
              json={"username": f"TEST_own_{uuid.uuid4().hex[:6]}",
                    "password": "passwd123", "role": "supervisor"})
    assert r.status_code == 200, r.text
    owner = r.json()["user"]

    r = _post("/users", headers=admin_headers,
              json={"username": f"TEST_new_{uuid.uuid4().hex[:6]}",
                    "password": "passwd123", "role": "supervisor"})
    assert r.status_code == 200, r.text
    fresh = r.json()["user"]

    code = f"SC{uuid.uuid4().hex[:6].upper()}"
    r = _post("/clients", headers=_headers(owner),
              json={"name": f"Scoped {code}", "code": code, "client_type": "store"})
    assert r.status_code == 200, r.text
    client_id = r.json()["client"]["id"]

    r = _post("/sessions", headers=_headers(owner),
              json={"client_id": client_id, "name": f"Scoped session {code}",
                    "variance_mode": "bin-wise", "start_date": "2026-01-01T00:00:00+00:00"})
    assert r.status_code == 200, r.text
    session_id = r.json()["session"]["id"]

    yield {"owner": owner, "fresh": fresh, "client_id": client_id, "session_id": session_id}

    _del(f"/clients/{client_id}")
    for u in (owner, fresh):
        _del(f"/users/{u['id']}", headers=admin_headers)


def _ids(rows):
    return {r.get("id") for r in rows}


def test_owner_sees_their_own_client(scene):
    r = _get("/clients", headers=_headers(scene["owner"]))
    assert r.status_code == 200, r.text
    assert scene["client_id"] in _ids(r.json())


def test_a_fresh_user_sees_no_clients_at_all(scene):
    """The reported bug: a newly approved user opened the portal onto every
    client in the database."""
    r = _get("/clients", headers=_headers(scene["fresh"]))
    assert r.status_code == 200, r.text
    assert scene["client_id"] not in _ids(r.json())


def test_a_fresh_user_sees_no_sessions(scene):
    r = _get("/sessions", headers=_headers(scene["fresh"]))
    assert r.status_code == 200, r.text
    assert scene["session_id"] not in _ids(r.json())


@pytest.mark.parametrize("path", ["/devices", "/conflicts", "/sync-logs/grouped", "/sync-logs/by-scanner"])
def test_fresh_user_list_endpoints_exclude_other_peoples_clients(scene, path):
    r = _get(path, headers=_headers(scene["fresh"]))
    assert r.status_code == 200, r.text
    body = r.json()
    assert all(row.get("client_id") != scene["client_id"] for row in body if isinstance(row, dict))


def test_fresh_user_movement_log_is_empty_for_someone_elses_client(scene):
    """Naming a client you cannot see must not become a way around the scope."""
    r = _post("/audit-logs/search", headers=_headers(scene["fresh"]),
              json={"client_id": scene["client_id"]})
    assert r.status_code == 200, r.text
    assert r.json()["total"] == 0


def test_dashboard_counts_are_per_user(scene):
    fresh = _get("/dashboard", headers=_headers(scene["fresh"]))
    owner = _get("/dashboard", headers=_headers(scene["owner"]))
    assert fresh.status_code == 200 and owner.status_code == 200
    assert fresh.json()["stats"]["clients"] == 0
    assert owner.json()["stats"]["clients"] >= 1


def test_an_assignment_opens_exactly_that_client(scene):
    r = _post("/assignments", headers=_headers(scene["owner"]), json={
        "module": "warehouse", "assigned_to": scene["fresh"]["id"],
        "session_id": scene["session_id"], "assignment_type": "full_session"})
    assert r.status_code == 200, r.text

    r = _get("/clients", headers=_headers(scene["fresh"]))
    assert scene["client_id"] in _ids(r.json()), "assignee should now see the client"


def test_a_caller_with_no_identity_is_not_scoped(scene):
    """Scanners send no X-User-Id and must keep resolving sessions."""
    r = _get(f"/sessions?client_id={scene['client_id']}")
    assert r.status_code == 200, r.text
    assert scene["session_id"] in _ids(r.json())
