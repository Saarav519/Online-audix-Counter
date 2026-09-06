"""Cascade-delete completeness tests.

Guards the defect where a deleted client left rows behind in collections the
cascade never listed (audit_logs / report_assignments / location_assignments /
sync_staging / the cycle_* family), and where an orphaned cycle-count project
became permanently undeletable because ownership is derived from a client row
that no longer exists.

The scope registry below is the single source of truth: every collection that
carries the client's id, one of its session ids, or one of its cycle-project
ids is seeded, then asserted empty after the delete. Adding a collection here
(or to the cascade) without the other side failing is the point — the tests
loop over the registry rather than a hand-picked set.

Requires MONGO_URL/DB_NAME pointing at the SAME database the server under test
uses; rows are scoped to a unique per-test client id, so nothing else is touched.
"""
import asyncio
import os
import uuid

import pytest
import requests

MONGO_URL = os.environ.get("MONGO_URL", "")
DB_NAME = os.environ.get("DB_NAME", "")

needs_db = pytest.mark.skipif(
    not (MONGO_URL and DB_NAME),
    reason="MONGO_URL/DB_NAME not set — cascade tests seed the server's database directly",
)

# ── scope registry ────────────────────────────────────────────────────────────
CLIENT_SCOPED = [
    "master_products", "client_stock", "client_schemas", "barcode_edits",
    "location_master", "reco_adjustments", "cycle_projects", "audit_sessions",
    "verified_remarks",
]
SESSION_SCOPED = [
    "expected_stock", "synced_locations", "sync_inbox", "forward_batches",
    "conflict_locations",
]
BOTH_SCOPED = [
    "sync_raw_logs", "alerts", "devices", "audit_logs",
    "report_assignments", "location_assignments", "sync_staging",
]
PROJECT_SCOPED = [
    "cycle_days", "cycle_day_stock", "cycle_day_picks", "cycle_closed_bins",
]


def _client():
    """A fresh motor client. Must be created inside the loop that uses it —
    each asyncio.run() below opens a new event loop."""
    from motor.motor_asyncio import AsyncIOMotorClient
    return AsyncIOMotorClient(MONGO_URL)


def _run(coro_fn):
    """Run one DB coroutine in its own loop with its own client."""
    async def _wrapped():
        cl = _client()
        try:
            return await coro_fn(cl[DB_NAME])
        finally:
            cl.close()
    return asyncio.run(_wrapped())


class Ids:
    def __init__(self):
        h = uuid.uuid4().hex
        self.client = f"TESTCASCADE-cli-{h}"
        self.session = f"TESTCASCADE-ses-{h}"
        self.project = f"TESTCASCADE-prj-{h}"
        self.day = f"TESTCASCADE-day-{h}"


async def _seed(db, ids: Ids, *, with_client_row=True):
    """One row in every collection the registry covers, plus the client row."""
    if with_client_row:
        await db.clients.insert_one({
            "id": ids.client, "name": "TEST cascade client",
            "code": ids.client[-8:], "client_type": "cycle_count", "is_active": True,
        })
    for col in CLIENT_SCOPED:
        doc = {"id": f"{col}-{ids.client}", "client_id": ids.client}
        if col == "audit_sessions":
            doc["id"] = ids.session
        if col == "cycle_projects":
            doc["id"] = ids.project
            doc["audit_session_id"] = ids.session
        await db[col].insert_one(doc)
    for col in SESSION_SCOPED:
        await db[col].insert_one({"id": f"{col}-{ids.session}", "session_id": ids.session})
    for col in BOTH_SCOPED:
        await db[col].insert_one({
            "id": f"{col}-{ids.client}", "client_id": ids.client, "session_id": ids.session,
        })
    for col in PROJECT_SCOPED:
        doc = {"id": f"{col}-{ids.project}", "project_id": ids.project}
        if col != "cycle_days":
            doc["day_id"] = ids.day
        await db[col].insert_one(doc)


async def _leftovers(db, ids: Ids):
    """Any row still referencing this client / its session / its project."""
    out = {}
    for col in CLIENT_SCOPED + BOTH_SCOPED:
        n = await db[col].count_documents({"client_id": ids.client})
        if n:
            out[f"{col}(client_id)"] = n
    for col in SESSION_SCOPED + BOTH_SCOPED:
        n = await db[col].count_documents({"session_id": ids.session})
        if n:
            out[f"{col}(session_id)"] = n
    for col in PROJECT_SCOPED:
        n = await db[col].count_documents({"project_id": ids.project})
        if n:
            out[f"{col}(project_id)"] = n
    n = await db.clients.count_documents({"id": ids.client})
    if n:
        out["clients(id)"] = n
    return out


async def _cleanup(db, ids: Ids):
    for col in set(CLIENT_SCOPED + SESSION_SCOPED + BOTH_SCOPED + PROJECT_SCOPED):
        await db[col].delete_many({"$or": [
            {"client_id": ids.client}, {"session_id": ids.session}, {"project_id": ids.project},
        ]})
    await db.clients.delete_many({"id": ids.client})


@needs_db
def test_delete_client_purges_every_scoped_collection(base_url):
    ids = Ids()
    _run(lambda db: _seed(db, ids))
    try:
        r = requests.delete(f"{base_url}/api/audit/portal/clients/{ids.client}", timeout=60)
        assert r.status_code == 200, r.text
        left = _run(lambda db: _leftovers(db, ids))
        assert left == {}, f"cascade missed these collections: {left}"
    finally:
        _run(lambda db: _cleanup(db, ids))


@needs_db
def test_delete_client_is_rerunnable_when_client_row_already_gone(base_url):
    """A cascade that died part-way leaves the client row deleted and children
    behind. Calling delete again must finish the job, not 404."""
    ids = Ids()
    _run(lambda db: _seed(db, ids, with_client_row=False))
    try:
        r = requests.delete(f"{base_url}/api/audit/portal/clients/{ids.client}", timeout=60)
        assert r.status_code == 200, f"orphaned children should still be purged, got {r.status_code}: {r.text}"
        left = _run(lambda db: _leftovers(db, ids))
        assert left == {}, f"re-run cascade missed: {left}"
    finally:
        _run(lambda db: _cleanup(db, ids))


@needs_db
def test_delete_client_still_404s_when_nothing_exists(base_url):
    r = requests.delete(
        f"{base_url}/api/audit/portal/clients/TESTCASCADE-nope-{uuid.uuid4().hex}", timeout=30)
    assert r.status_code == 404, r.text


@needs_db
def test_delete_session_purges_session_scoped_collections(base_url):
    ids = Ids()
    _run(lambda db: _seed(db, ids))
    try:
        r = requests.delete(f"{base_url}/api/audit/portal/sessions/{ids.session}", timeout=60)
        assert r.status_code == 200, r.text

        async def session_leftovers(db):
            out = {}
            for col in SESSION_SCOPED + BOTH_SCOPED:
                n = await db[col].count_documents({"session_id": ids.session})
                if n:
                    out[col] = n
            return out

        left = _run(session_leftovers)
        assert left == {}, f"delete_session missed these collections: {left}"
    finally:
        _run(lambda db: _cleanup(db, ids))


# ── orphaned cycle-count project must not be permanently undeletable ─────────

def _login_admin(base_url, admin_password):
    r = requests.post(f"{base_url}/api/audit/portal/login",
                      json={"username": "admin", "password": admin_password}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["user"]


def _make_orphan_project(base_url, headers):
    """Real client + cycle project via the API, then drop ONLY the client row.

    That is the state production is already in: projects whose client row was
    removed before the cascade covered cycle_*. It cannot be produced through
    DELETE /clients any more — that now purges the projects too — so the row is
    removed directly, exactly as the broken cascade used to leave it.
    """
    portal = f"{base_url}/api/audit/portal"
    code = f"OR{uuid.uuid4().hex[:6].upper()}"
    r = requests.post(f"{portal}/clients", json={
        "name": f"TEST orphan {code}", "code": code, "client_type": "cycle_count"},
        headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    client_id = r.json()["client"]["id"]
    r = requests.post(f"{portal}/cycle-count/projects",
                      json={"client_id": client_id, "name": "TEST orphan project"},
                      headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    pid = (r.json().get("project") or r.json())["id"]

    async def drop_client_row(db):
        return (await db.clients.delete_many({"id": client_id})).deleted_count

    assert _run(drop_client_row) == 1, "failed to orphan the project"
    return client_id, pid


@needs_db
def test_orphan_cycle_project_is_deletable_by_admin(base_url, admin_password):
    admin = _login_admin(base_url, admin_password)
    h = {"X-User-Id": admin["id"], "X-Username": admin["username"]}
    _, pid = _make_orphan_project(base_url, h)
    r = requests.delete(f"{base_url}/api/audit/portal/cycle-count/projects/{pid}",
                        headers=h, timeout=30)
    assert r.status_code == 200, (
        f"orphaned project must stay deletable, got {r.status_code}: {r.text}")


@needs_db
def test_orphan_cycle_project_is_deletable_by_non_admin(base_url, admin_password):
    """Ownership comes from clients.created_by; with the client gone nobody can
    be owner, so the orphan rule (not the admin bypass) must allow cleanup."""
    portal = f"{base_url}/api/audit/portal"
    admin = _login_admin(base_url, admin_password)
    ah = {"X-User-Id": admin["id"], "X-Username": admin["username"]}
    _, pid = _make_orphan_project(base_url, ah)

    uname = f"TEST_orphan_user_{uuid.uuid4().hex[:8]}"
    requests.post(f"{portal}/register",
                  json={"username": uname, "password": "Pass123!", "full_name": uname}, timeout=30)
    users = requests.get(f"{portal}/users", timeout=30).json()
    target = next((u for u in users if u.get("username") == uname), None)
    assert target, "test user was not created"
    requests.put(f"{portal}/users/{target['id']}/approve", headers=ah, timeout=30)
    assert (target.get("role") or "") != "admin", "fixture user must not be an admin"

    r = requests.delete(f"{base_url}/api/audit/portal/cycle-count/projects/{pid}",
                        headers={"X-User-Id": target["id"], "X-Username": uname}, timeout=30)
    assert r.status_code == 200, (
        f"orphan rule should allow non-admin cleanup, got {r.status_code}: {r.text}")
