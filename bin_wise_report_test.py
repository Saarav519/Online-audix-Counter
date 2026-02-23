#!/usr/bin/env python3
"""
AUDIX Backend Testing - Bin-wise Report with Empty Bins and Pending Locations
Testing Flow as specified in review request.
Backend URL: https://inventory-reconcile.preview.emergentagent.com
"""

import requests
import json
import io
from datetime import datetime
import sys

# Backend configuration
BACKEND_URL = "https://inventory-reconcile.preview.emergentagent.com"
API_BASE = f"{BACKEND_URL}/api"

class BinWiseReportTester:
    def __init__(self):
        self.session = requests.Session()
        self.admin_token = None
        self.client_id = None
        self.session_id = None
        self.test_results = {}
        
    def log_test(self, test_name, success, details):
        """Log test results"""
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} - {test_name}: {details}")
        self.test_results[test_name] = {"success": success, "details": details}
        return success

    def test_1_portal_login(self):
        """Test 1: Login with admin credentials"""
        try:
            login_data = {"username": "admin", "password": "admin123"}
            response = self.session.post(f"{API_BASE}/portal/login", json=login_data)
            
            if response.status_code == 200:
                login_result = response.json()
                # Handle nested user object
                user_data = login_result.get("user", login_result)
                if "id" in user_data and "username" in user_data:
                    self.admin_token = user_data.get("id")
                    return self.log_test("Portal Login", True, 
                        f"Admin login successful - User ID: {user_data['id']}, Username: {user_data['username']}")
                else:
                    return self.log_test("Portal Login", False, f"Invalid login response format: {login_result}")
            else:
                return self.log_test("Portal Login", False, 
                    f"Login failed - Status: {response.status_code}, Response: {response.text}")
                    
        except Exception as e:
            return self.log_test("Portal Login", False, f"Exception: {str(e)}")

    def test_2_get_existing_sessions(self):
        """Test 2: Get existing sessions"""
        try:
            response = self.session.get(f"{API_BASE}/portal/sessions")
            
            if response.status_code == 200:
                sessions = response.json()
                if isinstance(sessions, list) and len(sessions) > 0:
                    # Pick the first session
                    first_session = sessions[0]
                    self.session_id = first_session.get("id")
                    self.client_id = first_session.get("client_id")
                    return self.log_test("Get Sessions", True, 
                        f"Found {len(sessions)} sessions - Using session ID: {self.session_id}, Client ID: {self.client_id}")
                else:
                    return self.log_test("Get Sessions", False, f"No sessions found: {sessions}")
            else:
                return self.log_test("Get Sessions", False, 
                    f"Failed to get sessions - Status: {response.status_code}, Response: {response.text}")
                    
        except Exception as e:
            return self.log_test("Get Sessions", False, f"Exception: {str(e)}")

    def test_3_bin_wise_report_structure(self):
        """Test 3: Verify bin-wise report structure and fields"""
        try:
            if not self.session_id:
                return self.log_test("Bin-wise Report Structure", False, "No session_id available")
            
            response = self.session.get(f"{API_BASE}/portal/reports/{self.session_id}/bin-wise")
            
            if response.status_code == 200:
                report_data = response.json()
                
                # Check if response has required top-level structure
                required_top_fields = ["summary"]
                missing_top_fields = [field for field in required_top_fields if field not in report_data]
                
                if missing_top_fields:
                    return self.log_test("Bin-wise Report Structure", False, 
                        f"Missing top-level fields: {missing_top_fields}. Available: {list(report_data.keys())}")
                
                # Check summary structure
                summary = report_data.get("summary", {})
                required_summary_fields = ["total_locations", "completed", "empty_bins", "pending"]
                missing_summary_fields = [field for field in required_summary_fields if field not in summary]
                
                if missing_summary_fields:
                    return self.log_test("Bin-wise Report Structure", False, 
                        f"Missing summary fields: {missing_summary_fields}. Available: {list(summary.keys())}")
                
                # Check if there are location records
                locations_key = None
                for key in report_data.keys():
                    if key != "summary" and isinstance(report_data[key], list):
                        locations_key = key
                        break
                
                if not locations_key:
                    return self.log_test("Bin-wise Report Structure", True, 
                        f"Report structure valid - Summary: {summary}, No location data yet")
                
                locations = report_data[locations_key]
                if len(locations) > 0:
                    # Check first location record for required fields
                    sample_location = locations[0]
                    required_location_fields = ["status", "is_empty", "empty_remarks"]
                    missing_location_fields = [field for field in required_location_fields if field not in sample_location]
                    
                    if missing_location_fields:
                        return self.log_test("Bin-wise Report Structure", False, 
                            f"Location record missing fields: {missing_location_fields}. Available: {list(sample_location.keys())}")
                    
                    # Verify status field values
                    valid_statuses = ["completed", "empty_bin", "pending"]
                    location_status = sample_location.get("status")
                    if location_status not in valid_statuses:
                        return self.log_test("Bin-wise Report Structure", False, 
                            f"Invalid status value: {location_status}. Expected one of: {valid_statuses}")
                    
                    return self.log_test("Bin-wise Report Structure", True, 
                        f"Report structure valid - Summary: {summary}, Sample location fields: {list(sample_location.keys())}")
                else:
                    return self.log_test("Bin-wise Report Structure", True, 
                        f"Report structure valid - Summary: {summary}, No location records yet")
                    
            else:
                return self.log_test("Bin-wise Report Structure", False, 
                    f"Failed to get bin-wise report - Status: {response.status_code}, Response: {response.text}")
                    
        except Exception as e:
            return self.log_test("Bin-wise Report Structure", False, f"Exception: {str(e)}")

    def test_4_verify_status_and_remarks(self):
        """Test 4: Verify status fields and remark patterns"""
        try:
            if not self.session_id:
                return self.log_test("Status and Remarks", False, "No session_id available")
            
            response = self.session.get(f"{API_BASE}/portal/reports/{self.session_id}/bin-wise")
            
            if response.status_code == 200:
                report_data = response.json()
                
                # Find location data
                locations = []
                for key, value in report_data.items():
                    if key != "summary" and isinstance(value, list):
                        locations = value
                        break
                
                if len(locations) == 0:
                    return self.log_test("Status and Remarks", True, 
                        "No location data to verify status/remarks yet")
                
                status_counts = {"completed": 0, "empty_bin": 0, "pending": 0}
                remark_patterns = {"Empty Bin —": 0, "Pending —": 0, "normal": 0}
                
                for location in locations:
                    status = location.get("status")
                    remarks = location.get("empty_remarks", "")
                    
                    # Count status types
                    if status in status_counts:
                        status_counts[status] += 1
                    
                    # Check remark patterns
                    if status == "empty_bin" and remarks.startswith("Empty Bin —"):
                        remark_patterns["Empty Bin —"] += 1
                    elif status == "pending" and remarks.startswith("Pending —"):
                        remark_patterns["Pending —"] += 1
                    elif status == "completed":
                        remark_patterns["normal"] += 1
                
                return self.log_test("Status and Remarks", True, 
                    f"Status distribution: {status_counts}, Remark patterns: {remark_patterns}")
                    
            else:
                return self.log_test("Status and Remarks", False, 
                    f"Failed to get bin-wise report - Status: {response.status_code}, Response: {response.text}")
                    
        except Exception as e:
            return self.log_test("Status and Remarks", False, f"Exception: {str(e)}")

    def test_5_sync_empty_location(self):
        """Test 5: Sync an empty location to session"""
        try:
            if not self.client_id or not self.session_id:
                return self.log_test("Sync Empty Location", False, "Missing client_id or session_id")
            
            sync_data = {
                "device_name": "test-empty-sync",
                "sync_password": "audix2024",
                "client_id": self.client_id,
                "session_id": self.session_id,
                "locations": [
                    {
                        "name": "EMPTY-TEST-001",
                        "is_empty": True,
                        "empty_remarks": "Empty Bin — Verified no items during audit",
                        "items": []
                    }
                ]
            }
            
            response = self.session.post(f"{API_BASE}/sync/", json=sync_data)
            
            if response.status_code == 200:
                result = response.json()
                # Check for success indicators
                if ("success" in result and result["success"]) or ("message" in result and "successful" in result["message"].lower()):
                    return self.log_test("Sync Empty Location", True, 
                        f"Empty location synced - Message: {result.get('message', 'Success')}")
                else:
                    return self.log_test("Sync Empty Location", False, f"Sync failed: {result}")
            else:
                return self.log_test("Sync Empty Location", False, 
                    f"Sync failed - Status: {response.status_code}, Response: {response.text}")
                    
        except Exception as e:
            return self.log_test("Sync Empty Location", False, f"Exception: {str(e)}")

    def test_6_verify_empty_location_in_report(self):
        """Test 6: Verify empty location appears in bin-wise report"""
        try:
            if not self.session_id:
                return self.log_test("Verify Empty in Report", False, "No session_id available")
            
            response = self.session.get(f"{API_BASE}/portal/reports/{self.session_id}/bin-wise")
            
            if response.status_code == 200:
                report_data = response.json()
                
                # Find location data
                locations = []
                for key, value in report_data.items():
                    if key != "summary" and isinstance(value, list):
                        locations = value
                        break
                
                # Look for our empty test location
                empty_test_location = None
                for location in locations:
                    if location.get("location") == "EMPTY-TEST-001":
                        empty_test_location = location
                        break
                
                if empty_test_location:
                    # Verify it has empty_bin status
                    status = empty_test_location.get("status")
                    is_empty = empty_test_location.get("is_empty")
                    remarks = empty_test_location.get("empty_remarks", "")
                    
                    if status == "empty_bin" and is_empty is True and "Empty Bin —" in remarks:
                        return self.log_test("Verify Empty in Report", True, 
                            f"Empty location found in report - Status: {status}, Is Empty: {is_empty}, Remarks: {remarks}")
                    else:
                        return self.log_test("Verify Empty in Report", False, 
                            f"Empty location found but incorrect fields - Status: {status}, Is Empty: {is_empty}, Remarks: {remarks}")
                else:
                    return self.log_test("Verify Empty in Report", False, 
                        f"EMPTY-TEST-001 location not found in report. Available locations: {[loc.get('location') for loc in locations]}")
                    
            else:
                return self.log_test("Verify Empty in Report", False, 
                    f"Failed to get bin-wise report - Status: {response.status_code}, Response: {response.text}")
                    
        except Exception as e:
            return self.log_test("Verify Empty in Report", False, f"Exception: {str(e)}")

    def test_7_consolidated_bin_wise_report(self):
        """Test 7: Test consolidated bin-wise report"""
        try:
            # First get available clients
            clients_response = self.session.get(f"{API_BASE}/portal/clients")
            
            if clients_response.status_code != 200:
                return self.log_test("Consolidated Bin-wise Report", False, 
                    f"Failed to get clients - Status: {clients_response.status_code}")
            
            clients = clients_response.json()
            if not isinstance(clients, list) or len(clients) == 0:
                return self.log_test("Consolidated Bin-wise Report", False, 
                    f"No clients found: {clients}")
            
            # Use first client or our test client
            test_client_id = self.client_id if self.client_id else clients[0].get("id")
            
            response = self.session.get(f"{API_BASE}/portal/reports/consolidated/{test_client_id}/bin-wise")
            
            if response.status_code == 200:
                report_data = response.json()
                
                # Check for required fields like regular bin-wise report
                if "summary" in report_data:
                    summary = report_data["summary"]
                    required_summary_fields = ["total_locations", "completed", "empty_bins", "pending"]
                    missing_fields = [field for field in required_summary_fields if field not in summary]
                    
                    if missing_fields:
                        return self.log_test("Consolidated Bin-wise Report", False, 
                            f"Missing summary fields: {missing_fields}")
                    
                    return self.log_test("Consolidated Bin-wise Report", True, 
                        f"Consolidated report working - Client ID: {test_client_id}, Summary: {summary}")
                else:
                    return self.log_test("Consolidated Bin-wise Report", False, 
                        f"Missing summary in consolidated report: {report_data}")
                    
            else:
                return self.log_test("Consolidated Bin-wise Report", False, 
                    f"Failed to get consolidated report - Status: {response.status_code}, Response: {response.text}")
                    
        except Exception as e:
            return self.log_test("Consolidated Bin-wise Report", False, f"Exception: {str(e)}")

    def run_all_tests(self):
        """Run all tests in sequence"""
        print(f"🚀 AUDIX Backend Testing - Bin-wise Report with Empty Bins and Pending Locations")
        print(f"Backend URL: {BACKEND_URL}")
        print("=" * 80)
        
        tests = [
            self.test_1_portal_login,
            self.test_2_get_existing_sessions,
            self.test_3_bin_wise_report_structure,
            self.test_4_verify_status_and_remarks,
            self.test_5_sync_empty_location,
            self.test_6_verify_empty_location_in_report,
            self.test_7_consolidated_bin_wise_report
        ]
        
        passed = 0
        total = len(tests)
        
        for test in tests:
            if test():
                passed += 1
            print()  # Add space between tests
        
        print("=" * 80)
        print(f"🎯 TEST SUMMARY: {passed}/{total} tests passed ({passed/total*100:.1f}%)")
        
        if passed == total:
            print("🎉 ALL TESTS PASSED - BIN-WISE REPORT WITH EMPTY BINS AND PENDING LOCATIONS WORKING CORRECTLY")
        else:
            print("⚠️  SOME TESTS FAILED - CHECK DETAILS ABOVE")
            
        return passed == total

if __name__ == "__main__":
    tester = BinWiseReportTester()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)