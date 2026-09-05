"""Assigning the consolidated (all-sessions) view, and keeping a session
assignment to that session alone.

Two things this pins down:

  • The Reports page offers "All Sessions (Consolidated)" alongside the real
    sessions, but only a real session could be assigned — so a client's roll-up
    could not be shared at all. It is named by the CONSOLIDATED_SESSION
    sentinel, which has no session row, so the client is passed explicitly.

  • Sharing one session must grant that session only. It must not carry the
    consolidated roll-up, the client's other sessions, or — under
    specific_reports — report types that were never picked.
"""
import asyncio
import os
import uuid

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

from conftest import get_base_url

API = f"{get_base_url()}/api/audit/portal"
CONSOLIDATED = "__consolidated__"


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
    """An owner with two sessions on one client, plus a user to share with."""
    def _mk_user(label):
        r = _post("/users", headers=admin_headers,
                  json={"username": f"TEST_cons_{label}_{uuid.uuid4().hex[:6]}",
                        "password": "passwd123", "role": "supervisor"})
        assert r.status_code == 200, r.text
        return r.json()["user"]

    owner, mate = _mk_user("own"), _mk_user("mate")

    code = f"CN{uuid.uuid4().hex[:6].upper()}"
    r = _post("/clients", headers=_headers(owner),
              json={"name": f"Cons {code}", "code": code, "client_type": "warehouse"})
    assert r.status_code == 200, r.text
    client_id = r.json()["client"]["id"]

    def _mk_session(name):
        r = _post("/sessions", headers=_headers(owner),
                  json={"client_id": client_id, "name": name, "variance_mode": "bin-wise",
                        "start_date": "2026-01-01T00:00:00+00:00"})
        assert r.status_code == 200, r.text
        return r.json()["session"]["id"]

    day1, day2 = _mk_session("Day 1"), _mk_session("Day 2")

    yield {"owner": owner, "mate": mate, "client_id": client_id, "day1": day1, "day2": day2}

    _del(f"/clients/{client_id}")
    for u in (owner, mate):
        _del(f"/users/{u['id']}", headers=admin_headers)


def _assign(scene, session_id, **extra):
    body = {"module": "warehouse", "assigned_to": scene["mate"]["id"],
            "session_id": session_id, "client_id": scene["client_id"],
            "assignment_type": "full_session"}
    body.update(extra)
    return _post("/assignments", headers=_headers(scene["owner"]), json=body)


def _check(scene, who, session_id, **params):
    qs = {"session_id": session_id, **params}
    return _get("/assignments/check", headers=_headers(scene[who]), params=qs)


# ─────────────────────────────────────────── consolidated can be assigned

def test_consolidated_view_can_be_assigned(scene):
    r = _assign(scene, CONSOLIDATED)
    assert r.status_code == 200, r.text
    row = r.json()["assignment"]
    assert row["session_id"] == CONSOLIDATED
    assert row["client_id"] == scene["client_id"]


def test_consolidated_assignment_requires_a_client(scene):
    """It spans every session, so there is no session to resolve the client from."""
    r = _post("/assignments", headers=_headers(scene["owner"]), json={
        "module": "warehouse", "assigned_to": scene["mate"]["id"],
        "session_id": CONSOLIDATED, "assignment_type": "full_session"})
    assert r.status_code == 400, r.text
    assert "client_id" in r.json()["detail"]


def test_only_the_owner_can_assign_the_consolidated_view(scene):
    r = _post("/assignments", headers=_headers(scene["mate"]), json={
        "module": "warehouse", "assigned_to": scene["owner"]["id"],
        "session_id": CONSOLIDATED, "client_id": scene["client_id"],
        "assignment_type": "full_session"})
    assert r.status_code == 403, r.text


def test_owner_reads_as_owner_on_the_consolidated_view(scene):
    """With the client named, ownership resolves even though the sentinel is
    not a real session."""
    r = _check(scene, "owner", CONSOLIDATED, client_id=scene["client_id"])
    assert r.status_code == 200, r.text
    assert r.json()["is_owner"] is True
    assert r.json()["has_access"] is True


def test_consolidated_assignee_gets_the_rollup(scene):
    _assign(scene, CONSOLIDATED)
    r = _check(scene, "mate", CONSOLIDATED, client_id=scene["client_id"])
    assert r.json()["has_access"] is True
    assert r.json()["is_owner"] is False


# ─────────────────────────────────────────── a session grant stays that session

def test_a_session_grant_does_not_open_the_consolidated_view(scene):
    """The reported bug: sharing Day 1 also showed All Consolidated."""
    _assign(scene, scene["day1"])
    r = _check(scene, "mate", CONSOLIDATED, client_id=scene["client_id"])
    assert r.json()["has_access"] is False, r.text


def test_a_session_grant_does_not_open_the_other_sessions(scene):
    _assign(scene, scene["day1"])
    assert _check(scene, "mate", scene["day1"]).json()["has_access"] is True
    assert _check(scene, "mate", scene["day2"]).json()["has_access"] is False


def test_my_assignments_names_only_what_was_shared(scene):
    """The Reports page narrows its session picker from this list."""
    _assign(scene, scene["day1"])
    r = _get("/assignments/my", headers=_headers(scene["mate"]))
    assert r.status_code == 200, r.text
    assert [a["session_id"] for a in r.json()["assignments"]] == [scene["day1"]]


def test_a_consolidated_grant_does_not_open_individual_sessions(scene):
    _assign(scene, CONSOLIDATED)
    assert _check(scene, "mate", scene["day1"]).json()["has_access"] is False
    assert _check(scene, "mate", scene["day2"]).json()["has_access"] is False


# ─────────────────────────────────────────── specific reports stay specific

def test_specific_reports_grant_only_the_named_types(scene):
    r = _assign(scene, scene["day1"], assignment_type="specific_reports",
                report_types=["detailed", "category-summary"])
    assert r.status_code == 200, r.text

    assert _check(scene, "mate", scene["day1"], report_type="detailed").json()["has_access"] is True
    assert _check(scene, "mate", scene["day1"], report_type="category-summary").json()["has_access"] is True
    assert _check(scene, "mate", scene["day1"], report_type="bin-wise").json()["has_access"] is False


def test_report_types_round_trip_for_the_reports_picker(scene):
    """The Reports page filters its Report Type dropdown with this list, so the
    keys have to come back exactly as they were sent."""
    _assign(scene, scene["day1"], assignment_type="specific_reports",
            report_types=["detailed", "empty-bins"])
    rows = _get("/assignments/my", headers=_headers(scene["mate"])).json()["assignments"]
    assert rows[0]["report_types"] == ["detailed", "empty-bins"]
