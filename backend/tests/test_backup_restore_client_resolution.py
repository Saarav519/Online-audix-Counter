"""Restore-Backup client resolution.

The dialog used to send only a client *name*, so a name that did not match
exactly minted a duplicate client and the restored data landed somewhere the
user never opened. The portal now sends client_id, and the backend must honour
it rather than falling back to name matching.

Note on style: the repo has no pytest-asyncio, so the async DB work runs via
asyncio.run inside sync tests — the same pattern as test_cascade_delete.py and
test_purge_safety.py. Writing `async def test_...` here would silently not run.
"""
import asyncio
import io
import os
import uuid

import pytest
import requests

MONGO_URL = os.environ.get("MONGO_URL", "")
DB_NAME = os.environ.get("DB_NAME", "")

needs_db = pytest.mark.skipif(
    not (MONGO_URL and DB_NAME),
    reason="MONGO_URL/DB_NAME not set — these tests verify rows directly in the server's database",
)

CSV_BODY = (
    'Location,Barcode,Product Name,Price,Quantity,Scanned At\n'
    '"BIN-01",="8901234567890","Widget",10,5,"2026-01-01T00:00:00Z"\n'
).encode()


def _run(coro_fn):
    """Run one DB coroutine in its own loop with its own client."""
    async def _wrapped():
        from motor.motor_asyncio import AsyncIOMotorClient
        cl = AsyncIOMotorClient(MONGO_URL)
        try:
            return await coro_fn(cl[DB_NAME])
        finally:
            cl.close()
    return asyncio.run(_wrapped())


def _make_client(portal, name):
    r = requests.post(f"{portal}/clients", json={
        "name": name, "code": f"BR{uuid.uuid4().hex[:6].upper()}", "client_type": "store"}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["client"]["id"]


def _make_session(portal, client_id, name):
    r = requests.post(f"{portal}/sessions", json={
        "client_id": client_id, "name": name, "variance_mode": "bin-wise",
        "start_date": "2026-01-01T00:00:00+00:00"}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["session"]["id"]


def _post_backup(portal, *, client_id, client_name, session_id):
    return requests.post(
        f"{portal}/sync-inbox/upload-backup",
        files={"file": ("backup.csv", io.BytesIO(CSV_BODY), "text/csv")},
        data={
            "client_id": client_id,
            "client_name": client_name,
            "session_id": session_id,
            "session_name": "",
            "variance_mode": "bin-wise",
            "device_name": "backup-restore",
        },
        timeout=60,
    )


@needs_db
def test_backup_uses_client_id_and_does_not_duplicate_regex_hostile_name(base_url):
    """A name full of regex metacharacters used to never match, so every restore
    created another client. With client_id sent, exactly one client must exist."""
    portal = f"{base_url}/api/audit/portal"
    name = f"ABC (North) {uuid.uuid4().hex[:8]}"
    client_id = _make_client(portal, name)
    session_id = _make_session(portal, client_id, "TEST backup session")
    try:
        r = _post_backup(portal, client_id=client_id, client_name=name, session_id=session_id)
        assert r.status_code == 200, r.text
        body = r.json()

        assert body["client_id"] == client_id, "backend resolved a different client"
        assert body["session_id"] == session_id, "backend resolved a different session"
        assert body["total_quantity"] == 5, body

        async def checks(db):
            return {
                "clients_with_name": await db.clients.count_documents({"name": name}),
                "pending_inbox": await db.sync_inbox.count_documents(
                    {"session_id": session_id, "status": "pending"}),
            }

        got = _run(checks)
        assert got["clients_with_name"] == 1, f"duplicate client created: {got}"
        assert got["pending_inbox"] == 1, f"expected one pending sync_inbox row, got {got}"
    finally:
        requests.delete(f"{portal}/clients/{client_id}", timeout=60)


@needs_db
def test_backup_rejects_session_from_a_different_client(base_url):
    portal = f"{base_url}/api/audit/portal"
    name_a = f"ABC (North) {uuid.uuid4().hex[:8]}"
    name_b = f"XYZ [South] {uuid.uuid4().hex[:8]}"
    client_a = _make_client(portal, name_a)
    client_b = _make_client(portal, name_b)
    session_b = _make_session(portal, client_b, "TEST other client session")
    try:
        r = _post_backup(portal, client_id=client_a, client_name=name_a, session_id=session_b)
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
    finally:
        requests.delete(f"{portal}/clients/{client_a}", timeout=60)
        requests.delete(f"{portal}/clients/{client_b}", timeout=60)
