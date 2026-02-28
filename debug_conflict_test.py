#!/usr/bin/env python3

import requests
import json

# Backend URL from environment
BACKEND_URL = "https://counter-preview-2.preview.emergentagent.com/api"

print("🔍 DEBUGGING CONFLICT FLOW - STEP BY STEP")

# Step 1: Login
print("\n🔐 STEP 1: Portal Login")
login_data = {"username": "admin", "password": "admin123"}
login_response = requests.post(f"{BACKEND_URL}/portal/login", json=login_data)
print(f"Login response: {login_response.status_code}")
if login_response.status_code == 200:
    user_info = login_response.json()
    print(f"✅ Login successful")

# Step 2: Get sessions
print("\n📊 STEP 2: Get Sessions") 
sessions_response = requests.get(f"{BACKEND_URL}/portal/sessions")
print(f"Sessions response: {sessions_response.status_code}")
if sessions_response.status_code == 200:
    sessions = sessions_response.json()
    print(f"Found {len(sessions)} sessions")
    if sessions:
        session = sessions[0]
        session_id = session.get('id')
        client_id = session.get('client_id')
        print(f"Using session: {session.get('name')} (ID: {session_id})")
        print(f"Client ID: {client_id}")

        # Check current bin-wise report before sync
        print(f"\n📈 CHECKING CURRENT BIN-WISE REPORT")
        binwise_response = requests.get(f"{BACKEND_URL}/portal/reports/{session_id}/bin-wise")
        print(f"Bin-wise response: {binwise_response.status_code}")
        if binwise_response.status_code == 200:
            binwise_data = binwise_response.json()
            locations = binwise_data.get('locations', [])
            print(f"Current locations in report: {len(locations)}")
            for loc in locations[:3]:  # Show first 3
                print(f"  - {loc.get('location')} (status: {loc.get('status')})")

        # Step 3: Try sync
        print(f"\n🔄 STEP 3: Sync Location from Scanner-TestA")
        
        sync_data_a = {
            "device_name": "Scanner-TestA",
            "sync_password": "test123",
            "client_id": client_id,
            "session_id": session_id,
            "locations": [{
                "id": "conflict-loc-1",
                "name": "CONFLICT-TEST-LOC",
                "is_empty": False,
                "items": [
                    {"barcode": "ITEM-001", "productName": "Product A", "quantity": 50, "scannedAt": "2026-02-23T10:00:00Z"},
                    {"barcode": "ITEM-002", "productName": "Product B", "quantity": 30, "scannedAt": "2026-02-23T10:01:00Z"}
                ]
            }]
        }
        
        sync_a_response = requests.post(f"{BACKEND_URL}/sync/", json=sync_data_a)
        print(f"Sync A response: {sync_a_response.status_code}")
        print(f"Sync A text: {sync_a_response.text}")
        
        if sync_a_response.status_code == 200:
            sync_result = sync_a_response.json()
            print(f"✅ Sync successful: {sync_result}")
            
            # Check bin-wise report after sync
            print(f"\n📈 CHECKING BIN-WISE REPORT AFTER SYNC")
            binwise_response_2 = requests.get(f"{BACKEND_URL}/portal/reports/{session_id}/bin-wise")
            print(f"Bin-wise response 2: {binwise_response_2.status_code}")
            if binwise_response_2.status_code == 200:
                binwise_data_2 = binwise_response_2.json()
                locations_2 = binwise_data_2.get('locations', [])
                print(f"Locations after sync: {len(locations_2)}")
                
                # Find our test location
                conflict_loc_found = False
                for loc in locations_2:
                    if 'CONFLICT-TEST-LOC' in str(loc.get('location', '')):
                        print(f"✅ Found CONFLICT-TEST-LOC: {loc}")
                        conflict_loc_found = True
                        break
                
                if not conflict_loc_found:
                    print("❌ CONFLICT-TEST-LOC not found. All locations:")
                    for i, loc in enumerate(locations_2[:10]):  # Show first 10
                        print(f"  {i+1}. {loc.get('location')} (status: {loc.get('status')})")