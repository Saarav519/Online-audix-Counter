"""Scan Data (Location-wise) report.

Store audits are counted aisle by aisle, and until now the only way to see
those lines as they were actually scanned was to download the raw sync-log
CSV and match barcodes against master by hand. This report is that same raw
list, in Reports, with master and the client's own schema fields filled in
against each barcode.

The contract these tests pin: nothing is aggregated. The raw download gives
one line per scan and so does this — same lines, same order — and every extra
column is filled from master, never invented.
"""
import asyncio
import csv
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

VISIT1 = "Store Visit 1"
VISIT2 = "Store Visit 2"


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


@pytest.fixture(scope="module")
def store(portal, admin):
    """A store client whose schema carries two custom fields, two barcodes in
    master and a third that was scanned but never loaded. Session 1 scans one
    barcode twice in the same aisle; session 2 scans in another aisle."""
    code = f"SD{uuid.uuid4().hex[:5].upper()}"
    cid = requests.post(f"{portal}/clients", json={
        "name": f"TEST scan data {code}", "code": code, "client_type": "store"},
        headers=_hdr(admin), timeout=30).json()["client"]["id"]

    def mk(name):
        return requests.post(f"{portal}/sessions", json={
            "client_id": cid, "name": name, "variance_mode": "bin-wise",
            "start_date": "2026-01-01T00:00:00+00:00"},
            headers=_hdr(admin), timeout=30).json()["session"]["id"]
    s1, s2 = mk(VISIT1), mk(VISIT2)

    async def seed(db):
        await db.client_schemas.insert_one({"client_id": cid, "fields": [
            {"name": "barcode", "label": "Barcode", "enabled": True},
            {"name": "description", "label": "Description", "enabled": True},
            {"name": "brand", "label": "Brand", "enabled": True, "type": "text"},
            {"name": "hsn", "label": "HSN Code", "enabled": True, "type": "text"},
        ]})
        await db.master_products.insert_many([
            {"client_id": cid, "barcode": "BC001", "description": "Shampoo 200ml",
             "category": "Personal", "mrp": 199, "cost": 120,
             "article_code": "ART-1", "article_name": "Shampoo",
             "custom_fields": {"brand": "Dove", "hsn": "3305"}},
            {"client_id": cid, "barcode": "BC002", "description": "Soap",
             "category": "Personal", "mrp": 45, "cost": 28,
             "article_code": "ART-2", "article_name": "Soap",
             "custom_fields": {"brand": "Lux", "hsn": "3401"}},
        ])
        now = datetime.now(timezone.utc).isoformat()
        await db.sync_raw_logs.insert_many([
            {"id": str(uuid.uuid4()), "client_id": cid, "session_id": s1,
             "device_name": "Scanner-01", "sync_date": "2026-09-30", "synced_at": now,
             "raw_payload": {"locations": [
                 {"name": "AISLE-1", "items": [
                     {"barcode": "BC001", "product_name": "Shampoo 200ml",
                      "quantity": 5, "scanned_at": now},
                     {"barcode": "BC001", "product_name": "Shampoo 200ml",
                      "quantity": 3, "scanned_at": now},
                     {"barcode": "BC002", "product_name": "Soap",
                      "quantity": 10, "scanned_at": now}]},
                 {"name": "AISLE-2", "items": [
                     {"barcode": "NOTINMASTER", "product_name": "???",
                      "quantity": 2, "scanned_at": now}]}]}},
            {"id": str(uuid.uuid4()), "client_id": cid, "session_id": s2,
             "device_name": "Scanner-02", "sync_date": "2026-10-01", "synced_at": now,
             "raw_payload": {"locations": [
                 {"name": "AISLE-9", "items": [
                     {"barcode": "BC002", "product_name": "Soap",
                      "quantity": 7, "scanned_at": now}]}]}},
        ])
    _run(seed)
    yield {"client_id": cid, "s1": s1, "s2": s2, "code": code}
    requests.delete(f"{portal}/clients/{cid}", timeout=60)


def _session_report(portal, sid):
    r = requests.get(f"{portal}/reports/{sid}/scan-data", timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def _consolidated_report(portal, cid):
    r = requests.get(f"{portal}/reports/consolidated/{cid}/scan-data", timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def test_every_scan_line_is_its_own_row(store, portal):
    """BC001 was scanned twice in AISLE-1. Two scans, two rows — merging them
    into one line of 8 would hide how the count was actually taken."""
    rows = _session_report(portal, store["s1"])["report"]
    a1_bc001 = [r for r in rows if r["location"] == "AISLE-1" and r["barcode"] == "BC001"]
    assert len(a1_bc001) == 2, a1_bc001
    assert sorted(r["quantity"] for r in a1_bc001) == [3, 5]
    assert len(rows) == 4


def test_master_fields_are_filled_against_the_barcode(store, portal):
    row = next(r for r in _session_report(portal, store["s1"])["report"]
               if r["barcode"] == "BC001")
    assert row["description"] == "Shampoo 200ml"
    assert row["category"] == "Personal"
    assert row["article_code"] == "ART-1"
    assert row["article_name"] == "Shampoo"
    assert row["mrp"] == 199
    assert row["cost"] == 120
    assert row["in_master"] is True


def test_the_clients_own_schema_fields_come_through(store, portal):
    """The whole point of the report: whatever fields this client saved in its
    schema must arrive filled, without the report knowing their names."""
    data = _session_report(portal, store["s1"])
    names = {c["name"] for c in data["extra_columns"]}
    assert {"brand", "hsn"} <= names, names
    by_bc = {r["barcode"]: r for r in data["report"]}
    assert by_bc["BC001"]["brand"] == "Dove"
    assert by_bc["BC001"]["hsn"] == "3305"
    assert by_bc["BC002"]["brand"] == "Lux"
    assert by_bc["BC002"]["hsn"] == "3401"


def test_a_barcode_missing_from_master_still_shows_its_scan(store, portal):
    """It was scanned, so it is on the sheet. Master columns stay blank and the
    row says so — that gap is a finding for the auditor, not a row to drop."""
    row = next(r for r in _session_report(portal, store["s1"])["report"]
               if r["barcode"] == "NOTINMASTER")
    assert row["location"] == "AISLE-2"
    assert row["quantity"] == 2
    assert row["product_name"] == "???"
    assert row["in_master"] is False
    assert row["description"] == ""
    assert row["article_name"] == ""
    assert row["mrp"] == 0


def test_totals_are_the_scanned_quantities(store, portal):
    data = _session_report(portal, store["s1"])
    assert data["totals"]["rows"] == len(data["report"]) == 4
    assert data["totals"]["quantity"] == 5 + 3 + 10 + 2


def test_device_and_sync_details_travel_with_the_row(store, portal):
    row = _session_report(portal, store["s1"])["report"][0]
    assert row["device_name"] == "Scanner-01"
    assert row["sync_date"] == "2026-09-30"
    assert row["scanned_at"]


def test_consolidated_spans_sessions_and_names_each_one(store, portal):
    data = _consolidated_report(portal, store["client_id"])
    assert data["totals"]["rows"] == 5
    assert data["totals"]["quantity"] == 5 + 3 + 10 + 2 + 7
    by_loc = {}
    for r in data["report"]:
        by_loc.setdefault(r["location"], set()).add(r["session_name"])
    assert by_loc["AISLE-1"] == {VISIT1}
    assert by_loc["AISLE-2"] == {VISIT1}
    assert by_loc["AISLE-9"] == {VISIT2}


def test_a_session_only_shows_its_own_scans(store, portal):
    """AISLE-9 belongs to visit 2 and must not leak into visit 1's sheet."""
    locs = {r["location"] for r in _session_report(portal, store["s1"])["report"]}
    assert locs == {"AISLE-1", "AISLE-2"}
    assert _session_report(portal, store["s2"])["report"][0]["location"] == "AISLE-9"


def test_it_matches_the_raw_download_line_for_line(store, portal):
    """The user's own yardstick: this is the raw data export with the schema
    fields bolted on. If the two ever disagree on which lines exist, or in what
    order, the report has started aggregating something."""
    r = requests.get(f"{portal}/sync-logs/export",
                     params={"client_id": store["client_id"]}, timeout=30)
    assert r.status_code == 200, r.text
    raw = list(csv.DictReader(io.StringIO(r.text)))
    raw_lines = [(x["Location"], x["Barcode"], int(x["Quantity"])) for x in raw]

    rows = _consolidated_report(portal, store["client_id"])["report"]
    report_lines = [(x["location"], x["barcode"], x["quantity"]) for x in rows]

    assert report_lines == raw_lines


def test_an_unknown_session_is_not_an_empty_report(store, portal):
    """Silently returning zero rows for a bad id would read as 'nothing was
    scanned here', which is a different and much worse answer."""
    r = requests.get(f"{portal}/reports/{uuid.uuid4()}/scan-data", timeout=30)
    assert r.status_code == 404, r.text
