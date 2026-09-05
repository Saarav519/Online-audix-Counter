"""
Movement / Audit Log backend tests — covers shared/audit_log_helper.py
and the new endpoints under /api/audit/portal/audit-logs/* plus the
non-blocking audit hooks in audit_routes.py & cycle_count_routes.py.

Run:
  pytest /app/backend/tests/test_audit_movement_log.py -v \
    --junitxml=/app/test_reports/pytest/movement_audit_log.xml
"""
from __future__ import annotations

import io
import os
import time
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path

import pytest
import requests

REPO_ROOT = Path(__file__).resolve().parents[2]

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://counter-app-demo-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api/audit/portal"
CYCLE = f"{BASE_URL}/api/audit/portal/cycle-count"

# Unique tag so we can scope every assertion to data this test created
RUN_TAG = f"TEST_MOV_{uuid.uuid4().hex[:8]}"
TEST_USER_ID = f"u_{RUN_TAG}"
TEST_USERNAME = f"user_{RUN_TAG}"


# --------------------------- fixtures --------------------------------

@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def warehouse_client(session):
    """Create a warehouse client + audit session for warehouse-module tests."""
    code = f"{RUN_TAG}_WH"
    r = session.post(f"{API}/clients", json={
        "name": f"WH {RUN_TAG}", "code": code, "client_type": "store",
    })
    assert r.status_code in (200, 201), r.text
    cid = r.json()["client"]["id"]

    s_r = session.post(f"{API}/sessions", json={
        "client_id": cid,
        "name": f"Sess {RUN_TAG}",
        "variance_mode": "bin-wise",
        "start_date": datetime.now(timezone.utc).isoformat(),
    })
    assert s_r.status_code in (200, 201), s_r.text
    sid = s_r.json().get("id") or s_r.json().get("session", {}).get("id")

    yield {"client_id": cid, "session_id": sid}

    # cleanup
    try:
        session.delete(f"{API}/clients/{cid}")
    except Exception:
        pass


@pytest.fixture(scope="module")
def cycle_setup(session):
    """Create a cycle_count client + project + day for cycle tests."""
    code = f"{RUN_TAG}_CC"
    r = session.post(f"{API}/clients", json={
        "name": f"CC {RUN_TAG}", "code": code, "client_type": "cycle_count",
    })
    assert r.status_code in (200, 201), r.text
    cid = r.json()["client"]["id"]

    p = session.post(f"{CYCLE}/projects", json={"client_id": cid, "name": f"P {RUN_TAG}"})
    assert p.status_code in (200, 201), p.text
    pid = p.json()["id"]

    d = session.post(f"{CYCLE}/days", json={"project_id": pid})
    assert d.status_code in (200, 201), d.text
    day = d.json()
    day_id = day["id"]
    day_no = day["day_no"]
    sid = (p.json().get("audit_session_id")) or ""

    yield {"client_id": cid, "project_id": pid, "day_id": day_id, "day_no": day_no, "session_id": sid}

    try:
        session.delete(f"{API}/clients/{cid}")
    except Exception:
        pass


# ----------------------- Helper -----------------------

def _search(session, **filters):
    r = session.post(f"{API}/audit-logs/search", json=filters)
    assert r.status_code == 200, r.text
    return r.json()


# ----------------------- 1. SEARCH endpoint -----------------------

class TestSearchEndpoint:

    def test_search_empty_filters_returns_shape(self, session):
        r = session.post(f"{API}/audit-logs/search", json={})
        assert r.status_code == 200
        data = r.json()
        assert "logs" in data and isinstance(data["logs"], list)
        assert "total" in data and isinstance(data["total"], int)
        assert data.get("limit") == 50
        assert data.get("skip") == 0

    def test_pagination_limit_skip(self, session):
        r = session.post(f"{API}/audit-logs/search", json={"limit": 5, "skip": 0})
        assert r.status_code == 200
        d = r.json()
        assert d["limit"] == 5 and d["skip"] == 0
        assert len(d["logs"]) <= 5

    def test_pagination_default_and_cap(self, session):
        d_def = _search(session)
        assert d_def["limit"] == 50

        d_cap = _search(session, limit=10_000)
        assert d_cap["limit"] == 500, "limit must be capped at 500"

    def test_module_filter_all(self, session):
        d = _search(session, module="all")
        assert isinstance(d["logs"], list)


# ----------------------- 2. RECENT endpoint -----------------------

class TestRecentEndpoint:

    def test_recent_no_match(self, session):
        r = session.get(f"{API}/audit-logs/recent",
                        params={"barcode": f"NOEXIST_{RUN_TAG}", "limit": 5})
        assert r.status_code == 200
        body = r.json()
        assert body == {"logs": []} or body.get("logs") == []

    def test_recent_requires_barcode(self, session):
        r = session.get(f"{API}/audit-logs/recent")
        # FastAPI returns 422 when required query param is missing
        assert r.status_code in (400, 422)


# ----------------------- 3. EXPORT endpoint -----------------------

class TestExportEndpoint:

    def test_export_returns_valid_xlsx(self, session):
        r = session.post(f"{API}/audit-logs/export", json={})
        assert r.status_code == 200
        ct = r.headers.get("content-type", "")
        assert "spreadsheetml.sheet" in ct, f"Bad content-type: {ct}"
        # PK zip signature for any xlsx file
        assert r.content[:4] == b"PK\x03\x04", "XLSX must start with PK zip signature"

    def test_export_with_filters_still_valid(self, session):
        r = session.post(f"{API}/audit-logs/export",
                         json={"module": "warehouse", "limit": 100})
        assert r.status_code == 200
        assert r.content[:4] == b"PK\x03\x04"


# ----------------------- 4. CYCLE COUNT day/project hooks -----------------------

class TestCycleCountHooks:
    """Verifies log entries written by cycle_count_routes.py for
    close-day / reopen-day / delete-day / complete-project / reopen-project /
    delete-project, with X-User-Id + X-Username headers picked up by
    _user_from_request()."""

    def _user_headers(self):
        return {"X-User-Id": TEST_USER_ID, "X-Username": TEST_USERNAME,
                "Content-Type": "application/json"}

    def _wait_log(self, session, *, action_type, field_name, client_id, day_no=None, timeout=5):
        """Poll audit-logs/search briefly because logging is async."""
        deadline = time.time() + timeout
        last = None
        while time.time() < deadline:
            d = _search(session, module="cycle_count", client_id=client_id,
                        action_type=action_type, limit=20)
            for row in d["logs"]:
                if row.get("field_name") != field_name:
                    continue
                if day_no is not None and row.get("cycle_day") != day_no:
                    continue
                return row
            last = d
            time.sleep(0.3)
        raise AssertionError(f"No audit_log found action={action_type} field={field_name} day={day_no}; last={last}")

    def test_close_day_logs_assign(self, session, cycle_setup):
        cs = cycle_setup
        r = session.post(f"{CYCLE}/days/{cs['day_id']}/close",
                         json={"confirm": True}, headers=self._user_headers())
        assert r.status_code == 200, r.text
        row = self._wait_log(session, action_type="assign", field_name="day_status",
                             client_id=cs["client_id"], day_no=cs["day_no"])
        assert row["module"] == "cycle_count"
        assert row["old_value"] == "open"
        assert row["new_value"] == "closed"
        assert row["user_id"] == TEST_USER_ID
        assert row["username"] == TEST_USERNAME

    def test_reopen_day_logs_revoke(self, session, cycle_setup):
        cs = cycle_setup
        r = session.post(f"{CYCLE}/days/{cs['day_id']}/reopen",
                         headers=self._user_headers())
        assert r.status_code == 200, r.text
        row = self._wait_log(session, action_type="revoke", field_name="day_status",
                             client_id=cs["client_id"], day_no=cs["day_no"])
        assert row["old_value"] == "closed"
        assert row["new_value"] == "open"

    def test_complete_project_logs_assign(self, session, cycle_setup):
        cs = cycle_setup
        r = session.post(f"{CYCLE}/projects/{cs['project_id']}/complete",
                         headers=self._user_headers())
        assert r.status_code == 200, r.text
        row = self._wait_log(session, action_type="assign", field_name="project_status",
                             client_id=cs["client_id"])
        assert row["old_value"] == "active" and row["new_value"] == "completed"

    def test_reopen_project_logs_revoke(self, session, cycle_setup):
        cs = cycle_setup
        r = session.post(f"{CYCLE}/projects/{cs['project_id']}/reopen",
                         headers=self._user_headers())
        assert r.status_code == 200, r.text
        row = self._wait_log(session, action_type="revoke", field_name="project_status",
                             client_id=cs["client_id"])
        assert row["old_value"] == "completed" and row["new_value"] == "active"

    def test_delete_day_logs_delete(self, session, cycle_setup):
        cs = cycle_setup
        r = session.delete(f"{CYCLE}/days/{cs['day_id']}", headers=self._user_headers())
        assert r.status_code == 200, r.text
        row = self._wait_log(session, action_type="delete", field_name="day",
                             client_id=cs["client_id"])
        assert row["module"] == "cycle_count"

    def test_delete_project_logs_delete(self, session, cycle_setup):
        cs = cycle_setup
        r = session.delete(f"{CYCLE}/projects/{cs['project_id']}", headers=self._user_headers())
        assert r.status_code == 200, r.text
        row = self._wait_log(session, action_type="delete", field_name="project",
                             client_id=cs["client_id"])
        assert row["module"] == "cycle_count"
        assert row["user_id"] == TEST_USER_ID


# ----------------------- 5. RECO ADJUSTMENTS hook -----------------------

class TestRecoAdjustmentHook:

    def test_reco_adjust_warehouse_create(self, session, warehouse_client):
        wc = warehouse_client
        barcode = f"BAR_{RUN_TAG}_1"
        payload = {
            "client_id": wc["client_id"],
            "reco_type": "barcode",
            "barcode": barcode,
            "reco_qty": 7,
            "user_id": TEST_USER_ID,
            "username": TEST_USERNAME,
            "session_id": wc["session_id"],
        }
        r = session.post(f"{API}/reco-adjustments", json=payload)
        assert r.status_code == 200, r.text

        time.sleep(0.5)
        d = _search(session, module="warehouse", client_id=wc["client_id"],
                    action_type="reco_adjust", barcode=barcode, limit=10)
        rows = [r_ for r_ in d["logs"] if r_.get("barcode") == barcode]
        assert rows, f"No reco_adjust log for {barcode}: {d}"
        row = rows[0]
        assert row["field_name"] == "reco_qty"
        assert row["new_value"] == "7"
        assert row["user_id"] == TEST_USER_ID

    def test_reco_adjust_zero_logs_deletion(self, session, warehouse_client):
        wc = warehouse_client
        barcode = f"BAR_{RUN_TAG}_2"
        # First create with qty=4
        r1 = session.post(f"{API}/reco-adjustments", json={
            "client_id": wc["client_id"], "reco_type": "barcode",
            "barcode": barcode, "reco_qty": 4,
            "user_id": TEST_USER_ID, "username": TEST_USERNAME,
            "session_id": wc["session_id"],
        })
        assert r1.status_code == 200, r1.text
        # Then set to 0 (deletion)
        r2 = session.post(f"{API}/reco-adjustments", json={
            "client_id": wc["client_id"], "reco_type": "barcode",
            "barcode": barcode, "reco_qty": 0,
            "user_id": TEST_USER_ID, "username": TEST_USERNAME,
            "session_id": wc["session_id"],
        })
        assert r2.status_code == 200, r2.text

        time.sleep(0.5)
        d = _search(session, module="warehouse", client_id=wc["client_id"],
                    action_type="reco_adjust", barcode=barcode, limit=20)
        zero_rows = [r_ for r_ in d["logs"] if r_.get("new_value") == "0"]
        assert zero_rows, f"No reco_adjust zero log for {barcode}: {d}"


# ----------------------- 6. FILTER COVERAGE on populated data -----------------------

class TestFiltersOnRealData:
    """After the cycle + reco fixtures run, audit_logs has known rows we
    can use to validate every filter dimension."""

    def test_filter_by_user_id(self, session):
        d = _search(session, user_id=TEST_USER_ID, limit=200)
        assert d["total"] >= 1
        for row in d["logs"]:
            assert row["user_id"] == TEST_USER_ID

    def test_filter_module_cycle_count(self, session):
        d = _search(session, module="cycle_count", user_id=TEST_USER_ID, limit=100)
        assert d["total"] >= 1
        for row in d["logs"]:
            assert row["module"] == "cycle_count"

    def test_filter_module_warehouse(self, session):
        d = _search(session, module="warehouse", user_id=TEST_USER_ID, limit=100)
        # Warehouse rows come from reco-adjustments
        assert d["total"] >= 1
        for row in d["logs"]:
            assert row["module"] == "warehouse"

    def test_filter_by_client_id(self, session, warehouse_client):
        d = _search(session, client_id=warehouse_client["client_id"], limit=100)
        assert d["total"] >= 1
        for row in d["logs"]:
            assert row["client_id"] == warehouse_client["client_id"]

    def test_filter_by_barcode_substring(self, session):
        # All reco_adjust barcodes contain RUN_TAG
        d = _search(session, barcode=RUN_TAG, limit=100)
        assert d["total"] >= 1
        for row in d["logs"]:
            assert RUN_TAG in row["barcode"]

    def test_filter_by_cycle_day(self, session):
        d = _search(session, module="cycle_count", user_id=TEST_USER_ID,
                    cycle_day=1, limit=100)
        for row in d["logs"]:
            assert row.get("cycle_day") == 1

    def test_filter_by_date_range_inclusive(self, session):
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        d = _search(session, user_id=TEST_USER_ID,
                    start_date=today, end_date=today, limit=200)
        # Our test rows were just created — must be in range
        assert d["total"] >= 1, "Inclusive same-day date filter must include today's rows"

    def test_filter_by_date_range_past_excludes(self, session):
        past = (datetime.now(timezone.utc) - timedelta(days=10)).strftime("%Y-%m-%d")
        d = _search(session, user_id=TEST_USER_ID,
                    start_date=past, end_date=past, limit=200)
        assert d["total"] == 0, "Past-only window must exclude today's rows"

    def test_recent_endpoint_returns_rows_after_data(self, session):
        # Try with the first reco-adjust barcode that should exist
        d = _search(session, action_type="reco_adjust", user_id=TEST_USER_ID, limit=1)
        if not d["logs"]:
            pytest.skip("No reco_adjust rows yet")
        bar = d["logs"][0]["barcode"]
        cid = d["logs"][0]["client_id"]
        r = session.get(f"{API}/audit-logs/recent",
                        params={"barcode": bar, "client_id": cid, "limit": 5})
        assert r.status_code == 200
        rows = r.json().get("logs", [])
        assert len(rows) >= 1
        for row in rows:
            assert row["barcode"] == bar


# ----------------------- 7. NON-BLOCKING / try-except verification -----------------------

class TestNonBlockingCodeReview:
    def test_log_audit_entry_wrapped_in_try_except(self):
        """Static code check: helper must swallow exceptions."""
        with open(REPO_ROOT / "backend" / "shared" / "audit_log_helper.py", encoding="utf-8") as f:
            src = f.read()
        assert "try:" in src and "except Exception" in src
        assert "NEVER raise" in src or "non-fatal" in src
        # The function body must contain the try block before insert_one
        idx_def = src.index("async def log_audit_entry")
        idx_insert = src.index("audit_logs.insert_one", idx_def)
        idx_try = src.index("try:", idx_def)
        idx_except = src.index("except Exception", idx_def)
        assert idx_try < idx_insert < idx_except


# ----------------------- 8. MongoDB INDEXES -----------------------

class TestMongoIndexes:
    def test_indexes_exist(self):
        try:
            from pymongo import MongoClient
        except ImportError:
            pytest.skip("pymongo not available")
        from dotenv import load_dotenv
        load_dotenv("/app/backend/.env")
        mongo_url = os.environ.get("MONGO_URL")
        db_name = os.environ.get("DB_NAME")
        if not mongo_url or not db_name:
            pytest.skip("MONGO_URL/DB_NAME not configured")

        client = MongoClient(mongo_url)
        try:
            db = client[db_name]
            info = db.audit_logs.index_information()
            # Build a normalized set of index key tuples
            keys_set = set()
            for _name, meta in info.items():
                keys_set.add(tuple(meta["key"]))
            expected = [
                (("barcode", 1), ("client_id", 1), ("timestamp_dt", -1)),
                (("session_id", 1), ("timestamp_dt", -1)),
                (("user_id", 1), ("timestamp_dt", -1)),
                (("client_id", 1), ("timestamp_dt", -1)),
                (("module", 1), ("timestamp_dt", -1)),
                (("timestamp_dt", -1),),
            ]
            missing = [e for e in expected if e not in keys_set]
            assert not missing, f"Missing audit_logs indexes: {missing}; got {keys_set}"
        finally:
            client.close()
