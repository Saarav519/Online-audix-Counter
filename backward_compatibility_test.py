#!/usr/bin/env python3
"""
Test backward compatibility: Reports should still work even without master products
"""

import requests
import json
import io
import sys

# Backend URL
BASE_URL = "https://reconciliation-fix.preview.emergentagent.com"
API_BASE = f"{BASE_URL}/api"

def test_backward_compatibility():
    """Test that reports work correctly without master products"""
    session = requests.Session()
    
    print("🔍 Testing Backward Compatibility (Reports without Master Products)")
    print("=" * 70)
    
    # Login
    response = session.post(f"{API_BASE}/portal/login", json={
        "username": "admin", "password": "admin123"
    })
    if response.status_code != 200:
        print("❌ Login failed")
        return False
    print("✅ Portal Login successful")
    
    # Create client (without importing master products)
    import random
    client_code = f"BC{random.randint(1000, 9999)}"
    response = session.post(f"{API_BASE}/portal/clients", json={
        "name": "Backward Compatibility Test Client",
        "code": client_code,
        "address": "Test"
    })
    if response.status_code != 200:
        print("❌ Client creation failed")
        return False
    client_id = response.json()["client"]["id"]
    print(f"✅ Created client without master: {client_id}")
    
    # Create session
    from datetime import datetime, timezone
    response = session.post(f"{API_BASE}/portal/sessions", json={
        "client_id": client_id,
        "name": "Backward Compatibility Session",
        "variance_mode": "bin-wise",
        "start_date": datetime.now(timezone.utc).isoformat()
    })
    if response.status_code != 200:
        print("❌ Session creation failed")
        return False
    session_id = response.json()["session"]["id"]
    print(f"✅ Created session: {session_id}")
    
    # Import expected stock with full product info (old way)
    csv_content = """Location,Barcode,Description,Category,Qty,MRP,Cost
Bin-B01,1122334455667,Legacy Product 1,Electronics,25,500,400
Bin-B02,1122334455668,Legacy Product 2,Books,15,200,150"""
    
    files = {"file": ("expected_stock.csv", io.StringIO(csv_content), "text/csv")}
    response = session.post(f"{API_BASE}/portal/sessions/{session_id}/import-expected", files=files)
    if response.status_code != 200:
        print("❌ Expected stock import failed")
        return False
    print("✅ Imported expected stock with full product info (legacy mode)")
    
    # Sync some physical data
    sync_data = {
        "device_name": "backward_compat_device",
        "sync_password": "test123",
        "client_id": client_id,
        "session_id": session_id,
        "locations": [{
            "id": "loc_legacy_1",
            "name": "Bin-B01",
            "items": [{
                "barcode": "1122334455667",
                "quantity": 20,
                "productName": "Legacy Product 1",
                "scannedAt": "2026-02-21T14:30:00Z"
            }]
        }]
    }
    
    response = session.post(f"{API_BASE}/sync/", json=sync_data)
    if response.status_code != 200:
        print("❌ Sync failed")
        return False
    print("✅ Synced physical data")
    
    # Test all report endpoints work without master products
    report_endpoints = [
        ("detailed", "/detailed"),
        ("bin-wise", "/bin-wise"),
        ("barcode-wise", "/barcode-wise"),
        ("article-wise", "/article-wise"),
        ("category-summary", "/category-summary")
    ]
    
    all_passed = True
    for name, endpoint in report_endpoints:
        response = session.get(f"{API_BASE}/portal/reports/{session_id}{endpoint}")
        if response.status_code == 200:
            data = response.json()
            report = data.get("report", [])
            print(f"✅ {name} report works without master: {len(report)} items")
        else:
            print(f"❌ {name} report failed: {response.status_code}")
            all_passed = False
    
    return all_passed

if __name__ == "__main__":
    success = test_backward_compatibility()
    if success:
        print("\n🎉 BACKWARD COMPATIBILITY TEST PASSED!")
    else:
        print("\n❌ BACKWARD COMPATIBILITY TEST FAILED!")
    sys.exit(0 if success else 1)