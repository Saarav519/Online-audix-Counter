"""Reco concurrent-edit guard.

Reco used to be gated on ownership/assignment: a second supervisor opening the
same article got a 403 and a dead cell. That gate is gone — anyone may now set
a reco — but overwriting a value somebody else entered requires an explicit
reason, which the portal collects after showing that item's recent history.

Style note: no pytest-asyncio in this repo, so DB checks run through
asyncio.run inside sync tests, as in test_cascade_delete.py.
"""
import asyncio
import os
import uuid

import pytest
import requests

from conftest import get_admin_password

MONGO_URL = os.environ.get("MONGO_URL", "")
DB_NAME = os.environ.get("DB_NAME", "")

needs_db = pytest.mark.skipif(
    not (MONGO_URL and DB_NAME), reason="MONGO_URL/DB_NAME not set")


def _run(coro_fn):
    async def _wrapped():
        from motor.motor_asyncio import AsyncIOMotorClient
        cl = AsyncIOMotorClient(MONGO_URL)
        try:
            return await coro_fn(cl[DB_NAME])
        finally:
            cl.close()
    return asyncio.run(_wrapped())


def _hdr(uid, uname=""):
    h = {"Content-Type": "application/json"}
    if uid:
        h["X-User-Id"] = uid
    if uname:
        h["X-Username"] = uname
    return h


@pytest.fixture(scope="module")
def portal(base_url):
    return f"{base_url}/api/audit/portal"


@pytest.fixture(scope="module")
def admin(portal):
    r = requests.post(f"{portal}/login",
                      json={"username": "admin", "password": get_admin_password()}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["user"]


@pytest.fixture(scope="module")
def stranger(portal, admin):
    """A real, approved portal user who owns nothing."""
    uname = f"TEST_reco_str_{uuid.uuid4().hex[:8]}"
    requests.post(f"{portal}/register",
                  json={"username": uname, "password": "Pass123!", "full_name": uname}, timeout=30)
    target = next((u for u in requests.get(f"{portal}/users", timeout=30).json()
                   if u.get("username") == uname), None)
    assert target, "stranger user was not created"
    requests.put(f"{portal}/users/{target['id']}/approve",
                 headers=_hdr(admin["id"], admin["username"]), timeout=30)
    return target


@pytest.fixture
def owned_client(portal, admin):
    code = f"RC{uuid.uuid4().hex[:6].upper()}"
    r = requests.post(f"{portal}/clients",
                      json={"name": f"TEST reco {code}", "code": code, "client_type": "store"},
                      headers=_hdr(admin["id"], admin["username"]), timeout=30)
    assert r.status_code == 200, r.text
    cid = r.json()["client"]["id"]
    yield cid
    requests.delete(f"{portal}/clients/{cid}", timeout=60)


def _reco(portal, cid, barcode, qty, *, user, reason=None):
    body = {"client_id": cid, "reco_type": "detailed", "barcode": barcode,
            "location": "BIN-01", "reco_qty": qty,
            "user_id": user["id"], "username": user.get("username", "")}
    if reason is not None:
        body["reason"] = reason
    return requests.post(f"{portal}/reco-adjustments", json=body,
                         headers=_hdr(user["id"], user.get("username", "")), timeout=30)


def test_non_owner_can_now_set_a_fresh_reco(portal, admin, stranger, owned_client):
    """The old ownership gate returned 403 here — now it is allowed, with a reason."""
    bc = f"RC{uuid.uuid4().hex[:10]}"
    r = _reco(portal, owned_client, bc, 5, user=stranger, reason="First count")
    assert r.status_code == 200, f"non-owner should be able to set reco now: {r.status_code} {r.text}"
    assert r.json()["reco_qty"] == 5


def test_every_reco_edit_needs_a_reason(portal, admin, owned_client):
    """Even a first value on an untouched item: the Movement Log must say why."""
    bc = f"RC{uuid.uuid4().hex[:10]}"
    r = _reco(portal, owned_client, bc, 5, user=admin)
    assert r.status_code == 400, f"expected 400 without a reason, got {r.status_code}: {r.text}"
    d = r.json()["detail"]
    assert d["code"] == "reason_required"
    assert d["overwriting_other_user"] is False, "nobody else set this — the dialog should not claim otherwise"


def test_overwriting_another_users_reco_without_reason_is_400(portal, admin, stranger, owned_client):
    bc = f"RC{uuid.uuid4().hex[:10]}"
    assert _reco(portal, owned_client, bc, 5, user=admin, reason="First count").status_code == 200
    r = _reco(portal, owned_client, bc, 9, user=stranger)
    assert r.status_code == 400, f"expected 400 without a reason, got {r.status_code}: {r.text}"
    # machine-readable so the portal can react without string-matching
    d = r.json()["detail"]
    assert d["code"] == "reason_required", r.text
    assert d["overwriting_other_user"] is True, "the dialog needs to know to show the other user's history"


def test_overwriting_another_users_reco_with_reason_succeeds_and_is_logged(
        portal, admin, stranger, owned_client):
    bc = f"RC{uuid.uuid4().hex[:10]}"
    assert _reco(portal, owned_client, bc, 5, user=admin, reason="First count").status_code == 200
    why = "Recounted with supervisor, 4 units found in adjacent bin"
    r = _reco(portal, owned_client, bc, 9, user=stranger, reason=why)
    assert r.status_code == 200, r.text

    async def check(db):
        return await db.audit_logs.find_one(
            {"barcode": bc, "action_type": "reco_adjust", "new_value": "9"}, {"_id": 0})

    log = _run(check) or _run(lambda db: db.audit_logs.find_one(
        {"barcode": bc, "action_type": "reco_adjust"}, {"_id": 0}, sort=[("timestamp_dt", -1)]))
    assert log, "reco overwrite was not written to the movement log"
    assert log.get("reason") == why, f"reason not stored on the log entry: {log}"
    assert log.get("username") == stranger.get("username")


def test_final_qty_is_recorded_when_the_portal_sends_physical_qty(portal, admin, owned_client):
    """Movement Log shows what the row's Final Qty became, not just the reco diff."""
    bc = f"RC{uuid.uuid4().hex[:10]}"
    body = {"client_id": owned_client, "reco_type": "detailed", "barcode": bc,
            "location": "BIN-01", "reco_qty": 3, "physical_qty": 8,
            "reason": "Short by 3", "user_id": admin["id"], "username": admin["username"]}
    r = requests.post(f"{portal}/reco-adjustments", json=body,
                      headers=_hdr(admin["id"], admin["username"]), timeout=30)
    assert r.status_code == 200, r.text

    async def check(db):
        return await db.audit_logs.find_one(
            {"barcode": bc, "action_type": "reco_adjust"}, {"_id": 0}, sort=[("timestamp_dt", -1)])

    log = _run(check)
    assert log, "no movement-log entry written"
    assert log.get("final_qty") == 11, f"final_qty should be physical 8 + reco 3, got {log.get('final_qty')}"


def test_recent_history_endpoint_feeds_the_popup(portal, admin, stranger, owned_client):
    """The dialog reads the same endpoint the barcode-edit popup already uses."""
    bc = f"RC{uuid.uuid4().hex[:10]}"
    assert _reco(portal, owned_client, bc, 5, user=admin, reason="First count").status_code == 200
    assert _reco(portal, owned_client, bc, 6, user=admin, reason="Recount").status_code == 200
    r = requests.get(f"{portal}/audit-logs/recent",
                     params={"barcode": bc, "client_id": owned_client, "limit": 5}, timeout=30)
    assert r.status_code == 200, r.text
    logs = r.json().get("logs", [])
    assert len(logs) >= 2, f"expected the reco history to be readable, got {logs}"
    assert all(l["action_type"] == "reco_adjust" for l in logs)


@needs_db
def test_assignment_notifies_the_assignee(portal, admin, stranger, owned_client):
    """Being assigned a report should reach that user's bell — and nobody else's."""
    r = requests.post(f"{portal}/sessions", json={
        "client_id": owned_client, "name": "TEST notify session",
        "variance_mode": "bin-wise", "start_date": "2026-01-01T00:00:00+00:00"},
        headers=_hdr(admin["id"], admin["username"]), timeout=30)
    assert r.status_code == 200, r.text
    sid = r.json()["session"]["id"]

    r = requests.post(f"{portal}/assignments", json={
        "module": "warehouse", "assigned_to": stranger["id"], "session_id": sid,
        "assignment_type": "full_session", "notes": "Please finish today"},
        headers=_hdr(admin["id"], admin["username"]), timeout=30)
    assert r.status_code == 200, r.text

    mine = requests.get(f"{portal}/alerts",
                        params={"user_id": stranger["id"]}, timeout=30).json()
    assigned = [a for a in mine if a.get("alert_type") == "assignment"
                and a.get("user_id") == stranger["id"]]
    assert assigned, f"assignee got no notification: {mine}"
    assert "Please finish today" in assigned[0]["message"]

    # ...and it is not broadcast to an unrelated user
    other = requests.get(f"{portal}/alerts",
                         params={"user_id": admin["id"]}, timeout=30).json()
    assert not [a for a in other if a.get("id") == assigned[0]["id"]], \
        "an assignment addressed to one user leaked into another user's bell"
