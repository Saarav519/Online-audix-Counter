#!/usr/bin/env python3

import requests
import json
import uuid
from datetime import datetime, timezone

# Backend URL from environment
BACKEND_URL = "https://reconciliation-fix.preview.emergentagent.com/api"

print("🔄 AUDIX CONFLICT RESOLUTION FLOW - COMPREHENSIVE END-TO-END TESTING")
print("=" * 80)

def test_existing_conflict_flow(test_location, session_id, client_id):
    """Handle testing when a conflict already exists"""
    print(f"\n⚠️  EXISTING CONFLICT DETECTED for {test_location} - Testing resolution flow")
    
    # Get existing conflicts
    conflicts_response = requests.get(f"{BACKEND_URL}/portal/conflicts")
    if conflicts_response.status_code != 200:
        print(f"❌ Get conflicts failed: {conflicts_response.status_code}")
        return False
        
    conflicts = conflicts_response.json()
    
    # Find our conflict
    test_conflict = None
    for conflict in conflicts:
        if conflict.get('location_name') == test_location and conflict.get('status') == 'pending':
            test_conflict = conflict
            break
    
    if not test_conflict:
        print(f"❌ No pending conflict found for {test_location}")
        return False
        
    conflict_id = test_conflict.get('id')
    entries = test_conflict.get('entries', [])
    
    print(f"✅ Found existing conflict:")
    print(f"   Conflict ID: {conflict_id}")
    print(f"   Status: {test_conflict.get('status')}")
    print(f"   Entries count: {len(entries)}")
    
    # Show entry details
    for i, entry in enumerate(entries):
        print(f"   Entry {i+1}: Device {entry.get('device_name')}, Qty: {entry.get('total_quantity')}")
    
    # Approve first entry
    if entries:
        first_entry_id = entries[0].get('entry_id')
        first_device = entries[0].get('device_name')
        
        print(f"\n✅ TESTING: Approve Entry from {first_device}")
        
        approve_response = requests.post(f"{BACKEND_URL}/portal/conflicts/{conflict_id}/approve/{first_entry_id}")
        
        if approve_response.status_code != 200:
            print(f"❌ Approve failed: {approve_response.status_code} - {approve_response.text}")
            return False
            
        approve_result = approve_response.json()
        print(f"✅ Approval successful: {approve_result.get('message')}")
        
        # Verify resolution
        conflicts_response_2 = requests.get(f"{BACKEND_URL}/portal/conflicts")
        if conflicts_response_2.status_code == 200:
            conflicts_2 = conflicts_response_2.json()
            resolved_conflict = None
            for conflict in conflicts_2:
                if conflict.get('id') == conflict_id:
                    resolved_conflict = conflict
                    break
            
            if resolved_conflict and resolved_conflict.get('status') == 'resolved':
                print("✅ Conflict marked as resolved")
                print("\n🎉 EXISTING CONFLICT RESOLUTION TEST PASSED!")
                return True
            else:
                print(f"❌ Conflict not resolved properly: {resolved_conflict.get('status') if resolved_conflict else 'Not found'}")
                return False
        
    return False

def test_conflict_resolution_flow():
    """Test the complete conflict resolution flow as specified in the review request"""
    
    print("\n📋 TEST PLAN:")
    print("1. Login with admin credentials")
    print("2. Get sessions and pick first one")
    print("3. Sync location from Scanner-TestA")
    print("4. Verify first sync appears normally in bin-wise report")
    print("5. Sync SAME location from Scanner-TestB (different device)")
    print("6. Verify conflict is created")
    print("7. Verify bin-wise report shows conflict status")
    print("8. Verify dashboard shows pending conflicts")
    print("9. Approve one entry")
    print("10. Verify conflict resolution")
    print("11. Test reject-all flow")
    print("=" * 80)
    
    # Step 1: Login
    print("\n🔐 STEP 1: Portal Login")
    login_data = {"username": "admin", "password": "admin123"}
    login_response = requests.post(f"{BACKEND_URL}/portal/login", json=login_data)
    
    if login_response.status_code != 200:
        print(f"❌ Login failed: {login_response.status_code} - {login_response.text}")
        return False
        
    user_info = login_response.json()
    print(f"✅ Login successful - User: {user_info.get('username')}, ID: {user_info.get('id')}")
    
    # Step 2: Get sessions
    print("\n📊 STEP 2: Get Sessions")
    sessions_response = requests.get(f"{BACKEND_URL}/portal/sessions")
    
    if sessions_response.status_code != 200:
        print(f"❌ Get sessions failed: {sessions_response.status_code} - {sessions_response.text}")
        return False
        
    sessions = sessions_response.json()
    if not sessions:
        print("❌ No sessions found")
        return False
        
    # Pick the first session that has session_id
    session = sessions[0]
    session_id = session.get('id')
    client_id = session.get('client_id')
    
    if not session_id:
        print("❌ Session missing ID")
        return False
        
    print(f"✅ Using session: {session.get('name')} (ID: {session_id})")
    print(f"   Client ID: {client_id}")
    
    # Get expected stock to find existing location
    expected_response = requests.get(f"{BACKEND_URL}/portal/sessions/{session_id}/expected-stock")
    if expected_response.status_code != 200:
        print(f"❌ Failed to get expected stock: {expected_response.status_code}")
        return False
    
    expected_data = expected_response.json()
    if not expected_data:
        print("❌ No expected stock found - cannot test conflicts")
        return False
    
    # Use existing location for conflict testing
    test_location = expected_data[0].get('location', 'Rack-A01')
    print(f"Using existing location for conflict test: {test_location}")
    
    # Step 3: Sync location from Scanner-TestA
    print(f"\n🔄 STEP 3: Sync Location '{test_location}' from Scanner-TestA")
    
    sync_data_a = {
        "device_name": "Scanner-TestA",
        "sync_password": "test123",
        "client_id": client_id,
        "session_id": session_id,
        "locations": [{
            "id": "conflict-loc-1",
            "name": test_location,
            "is_empty": False,
            "items": [
                {"barcode": "ITEM-001", "productName": "Product A", "quantity": 50, "scannedAt": "2026-02-23T10:00:00Z"},
                {"barcode": "ITEM-002", "productName": "Product B", "quantity": 30, "scannedAt": "2026-02-23T10:01:00Z"}
            ]
        }]
    }
    
    sync_a_response = requests.post(f"{BACKEND_URL}/sync/", json=sync_data_a)
    
    if sync_a_response.status_code != 200:
        print(f"❌ Sync A failed: {sync_a_response.status_code} - {sync_a_response.text}")
        return False
        
    sync_a_result = sync_a_response.json()
    print(f"✅ Scanner-TestA sync successful: {sync_a_result.get('message')}")
    print(f"   Locations synced: {sync_a_result.get('locations_synced')}")
    
    # Step 4: Verify first sync appears normally in bin-wise report
    print("\n📈 STEP 4: Verify First Sync in Bin-wise Report")
    
    binwise_response = requests.get(f"{BACKEND_URL}/portal/reports/{session_id}/bin-wise")
    
    if binwise_response.status_code != 200:
        print(f"❌ Bin-wise report failed: {binwise_response.status_code} - {binwise_response.text}")
        return False
        
    binwise_data = binwise_response.json()
    
    # Find test_location in the report (check both 'report' and 'locations' keys)
    locations_list = binwise_data.get('locations', []) or binwise_data.get('report', [])
    
    conflict_location = None
    for location in locations_list:
        if location.get('location') == test_location:
            conflict_location = location
            break
    
    if not conflict_location:
        print(f"❌ {test_location} not found in bin-wise report after first sync")
        print(f"   Available locations: {[loc.get('location') for loc in locations_list]}")
        print(f"   Report structure: {list(binwise_data.keys())}")
        print(f"   Summary: {binwise_data.get('summary', {})}")
        
        # Maybe there's already a conflict? Check existing conflicts
        conflicts_check = requests.get(f"{BACKEND_URL}/portal/conflicts")
        if conflicts_check.status_code == 200:
            existing_conflicts = conflicts_check.json()
            for conf in existing_conflicts:
                if conf.get('location_name') == test_location:
                    print(f"   ⚠️ {test_location} already has a conflict: {conf.get('status')}")
                    print(f"   Continuing with existing conflict...")
                    # Skip to step 5 since we already have a conflict
                    return test_existing_conflict_flow(test_location, session_id, client_id)
        return False
        
    print(f"✅ First sync verified - Status: {conflict_location.get('status')}")
    print(f"   Physical Qty: {conflict_location.get('physical_qty')}, Items: {len(sync_data_a['locations'][0]['items'])}")
    
    # Step 5: Sync SAME location from Scanner-TestB (different device)
    print(f"\n🔄 STEP 5: Sync SAME Location '{test_location}' from Scanner-TestB")
    
    sync_data_b = {
        "device_name": "Scanner-TestB",
        "sync_password": "test123",
        "client_id": client_id,
        "session_id": session_id,
        "locations": [{
            "id": "conflict-loc-2",
            "name": test_location,  # Same location name
            "is_empty": False,
            "items": [
                {"barcode": "ITEM-001", "productName": "Product A", "quantity": 45, "scannedAt": "2026-02-23T11:00:00Z"},  # Different quantity
                {"barcode": "ITEM-003", "productName": "Product C", "quantity": 20, "scannedAt": "2026-02-23T11:01:00Z"}   # Different item
            ]
        }]
    }
    
    sync_b_response = requests.post(f"{BACKEND_URL}/sync/", json=sync_data_b)
    
    if sync_b_response.status_code != 200:
        print(f"❌ Sync B failed: {sync_b_response.status_code} - {sync_b_response.text}")
        return False
        
    sync_b_result = sync_b_response.json()
    print(f"✅ Scanner-TestB sync successful: {sync_b_result.get('message')}")
    print(f"   Locations synced: {sync_b_result.get('locations_synced')}")
    
    # Step 6: Verify conflict is created
    print("\n⚠️  STEP 6: Verify Conflict Created")
    
    conflicts_response = requests.get(f"{BACKEND_URL}/portal/conflicts")
    
    if conflicts_response.status_code != 200:
        print(f"❌ Get conflicts failed: {conflicts_response.status_code} - {conflicts_response.text}")
        return False
        
    conflicts = conflicts_response.json()
    
    # Find our conflict
    test_conflict = None
    for conflict in conflicts:
        if conflict.get('location_name') == test_location and conflict.get('status') == 'pending':
            test_conflict = conflict
            break
    
    if not test_conflict:
        print(f"❌ Conflict for {test_location} not found")
        print(f"   Available conflicts: {[c.get('location_name') for c in conflicts]}")
        return False
        
    conflict_id = test_conflict.get('id')
    entries = test_conflict.get('entries', [])
    
    print(f"✅ Conflict created successfully!")
    print(f"   Conflict ID: {conflict_id}")
    print(f"   Status: {test_conflict.get('status')}")
    print(f"   Entries count: {len(entries)}")
    
    # Show entry details
    for i, entry in enumerate(entries):
        print(f"   Entry {i+1}: Device {entry.get('device_name')}, Qty: {entry.get('total_quantity')}, Items: {entry.get('total_items')}")
    
    # Step 7: Verify bin-wise shows conflict
    print("\n📈 STEP 7: Verify Bin-wise Report Shows Conflict Status")
    
    binwise_response_2 = requests.get(f"{BACKEND_URL}/portal/reports/{session_id}/bin-wise")
    
    if binwise_response_2.status_code != 200:
        print(f"❌ Bin-wise report 2 failed: {binwise_response_2.status_code} - {binwise_response_2.text}")
        return False
        
    binwise_data_2 = binwise_response_2.json()
    
    # Find test_location in the updated report (check both 'report' and 'locations' keys)
    locations_list_2 = binwise_data_2.get('locations', []) or binwise_data_2.get('report', [])
    
    conflict_location_2 = None
    for location in locations_list_2:
        if location.get('location') == test_location:
            conflict_location_2 = location
            break
    
    if not conflict_location_2:
        print(f"❌ {test_location} not found in updated bin-wise report")
        return False
        
    location_status = conflict_location_2.get('status')
    location_remark = conflict_location_2.get('remark', '')
    
    print(f"✅ Bin-wise report updated:")
    print(f"   Status: {location_status}")
    print(f"   Remark: {location_remark}")
    
    if location_status != 'conflict':
        print(f"❌ Expected status 'conflict', got '{location_status}'")
        return False
        
    if 'Conflict' not in location_remark and 'Duplicate scan' not in location_remark:
        print(f"❌ Expected conflict remark, got: {location_remark}")
        return False
    
    print("✅ Conflict status correctly shown in bin-wise report")
    
    # Step 8: Verify dashboard shows pending conflicts
    print("\n📊 STEP 8: Verify Dashboard Shows Pending Conflicts")
    
    dashboard_response = requests.get(f"{BACKEND_URL}/portal/dashboard")
    
    if dashboard_response.status_code != 200:
        print(f"❌ Dashboard failed: {dashboard_response.status_code} - {dashboard_response.text}")
        return False
        
    dashboard_data = dashboard_response.json()
    pending_conflicts_count = dashboard_data.get('stats', {}).get('pending_conflicts', 0)
    
    print(f"✅ Dashboard shows pending_conflicts: {pending_conflicts_count}")
    
    if pending_conflicts_count == 0:
        print("❌ Expected pending_conflicts > 0")
        return False
    
    # Step 9: Approve one entry
    print("\n✅ STEP 9: Approve Entry from Scanner-TestA")
    
    # Find Scanner-TestA entry
    testA_entry = None
    for entry in entries:
        if entry.get('device_name') == 'Scanner-TestA':
            testA_entry = entry
            break
    
    if not testA_entry:
        print("❌ Scanner-TestA entry not found")
        return False
        
    testA_entry_id = testA_entry.get('entry_id')
    
    approve_response = requests.post(f"{BACKEND_URL}/portal/conflicts/{conflict_id}/approve/{testA_entry_id}")
    
    if approve_response.status_code != 200:
        print(f"❌ Approve failed: {approve_response.status_code} - {approve_response.text}")
        return False
        
    approve_result = approve_response.json()
    print(f"✅ Approval successful: {approve_result.get('message')}")
    print(f"   Approved device: {approve_result.get('approved_device')}")
    print(f"   Approved quantity: {approve_result.get('approved_quantity')}")
    
    # Step 10: Verify resolution
    print("\n🔍 STEP 10: Verify Conflict Resolution")
    
    # Check conflict status
    conflicts_response_2 = requests.get(f"{BACKEND_URL}/portal/conflicts")
    
    if conflicts_response_2.status_code != 200:
        print(f"❌ Get conflicts 2 failed: {conflicts_response_2.status_code} - {conflicts_response_2.text}")
        return False
        
    conflicts_2 = conflicts_response_2.json()
    
    # Find our resolved conflict
    resolved_conflict = None
    for conflict in conflicts_2:
        if conflict.get('id') == conflict_id:
            resolved_conflict = conflict
            break
    
    if not resolved_conflict:
        print("❌ Resolved conflict not found")
        return False
        
    if resolved_conflict.get('status') != 'resolved':
        print(f"❌ Expected status 'resolved', got '{resolved_conflict.get('status')}'")
        return False
        
    print("✅ Conflict marked as resolved")
    
    # Check bin-wise report shows completed with approved data
    binwise_response_3 = requests.get(f"{BACKEND_URL}/portal/reports/{session_id}/bin-wise")
    
    if binwise_response_3.status_code != 200:
        print(f"❌ Bin-wise report 3 failed: {binwise_response_3.status_code} - {binwise_response_3.text}")
        return False
        
    binwise_data_3 = binwise_response_3.json()
    
    # Find test_location in the final report (check both 'report' and 'locations' keys)
    locations_list_3 = binwise_data_3.get('locations', []) or binwise_data_3.get('report', [])
    
    final_location = None
    for location in locations_list_3:
        if location.get('location') == test_location:
            final_location = location
            break
    
    if not final_location:
        print(f"❌ {test_location} not found in final bin-wise report")
        return False
        
    final_status = final_location.get('status')
    final_qty = final_location.get('physical_qty')
    
    print(f"✅ Final bin-wise report:")
    print(f"   Status: {final_status}")
    print(f"   Physical Qty: {final_qty}")
    
    # Should be completed with Scanner-TestA data (quantity 80 = 50+30)
    expected_qty = 80  # ITEM-001: 50 + ITEM-002: 30
    
    if final_status != 'completed':
        print(f"❌ Expected final status 'completed', got '{final_status}'")
        return False
        
    if final_qty != expected_qty:
        print(f"❌ Expected final quantity {expected_qty}, got {final_qty}")
        return False
        
    print("✅ Approved entry data correctly appears in bin-wise report")
    
    # Step 11: Test reject-all flow
    print("\n🚫 STEP 11: Test Reject-All Flow")
    
    # Create another conflict by syncing a different location from two devices
    print("   Creating new conflict for reject-all test...")
    
    # Use second location from expected stock if available
    reject_location = "Rack-A02"  # Default fallback
    if len(expected_data) > 1:
        reject_location = expected_data[1].get('location', 'Rack-A02')
    
    print(f"   Using location: {reject_location}")
    
    sync_data_c = {
        "device_name": "Scanner-TestA",
        "sync_password": "test123",
        "client_id": client_id,
        "session_id": session_id,
        "locations": [{
            "id": "conflict-loc-3",
            "name": reject_location,
            "is_empty": False,
            "items": [
                {"barcode": "ITEM-004", "productName": "Product D", "quantity": 10, "scannedAt": "2026-02-23T12:00:00Z"}
            ]
        }]
    }
    
    sync_data_d = {
        "device_name": "Scanner-TestB",
        "sync_password": "test123",
        "client_id": client_id,
        "session_id": session_id,
        "locations": [{
            "id": "conflict-loc-4",
            "name": reject_location,  # Same name
            "is_empty": False,
            "items": [
                {"barcode": "ITEM-005", "productName": "Product E", "quantity": 15, "scannedAt": "2026-02-23T12:05:00Z"}
            ]
        }]
    }
    
    # Sync from both devices
    requests.post(f"{BACKEND_URL}/sync/", json=sync_data_c)
    requests.post(f"{BACKEND_URL}/sync/", json=sync_data_d)
    
    # Get the new conflict
    conflicts_response_3 = requests.get(f"{BACKEND_URL}/portal/conflicts")
    conflicts_3 = conflicts_response_3.json()
    
    reject_conflict = None
    for conflict in conflicts_3:
        if conflict.get('location_name') == reject_location and conflict.get('status') == 'pending':
            reject_conflict = conflict
            break
    
    if not reject_conflict:
        print(f"❌ Second conflict for reject-all test not found (location: {reject_location})")
        return False
        
    reject_conflict_id = reject_conflict.get('id')
    print(f"   New conflict created: {reject_conflict_id}")
    
    # Reject all entries
    reject_response = requests.post(f"{BACKEND_URL}/portal/conflicts/{reject_conflict_id}/reject-all")
    
    if reject_response.status_code != 200:
        print(f"❌ Reject-all failed: {reject_response.status_code} - {reject_response.text}")
        return False
        
    reject_result = reject_response.json()
    print(f"✅ Reject-all successful: {reject_result.get('message')}")
    
    # Verify location is not in synced_locations anymore
    binwise_response_4 = requests.get(f"{BACKEND_URL}/portal/reports/{session_id}/bin-wise")
    binwise_data_4 = binwise_response_4.json()
    
    # Find rejected location in final report (check both 'report' and 'locations' keys)
    locations_list_4 = binwise_data_4.get('locations', []) or binwise_data_4.get('report', [])
    
    rejected_location = None
    for location in locations_list_4:
        if location.get('location') == reject_location:
            rejected_location = location
            break
    
    # Should either not exist or have status 'pending'
    if rejected_location:
        rejected_status = rejected_location.get('status')
        if rejected_status not in ['pending']:
            print(f"❌ Expected rejected location to be pending or missing, got status: {rejected_status}")
            return False
        print(f"✅ Rejected location correctly shows as: {rejected_status}")
    else:
        print("✅ Rejected location correctly removed from variance calculations")
    
    print("\n🎉 ALL CONFLICT RESOLUTION TESTS PASSED!")
    print("=" * 80)
    print("✅ Conflict detection working correctly")
    print("✅ Bin-wise report shows conflict status properly")
    print("✅ Dashboard tracks pending conflicts")
    print("✅ Approve entry workflow working")
    print("✅ Reject-all workflow working")
    print("✅ Full conflict lifecycle verified")
    
    return True

if __name__ == "__main__":
    success = test_conflict_resolution_flow()
    exit(0 if success else 1)