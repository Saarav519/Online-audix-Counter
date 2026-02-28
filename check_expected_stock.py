#!/usr/bin/env python3

import requests
import json

# Backend URL from environment
BACKEND_URL = "https://reco-reports-fix.preview.emergentagent.com/api"

print("🔍 CHECKING SESSION EXPECTED STOCK")

# Login
login_data = {"username": "admin", "password": "admin123"}
login_response = requests.post(f"{BACKEND_URL}/portal/login", json=login_data)

# Get sessions
sessions_response = requests.get(f"{BACKEND_URL}/portal/sessions")
sessions = sessions_response.json()
session = sessions[0]
session_id = session.get('id')
client_id = session.get('client_id')

print(f"Session: {session.get('name')} (ID: {session_id})")
print(f"Expected stock imported: {session.get('expected_stock_imported')}")

# Check expected stock for this session
expected_response = requests.get(f"{BACKEND_URL}/portal/sessions/{session_id}/expected-stock")
print(f"Expected stock response: {expected_response.status_code}")
if expected_response.status_code == 200:
    expected_data = expected_response.json()
    print(f"Expected stock records: {len(expected_data)}")
    if expected_data:
        print("Sample expected stock:")
        for i, record in enumerate(expected_data[:3]):
            print(f"  {i+1}. Location: {record.get('location')}, Barcode: {record.get('barcode')}, Qty: {record.get('qty')}")
    
    # Check if our test location exists in expected stock
    conflict_loc_expected = False
    for record in expected_data:
        if record.get('location') == 'CONFLICT-TEST-LOC':
            conflict_loc_expected = True
            print(f"✅ CONFLICT-TEST-LOC found in expected stock: {record}")
            break
    
    if not conflict_loc_expected:
        print("❌ CONFLICT-TEST-LOC not in expected stock - this is why it doesn't show in bin-wise report!")
        print("For conflict testing, we need to either:")
        print("1. Use an existing location from expected stock, or")
        print("2. Add CONFLICT-TEST-LOC to expected stock first")
        
        # Let's try using an existing location instead
        if expected_data:
            existing_location = expected_data[0].get('location')
            print(f"\n🔄 Let's try using existing location: {existing_location}")
            
            # Try sync with existing location
            sync_data_existing = {
                "device_name": "Scanner-TestA",
                "sync_password": "test123",
                "client_id": client_id,
                "session_id": session_id,
                "locations": [{
                    "id": "conflict-loc-1",
                    "name": existing_location,  # Use existing location
                    "is_empty": False,
                    "items": [
                        {"barcode": "ITEM-001", "productName": "Product A", "quantity": 50, "scannedAt": "2026-02-23T10:00:00Z"},
                        {"barcode": "ITEM-002", "productName": "Product B", "quantity": 30, "scannedAt": "2026-02-23T10:01:00Z"}
                    ]
                }]
            }
            
            sync_response = requests.post(f"{BACKEND_URL}/sync/", json=sync_data_existing)
            print(f"Sync response: {sync_response.status_code}")
            if sync_response.status_code == 200:
                print("✅ Sync successful with existing location")
                
                # Check bin-wise report
                binwise_response = requests.get(f"{BACKEND_URL}/portal/reports/{session_id}/bin-wise")
                if binwise_response.status_code == 200:
                    binwise_data = binwise_response.json()
                    locations = binwise_data.get('locations', [])
                    
                    # Find our location
                    for loc in locations:
                        if loc.get('location') == existing_location:
                            print(f"✅ Found synced location in bin-wise report:")
                            print(f"   Location: {loc.get('location')}")
                            print(f"   Status: {loc.get('status')}")
                            print(f"   Stock: {loc.get('stock_qty')}, Physical: {loc.get('physical_qty')}")
                            break