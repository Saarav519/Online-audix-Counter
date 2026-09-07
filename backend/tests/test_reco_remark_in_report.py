"""The reco remark has to reach the variance report.

The reason typed in the reco popup was written only to the movement log. No
report reads that collection, so the auditor's note vanished from the sheet
they actually look at. It is now stored on the reco itself and carried onto
every report row whose reco it explains.
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
pytestmark = needs_db

BARCODE = "8901111100001"
LOCATION = "BIN-R1"
REMARK = "Damaged stock mila, 2 units kam kiye"


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
def store(portal, admin):
    """Store client — reco is exposed on single-session reports for these."""
    code = f"RR{uuid.uuid4().hex[:6].upper()}"
    cid = requests.post(f"{portal}/clients", json={
        "name": f"TEST recoremark {code}", "code": code, "client_type": "store"},
        headers=_hdr(admin), timeout=30).json()["client"]["id"]
    sid = requests.post(f"{portal}/sessions", json={
        "client_id": cid, "name": "RR Session", "variance_mode": "bin-wise",
        "start_date": "2026-01-01T00:00:00+00:00"},
        headers=_hdr(admin), timeout=30).json()["session"]["id"]
    requests.post(f"{portal}/sessions/{sid}/import-expected",
                  files={"file": ("s.csv", io.BytesIO(
                      f"location,barcode,qty\n{LOCATION},{BARCODE},10\n".encode()), "text/csv")},
                  timeout=30)

    async def seed(db):
        await db.synced_locations.insert_one({
            "session_id": sid, "location_name": LOCATION, "device_name": "D1",
            "items": [{"barcode": BARCODE, "quantity": 8, "product_name": "Item R"}],
            "total_items": 1, "total_quantity": 8, "is_empty": False,
            "synced_at": datetime.now(timezone.utc).isoformat()})
    _run(seed)

    yield {"client_id": cid, "session_id": sid}
    requests.delete(f"{portal}/clients/{cid}", timeout=60)


def _save_reco(portal, admin, store, qty, reason):
    return requests.post(f"{portal}/reco-adjustments", json={
        "client_id": store["client_id"], "reco_type": "detailed",
        "barcode": BARCODE, "location": LOCATION, "reco_qty": qty,
        "user_id": admin["id"], "username": admin["username"],
        "session_id": store["session_id"], "physical_qty": 8, "reason": reason},
        headers=_hdr(admin), timeout=30)


def _row(portal, sid, report="detailed"):
    r = requests.get(f"{portal}/reports/{sid}/{report}", timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["report"][0]


def test_the_remark_is_stored_on_the_reco(portal, admin, store):
    """Reports read reco_adjustments; a note only in the movement log is invisible."""
    assert _save_reco(portal, admin, store, -2, REMARK).status_code == 200

    async def look(db):
        return await db.reco_adjustments.find_one({"client_id": store["client_id"]}, {"_id": 0})
    assert _run(look)["reco_remark"] == REMARK


def test_it_shows_on_the_detailed_report(portal, admin, store):
    assert _save_reco(portal, admin, store, -2, REMARK).status_code == 200
    row = _row(portal, store["session_id"])
    assert row["reco_qty"] == -2
    assert row["reco_remark"] == REMARK


def test_it_follows_a_detailed_reco_onto_the_barcode_report(portal, admin, store):
    """A detailed reco is rolled up per barcode; its note rolls up with it."""
    assert _save_reco(portal, admin, store, -2, REMARK).status_code == 200
    rows = requests.get(f"{portal}/reports/{store['session_id']}/barcode-wise",
                        timeout=30).json()["report"]
    assert any(r.get("reco_remark") == REMARK for r in rows)


def test_an_article_reco_carries_its_own_remark(portal, admin, store):
    """Article-wise reco is entered against the article code, not the barcode —
    a detailed reco never lands here, so it gets its own note."""
    rows = requests.get(f"{portal}/reports/{store['session_id']}/article-wise",
                        timeout=30).json()["report"]
    assert rows, "article-wise report was empty"
    article_code = rows[0].get("article_code", "")

    note = "Article level adjustment"
    r = requests.post(f"{portal}/reco-adjustments", json={
        "client_id": store["client_id"], "reco_type": "article",
        "article_code": article_code, "reco_qty": -3,
        "user_id": admin["id"], "username": admin["username"],
        "session_id": store["session_id"], "reason": note},
        headers=_hdr(admin), timeout=30)
    assert r.status_code == 200, r.text

    rows = requests.get(f"{portal}/reports/{store['session_id']}/article-wise",
                        timeout=30).json()["report"]
    row = next(x for x in rows if x.get("article_code", "") == article_code)
    assert row["reco_qty"] == -3
    assert row["reco_remark"] == note


def test_it_shows_in_the_consolidated_view(portal, admin, store):
    assert _save_reco(portal, admin, store, -2, REMARK).status_code == 200
    rows = requests.get(
        f"{portal}/reports/consolidated/{store['client_id']}/detailed", timeout=30).json()["report"]
    assert any(r.get("reco_remark") == REMARK for r in rows)


def test_editing_the_reco_replaces_the_remark(portal, admin, store):
    """The sheet must explain the value it currently shows, not an older one."""
    assert _save_reco(portal, admin, store, -2, REMARK).status_code == 200
    assert _save_reco(portal, admin, store, -5, "Recount ke baad 5 kam").status_code == 200
    row = _row(portal, store["session_id"])
    assert row["reco_qty"] == -5
    assert row["reco_remark"] == "Recount ke baad 5 kam"


def test_clearing_the_reco_clears_the_remark(portal, admin, store):
    assert _save_reco(portal, admin, store, -2, REMARK).status_code == 200
    assert _save_reco(portal, admin, store, 0, "Galti thi, wapas 0").status_code == 200
    row = _row(portal, store["session_id"])
    assert row["reco_qty"] == 0
    assert row["reco_remark"] == ""


def test_a_reco_without_a_remark_is_blank_not_missing(portal, admin, store):
    """Headerless callers save without a reason; the column must still exist."""
    r = requests.post(f"{portal}/reco-adjustments", json={
        "client_id": store["client_id"], "reco_type": "detailed",
        "barcode": BARCODE, "location": LOCATION, "reco_qty": -1},
        headers={"Content-Type": "application/json"}, timeout=30)
    assert r.status_code == 200, r.text
    row = _row(portal, store["session_id"])
    assert row["reco_qty"] == -1
    assert row["reco_remark"] == ""
