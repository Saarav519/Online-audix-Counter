"""Which session a bin was counted in, on the consolidated sheet.

The consolidated view merges every session into one list, so there was no way
to tell where a bin was actually counted. Each row now carries the name of the
session whose sync log forwarded it.
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

DAY1 = "Day 1 - Ground Floor"
DAY2 = "Day 2 - First Floor"


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
    """Five bins in stock; two sessions between them count four, one is never
    touched, and one of the counted ones is an empty bin."""
    code = f"SS{uuid.uuid4().hex[:6].upper()}"
    cid = requests.post(f"{portal}/clients", json={
        "name": f"TEST session col {code}", "code": code, "client_type": "warehouse"},
        headers=_hdr(admin), timeout=30).json()["client"]["id"]
    stock = "location,barcode,qty\n" + "".join(f"BIN-{i:02d},89000000{i},10\n" for i in range(1, 6))
    requests.post(f"{portal}/clients/{cid}/import-stock",
                  files={"file": ("s.csv", io.BytesIO(stock.encode()), "text/csv")},
                  headers=_hdr(admin), timeout=30)

    def mk(name):
        return requests.post(f"{portal}/sessions", json={
            "client_id": cid, "name": name, "variance_mode": "bin-wise",
            "start_date": "2026-01-01T00:00:00+00:00"},
            headers=_hdr(admin), timeout=30).json()["session"]["id"]
    s1, s2 = mk(DAY1), mk(DAY2)

    async def scan(db):
        now = datetime.now(timezone.utc).isoformat()
        await db.synced_locations.insert_many([
            {"session_id": s1, "location_name": "BIN-01", "device_name": "D1",
             "items": [{"barcode": "890000001", "quantity": 10, "product_name": "A"}],
             "total_items": 1, "total_quantity": 10, "is_empty": False, "synced_at": now},
            {"session_id": s1, "location_name": "BIN-03", "device_name": "D1", "items": [],
             "total_items": 0, "total_quantity": 0, "is_empty": True,
             "empty_remarks": "khali mila", "synced_at": now},
            {"session_id": s2, "location_name": "BIN-04", "device_name": "D2",
             "items": [{"barcode": "890000004", "quantity": 10, "product_name": "D"}],
             "total_items": 1, "total_quantity": 10, "is_empty": False, "synced_at": now},
        ])
    _run(scan)
    yield {"client_id": cid, "s1": s1, "s2": s2}
    requests.delete(f"{portal}/clients/{cid}", timeout=60)


def _rows(portal, cid):
    r = requests.get(f"{portal}/reports/consolidated/{cid}/bin-wise", timeout=30)
    assert r.status_code == 200, r.text
    return {row["location"]: row for row in r.json()["report"]}


def test_a_counted_bin_names_its_session(site, portal):
    rows = _rows(portal, site["client_id"])
    assert rows["BIN-01"]["session_name"] == DAY1
    assert rows["BIN-04"]["session_name"] == DAY2


def test_an_empty_bin_names_its_session_too(site, portal):
    """An empty bin was still visited and forwarded — it must say by whom."""
    row = _rows(portal, site["client_id"])["BIN-03"]
    assert row["status"] == "empty_bin"
    assert row["session_name"] == DAY1


def test_a_bin_nobody_counted_stays_blank(site, portal):
    """Nothing was ever forwarded for it, so naming a session would be a guess."""
    row = _rows(portal, site["client_id"])["BIN-05"]
    assert row["status"] == "pending"
    assert row["session_name"] == ""


def test_a_bin_counted_in_two_sessions_names_both(site, portal):
    cid = site["client_id"]

    async def rescan(db):
        await db.synced_locations.insert_one({
            "session_id": site["s2"], "location_name": "BIN-01", "device_name": "D2",
            "items": [{"barcode": "890000001", "quantity": 4, "product_name": "A"}],
            "total_items": 1, "total_quantity": 4, "is_empty": False,
            "synced_at": datetime.now(timezone.utc).isoformat()})
    _run(rescan)

    name = _rows(portal, cid)["BIN-01"]["session_name"]
    assert DAY1 in name and DAY2 in name, name


def test_the_numbers_are_untouched(site, portal):
    """This column is additive — nothing else on the sheet may move."""
    r = requests.get(f"{portal}/reports/consolidated/{site['client_id']}/bin-wise",
                     timeout=30).json()
    assert r["totals"]["stock_qty"] == 50
    assert r["totals"]["physical_qty"] == 20
    assert r["summary"]["completed"] == 2
    assert r["summary"]["empty_bins"] == 1
    assert r["summary"]["pending"] == 2
