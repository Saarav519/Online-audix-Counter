#!/usr/bin/env python3
"""
Test script for AUDIX Admin Portal "Restore Sync Backup" feature.
Tests the complete backup restoration workflow as specified in the review request.
"""
import requests
import json
import io
import csv

# Backend URL from the review request
BASE_URL = "https://tally-app-15.preview.emergentagent.com"

def create_test_csv():
    """Create the test CSV file as specified in the review request"""
    csv_content = '''Location,Barcode,Product Name,Price,Quantity,Scanned At
"Cold-Storage",="8901725130206","Amul Milk 1L",120,288,"2026-02-28T10:30:00Z"
"Cold-Storage",="8901725130213","Amul Butter 500g",270,45,"2026-02-28T10:31:00Z"
"Rack-A01",="8901234567890","Rice 5kg",320,150,"2026-02-28T10:35:00Z"'''
    return csv_content

def test_1_upload_backup_csv_new_client():
    """Test 1: Upload backup CSV (new client)"""
    print("\n=== Test 1: Upload backup CSV (new client) ===")
    
    csv_content = create_test_csv()
    
    # Prepare multipart form data
    files = {
        'file': ('test_backup.csv', csv_content, 'text/csv')
    }
    data = {
        'client_name': 'Test Backup Client',
        'session_name': 'Restored Session Test',
        'variance_mode': 'bin-wise',
        'device_name': 'test-device'
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/api/portal/sync-inbox/upload-backup",
            files=files,
            data=data,
            timeout=30
        )
        
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code == 200:
            result = response.json()
            
            # Verify expected fields in response
            required_fields = ['message', 'client_id', 'session_id', 'locations_restored', 'total_items', 'total_quantity']
            missing_fields = [field for field in required_fields if field not in result]
            
            if missing_fields:
                print(f"❌ Missing required fields in response: {missing_fields}")
                return None, None
            
            # Verify specific values
            if (result['locations_restored'] == 2 and 
                result['total_items'] == 3 and 
                result['total_quantity'] == 483):
                print("✅ Test 1 PASSED: Upload backup CSV (new client)")
                print(f"   - Message: {result['message']}")
                print(f"   - Client ID: {result['client_id']}")
                print(f"   - Session ID: {result['session_id']}")
                print(f"   - Locations restored: {result['locations_restored']}")
                print(f"   - Total items: {result['total_items']}")
                print(f"   - Total quantity: {result['total_quantity']}")
                return result['client_id'], result['session_id']
            else:
                print(f"❌ Test 1 FAILED: Incorrect counts - locations: {result['locations_restored']}, items: {result['total_items']}, quantity: {result['total_quantity']}")
                return None, None
        else:
            print(f"❌ Test 1 FAILED: HTTP {response.status_code}")
            return None, None
            
    except Exception as e:
        print(f"❌ Test 1 FAILED: Exception - {e}")
        return None, None

def test_2_verify_sync_inbox(session_id):
    """Test 2: Verify sync inbox has restored data"""
    print("\n=== Test 2: Verify sync inbox has restored data ===")
    
    try:
        response = requests.get(
            f"{BASE_URL}/api/portal/sync-inbox/summary",
            params={'session_id': session_id},
            timeout=30
        )
        
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code == 200:
            result = response.json()
            
            # Verify expected structure and values
            if (result.get('total_pending') == 2 and
                result.get('scanner_count') == 1 and
                len(result.get('scanners', [])) == 1 and
                result['scanners'][0].get('device_name') == 'test-device'):
                print("✅ Test 2 PASSED: Sync inbox verified")
                print(f"   - Total pending: {result['total_pending']}")
                print(f"   - Scanner count: {result['scanner_count']}")
                print(f"   - Device name: {result['scanners'][0]['device_name']}")
                return True
            else:
                print(f"❌ Test 2 FAILED: Incorrect sync inbox summary - {result}")
                return False
        else:
            print(f"❌ Test 2 FAILED: HTTP {response.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ Test 2 FAILED: Exception - {e}")
        return False

def test_3_verify_client_created():
    """Test 3: Verify client was created"""
    print("\n=== Test 3: Verify client was created ===")
    
    try:
        response = requests.get(
            f"{BASE_URL}/api/portal/clients",
            timeout=30
        )
        
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            clients = response.json()
            
            # Find "Test Backup Client" in the list
            test_client = None
            for client in clients:
                if client.get('name') == 'Test Backup Client':
                    test_client = client
                    break
            
            if test_client:
                print("✅ Test 3 PASSED: Client verification")
                print(f"   - Client found: {test_client['name']}")
                print(f"   - Client ID: {test_client['id']}")
                return test_client['id']
            else:
                print(f"❌ Test 3 FAILED: 'Test Backup Client' not found in clients list")
                print(f"   Available clients: {[c.get('name') for c in clients]}")
                return None
        else:
            print(f"❌ Test 3 FAILED: HTTP {response.status_code}")
            return None
            
    except Exception as e:
        print(f"❌ Test 3 FAILED: Exception - {e}")
        return None

def test_4_upload_existing_client(original_client_id):
    """Test 4: Upload to existing client (same name)"""
    print("\n=== Test 4: Upload to existing client (same name) ===")
    
    csv_content = create_test_csv()
    
    # Prepare multipart form data with same client name
    files = {
        'file': ('test_backup2.csv', csv_content, 'text/csv')
    }
    data = {
        'client_name': 'Test Backup Client',  # Same name as before
        'session_name': 'Second Restored Session',
        'variance_mode': 'bin-wise',
        'device_name': 'test-device'
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/api/portal/sync-inbox/upload-backup",
            files=files,
            data=data,
            timeout=30
        )
        
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code == 200:
            result = response.json()
            
            # Verify it reuses the same client_id
            if result.get('client_id') == original_client_id:
                print("✅ Test 4 PASSED: Existing client reuse verified")
                print(f"   - Reused client ID: {result['client_id']}")
                print(f"   - New session ID: {result['session_id']}")
                return result['session_id']
            else:
                print(f"❌ Test 4 FAILED: Different client ID returned - expected: {original_client_id}, got: {result.get('client_id')}")
                return None
        else:
            print(f"❌ Test 4 FAILED: HTTP {response.status_code}")
            return None
            
    except Exception as e:
        print(f"❌ Test 4 FAILED: Exception - {e}")
        return None

def test_5_cleanup_sessions(session_ids):
    """Test 5: Cleanup - Delete sessions"""
    print("\n=== Test 5: Cleanup - Delete sessions ===")
    
    deleted_count = 0
    for session_id in session_ids:
        if not session_id:
            continue
            
        try:
            response = requests.delete(
                f"{BASE_URL}/api/portal/sessions/{session_id}",
                timeout=30
            )
            
            print(f"Deleting session {session_id}: Status {response.status_code}")
            
            if response.status_code == 200:
                deleted_count += 1
            else:
                print(f"   Failed to delete session {session_id}")
                
        except Exception as e:
            print(f"   Exception deleting session {session_id}: {e}")
    
    if deleted_count == len([s for s in session_ids if s]):
        print(f"✅ Test 5 PASSED: Cleanup completed - {deleted_count} sessions deleted")
        return True
    else:
        print(f"❌ Test 5 PARTIAL: Only {deleted_count} of {len(session_ids)} sessions deleted")
        return False

def main():
    """Main test execution"""
    print("🧪 AUDIX Admin Portal - Restore Sync Backup Feature Testing")
    print("=" * 70)
    
    session_ids = []
    
    # Test 1: Upload backup CSV (new client)
    client_id, session_id_1 = test_1_upload_backup_csv_new_client()
    if session_id_1:
        session_ids.append(session_id_1)
    
    # Test 2: Verify sync inbox has restored data
    if session_id_1:
        test_2_verify_sync_inbox(session_id_1)
    
    # Test 3: Verify client was created
    verified_client_id = test_3_verify_client_created()
    
    # Test 4: Upload to existing client (same name)
    if client_id:
        session_id_2 = test_4_upload_existing_client(client_id)
        if session_id_2:
            session_ids.append(session_id_2)
    
    # Test 5: Cleanup
    if session_ids:
        test_5_cleanup_sessions(session_ids)
    
    # Final Summary
    print("\n" + "=" * 70)
    print("📊 TEST SUMMARY")
    print("=" * 70)
    
    total_tests = 5
    passed_tests = 0
    
    if client_id and session_id_1:
        passed_tests += 2  # Tests 1 & 2
    if verified_client_id:
        passed_tests += 1  # Test 3
    if len(session_ids) == 2:
        passed_tests += 1  # Test 4
    if session_ids:
        passed_tests += 1  # Test 5
    
    print(f"Tests Passed: {passed_tests}/{total_tests}")
    
    if passed_tests == total_tests:
        print("🎉 ALL TESTS PASSED - Restore Sync Backup feature is working correctly!")
    else:
        print(f"⚠️  {total_tests - passed_tests} tests failed - Issues need to be addressed")
    
    return passed_tests == total_tests

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)