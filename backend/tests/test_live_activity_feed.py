"""The live-activity feed an open report polls.

A reco entered by one user only reached everybody else's screen after a manual
refresh. /audit-logs/activity is the feed the Reports page and the Movement Log
poll to close that gap, so what it returns has to be exact: entries newer than
the caller's cursor, nothing replayed, nothing from a client they cannot see.
"""
import asyncio
import os
import uuid
from datetime import datetime, timezone

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

from conftest import get_base_url

API = f"{get_base_url()}/api/audit/portal"

MONGO_URL = os.environ.get("MONGO_URL", "")
DB_NAME = os.environ.get("DB_NAME", "")

needs_db = pytest.mark.skipif(
    not (MONGO_URL and DB_NAME),
    reason="MONGO_URL/DB_NAME not set — these tests seed audit_logs directly",
)


def _get(path, **kw):
    return requests.get(f"{API}{path}", timeout=30, **kw)


def _post(path, **kw):
    return requests.post(f"{API}{path}", timeout=30, **kw)


def _del(path, **kw):
    return requests.delete(f"{API}{path}", timeout=30, **kw)


def _run(coro_fn):
    async def _wrapped():
        cl = AsyncIOMotorClient(MONGO_URL)
        try:
            return await coro_fn(cl[DB_NAME])
        finally:
            cl.close()
    return asyncio.run(_wrapped())


def _admin_id():
    if not (MONGO_URL and DB_NAME):
        r = _get("/users")
        if r.status_code == 200:
            for u in r.json():
                if u.get("username") == "admin":
                    return u["id"]
        return None
    doc = _run(lambda db: db.portal_users.find_one({"username": "admin"}, {"_id": 0, "id": 1}))
    return (doc or {}).get("id")


ADMIN_ID = _admin_id()


def _headers(user):
    return {"X-User-Id": user["id"], "X-Username": user["username"]}


@pytest.fixture(scope="module")
def admin_headers():
    if not ADMIN_ID:
        pytest.skip("Default admin user not seeded")
    return {"X-User-Id": ADMIN_ID, "X-Username": "admin"}


@pytest.fixture
def scene(admin_headers):
    """Two users sharing one client, and a third with a client of their own."""
    def _mk(label):
        r = _post("/users", headers=admin_headers,
                  json={"username": f"TEST_live_{label}_{uuid.uuid4().hex[:6]}",
                        "password": "passwd123", "role": "supervisor"})
        assert r.status_code == 200, r.text
        return r.json()["user"]

    owner, mate, outsider = _mk("own"), _mk("mate"), _mk("out")

    code = f"LV{uuid.uuid4().hex[:6].upper()}"
    r = _post("/clients", headers=_headers(owner),
              json={"name": f"Live {code}", "code": code, "client_type": "warehouse"})
    assert r.status_code == 200, r.text
    client_id = r.json()["client"]["id"]

    r = _post("/sessions", headers=_headers(owner),
              json={"client_id": client_id, "name": "Day 1", "variance_mode": "bin-wise",
                    "start_date": "2026-01-01T00:00:00+00:00"})
    assert r.status_code == 200, r.text
    session_id = r.json()["session"]["id"]

    _post("/assignments", headers=_headers(owner), json={
        "module": "warehouse", "assigned_to": mate["id"], "session_id": session_id,
        "client_id": client_id, "assignment_type": "full_session"})

    ocode = f"LX{uuid.uuid4().hex[:6].upper()}"
    r = _post("/clients", headers=_headers(outsider),
              json={"name": f"Other {ocode}", "code": ocode, "client_type": "warehouse"})
    other_client_id = r.json()["client"]["id"]

    seeded = []
    yield {"owner": owner, "mate": mate, "outsider": outsider,
           "client_id": client_id, "session_id": session_id,
           "other_client_id": other_client_id, "seeded": seeded}

    if seeded:
        _run(lambda db: db.audit_logs.delete_many({"id": {"$in": seeded}}))
    _del(f"/clients/{client_id}")
    _del(f"/clients/{other_client_id}")
    for u in (owner, mate, outsider):
        _del(f"/users/{u['id']}", headers=admin_headers)


def _seed_reco(scene, user, barcode, old, new, client_id=None, session_id=None):
    """Write one reco entry straight into audit_logs, the way a reco save does."""
    now = datetime.now(timezone.utc)
    entry_id = str(uuid.uuid4())
    scene["seeded"].append(entry_id)
    doc = {
        "id": entry_id, "module": "warehouse", "action_type": "reco_adjust",
        "barcode": barcode,
        "client_id": client_id or scene["client_id"],
        "session_id": session_id if session_id is not None else scene["session_id"],
        "field_name": "reco_qty", "old_value": str(old), "new_value": str(new),
        "user_id": user["id"], "username": user["username"],
        "report_type": "detailed", "location": "BIN-1", "reason": "recount",
        "final_qty": None, "timestamp": now.isoformat(), "timestamp_dt": now,
    }
    _run(lambda db: db.audit_logs.insert_one(doc))
    return entry_id


def _poll(scene, who, **params):
    r = _get("/audit-logs/activity", headers=_headers(scene[who]), params=params)
    assert r.status_code == 200, r.text
    return r.json()


@needs_db
def test_priming_poll_returns_a_clock_not_history(scene):
    """Opening a report must not replay the day at you."""
    _seed_reco(scene, scene["owner"], "890111", 0, 5)
    data = _poll(scene, "mate", client_id=scene["client_id"])
    assert data["count"] == 0
    assert data["server_time"]


@needs_db
def test_an_edit_by_someone_else_comes_through(scene):
    cursor = _poll(scene, "mate", client_id=scene["client_id"])["server_time"]
    _seed_reco(scene, scene["owner"], "890222", 2, 7)

    data = _poll(scene, "mate", client_id=scene["client_id"], since=cursor)
    rows = [e for e in data["entries"] if e["barcode"] == "890222"]
    assert len(rows) == 1, data
    assert rows[0]["username"] == scene["owner"]["username"]
    assert (rows[0]["old_value"], rows[0]["new_value"]) == ("2", "7")
    assert rows[0]["is_self"] is False


@needs_db
def test_your_own_edit_is_flagged_so_it_is_not_announced_back(scene):
    cursor = _poll(scene, "owner", client_id=scene["client_id"])["server_time"]
    _seed_reco(scene, scene["owner"], "890333", 1, 4)

    data = _poll(scene, "owner", client_id=scene["client_id"], since=cursor)
    rows = [e for e in data["entries"] if e["barcode"] == "890333"]
    assert rows and rows[0]["is_self"] is True


@needs_db
def test_an_advanced_cursor_does_not_replay(scene):
    cursor = _poll(scene, "mate", client_id=scene["client_id"])["server_time"]
    _seed_reco(scene, scene["owner"], "890444", 0, 3)

    first = _poll(scene, "mate", client_id=scene["client_id"], since=cursor)
    assert any(e["barcode"] == "890444" for e in first["entries"])

    again = _poll(scene, "mate", client_id=scene["client_id"], since=first["server_time"])
    assert not any(e["barcode"] == "890444" for e in again["entries"])


@needs_db
def test_session_filter_narrows_the_feed(scene):
    cursor = _poll(scene, "owner", client_id=scene["client_id"])["server_time"]
    _seed_reco(scene, scene["mate"], "890555", 1, 6, session_id="some-other-session")

    scoped = _poll(scene, "owner", client_id=scene["client_id"],
                   session_id=scene["session_id"], since=cursor)
    assert not any(e["barcode"] == "890555" for e in scoped["entries"])

    unscoped = _poll(scene, "owner", client_id=scene["client_id"], since=cursor)
    assert any(e["barcode"] == "890555" for e in unscoped["entries"])


@needs_db
def test_a_client_you_cannot_see_leaks_nothing(scene):
    cursor = _poll(scene, "mate", client_id=scene["client_id"])["server_time"]
    _seed_reco(scene, scene["outsider"], "890666", 0, 9,
               client_id=scene["other_client_id"], session_id="")

    named = _poll(scene, "mate", client_id=scene["other_client_id"], since=cursor)
    assert named["count"] == 0, named

    wide = _poll(scene, "mate", since=cursor)
    assert all(e["client_id"] != scene["other_client_id"] for e in wide["entries"]), wide


@needs_db
def test_an_unreadable_cursor_returns_nothing_rather_than_everything(scene):
    _seed_reco(scene, scene["owner"], "890777", 0, 2)
    data = _poll(scene, "mate", client_id=scene["client_id"], since="not-a-date")
    assert data["count"] == 0, data
