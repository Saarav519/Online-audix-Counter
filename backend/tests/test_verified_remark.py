"""Bin verification remarks on the Bin-wise Summary.

A supervisor or admin cross-checks a bin and records the outcome from a fixed
dropdown. Scoped to the client, so the same remark shows on every session's
bin-wise sheet, in the consolidated view, on an assignee's copy of the report,
and in the Excel export (which is built from the same rows).
"""
import asyncio
import io
import os
import uuid
from datetime import datetime, timezone

import pytest
import requests

from conftest import get_admin_password

MONGO_URL = os.environ.get("MONGO_URL", "")
DB_NAME = os.environ.get("DB_NAME", "")
needs_db = pytest.mark.skipif(not (MONGO_URL and DB_NAME), reason="MONGO_URL/DB_NAME not set")

# The bin_session fixture seeds scan rows directly, so the whole module needs a DB.
pytestmark = needs_db


def _run(coro_fn):
    async def _wrapped():
        from motor.motor_asyncio import AsyncIOMotorClient
        cl = AsyncIOMotorClient(MONGO_URL)
        try:
            return await coro_fn(cl[DB_NAME])
        finally:
            cl.close()
    return asyncio.run(_wrapped())


def _hdr(u):
    return {"Content-Type": "application/json",
            "X-User-Id": u["id"], "X-Username": u.get("username", "")}


@pytest.fixture(scope="module")
def portal(base_url):
    return f"{base_url}/api/audit/portal"


@pytest.fixture(scope="module")
def admin(portal):
    r = requests.post(f"{portal}/login",
                      json={"username": "admin", "password": get_admin_password()}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["user"]


@pytest.fixture
def bin_session(portal, admin):
    """A client with two sessions, both holding the same counted bin.

    The session-level bin-wise report only lists locations that were actually
    scanned, so the scan rows are seeded straight into synced_locations — the
    same shortcut test_warehouse_parity.py uses, since there is no portal-side
    endpoint that accepts scanner data directly.
    """
    code = f"VR{uuid.uuid4().hex[:6].upper()}"
    cid = requests.post(f"{portal}/clients", json={
        "name": f"TEST verified {code}", "code": code, "client_type": "warehouse"},
        headers=_hdr(admin), timeout=30).json()["client"]["id"]
    sids = []
    for n in ("VR Session A", "VR Session B"):
        sid = requests.post(f"{portal}/sessions", json={
            "client_id": cid, "name": n, "variance_mode": "bin-wise",
            "start_date": "2026-01-01T00:00:00+00:00"},
            headers=_hdr(admin), timeout=30).json()["session"]["id"]
        csv = b"location,barcode,qty\nBIN-VR,8901234500777,10\n"
        requests.post(f"{portal}/sessions/{sid}/import-expected",
                      files={"file": ("s.csv", io.BytesIO(csv), "text/csv")}, timeout=30)
        sids.append(sid)

    async def seed(db):
        await db.synced_locations.insert_many([{
            "session_id": sid, "location_name": "BIN-VR", "device_name": "TEST-DEV",
            "items": [{"barcode": "8901234500777", "quantity": 10, "product_name": "VR Item"}],
            "total_items": 1, "total_quantity": 10, "is_empty": False,
            "synced_at": datetime.now(timezone.utc).isoformat(),
        } for sid in sids])
    _run(seed)

    yield {"client_id": cid, "sessions": sids}
    requests.delete(f"{portal}/clients/{cid}", timeout=60)


def _binwise(portal, sid):
    r = requests.get(f"{portal}/reports/{sid}/bin-wise", timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def test_options_are_served_with_the_report(portal, bin_session):
    """The dropdown renders exactly what the backend accepts — no drift."""
    data = _binwise(portal, bin_session["sessions"][0])
    opts = data.get("verified_remark_options")
    assert opts, "report did not carry the option list"
    assert "Verified – Correct" in opts and "Not Verified" in opts


def test_unverified_bin_starts_blank(portal, bin_session):
    row = _binwise(portal, bin_session["sessions"][0])["report"][0]
    assert row["location"] == "BIN-VR"
    assert row.get("verified_remark") == ""


def test_verifying_shows_on_every_session_and_consolidated(portal, admin, bin_session):
    """One check, visible everywhere — that is the whole point of client scope."""
    cid = bin_session["client_id"]
    r = requests.post(f"{portal}/reports/verified-remark", json={
        "client_id": cid, "location": "BIN-VR", "remark": "Verified – Recount Done",
        "session_id": bin_session["sessions"][0],
        "user_id": admin["id"], "username": admin["username"]},
        headers=_hdr(admin), timeout=30)
    assert r.status_code == 200, r.text

    for sid in bin_session["sessions"]:
        row = _binwise(portal, sid)["report"][0]
        assert row["verified_remark"] == "Verified – Recount Done", f"missing on session {sid}"

    con = requests.get(f"{portal}/reports/consolidated/{cid}/bin-wise", timeout=30)
    assert con.status_code == 200, con.text
    crow = next(r for r in con.json()["report"] if r["location"] == "BIN-VR")
    assert crow["verified_remark"] == "Verified – Recount Done"


def test_not_verified_clears_it(portal, admin, bin_session):
    cid = bin_session["client_id"]
    for remark in ("Verified – Damaged", "Not Verified"):
        assert requests.post(f"{portal}/reports/verified-remark", json={
            "client_id": cid, "location": "BIN-VR", "remark": remark,
            "user_id": admin["id"], "username": admin["username"]},
            headers=_hdr(admin), timeout=30).status_code == 200
    row = _binwise(portal, bin_session["sessions"][0])["report"][0]
    assert row["verified_remark"] == ""


def test_free_text_is_rejected(portal, admin, bin_session):
    """It must come from the dropdown — typing anything else is refused."""
    r = requests.post(f"{portal}/reports/verified-remark", json={
        "client_id": bin_session["client_id"], "location": "BIN-VR",
        "remark": "whatever I feel like",
        "user_id": admin["id"], "username": admin["username"]},
        headers=_hdr(admin), timeout=30)
    assert r.status_code == 400, r.text


@needs_db
def test_verification_is_written_to_the_movement_log(portal, admin, bin_session):
    cid = bin_session["client_id"]
    assert requests.post(f"{portal}/reports/verified-remark", json={
        "client_id": cid, "location": "BIN-VR", "remark": "Verified – Short Found",
        "user_id": admin["id"], "username": admin["username"]},
        headers=_hdr(admin), timeout=30).status_code == 200

    async def check(db):
        return await db.audit_logs.find_one(
            {"client_id": cid, "action_type": "verify"}, {"_id": 0}, sort=[("timestamp_dt", -1)])

    log = _run(check)
    assert log, "verification was not logged"
    assert log["location"] == "BIN-VR"
    assert log["new_value"] == "Verified – Short Found"
    assert log["field_name"] == "verified_remark"
    assert log["username"] == admin["username"]
