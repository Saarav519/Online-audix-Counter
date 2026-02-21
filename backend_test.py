#!/usr/bin/env python3
"""
Comprehensive Backend Test Suite for AUDIX Admin Portal Sync Raw Logs Feature
Tests the new sync raw logs functionality following the exact review request flow.
"""

import requests
import json
import sys
from datetime import datetime
import time

# Backend URL from frontend .env
BASE_URL = "https://offline-sync-portal.preview.emergentagent.com"
API_URL = f"{BASE_URL}/api"

class SyncRawLogsTestSuite:
    def __init__(self):
        self.session = requests.Session()
        self.test_results = []
        self.test_data = {}
        
    def log_test(self, test_name, status, details=""):
        """Log test results"""
        result = {
            "test": test_name,
            "status": "✅" if status else "❌",
            "details": details
        }
        self.test_results.append(result)
        print(f"{result['status']} {test_name}: {details}")
        return status
    
    def test_portal_login(self):
        """Test portal authentication as prerequisite"""
        try:
            # Test portal login with admin credentials
            response = self.session.post(f"{API_URL}/portal/login", 
                json={"username": "admin", "password": "admin123"})
            
            if response.status_code == 200:
                data = response.json()
                self.test_data["admin_user"] = data
                return self.log_test("Portal Login", True, 
                    f"Admin login successful, User ID: {data.get('id', 'N/A')}")
            else:
                return self.log_test("Portal Login", False, 
                    f"Login failed: {response.status_code} - {response.text}")
                
        except Exception as e:
            return self.log_test("Portal Login", False, f"Exception: {str(e)}")
    
    def test_get_existing_session(self):
        """Get an existing session for testing sync"""
        try:
            response = self.session.get(f"{API_URL}/portal/sessions")
            
            if response.status_code == 200:
                sessions = response.json()
                if sessions:
                    # Use first available session
                    session_id = sessions[0]["id"]
                    self.test_data["session_id"] = session_id
                    return self.log_test("Get Existing Session", True, 
                        f"Using session: {session_id}")
                else:
                    return self.log_test("Get Existing Session", False, 
                        "No existing sessions found")
            else:
                return self.log_test("Get Existing Session", False, 
                    f"Failed to get sessions: {response.status_code}")
                
        except Exception as e:
            return self.log_test("Get Existing Session", False, f"Exception: {str(e)}")
    
    def test_sync_data_generation(self):
        """Test syncing data to generate raw logs (First sync)"""
        try:
            session_id = self.test_data.get("session_id")
            if not session_id:
                return self.log_test("Sync Data Generation", False, "No session ID available")
            
            sync_payload = {
                "device_name": "RawLogTestScanner",
                "sync_password": "testpass",
                "session_id": session_id,
                "locations": [{
                    "name": "TestLocation-RawLog",
                    "items": [
                        {"barcode": "1111111111111", "product_name": "Test Item 1", "quantity": 10},
                        {"barcode": "2222222222222", "product_name": "Test Item 2", "quantity": 5}
                    ],
                    "total_quantity": 15,
                    "submitted_at": "2026-02-21T10:00:00Z"
                }]
            }
            
            response = self.session.post(f"{API_URL}/sync/", json=sync_payload)
            
            if response.status_code == 200:
                data = response.json()
                return self.log_test("Sync Data Generation", True, 
                    f"First sync successful: {data.get('locations_synced', 0)} locations synced")
            else:
                return self.log_test("Sync Data Generation", False, 
                    f"Sync failed: {response.status_code} - {response.text}")
                
        except Exception as e:
            return self.log_test("Sync Data Generation", False, f"Exception: {str(e)}")
    
    def test_get_all_sync_logs(self):
        """Test GET /api/portal/sync-logs - Get all sync logs"""
        try:
            response = self.session.get(f"{API_URL}/portal/sync-logs")
            
            if response.status_code == 200:
                logs = response.json()
                if logs:
                    # Verify log structure
                    log = logs[0]
                    required_fields = ["id", "device_name", "session_id", "client_id", 
                                     "synced_at", "raw_payload", "location_count", 
                                     "total_items", "total_quantity"]
                    
                    missing_fields = [f for f in required_fields if f not in log]
                    if missing_fields:
                        return self.log_test("Get All Sync Logs", False, 
                            f"Missing fields: {missing_fields}")
                    
                    # Store log ID for detail test
                    self.test_data["log_id"] = log["id"]
                    
                    return self.log_test("Get All Sync Logs", True, 
                        f"Retrieved {len(logs)} sync logs with all required fields")
                else:
                    return self.log_test("Get All Sync Logs", False, 
                        "No sync logs found")
            else:
                return self.log_test("Get All Sync Logs", False, 
                    f"Request failed: {response.status_code} - {response.text}")
                
        except Exception as e:
            return self.log_test("Get All Sync Logs", False, f"Exception: {str(e)}")
    
    def test_filter_logs_by_session(self):
        """Test GET /api/portal/sync-logs?session_id= - Filter logs by session"""
        try:
            session_id = self.test_data.get("session_id")
            if not session_id:
                return self.log_test("Filter Logs by Session", False, "No session ID available")
            
            response = self.session.get(f"{API_URL}/portal/sync-logs?session_id={session_id}")
            
            if response.status_code == 200:
                logs = response.json()
                if logs:
                    # Verify all logs belong to the session
                    for log in logs:
                        if log.get("session_id") != session_id:
                            return self.log_test("Filter Logs by Session", False, 
                                f"Found log with different session_id: {log.get('session_id')}")
                    
                    return self.log_test("Filter Logs by Session", True, 
                        f"Retrieved {len(logs)} logs filtered by session {session_id}")
                else:
                    return self.log_test("Filter Logs by Session", False, 
                        "No logs found for this session")
            else:
                return self.log_test("Filter Logs by Session", False, 
                    f"Request failed: {response.status_code} - {response.text}")
                
        except Exception as e:
            return self.log_test("Filter Logs by Session", False, f"Exception: {str(e)}")
    
    def test_get_log_detail(self):
        """Test GET /api/portal/sync-logs/{log_id} - Get log detail"""
        try:
            log_id = self.test_data.get("log_id")
            if not log_id:
                return self.log_test("Get Log Detail", False, "No log ID available")
            
            response = self.session.get(f"{API_URL}/portal/sync-logs/{log_id}")
            
            if response.status_code == 200:
                log = response.json()
                
                # Verify log has raw_payload with locations and items
                raw_payload = log.get("raw_payload", {})
                locations = raw_payload.get("locations", [])
                
                if not locations:
                    return self.log_test("Get Log Detail", False, 
                        "Raw payload missing locations data")
                
                # Verify first location has items
                first_location = locations[0]
                items = first_location.get("items", [])
                
                if not items:
                    return self.log_test("Get Log Detail", False, 
                        "Location missing items data")
                
                return self.log_test("Get Log Detail", True, 
                    f"Retrieved detailed log with {len(locations)} locations and {len(items)} items in first location")
            else:
                return self.log_test("Get Log Detail", False, 
                    f"Request failed: {response.status_code} - {response.text}")
                
        except Exception as e:
            return self.log_test("Get Log Detail", False, f"Exception: {str(e)}")
    
    def test_resync_same_location(self):
        """Test re-sync (location replacement + raw log preservation)"""
        try:
            session_id = self.test_data.get("session_id")
            if not session_id:
                return self.log_test("Re-sync Same Location", False, "No session ID available")
            
            # Get current log count
            response = self.session.get(f"{API_URL}/portal/sync-logs")
            if response.status_code != 200:
                return self.log_test("Re-sync Same Location", False, 
                    "Failed to get current log count")
            
            initial_log_count = len(response.json())
            
            # Re-sync the same location with different data
            resync_payload = {
                "device_name": "RawLogTestScanner",
                "sync_password": "testpass",
                "session_id": session_id,
                "locations": [{
                    "name": "TestLocation-RawLog",  # Same location name
                    "items": [
                        {"barcode": "1111111111111", "product_name": "Test Item 1 Updated", "quantity": 12},
                        {"barcode": "3333333333333", "product_name": "New Item 3", "quantity": 7}
                    ],
                    "total_quantity": 19,
                    "submitted_at": "2026-02-21T11:00:00Z"
                }]
            }
            
            response = self.session.post(f"{API_URL}/sync/", json=resync_payload)
            
            if response.status_code != 200:
                return self.log_test("Re-sync Same Location", False, 
                    f"Re-sync failed: {response.status_code} - {response.text}")
            
            # Verify logs increased (append-only behavior)
            time.sleep(1)  # Brief pause for data consistency
            response = self.session.get(f"{API_URL}/portal/sync-logs")
            
            if response.status_code == 200:
                new_logs = response.json()
                new_log_count = len(new_logs)
                
                if new_log_count <= initial_log_count:
                    return self.log_test("Re-sync Same Location", False, 
                        f"Log count did not increase: {initial_log_count} -> {new_log_count}")
                
                return self.log_test("Re-sync Same Location", True, 
                    f"Re-sync successful, logs preserved (append-only): {initial_log_count} -> {new_log_count}")
            else:
                return self.log_test("Re-sync Same Location", False, 
                    "Failed to verify log count after re-sync")
                
        except Exception as e:
            return self.log_test("Re-sync Same Location", False, f"Exception: {str(e)}")
    
    def test_verify_both_syncs_preserved(self):
        """Verify both original sync and re-sync are preserved in raw logs"""
        try:
            session_id = self.test_data.get("session_id")
            if not session_id:
                return self.log_test("Verify Both Syncs Preserved", False, "No session ID available")
            
            # Get logs for this session
            response = self.session.get(f"{API_URL}/portal/sync-logs?session_id={session_id}")
            
            if response.status_code != 200:
                return self.log_test("Verify Both Syncs Preserved", False, 
                    f"Failed to get session logs: {response.status_code}")
            
            logs = response.json()
            
            # Should have at least 2 logs for this session now
            session_logs = [log for log in logs if log.get("session_id") == session_id]
            
            if len(session_logs) < 2:
                return self.log_test("Verify Both Syncs Preserved", False, 
                    f"Expected at least 2 logs, found {len(session_logs)}")
            
            # Verify raw payloads are different (indicating both syncs preserved)
            payloads = [log.get("raw_payload", {}) for log in session_logs[:2]]
            
            # Check that we have different item data in the payloads
            first_items = payloads[0].get("locations", [{}])[0].get("items", [])
            second_items = payloads[1].get("locations", [{}])[0].get("items", [])
            
            if first_items == second_items:
                return self.log_test("Verify Both Syncs Preserved", False, 
                    "Raw payloads appear identical - syncs may not be preserved")
            
            return self.log_test("Verify Both Syncs Preserved", True, 
                f"Both syncs preserved in raw logs: {len(session_logs)} logs found with different payloads")
                
        except Exception as e:
            return self.log_test("Verify Both Syncs Preserved", False, f"Exception: {str(e)}")
    
    def run_all_tests(self):
        """Execute all tests in the correct order"""
        print("🧪 Starting Sync Raw Logs Feature Testing...")
        print(f"🌐 Backend URL: {BASE_URL}")
        print("=" * 80)
        
        # Test sequence following the review request flow
        tests = [
            self.test_portal_login,
            self.test_get_existing_session,
            self.test_sync_data_generation,
            self.test_get_all_sync_logs,
            self.test_filter_logs_by_session,
            self.test_get_log_detail,
            self.test_resync_same_location,
            self.test_verify_both_syncs_preserved,
        ]
        
        passed = 0
        total = len(tests)
        
        for test in tests:
            if test():
                passed += 1
            print()  # Add spacing between tests
        
        # Print summary
        print("=" * 80)
        print(f"📊 TEST SUMMARY: {passed}/{total} tests passed")
        print()
        
        if passed == total:
            print("🎉 ALL SYNC RAW LOGS TESTS PASSED!")
            return True
        else:
            print("❌ SOME TESTS FAILED - Check logs above for details")
            return False

if __name__ == "__main__":
    test_suite = SyncRawLogsTestSuite()
    success = test_suite.run_all_tests()
    sys.exit(0 if success else 1)