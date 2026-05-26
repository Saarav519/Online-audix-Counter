"""
Prompt 4 fix re-test (actor resolution invariant):

Spec — actor_id is read ONLY from X-User-Id header. If absent OR if header refers
to a synthetic id not in portal_users, the ACL gate is bypassed (legacy). If
header is present AND belongs to a real portal_users row AND user is not
owner/assignee → 403.

Four explicit scenarios:
  1) POST /reco-adjustments  — NO X-User-Id, body user_id=synthetic → 200
  2) POST /reco-adjustments  — X-User-Id of real non-owner non-assignee → 403
  3) POST /cycle-count/days/{id}/close — X-User-Id=synthetic id → bypass (not 403)
  4) Same — X-User-Id of real non-owner portal_user → 403
"""
import os
import uuid
import requests
import pytest


def _read_frontend_env():
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                line = line.strip()
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    except Exception:
        return None
    return None


BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _read_frontend_env() or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not configured"
API = f"{BASE_URL}/api/audit/portal"
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "admin123"


def _hdr(uid, uname=""):
    h = {}
    if uid:
        h["X-User-Id"] = uid
    if uname:
        h["X-Username"] = uname
    return h


@pytest.fixture(scope="module")
def http():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin(http):
    r = http.post(f"{API}/login",
                  json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    u = r.json().get("user") or r.json()
    assert u.get("id")
    return u


@pytest.fixture(scope="module")
def stranger(http, admin):
    uname = f"TEST_invar_str_{uuid.uuid4().hex[:8]}"
    http.post(f"{API}/register",
              json={"username": uname, "password": "Pass123!", "full_name": uname}, timeout=15)
    target = next((x for x in http.get(f"{API}/users").json() if x.get("username") == uname), None)
    assert target
    r = http.put(f"{API}/users/{target['id']}/approve",
                 headers=_hdr(admin["id"], admin["username"]))
    assert r.status_code == 200, r.text
    return target


@pytest.fixture(scope="module")
def owner_client(http, admin):
    """Cycle-count client (so we can also create cc project/day on it)."""
    code = f"INV{uuid.uuid4().hex[:6].upper()}"
    r = http.post(f"{API}/clients",
                  json={"name": f"TEST_inv_{code}", "code": code, "client_type": "cycle_count"},
                  headers=_hdr(admin["id"]))
    assert r.status_code == 200, r.text
    return r.json().get("client") or r.json()


@pytest.fixture(scope="module")
def owner_session(http, admin, owner_client):
    """Best-effort session create for the client; if unavailable, return None."""
    r = http.post(f"{API}/sessions",
                  json={"client_id": owner_client["id"], "name": "TEST_inv_session"},
                  headers=_hdr(admin["id"], admin["username"]))
    if r.status_code != 200:
        return None
    return r.json().get("session") or r.json()


@pytest.fixture(scope="module")
def cc_day(http, admin, owner_client):
    pr = http.post(f"{API}/cycle-count/projects",
                   json={"client_id": owner_client["id"], "name": "TEST_inv_proj"},
                   headers=_hdr(admin["id"], admin["username"]))
    assert pr.status_code == 200, pr.text
    proj = pr.json().get("project") or pr.json()
    dr = http.post(f"{API}/cycle-count/days",
                   json={"project_id": proj["id"]},
                   headers=_hdr(admin["id"], admin["username"]))
    assert dr.status_code == 200, dr.text
    day = dr.json().get("day") or dr.json()
    return {"project_id": proj["id"], "day_id": day["id"]}


# ───────── Scenarios ─────────

def test_1_reco_no_header_synthetic_body_userid_is_legacy_200(http, owner_client, owner_session):
    payload = {
        "client_id": owner_client["id"],
        "reco_type": "detailed",
        "barcode": f"INVBC_{uuid.uuid4().hex[:6]}",
        "location": "LOC",
        "reco_qty": 1,
        "user_id": f"synthetic-{uuid.uuid4().hex}",
    }
    if owner_session:
        payload["session_id"] = owner_session["id"]
    r = http.post(f"{API}/reco-adjustments", json=payload, timeout=15)
    assert r.status_code == 200, f"got {r.status_code}: {r.text}"


def test_2_reco_real_non_owner_xuserid_is_403(http, stranger, owner_client, owner_session):
    payload = {
        "client_id": owner_client["id"],
        "reco_type": "detailed",
        "barcode": f"INVBC_{uuid.uuid4().hex[:6]}",
        "location": "LOC",
        "reco_qty": 1,
    }
    if owner_session:
        payload["session_id"] = owner_session["id"]
    r = http.post(f"{API}/reco-adjustments", json=payload,
                  headers=_hdr(stranger["id"], stranger.get("username", "")), timeout=15)
    assert r.status_code == 403, f"got {r.status_code}: {r.text}"


def test_3_cc_close_day_synthetic_xuserid_is_bypassed(http, admin, cc_day):
    """Synthetic X-User-Id not in portal_users → ACL bypassed (legacy)."""
    day_id = cc_day["day_id"]
    synthetic = f"synthetic-{uuid.uuid4().hex}"
    r = http.post(f"{API}/cycle-count/days/{day_id}/close",
                  json={"confirm": True}, headers=_hdr(synthetic), timeout=15)
    # bypassed → must NOT be 403; success or 400 (already closed) are acceptable
    assert r.status_code != 403, f"expected legacy bypass, got 403: {r.text}"
    # cleanup → admin reopen
    http.post(f"{API}/cycle-count/days/{day_id}/reopen",
              json={"confirm": True}, headers=_hdr(admin["id"], admin["username"]))


def test_4_cc_close_day_real_non_owner_xuserid_is_403(http, admin, stranger, cc_day):
    day_id = cc_day["day_id"]
    # ensure day is open
    http.post(f"{API}/cycle-count/days/{day_id}/reopen",
              json={"confirm": True}, headers=_hdr(admin["id"], admin["username"]))
    r = http.post(f"{API}/cycle-count/days/{day_id}/close",
                  json={"confirm": True},
                  headers=_hdr(stranger["id"], stranger.get("username", "")), timeout=15)
    assert r.status_code == 403, f"got {r.status_code}: {r.text}"
