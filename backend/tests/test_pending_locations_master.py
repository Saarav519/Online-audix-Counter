"""The Pending sheet lists every bin the auditor must visit.

It used to be built from the stock file alone, so a bin holding no expected
stock never appeared — the sheet could read 100% complete while nobody had
walked to it. The work list is now the Location Master (what the scanner is
given) plus anything the stock file or a scan mentions.
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

# Master holds 8 bins; only 5 of them are booked to hold stock.
MASTER = [f"BIN-{i:02d}" for i in range(1, 9)]
WITH_STOCK = MASTER[:5]
NO_STOCK = MASTER[5:]


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
    return {"X-User-Id": u["id"], "X-Username": u.get("username", "")}


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
def site(portal, admin):
    """Client with a location master of 8 and a stock file covering 5."""
    code = f"PL{uuid.uuid4().hex[:6].upper()}"
    cid = requests.post(f"{portal}/clients", json={
        "name": f"TEST pending {code}", "code": code, "client_type": "warehouse"},
        headers=_hdr(admin), timeout=30).json()["client"]["id"]

    lm = "location_code,zone\n" + "".join(f"{loc},Z1\n" for loc in MASTER)
    assert requests.post(f"{portal}/clients/{cid}/import-location-master",
                         files={"file": ("lm.csv", io.BytesIO(lm.encode()), "text/csv")},
                         headers=_hdr(admin), timeout=30).status_code == 200

    sid = requests.post(f"{portal}/sessions", json={
        "client_id": cid, "name": "PL Session", "variance_mode": "bin-wise",
        "start_date": "2026-01-01T00:00:00+00:00"},
        headers=_hdr(admin), timeout=30).json()["session"]["id"]

    st = "location,barcode,qty\n" + "".join(f"{loc},89000000{i},10\n" for i, loc in enumerate(WITH_STOCK))
    requests.post(f"{portal}/sessions/{sid}/import-expected",
                  files={"file": ("st.csv", io.BytesIO(st.encode()), "text/csv")}, timeout=30)

    yield {"client_id": cid, "session_id": sid}
    requests.delete(f"{portal}/clients/{cid}", timeout=60)


def _pending(portal, sid):
    r = requests.get(f"{portal}/reports/{sid}/pending-locations", timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def test_every_master_location_is_listed(site, portal):
    """The bins without stock are the ones that used to vanish."""
    data = _pending(portal, site["session_id"])
    listed = {row["location_name"] for row in data["pending"]}
    assert listed == set(MASTER), f"missing from the sheet: {set(MASTER) - listed}"
    assert data["summary"]["total_expected"] == len(MASTER)


def test_stockless_bins_are_marked(site, portal):
    """The auditor still needs to know which ones hold nothing on paper."""
    rows = {r["location_name"]: r for r in _pending(portal, site["session_id"])["pending"]}
    for loc in NO_STOCK:
        assert rows[loc]["in_expected"] is False, f"{loc} should be flagged as having no expected stock"
    for loc in WITH_STOCK:
        assert rows[loc]["in_expected"] is True
    assert _pending(portal, site["session_id"])["summary"]["total_no_stock"] == len(NO_STOCK)


def test_the_counts_always_add_up(site, portal):
    s = _pending(portal, site["session_id"])["summary"]
    assert s["total_completed"] + s["total_empty"] + s["total_pending"] == s["total_expected"]
    assert s["total_synced"] == s["total_completed"] + s["total_empty"]


@needs_db
def test_scanning_a_stockless_bin_counts_as_progress(site, portal):
    """Walking to an empty bin has to move the needle, or the sheet is lying."""
    sid = site["session_id"]
    before = _pending(portal, sid)["summary"]
    assert before["completion_pct"] == 0.0

    async def scan(db):
        await db.synced_locations.insert_one({
            "session_id": sid, "location_name": NO_STOCK[0], "device_name": "TEST-DEV",
            "items": [], "total_items": 0, "total_quantity": 0,
            "is_empty": True, "empty_remarks": "verified empty",
            "synced_at": datetime.now(timezone.utc).isoformat()})
    _run(scan)

    after = _pending(portal, sid)
    assert NO_STOCK[0] not in {r["location_name"] for r in after["pending"]}
    assert NO_STOCK[0] in {r["location_name"] for r in after["empty_bins"]}
    s = after["summary"]
    assert s["total_pending"] == before["total_pending"] - 1
    assert s["total_completed"] + s["total_empty"] + s["total_pending"] == s["total_expected"]
    assert s["completion_pct"] > 0


def test_consolidated_view_matches(site, portal):
    r = requests.get(f"{portal}/reports/consolidated/{site['client_id']}/pending-locations", timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["summary"]["total_expected"] == len(MASTER)
    assert data["summary"]["total_no_stock"] == len(NO_STOCK)
    listed = {row["location_name"] for row in data["pending"]} | \
             {row["location_name"] for row in data["empty_bins"]} | \
             {row["location_name"] for row in data["completed"]}
    assert listed == set(MASTER)


def test_client_without_a_location_master_is_unchanged(portal, admin):
    """Backwards compatible: no master uploaded means the stock file still
    defines the work list, exactly as before."""
    code = f"NM{uuid.uuid4().hex[:6].upper()}"
    cid = requests.post(f"{portal}/clients", json={
        "name": f"TEST nomaster {code}", "code": code, "client_type": "warehouse"},
        headers=_hdr(admin), timeout=30).json()["client"]["id"]
    try:
        sid = requests.post(f"{portal}/sessions", json={
            "client_id": cid, "name": "NM Session", "variance_mode": "bin-wise",
            "start_date": "2026-01-01T00:00:00+00:00"},
            headers=_hdr(admin), timeout=30).json()["session"]["id"]
        st = "location,barcode,qty\nBIN-X,8900000001,10\nBIN-Y,8900000002,5\n"
        requests.post(f"{portal}/sessions/{sid}/import-expected",
                      files={"file": ("st.csv", io.BytesIO(st.encode()), "text/csv")}, timeout=30)
        s = _pending(portal, sid)["summary"]
        assert s["total_expected"] == 2
        assert s["total_no_stock"] == 0
    finally:
        requests.delete(f"{portal}/clients/{cid}", timeout=60)


@needs_db
def test_a_scan_with_a_blank_location_is_not_a_location(site, portal):
    """A synced row carrying no location name used to become a nameless entry
    on the sheet, inflating the total by one."""
    sid = site["session_id"]
    before = _pending(portal, sid)["summary"]["total_expected"]

    async def scan(db):
        await db.synced_locations.insert_one({
            "session_id": sid, "location_name": "", "device_name": "TEST-DEV",
            "items": [], "total_items": 0, "total_quantity": 0, "is_empty": False,
            "synced_at": datetime.now(timezone.utc).isoformat()})
    _run(scan)

    data = _pending(portal, sid)
    names = ([r["location_name"] for r in data["pending"]]
             + [r["location_name"] for r in data["completed"]]
             + [r["location_name"] for r in data["empty_bins"]])
    assert "" not in names, "a blank location name reached the sheet"
    assert data["summary"]["total_expected"] == before


@needs_db
def test_a_padded_scan_matches_its_master_location(site, portal):
    """Expected stock and the Location Master are both stripped; a scan that
    arrives as " BIN-01" must land on BIN-01, not beside it."""
    sid = site["session_id"]
    target = WITH_STOCK[0]
    before = _pending(portal, sid)["summary"]["total_expected"]

    async def scan(db):
        await db.synced_locations.insert_one({
            "session_id": sid, "location_name": f"  {target}  ", "device_name": "TEST-DEV",
            "items": [{"barcode": "8900000000", "quantity": 3, "product_name": "x"}],
            "total_items": 1, "total_quantity": 3, "is_empty": False,
            "synced_at": datetime.now(timezone.utc).isoformat()})
    _run(scan)

    data = _pending(portal, sid)
    assert data["summary"]["total_expected"] == before, "the padded name was counted as a new location"
    assert target in {r["location_name"] for r in data["completed"]}
    assert target not in {r["location_name"] for r in data["pending"]}


@needs_db
def test_the_consolidated_view_normalises_too(site, portal):
    sid, cid = site["session_id"], site["client_id"]

    async def scan(db):
        await db.synced_locations.insert_many([
            {"session_id": sid, "location_name": "", "device_name": "D",
             "items": [], "total_items": 0, "total_quantity": 0, "is_empty": False,
             "synced_at": datetime.now(timezone.utc).isoformat()},
            {"session_id": sid, "location_name": f" {WITH_STOCK[1]} ", "device_name": "D",
             "items": [], "total_items": 0, "total_quantity": 0, "is_empty": True,
             "synced_at": datetime.now(timezone.utc).isoformat()},
        ])
    _run(scan)

    data = requests.get(f"{portal}/reports/consolidated/{cid}/pending-locations", timeout=30).json()
    assert data["summary"]["total_expected"] == len(MASTER)
    all_names = ([r["location_name"] for r in data["pending"]]
                 + [r["location_name"] for r in data["completed"]]
                 + [r["location_name"] for r in data["empty_bins"]])
    assert "" not in all_names
    assert set(all_names) == set(MASTER)
