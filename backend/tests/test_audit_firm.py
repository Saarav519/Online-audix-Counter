"""The auditing company travels with the client.

One portal, several firms working in it. A report must carry the firm that
actually did that client's audit, not the portal owner's name — so the firm is
stored on the client and read back with it everywhere the client is fetched.
"""
import uuid

import pytest
import requests

from conftest import get_admin_password

FIRM = "Sharma & Associates LLP"


def _hdr(u):
    return {"Content-Type": "application/json",
            "X-User-Id": u["id"], "X-Username": u.get("username", "")}


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
def client_with_firm(portal, admin):
    code = f"AF{uuid.uuid4().hex[:6].upper()}"
    r = requests.post(f"{portal}/clients", json={
        "name": f"TEST firm {code}", "code": code,
        "client_type": "warehouse", "audit_firm": FIRM},
        headers=_hdr(admin), timeout=30)
    assert r.status_code == 200, r.text
    cid = r.json()["client"]["id"]
    yield cid
    requests.delete(f"{portal}/clients/{cid}", timeout=60)


def test_create_stores_the_firm(portal, admin, client_with_firm):
    r = requests.get(f"{portal}/clients/{client_with_firm}", timeout=30)
    assert r.status_code == 200, r.text
    assert r.json()["audit_firm"] == FIRM


def test_firm_comes_back_in_the_list(portal, client_with_firm):
    """The reports page reads the firm off the client list, not a lookup."""
    rows = requests.get(f"{portal}/clients", timeout=30).json()
    row = next(c for c in rows if c["id"] == client_with_firm)
    assert row["audit_firm"] == FIRM


def test_firm_is_editable(portal, admin, client_with_firm):
    existing = requests.get(f"{portal}/clients/{client_with_firm}", timeout=30).json()
    r = requests.put(f"{portal}/clients/{client_with_firm}", json={
        "name": existing["name"], "code": existing["code"],
        "client_type": existing["client_type"], "audit_firm": "Verma Audit Co."},
        headers=_hdr(admin), timeout=30)
    assert r.status_code == 200, r.text
    assert requests.get(f"{portal}/clients/{client_with_firm}",
                        timeout=30).json()["audit_firm"] == "Verma Audit Co."


def test_omitting_the_firm_is_allowed(portal, admin):
    """Existing clients were created without this field and must keep working;
    the PDF falls back to the portal's own brand when it is blank."""
    code = f"AN{uuid.uuid4().hex[:6].upper()}"
    r = requests.post(f"{portal}/clients", json={
        "name": f"TEST nofirm {code}", "code": code, "client_type": "store"},
        headers=_hdr(admin), timeout=30)
    assert r.status_code == 200, r.text
    cid = r.json()["client"]["id"]
    try:
        assert requests.get(f"{portal}/clients/{cid}", timeout=30).json().get("audit_firm") is None
    finally:
        requests.delete(f"{portal}/clients/{cid}", timeout=60)
