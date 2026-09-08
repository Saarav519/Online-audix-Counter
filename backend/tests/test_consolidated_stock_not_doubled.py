"""A warehouse has one book stock, however many sessions it is counted in.

Warehouse stock is uploaded once at client level, and create_session copies
that SAME client_stock into every new session. Consolidated reports then added
those identical copies together, so a second pass read as twice the stock on
hand and a third as three times — every variance and accuracy figure moved
with it.

Store stock is imported per session, by hand, which is a deliberate part of
that flow. These tests pin BOTH sides: warehouse stops multiplying, and store
keeps summing exactly as it always did.
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

STOCK = b"location,barcode,qty\nBIN-D1,8903333300001,100\nBIN-D2,8903333300002,40\n"


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
def client_id(portal, admin):
    code = f"CD{uuid.uuid4().hex[:6].upper()}"
    cid = requests.post(f"{portal}/clients", json={
        "name": f"TEST consolidated {code}", "code": code, "client_type": "warehouse"},
        headers=_hdr(admin), timeout=30).json()["client"]["id"]
    yield cid
    requests.delete(f"{portal}/clients/{cid}", timeout=60)


def _new_session(portal, admin, cid, name, csv=STOCK):
    sid = requests.post(f"{portal}/sessions", json={
        "client_id": cid, "name": name, "variance_mode": "bin-wise",
        "start_date": "2026-01-01T00:00:00+00:00"},
        headers=_hdr(admin), timeout=30).json()["session"]["id"]
    if csv:
        requests.post(f"{portal}/sessions/{sid}/import-expected",
                      files={"file": ("s.csv", io.BytesIO(csv), "text/csv")}, timeout=30)
    return sid


def _stock(portal, cid, report):
    r = requests.get(f"{portal}/reports/consolidated/{cid}/{report}", timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["totals"]["stock_qty"]


REPORTS = ("bin-wise", "detailed", "barcode-wise", "article-wise")


def test_a_second_session_does_not_double_the_stock(portal, admin, client_id):
    _new_session(portal, admin, client_id, "Pass 1")
    first = {r: _stock(portal, client_id, r) for r in REPORTS}
    assert first["detailed"] == 140

    _new_session(portal, admin, client_id, "Pass 2")
    for r in REPORTS:
        assert _stock(portal, client_id, r) == first[r], f"{r} changed after a second session"


def test_a_third_session_does_not_either(portal, admin, client_id):
    _new_session(portal, admin, client_id, "Pass 1")
    _new_session(portal, admin, client_id, "Pass 2")
    _new_session(portal, admin, client_id, "Pass 3")
    assert _stock(portal, client_id, "detailed") == 140


def test_sessions_covering_different_bins_still_add_up(portal, admin, client_id):
    """Dedupe is per (location, barcode) — genuinely different bins are not
    merged away, or splitting a warehouse across sessions would lose stock."""
    _new_session(portal, admin, client_id, "Zone A",
                 b"location,barcode,qty\nBIN-A1,8904444400001,10\n")
    _new_session(portal, admin, client_id, "Zone B",
                 b"location,barcode,qty\nBIN-B1,8904444400002,25\n")
    assert _stock(portal, client_id, "detailed") == 35


def test_a_corrected_reupload_replaces_the_old_figure(portal, admin, client_id):
    """Re-uploading a fixed stock file into a newer session must update the
    number, not add to it."""
    _new_session(portal, admin, client_id, "Pass 1",
                 b"location,barcode,qty\nBIN-D1,8903333300001,100\n")
    assert _stock(portal, client_id, "detailed") == 100
    _new_session(portal, admin, client_id, "Pass 2",
                 b"location,barcode,qty\nBIN-D1,8903333300001,90\n")
    assert _stock(portal, client_id, "detailed") == 90


@needs_db
def test_physical_counts_still_add_across_sessions(portal, admin, client_id):
    """Only the book stock is deduplicated. Two sessions scanning two different
    bins really did count both, and the consolidated view must say so."""
    s1 = _new_session(portal, admin, client_id, "Pass 1")
    s2 = _new_session(portal, admin, client_id, "Pass 2")

    async def scan(db):
        await db.synced_locations.insert_many([
            {"session_id": s1, "location_name": "BIN-D1", "device_name": "D",
             "items": [{"barcode": "8903333300001", "quantity": 100, "product_name": "A"}],
             "total_items": 1, "total_quantity": 100, "is_empty": False,
             "synced_at": datetime.now(timezone.utc).isoformat()},
            {"session_id": s2, "location_name": "BIN-D2", "device_name": "D",
             "items": [{"barcode": "8903333300002", "quantity": 40, "product_name": "B"}],
             "total_items": 1, "total_quantity": 40, "is_empty": False,
             "synced_at": datetime.now(timezone.utc).isoformat()},
        ])
    _run(scan)

    totals = requests.get(
        f"{portal}/reports/consolidated/{client_id}/detailed", timeout=30).json()["totals"]
    assert totals["stock_qty"] == 140
    assert totals["physical_qty"] == 140
    assert totals["diff_qty"] == 0


def _store_client(portal, admin):
    code = f"ST{uuid.uuid4().hex[:6].upper()}"
    return requests.post(f"{portal}/clients", json={
        "name": f"TEST store {code}", "code": code, "client_type": "store"},
        headers=_hdr(admin), timeout=30).json()["client"]["id"]


def test_store_clients_are_left_exactly_as_they_were(portal, admin):
    """Store stock is a per-session upload by design. Deduping it would be a
    guess about intent, so this pins the old behaviour: it still sums."""
    cid = _store_client(portal, admin)
    try:
        _new_session(portal, admin, cid, "Visit 1")
        assert _stock(portal, cid, "detailed") == 140
        _new_session(portal, admin, cid, "Visit 2")
        assert _stock(portal, cid, "detailed") == 280, "store behaviour changed"
        _new_session(portal, admin, cid, "Visit 3")
        assert _stock(portal, cid, "detailed") == 420
    finally:
        requests.delete(f"{portal}/clients/{cid}", timeout=60)


@needs_db
def test_the_warehouse_snapshot_is_what_gets_deduped(portal, admin, client_id):
    """Not a hand-uploaded file — the copies create_session makes of the one
    client-level stock. This is the exact path the doubling came from."""
    csv = b"location,barcode,qty\nBIN-D1,8903333300001,100\n"
    r = requests.post(f"{portal}/clients/{client_id}/import-stock",
                      files={"file": ("s.csv", io.BytesIO(csv), "text/csv")},
                      headers=_hdr(admin), timeout=30)
    assert r.status_code == 200, r.text

    for i in (1, 2, 3):
        made = requests.post(f"{portal}/sessions", json={
            "client_id": client_id, "name": f"Pass {i}", "variance_mode": "bin-wise",
            "start_date": "2026-01-01T00:00:00+00:00"},
            headers=_hdr(admin), timeout=30).json()
        assert "snapshot" in made, "warehouse session did not auto-snapshot client stock"
        assert _stock(portal, client_id, "detailed") == 100, f"multiplied at session {i}"
