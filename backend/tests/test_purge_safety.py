"""Safety tests for purge_orphan_session_data and the expected-stock cache fix.

Purge tests run in-process against a dedicated throwaway database
(`<DB_NAME>_purge_test`), never the shared test DB: server.db is swapped for
the duration of each test. They require MONGO_URL (and DB_NAME) in the env.

The cache-invalidation test is a live-server behavioural test (like the other
suites): it proves a fresh expected-stock import is visible immediately via a
report endpoint that reads through _expected_cache.
"""
import asyncio
import io
import os
import sys
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
import requests

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

MONGO_URL = os.environ.get("MONGO_URL", "")
DB_NAME = os.environ.get("DB_NAME", "")

pytestmark_db = pytest.mark.skipif(
    not (MONGO_URL and DB_NAME), reason="MONGO_URL/DB_NAME not set — purge tests need a MongoDB"
)

# server.py requires these at import; harmless defaults for the in-process tests
os.environ.setdefault("UPLOAD_DIR", "/tmp/audix-test-uploads")
os.environ.setdefault("CORS_ORIGINS", "http://localhost")
os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
os.environ.setdefault("DB_NAME", "audix_purge_test_fallback")

import server  # noqa: E402

PURGE_DB = f"{os.environ['DB_NAME']}_purge_test"

NOW = datetime.now(timezone.utc)
FRESH_TS = NOW.isoformat()
OLD_TS = (NOW - timedelta(hours=server.PURGE_GRACE_HOURS + 1)).isoformat()


def _run_purge_scenario(scenario):
    """Seed a throwaway DB, run purge_orphan_session_data against it, and hand
    the DB back to the scenario's assertion phase. server.db is restored even
    on failure."""
    async def _inner():
        from motor.motor_asyncio import AsyncIOMotorClient
        client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = client[PURGE_DB]
        original_db = server.db
        server.db = db
        try:
            for col in ("audit_sessions", "synced_locations", "devices", "sync_inbox"):
                await db[col].delete_many({})
            await scenario(db)
        finally:
            server.db = original_db
            client.close()
    asyncio.run(_inner())


@pytestmark_db
def test_purge_keeps_records_newer_than_grace_window():
    async def scenario(db):
        await db.audit_sessions.insert_one({"id": "real-session", "name": "real"})
        await db.synced_locations.insert_one(
            {"id": "fresh", "session_id": "orphan-sess", "location_name": "BIN-A", "synced_at": FRESH_TS})
        await db.synced_locations.insert_one(
            {"id": "stale", "session_id": "orphan-sess", "location_name": "BIN-B", "synced_at": OLD_TS})
        await server.purge_orphan_session_data()
        fresh = await db.synced_locations.find_one({"id": "fresh"})
        stale = await db.synced_locations.find_one({"id": "stale"})
        assert fresh is not None, "record inside the grace window was deleted"
        assert stale is None, "orphan record older than the grace window should be purged"
    _run_purge_scenario(scenario)


@pytestmark_db
def test_purge_deletes_nothing_when_audit_sessions_empty():
    async def scenario(db):
        # No audit_sessions at all — the guard must refuse to purge anything
        await db.synced_locations.insert_one(
            {"id": "would-be-orphan", "session_id": "orphan-sess", "synced_at": OLD_TS})
        await server.purge_orphan_session_data()
        rec = await db.synced_locations.find_one({"id": "would-be-orphan"})
        assert rec is not None, "purge ran against an empty audit_sessions collection"
    _run_purge_scenario(scenario)


@pytestmark_db
def test_purge_never_touches_devices():
    async def scenario(db):
        await db.audit_sessions.insert_one({"id": "real-session", "name": "real"})
        await db.devices.insert_one(
            {"id": "dev-1", "device_name": "purge-test-device",
             "session_id": "orphan-sess", "created_at": OLD_TS})
        await server.purge_orphan_session_data()
        dev = await db.devices.find_one({"id": "dev-1"})
        assert dev is not None, "devices must never be purged"
    _run_purge_scenario(scenario)


@pytestmark_db
def test_purge_threshold_guard_blocks_mass_deletion():
    async def scenario(db):
        await db.audit_sessions.insert_one({"id": "real-session", "name": "real"})
        n = server.PURGE_MAX_ORPHAN_SESSIONS + 1
        await db.synced_locations.insert_many([
            {"id": f"mass-{i}", "session_id": f"orphan-{i}", "synced_at": OLD_TS}
            for i in range(n)
        ])
        await server.purge_orphan_session_data()
        remaining = await db.synced_locations.count_documents({"id": {"$regex": "^mass-"}})
        assert remaining == n, (
            f"threshold guard failed: {n - remaining} of {n} records were deleted despite "
            f"orphan session count exceeding PURGE_MAX_ORPHAN_SESSIONS"
        )
    _run_purge_scenario(scenario)


@pytestmark_db
def test_purge_skips_record_missing_timestamp_field():
    async def scenario(db):
        await db.audit_sessions.insert_one({"id": "real-session", "name": "real"})
        await db.synced_locations.insert_one(
            {"id": "no-ts", "session_id": "orphan-sess", "location_name": "BIN-C"})
        await server.purge_orphan_session_data()
        rec = await db.synced_locations.find_one({"id": "no-ts"})
        assert rec is not None, "record without its timestamp field must be kept"
    _run_purge_scenario(scenario)


def test_expected_cache_invalidated_after_import(base_url):
    """Live-server: pending-locations reads expected stock through _expected_cache.
    Warm the cache while the session has no expected stock, import a CSV, and the
    imported location must appear immediately (not after the 10-min TTL)."""
    s = requests.Session()
    portal = f"{base_url}/api/audit/portal"
    code = f"PT{int(time.time()) % 100000}"

    r = s.post(f"{portal}/clients", json={
        "name": "TEST Purge Cache Client", "code": code, "client_type": "warehouse"})
    assert r.status_code == 200, r.text
    client_id = r.json()["client"]["id"]

    r = s.post(f"{portal}/sessions", json={
        "client_id": client_id, "name": "TEST Purge Cache Session",
        "variance_mode": "bin-wise", "start_date": datetime.now(timezone.utc).isoformat()})
    assert r.status_code == 200, r.text
    session_id = r.json()["session"]["id"]

    # Warm the cache with the (empty) expected stock
    r = s.get(f"{portal}/reports/{session_id}/pending-locations")
    assert r.status_code == 200, r.text

    bin_name = f"CACHE-TEST-BIN-{uuid.uuid4().hex[:6]}"
    csv_bytes = f"location,barcode,qty\n{bin_name},1234567890123,5\n".encode()
    r = s.post(f"{portal}/sessions/{session_id}/import-expected",
               files={"file": ("stock.csv", io.BytesIO(csv_bytes), "text/csv")})
    assert r.status_code == 200, r.text

    r = s.get(f"{portal}/reports/{session_id}/pending-locations")
    assert r.status_code == 200, r.text
    pending_names = {p.get("location_name") for p in r.json().get("pending", [])}
    assert bin_name in pending_names, (
        "imported expected stock not visible immediately — _expected_cache was not invalidated"
    )

    # Cleanup: cascade-delete the test session and client
    s.delete(f"{portal}/sessions/{session_id}")
    s.delete(f"{portal}/clients/{client_id}")
