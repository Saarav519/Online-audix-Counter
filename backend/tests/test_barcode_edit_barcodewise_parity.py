"""A barcode edit must land the same way on every view.

Editing an unknown scanned barcode in Detailed applied twice on the SESSION
barcode-wise report: once correctly, per scan and location-aware, before
aggregation, then again afterwards by a pass that matches on barcode alone.
That second pass renamed the SAME barcode still un-edited at another location,
and its quantity disappeared into the corrected row. Consolidated never did
this, so the two views disagreed.
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

GOOD, UNKNOWN = "GOODBC", "UNKNOWNBC"


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
def two_locations(portal, admin):
    """The same unknown barcode scanned at two locations, 10 each, alongside
    40 of a real barcode. Only the LOC-1 one gets corrected."""
    code = f"BP{uuid.uuid4().hex[:6].upper()}"
    cid = requests.post(f"{portal}/clients", json={
        "name": f"TEST bcparity {code}", "code": code, "client_type": "store"},
        headers=_hdr(admin), timeout=30).json()["client"]["id"]
    sid = requests.post(f"{portal}/sessions", json={
        "client_id": cid, "name": "S1", "variance_mode": "bin-wise",
        "start_date": "2026-01-01T00:00:00+00:00"},
        headers=_hdr(admin), timeout=30).json()["session"]["id"]
    requests.post(f"{portal}/sessions/{sid}/import-expected",
                  files={"file": ("s.csv", io.BytesIO(
                      f"location,barcode,qty\nLOC-1,{GOOD},50\nLOC-2,{GOOD},50\n".encode()),
                      "text/csv")}, timeout=30)

    async def seed(db):
        await db.master_products.insert_one({
            "client_id": cid, "barcode": GOOD, "description": "Good", "category": "C1",
            "mrp": 100, "cost": 50, "article_code": "ART-G", "article_name": "G"})
        now = datetime.now(timezone.utc).isoformat()
        await db.synced_locations.insert_many([{
            "session_id": sid, "location_name": loc, "device_name": "D1",
            "items": [{"barcode": GOOD, "quantity": 40, "product_name": "Good"},
                      {"barcode": UNKNOWN, "quantity": 10, "product_name": "?"}],
            "total_items": 2, "total_quantity": 50, "is_empty": False,
            "synced_at": now} for loc in ("LOC-1", "LOC-2")])
    _run(seed)

    r = requests.post(f"{portal}/reports/edit-barcode", json={
        "client_id": cid, "report_type": "detailed",
        "original_value": UNKNOWN, "new_value": GOOD, "location": "LOC-1",
        "user_id": admin["id"], "username": admin["username"], "session_id": sid},
        headers=_hdr(admin), timeout=30)
    assert r.status_code == 200, r.text

    yield {"client_id": cid, "session_id": sid}
    requests.delete(f"{portal}/clients/{cid}", timeout=60)


def _by_barcode(portal, url):
    return {r["barcode"]: r["physical_qty"]
            for r in requests.get(url, timeout=30).json()["report"]}


def test_the_uncorrected_scan_survives_on_barcode_wise(portal, two_locations):
    """LOC-2 was never edited. Its 10 must still stand on its own barcode."""
    rows = _by_barcode(portal, f"{portal}/reports/{two_locations['session_id']}/barcode-wise")
    assert rows.get(UNKNOWN) == 10, f"the un-edited scan was swallowed: {rows}"
    assert rows.get(GOOD) == 90, f"corrected row is wrong: {rows}"


def test_session_and_consolidated_agree(portal, two_locations):
    sess = _by_barcode(portal, f"{portal}/reports/{two_locations['session_id']}/barcode-wise")
    cons = _by_barcode(portal, f"{portal}/reports/consolidated/{two_locations['client_id']}/barcode-wise")
    assert sess == cons, f"session {sess} != consolidated {cons}"


def test_barcode_wise_totals_match_detailed(portal, two_locations):
    """Both views count the same scans, so their physical totals cannot differ."""
    sid = two_locations["session_id"]
    det = requests.get(f"{portal}/reports/{sid}/detailed", timeout=30).json()["report"]
    bw = requests.get(f"{portal}/reports/{sid}/barcode-wise", timeout=30).json()["report"]
    assert sum(r["physical_qty"] for r in det) == sum(r["physical_qty"] for r in bw) == 100


def test_the_corrected_row_is_still_flagged_for_the_ui(portal, two_locations):
    """The pencil and the "was: X" note must survive the fix."""
    rows = {r["barcode"]: r for r in requests.get(
        f"{portal}/reports/{two_locations['session_id']}/barcode-wise", timeout=30).json()["report"]}
    good = rows[GOOD]
    assert good["is_edited"] is True
    assert good["_original_value"] == UNKNOWN
    assert good["_edit_id"]
    assert UNKNOWN in good["remark"]
    assert rows[UNKNOWN]["is_editable"] is True


def test_editing_every_location_merges_everything(portal, admin, two_locations):
    """Correct the second one too and nothing should be left behind."""
    cid, sid = two_locations["client_id"], two_locations["session_id"]
    r = requests.post(f"{portal}/reports/edit-barcode", json={
        "client_id": cid, "report_type": "detailed",
        "original_value": UNKNOWN, "new_value": GOOD, "location": "LOC-2",
        "user_id": admin["id"], "username": admin["username"], "session_id": sid},
        headers=_hdr(admin), timeout=30)
    assert r.status_code == 200, r.text
    rows = _by_barcode(portal, f"{portal}/reports/{sid}/barcode-wise")
    assert rows == {GOOD: 100}, rows
