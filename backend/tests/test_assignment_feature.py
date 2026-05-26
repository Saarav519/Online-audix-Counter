"""
Prompt 4 — Assignment feature backend tests.

Covers:
  • migrate_clients_created_by  (server startup; verified indirectly)
  • POST /clients stamps created_by from X-User-Id (or admin fallback)
  • Assignment CRUD: create / list (my, by-me) / users / check / revoke
  • Permission gates on edit endpoints:
      - /reports/edit-barcode  (assignee → 403)
      - /reports/undo-edit     (assignee → 403)
      - /reco-adjustments      (assignee: detailed OK, barcode/article 403)
  • Post-revoke access is removed
  • Cycle-count day/project gates  (best-effort — only if a cycle session
    is available)
"""

import os
import uuid
import time
import pytest
import requests
from datetime import datetime, timezone

def _read_frontend_env():
    p = "/app/frontend/.env"
    try:
        with open(p) as f:
            for line in f:
                line = line.strip()
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    except Exception:
        pass
    return ""


BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _read_frontend_env() or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"
API = f"{BASE_URL}/api/audit/portal"
CC_API = f"{BASE_URL}/api/audit/portal/cycle-count"

ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "admin123"


# ─────────────────────────────────────── Helpers / fixtures
def _login(session: requests.Session, username: str, password: str):
    r = session.post(f"{API}/login", json={"username": username, "password": password})
    assert r.status_code == 200, f"Login failed for {username}: {r.status_code} {r.text}"
    return r.json()


def _register(session: requests.Session, username: str, password: str):
    r = session.post(
        f"{API}/register",
        json={"username": username, "password": password, "full_name": username},
    )
    # register may return 200 (newly created) or 400 if user exists — both OK
    assert r.status_code in (200, 400), f"Register {username}: {r.status_code} {r.text}"
    if r.status_code == 200:
        return r.json()
    return None


def _hdr(user_id: str, username: str = ""):
    h = {}
    if user_id:
        h["X-User-Id"] = user_id
    if username:
        h["X-Username"] = username
    return h


@pytest.fixture(scope="module")
def http():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin(http):
    """Login admin and return its portal_users row."""
    data = _login(http, ADMIN_USERNAME, ADMIN_PASSWORD)
    u = data.get("user") or data
    # Fallback: hit /users and find admin
    if not u.get("id"):
        users = http.get(f"{API}/users").json()
        u = next((x for x in users if x.get("username") == ADMIN_USERNAME), {})
    assert u.get("id"), "Could not resolve admin id"
    return u


@pytest.fixture(scope="module")
def assignee_user(http, admin):
    """Create + approve a non-admin assignee user."""
    uname = f"TEST_assignee_{uuid.uuid4().hex[:8]}"
    _register(http, uname, "Pass123!")
    users = http.get(f"{API}/users").json()
    target = next((x for x in users if x.get("username") == uname), None)
    assert target, f"User {uname} not found after register"
    # Approve via admin
    r = http.put(
        f"{API}/users/{target['id']}/approve", headers=_hdr(admin["id"], admin["username"])
    )
    assert r.status_code == 200, f"Approve failed: {r.text}"
    return {**target, "is_approved": True}


@pytest.fixture(scope="module")
def stranger_user(http, admin):
    """A 2nd non-admin user — not an assignee — used to verify 403s."""
    uname = f"TEST_stranger_{uuid.uuid4().hex[:8]}"
    _register(http, uname, "Pass123!")
    users = http.get(f"{API}/users").json()
    target = next((x for x in users if x.get("username") == uname), None)
    assert target
    http.put(
        f"{API}/users/{target['id']}/approve", headers=_hdr(admin["id"], admin["username"])
    )
    return target


@pytest.fixture(scope="module")
def owner_client(http, admin):
    """Client owned by admin (X-User-Id=admin)."""
    code = f"TST{uuid.uuid4().hex[:6].upper()}"
    payload = {
        "name": f"TEST_client_{code}",
        "code": code,
        "client_type": "store",
    }
    r = http.post(f"{API}/clients", json=payload, headers=_hdr(admin["id"]))
    assert r.status_code == 200, f"Create client failed: {r.text}"
    data = r.json()
    client = data.get("client") or data
    # Verify created_by was stamped to admin
    assert client.get("created_by") == admin["id"], (
        f"created_by not stamped to admin: {client}"
    )
    return client


@pytest.fixture(scope="module")
def owner_session(http, owner_client):
    payload = {
        "client_id": owner_client["id"],
        "name": f"TEST_session_{uuid.uuid4().hex[:6]}",
        "variance_mode": "bin-wise",
        "start_date": datetime.now(timezone.utc).isoformat(),
    }
    r = http.post(f"{API}/sessions", json=payload)
    assert r.status_code == 200, f"Create session failed: {r.text}"
    sess = (r.json().get("session") or r.json())
    assert sess.get("id")
    return sess


# ─────────────────────────────────────── Client created_by stamping
class TestClientCreatedBy:
    def test_create_client_stamps_created_by_admin(self, http, admin):
        code = f"OWN{uuid.uuid4().hex[:6].upper()}"
        r = http.post(
            f"{API}/clients",
            json={"name": f"TEST_owner_{code}", "code": code, "client_type": "store"},
            headers=_hdr(admin["id"]),
        )
        assert r.status_code == 200
        c = (r.json().get("client") or r.json())
        assert c["created_by"] == admin["id"]

    def test_create_client_no_header_falls_back_to_admin(self, http, admin):
        code = f"FB{uuid.uuid4().hex[:6].upper()}"
        r = http.post(
            f"{API}/clients",
            json={"name": f"TEST_fallback_{code}", "code": code, "client_type": "store"},
        )
        assert r.status_code == 200
        c = (r.json().get("client") or r.json())
        # Fallback should set created_by to admin's id
        assert c["created_by"] == admin["id"], f"expected admin fallback, got {c}"

    def test_migration_backfilled_existing_clients(self, http, admin):
        """Every client returned by /clients must have a non-empty created_by
        (proves migrate_clients_created_by ran at startup)."""
        r = http.get(f"{API}/clients")
        assert r.status_code == 200
        clients = r.json()
        without = [c for c in clients if not c.get("created_by")]
        assert not without, f"{len(without)} clients still missing created_by"


# ─────────────────────────────────────── Assignment CRUD
class TestAssignmentCRUD:
    def test_create_assignment_full_session(self, http, admin, assignee_user, owner_session):
        r = http.post(
            f"{API}/assignments",
            json={
                "module": "warehouse",
                "session_id": owner_session["id"],
                "assigned_to": assignee_user["id"],
                "assignment_type": "full_session",
                "notes": "TEST_full",
            },
            headers=_hdr(admin["id"]),
        )
        assert r.status_code == 200, r.text
        body = r.json()
        a = body["assignment"]
        assert "_id" not in a, "ObjectId leaked into response"
        assert a["assigned_to"] == assignee_user["id"]
        assert a["assigned_by"] == admin["id"]
        assert a["is_active"] is True
        pytest.full_assignment_id = a["id"]

    def test_create_assignment_invalid_type(self, http, admin, assignee_user, owner_session):
        r = http.post(
            f"{API}/assignments",
            json={
                "session_id": owner_session["id"],
                "assigned_to": assignee_user["id"],
                "assignment_type": "bogus_type",
            },
            headers=_hdr(admin["id"]),
        )
        assert r.status_code == 400, r.text

    def test_create_assignment_specific_requires_report_types(
        self, http, admin, assignee_user, owner_session
    ):
        r = http.post(
            f"{API}/assignments",
            json={
                "session_id": owner_session["id"],
                "assigned_to": assignee_user["id"],
                "assignment_type": "specific_reports",
                "report_types": [],
            },
            headers=_hdr(admin["id"]),
        )
        assert r.status_code == 400, r.text

    def test_self_assignment_blocked(self, http, admin, owner_session):
        r = http.post(
            f"{API}/assignments",
            json={
                "session_id": owner_session["id"],
                "assigned_to": admin["id"],
                "assignment_type": "full_session",
            },
            headers=_hdr(admin["id"]),
        )
        assert r.status_code == 400, r.text

    def test_assignee_does_not_exist(self, http, admin, owner_session):
        r = http.post(
            f"{API}/assignments",
            json={
                "session_id": owner_session["id"],
                "assigned_to": "nonexistent-user-" + uuid.uuid4().hex,
                "assignment_type": "full_session",
            },
            headers=_hdr(admin["id"]),
        )
        assert r.status_code == 404, r.text

    def test_only_owner_can_assign(self, http, stranger_user, assignee_user, owner_session):
        """A non-owner posting an assignment must get 403."""
        r = http.post(
            f"{API}/assignments",
            json={
                "session_id": owner_session["id"],
                "assigned_to": assignee_user["id"],
                "assignment_type": "full_session",
            },
            headers=_hdr(stranger_user["id"]),
        )
        assert r.status_code == 403, r.text

    def test_list_my_assignments(self, http, assignee_user):
        r = http.get(f"{API}/assignments/my", headers=_hdr(assignee_user["id"]))
        assert r.status_code == 200, r.text
        data = r.json()
        assert "assignments" in data and "count" in data
        assert data["count"] >= 1
        assert all(a["assigned_to"] == assignee_user["id"] and a["is_active"] for a in data["assignments"])

    def test_list_by_me_assignments(self, http, admin):
        r = http.get(f"{API}/assignments/by-me", headers=_hdr(admin["id"]))
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["count"] >= 1
        assert all(a["assigned_by"] == admin["id"] for a in data["assignments"])

    def test_list_assignable_users_excludes_caller(self, http, admin):
        r = http.get(f"{API}/assignments/users", headers=_hdr(admin["id"]))
        assert r.status_code == 200
        users = r.json()["users"]
        ids = [u["id"] for u in users]
        assert admin["id"] not in ids
        # All approved + active
        for u in users:
            assert u.get("is_approved") is True
            assert u.get("is_active", True) is True


# ─────────────────────────────────────── /assignments/check matrix
class TestAssignmentCheck:
    def test_owner_check_returns_owner_full(self, http, admin, owner_session):
        r = http.get(
            f"{API}/assignments/check",
            params={"session_id": owner_session["id"], "report_type": "barcode-wise"},
            headers=_hdr(admin["id"]),
        )
        assert r.status_code == 200
        d = r.json()
        assert d["is_owner"] is True
        assert d["has_access"] is True
        assert d["can_edit_all"] is True
        assert d["can_edit_reco"] is True

    def test_assignee_full_session_detailed_edit_reco(self, http, assignee_user, owner_session):
        r = http.get(
            f"{API}/assignments/check",
            params={"session_id": owner_session["id"], "report_type": "detailed"},
            headers=_hdr(assignee_user["id"]),
        )
        d = r.json()
        assert d["has_access"] is True
        assert d["is_owner"] is False
        assert d["can_edit_reco"] is True
        assert d["can_edit_all"] is False

    def test_assignee_full_session_other_report_no_reco_edit(
        self, http, assignee_user, owner_session
    ):
        r = http.get(
            f"{API}/assignments/check",
            params={"session_id": owner_session["id"], "report_type": "barcode-wise"},
            headers=_hdr(assignee_user["id"]),
        )
        d = r.json()
        assert d["has_access"] is True
        assert d["can_edit_reco"] is False
        assert d["can_edit_all"] is False

    def test_stranger_no_access(self, http, stranger_user, owner_session):
        r = http.get(
            f"{API}/assignments/check",
            params={"session_id": owner_session["id"], "report_type": "detailed"},
            headers=_hdr(stranger_user["id"]),
        )
        d = r.json()
        assert d["has_access"] is False
        assert d["can_edit_reco"] is False
        assert d["can_edit_all"] is False
        assert d["is_owner"] is False

    def test_specific_reports_scoping(self, http, admin, assignee_user, owner_client):
        """Create a specific_reports assignment on a NEW session and verify
        check honours the report_types list."""
        # New session so test is isolated from full_session assignment above
        sess_payload = {
            "client_id": owner_client["id"],
            "name": f"TEST_spec_{uuid.uuid4().hex[:6]}",
            "variance_mode": "bin-wise",
            "start_date": datetime.now(timezone.utc).isoformat(),
        }
        sess = (http.post(f"{API}/sessions", json=sess_payload).json().get("session") or {})
        sid = sess["id"]
        r = http.post(
            f"{API}/assignments",
            json={
                "session_id": sid,
                "assigned_to": assignee_user["id"],
                "assignment_type": "specific_reports",
                "report_types": ["detailed"],
            },
            headers=_hdr(admin["id"]),
        )
        assert r.status_code == 200, r.text

        # Access on detailed → yes
        d1 = http.get(
            f"{API}/assignments/check",
            params={"session_id": sid, "report_type": "detailed"},
            headers=_hdr(assignee_user["id"]),
        ).json()
        assert d1["has_access"] is True
        assert d1["can_edit_reco"] is True

        # Access on barcode-wise → NO
        d2 = http.get(
            f"{API}/assignments/check",
            params={"session_id": sid, "report_type": "barcode-wise"},
            headers=_hdr(assignee_user["id"]),
        ).json()
        assert d2["has_access"] is False, d2


# ─────────────────────────────────────── Edit-gate enforcement
class TestEditGates:
    def test_edit_barcode_assignee_blocked(self, http, assignee_user, owner_client, owner_session):
        r = http.post(
            f"{API}/reports/edit-barcode",
            json={
                "client_id": owner_client["id"],
                "report_type": "barcode-wise",
                "original_value": "111",
                "new_value": "222",
                "session_id": owner_session["id"],
            },
            headers=_hdr(assignee_user["id"], assignee_user["username"]),
        )
        assert r.status_code == 403, r.text

    def test_undo_edit_assignee_blocked(self, http, admin, assignee_user, owner_client, owner_session):
        # The /reports/edit-barcode endpoint validates new_value against
        # master data, which would require a full master-stock import to
        # exercise. To test ONLY the ACL gate, seed a barcode_edits row
        # directly via pymongo.
        import os
        from pymongo import MongoClient
        cli = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
        db = cli[os.environ.get("DB_NAME", "audix_db")]
        edit_id = "TEST_edit_" + uuid.uuid4().hex[:8]
        db.barcode_edits.insert_one({
            "id": edit_id,
            "client_id": owner_client["id"],
            "session_id": owner_session["id"],
            "report_type": "barcode-wise",
            "original_value": "UNDOSRC",
            "new_value": "UNDODST",
            "location": "",
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

        try:
            r = http.post(
                f"{API}/reports/undo-edit",
                json={
                    "edit_id": edit_id,
                    "client_id": owner_client["id"],
                    "session_id": owner_session["id"],
                },
                headers=_hdr(assignee_user["id"], assignee_user["username"]),
            )
            assert r.status_code == 403, r.text
        finally:
            db.barcode_edits.delete_one({"id": edit_id})
            cli.close()

    def test_reco_detailed_assignee_allowed(
        self, http, assignee_user, owner_client, owner_session
    ):
        r = http.post(
            f"{API}/reco-adjustments",
            json={
                "client_id": owner_client["id"],
                "reco_type": "detailed",
                "barcode": "TESTBC1",
                "location": "LOC1",
                "reco_qty": 5,
                "session_id": owner_session["id"],
                "user_id": assignee_user["id"],
                "username": assignee_user["username"],
            },
            headers=_hdr(assignee_user["id"], assignee_user["username"]),
        )
        assert r.status_code == 200, r.text
        assert r.json().get("status") == "saved"

    def test_reco_barcode_assignee_blocked(
        self, http, assignee_user, owner_client, owner_session
    ):
        r = http.post(
            f"{API}/reco-adjustments",
            json={
                "client_id": owner_client["id"],
                "reco_type": "barcode",
                "barcode": "TESTBC2",
                "reco_qty": 5,
                "session_id": owner_session["id"],
            },
            headers=_hdr(assignee_user["id"], assignee_user["username"]),
        )
        assert r.status_code == 403, r.text

    def test_reco_article_assignee_blocked(
        self, http, assignee_user, owner_client, owner_session
    ):
        r = http.post(
            f"{API}/reco-adjustments",
            json={
                "client_id": owner_client["id"],
                "reco_type": "article",
                "article_code": "ART1",
                "reco_qty": 5,
                "session_id": owner_session["id"],
            },
            headers=_hdr(assignee_user["id"], assignee_user["username"]),
        )
        assert r.status_code == 403, r.text

    def test_owner_reco_any_type_allowed(self, http, admin, owner_client, owner_session):
        for reco_type, extra in [
            ("detailed", {"barcode": "OWNBC", "location": "OLOC"}),
            ("barcode", {"barcode": "OWNBC2"}),
            ("article", {"article_code": "OWNART"}),
        ]:
            r = http.post(
                f"{API}/reco-adjustments",
                json={
                    "client_id": owner_client["id"],
                    "reco_type": reco_type,
                    "reco_qty": 3,
                    "session_id": owner_session["id"],
                    **extra,
                },
                headers=_hdr(admin["id"], admin["username"]),
            )
            assert r.status_code == 200, f"owner reco_type={reco_type}: {r.text}"

    def test_no_xuserid_legacy_allowed(self, http, owner_client, owner_session):
        """Backward compat — calls without X-User-Id should not be blocked."""
        r = http.post(
            f"{API}/reco-adjustments",
            json={
                "client_id": owner_client["id"],
                "reco_type": "detailed",
                "barcode": "LEGACYBC",
                "location": "LEGLOC",
                "reco_qty": 1,
                "session_id": owner_session["id"],
            },
        )
        assert r.status_code == 200, r.text


# ─────────────────────────────────────── Revoke + post-revoke gates
class TestRevoke:
    def test_revoke_forbidden_for_non_assigner(self, http, stranger_user):
        aid = getattr(pytest, "full_assignment_id", None)
        assert aid, "Need an assignment id from earlier test"
        r = http.delete(
            f"{API}/assignments/{aid}", headers=_hdr(stranger_user["id"])
        )
        assert r.status_code == 403, r.text

    def test_revoke_by_owner(self, http, admin):
        aid = getattr(pytest, "full_assignment_id", None)
        r = http.delete(f"{API}/assignments/{aid}", headers=_hdr(admin["id"]))
        assert r.status_code == 200, r.text

    def test_revoke_idempotent(self, http, admin):
        aid = getattr(pytest, "full_assignment_id", None)
        r = http.delete(f"{API}/assignments/{aid}", headers=_hdr(admin["id"]))
        assert r.status_code == 200, r.text

    def test_post_revoke_check_partial(self, http, assignee_user, owner_session):
        """After revoking the FULL_SESSION row, assignee may still have the
        specific_reports row (detailed only). Verify barcode-wise is blocked."""
        d = http.get(
            f"{API}/assignments/check",
            params={"session_id": owner_session["id"], "report_type": "barcode-wise"},
            headers=_hdr(assignee_user["id"]),
        ).json()
        assert d["has_access"] is False
        assert d["can_edit_reco"] is False


# ─────────────────────────────────────── Cycle-count gate (best effort)
class TestCycleCountGates:
    """Verifies non-owner X-User-Id is blocked on cycle-count destructive
    ops. Uses an existing cycle project if any; otherwise creates a fresh
    cycle_count client + project + day.
    """

    @pytest.fixture(scope="class")
    def cc_project_and_day(self, http, admin):
        # Create cycle_count client
        code = f"CC{uuid.uuid4().hex[:6].upper()}"
        cr = http.post(
            f"{API}/clients",
            json={"name": f"TEST_cc_{code}", "code": code, "client_type": "cycle_count"},
            headers=_hdr(admin["id"]),
        )
        if cr.status_code != 200:
            pytest.skip(f"client create failed: {cr.text}")
        client = (cr.json().get("client") or cr.json())
        # Create project
        pr = http.post(
            f"{API}/cycle-count/projects",
            json={"client_id": client["id"], "name": "TEST_proj"},
            headers=_hdr(admin["id"], admin["username"]),
        )
        if pr.status_code != 200:
            pytest.skip(f"cc project create failed: {pr.status_code} {pr.text}")
        proj = (pr.json().get("project") or pr.json())
        # Create day
        dr = http.post(
            f"{API}/cycle-count/days",
            json={"project_id": proj["id"]},
            headers=_hdr(admin["id"], admin["username"]),
        )
        if dr.status_code != 200:
            pytest.skip(f"cc day create failed: {dr.status_code} {dr.text}")
        day = (dr.json().get("day") or dr.json())
        return {"client": client, "project": proj, "day": day}

    def test_close_day_non_owner_blocked(self, http, stranger_user, cc_project_and_day):
        day_id = cc_project_and_day["day"]["id"]
        r = http.post(
            f"{API}/cycle-count/days/{day_id}/close",
            json={"confirm": True},
            headers=_hdr(stranger_user["id"], stranger_user["username"]),
        )
        assert r.status_code == 403, r.text

    def test_delete_day_non_owner_blocked(self, http, stranger_user, cc_project_and_day):
        day_id = cc_project_and_day["day"]["id"]
        r = http.delete(
            f"{API}/cycle-count/days/{day_id}",
            headers=_hdr(stranger_user["id"], stranger_user["username"]),
        )
        assert r.status_code == 403, r.text

    def test_delete_project_non_owner_blocked(self, http, stranger_user, cc_project_and_day):
        pid = cc_project_and_day["project"]["id"]
        r = http.delete(
            f"{API}/cycle-count/projects/{pid}",
            headers=_hdr(stranger_user["id"], stranger_user["username"]),
        )
        assert r.status_code == 403, r.text

    def test_close_day_owner_allowed(self, http, admin, cc_project_and_day):
        day_id = cc_project_and_day["day"]["id"]
        r = http.post(
            f"{API}/cycle-count/days/{day_id}/close",
            json={"confirm": True},
            headers=_hdr(admin["id"], admin["username"]),
        )
        # 200 (closed) or 400 (already closed / business rule) — owner not blocked by ACL
        assert r.status_code != 403, r.text
