"""Assignments stay private to the two people involved.

User management is open to everyone, so the only thing keeping one supervisor
out of another's work is the assignment split: what was assigned TO me shows in
"My assignments", what I assigned to someone else shows in "Assigned by me", and
nobody else sees either. These lock that down.
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


def _get(path, **kw):
    return requests.get(f"{API}{path}", timeout=30, **kw)


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


def _make_user(admin_headers, label):
    r = _post("/users", headers=admin_headers,
              json={"username": f"TEST_iso_{label}_{uuid.uuid4().hex[:6]}",
                    "password": "passwd123", "role": "supervisor"})
    assert r.status_code == 200, r.text
    return r.json()["user"]


@pytest.fixture
def cast(admin_headers):
    """An assigner (who owns a client + session), an assignee, and a bystander."""
    assigner = _make_user(admin_headers, "from")
    assignee = _make_user(admin_headers, "to")
    bystander = _make_user(admin_headers, "other")

    # The assigner must OWN the client — create_client stamps created_by from
    # the X-User-Id header.
    code = f"ISO{uuid.uuid4().hex[:6].upper()}"
    r = _post("/clients", headers=_headers(assigner),
              json={"name": f"Iso {code}", "code": code, "client_type": "store"})
    assert r.status_code == 200, r.text
    client_id = r.json()["client"]["id"]

    r = _post("/sessions", json={"client_id": client_id, "name": f"Iso session {code}",
                                 "variance_mode": "bin-wise",
                                 "start_date": "2026-01-01T00:00:00+00:00"})
    assert r.status_code == 200, r.text
    session_id = r.json()["session"]["id"]

    yield {"assigner": assigner, "assignee": assignee, "bystander": bystander,
           "client_id": client_id, "session_id": session_id}

    _del(f"/clients/{client_id}")
    for u in (assigner, assignee, bystander):
        _del(f"/users/{u['id']}", headers=admin_headers)


def _assign(cast):
    r = _post("/assignments", headers=_headers(cast["assigner"]), json={
        "module": "warehouse", "assigned_to": cast["assignee"]["id"],
        "session_id": cast["session_id"], "assignment_type": "full_session"})
    assert r.status_code == 200, r.text
    return r.json()["assignment"]


def test_assignment_lands_in_the_assignees_my_tab(cast):
    made = _assign(cast)
    r = _get("/assignments/my", headers=_headers(cast["assignee"]))
    assert r.status_code == 200, r.text
    assert any(a["id"] == made["id"] for a in r.json()["assignments"])


def test_assignment_lands_in_the_assigners_by_me_tab(cast):
    made = _assign(cast)
    r = _get("/assignments/by-me", headers=_headers(cast["assigner"]))
    assert r.status_code == 200, r.text
    assert any(a["id"] == made["id"] for a in r.json()["assignments"])


def test_the_two_tabs_do_not_cross_over(cast):
    made = _assign(cast)
    # What I handed out is not something handed TO me...
    r = _get("/assignments/my", headers=_headers(cast["assigner"]))
    assert not any(a["id"] == made["id"] for a in r.json()["assignments"])
    # ...and what I received is not something I handed out.
    r = _get("/assignments/by-me", headers=_headers(cast["assignee"]))
    assert not any(a["id"] == made["id"] for a in r.json()["assignments"])


def test_a_third_user_sees_neither_side(cast):
    made = _assign(cast)
    bystander = _headers(cast["bystander"])
    for tab in ("/assignments/my", "/assignments/by-me"):
        r = _get(tab, headers=bystander)
        assert r.status_code == 200, r.text
        assert not any(a["id"] == made["id"] for a in r.json()["assignments"])


def test_only_the_assigner_can_revoke(cast):
    made = _assign(cast)
    for who in ("assignee", "bystander"):
        r = _del(f"/assignments/{made['id']}", headers=_headers(cast[who]))
        assert r.status_code == 403, f"{who}: {r.text}"
    assert _del(f"/assignments/{made['id']}",
                headers=_headers(cast["assigner"])).status_code == 200


def test_a_non_owner_cannot_assign_someone_elses_session(cast):
    """Ownership still decides who may hand a session out — user management being
    open does not make every supervisor an assigner for every client."""
    r = _post("/assignments", headers=_headers(cast["bystander"]), json={
        "module": "warehouse", "assigned_to": cast["assignee"]["id"],
        "session_id": cast["session_id"], "assignment_type": "full_session"})
    assert r.status_code == 403, r.text
