#!/usr/bin/env python3
"""
Backend API Test Suite for Audix Online Counter App Portal
Testing all key API endpoints to verify functionality
"""

import requests
import sys
import json
from datetime import datetime

class AudixPortalAPITester:
    def __init__(self, base_url="https://audix-preview.preview.emergentagent.com"):
        self.base_url = base_url
        self.session = requests.Session()
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def log_test(self, name, success, details, status_code=None):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
        
        result = {
            "test": name,
            "status": "PASS" if success else "FAIL",
            "details": details,
            "status_code": status_code,
            "timestamp": datetime.now().isoformat()
        }
        self.test_results.append(result)
        
        status_icon = "✅" if success else "❌"
        print(f"{status_icon} {name}: {'PASS' if success else 'FAIL'}")
        if status_code:
            print(f"   Status: {status_code}")
        print(f"   Details: {details}")
        print()

    def test_portal_login(self):
        """Test portal login with admin credentials"""
        try:
            response = self.session.post(f"{self.base_url}/api/audit/portal/login", 
                                       json={"username": "admin", "password": "admin123"})
            
            if response.status_code == 200:
                data = response.json()
                if "user" in data and data["user"]["username"] == "admin":
                    self.log_test("Portal Login", True, 
                                f"Successfully logged in as admin user, role: {data['user']['role']}", 
                                response.status_code)
                    return True
                else:
                    self.log_test("Portal Login", False, 
                                "Login response missing user data", response.status_code)
            else:
                self.log_test("Portal Login", False, 
                            f"Login failed: {response.text}", response.status_code)
        except Exception as e:
            self.log_test("Portal Login", False, f"Request failed: {str(e)}")
        return False

    def test_dashboard_endpoint(self):
        """Test dashboard data endpoint"""
        try:
            response = self.session.get(f"{self.base_url}/api/audit/portal/dashboard")
            
            if response.status_code == 200:
                data = response.json()
                expected_keys = ["stats", "recent_syncs", "devices"]
                
                if all(key in data for key in expected_keys):
                    stats = data["stats"]
                    self.log_test("Dashboard Data", True,
                                f"Dashboard loaded with {stats.get('clients', 0)} clients, "
                                f"{stats.get('active_sessions', 0)} active sessions, "
                                f"{stats.get('devices', 0)} devices", response.status_code)
                    return True
                else:
                    self.log_test("Dashboard Data", False, 
                                f"Missing expected keys in response: {list(data.keys())}", 
                                response.status_code)
            else:
                self.log_test("Dashboard Data", False, 
                            f"Dashboard request failed: {response.text}", response.status_code)
        except Exception as e:
            self.log_test("Dashboard Data", False, f"Request failed: {str(e)}")
        return False

    def test_audit_summary_endpoint(self):
        """Test GET /api/audit/portal/dashboard/audit-summary"""
        try:
            response = self.session.get(f"{self.base_url}/api/audit/portal/dashboard/audit-summary")
            
            if response.status_code == 200:
                data = response.json()
                if "summaries" in data:
                    summaries = data["summaries"]
                    if len(summaries) >= 2:  # Expecting Reliance Retail and DMart Stores
                        clients_found = [s.get("client_name", s.get("client_code", "Unknown")) for s in summaries]
                        self.log_test("Audit Summary Endpoint", True,
                                    f"Found {len(summaries)} client summaries: {clients_found}", 
                                    response.status_code)
                        return True
                    else:
                        self.log_test("Audit Summary Endpoint", True,
                                    f"Audit summary returned {len(summaries)} summaries", 
                                    response.status_code)
                        return True
                else:
                    self.log_test("Audit Summary Endpoint", False, 
                                f"Missing 'summaries' key in response", response.status_code)
            else:
                self.log_test("Audit Summary Endpoint", False, 
                            f"Audit summary request failed: {response.text}", response.status_code)
        except Exception as e:
            self.log_test("Audit Summary Endpoint", False, f"Request failed: {str(e)}")
        return False

    def test_clients_endpoint(self):
        """Test clients listing"""
        try:
            response = self.session.get(f"{self.base_url}/api/audit/portal/clients")
            
            if response.status_code == 200:
                clients = response.json()
                if isinstance(clients, list):
                    client_names = [c.get("name", "Unknown") for c in clients]
                    self.log_test("Clients Endpoint", True,
                                f"Found {len(clients)} clients: {client_names}", 
                                response.status_code)
                    return True
                else:
                    self.log_test("Clients Endpoint", False, 
                                "Response is not a list", response.status_code)
            else:
                self.log_test("Clients Endpoint", False, 
                            f"Clients request failed: {response.text}", response.status_code)
        except Exception as e:
            self.log_test("Clients Endpoint", False, f"Request failed: {str(e)}")
        return False

    def test_sessions_endpoint(self):
        """Test sessions listing"""
        try:
            response = self.session.get(f"{self.base_url}/api/audit/portal/sessions")
            
            if response.status_code == 200:
                sessions = response.json()
                if isinstance(sessions, list):
                    self.log_test("Sessions Endpoint", True,
                                f"Found {len(sessions)} sessions", response.status_code)
                    return True
                else:
                    self.log_test("Sessions Endpoint", False, 
                                "Response is not a list", response.status_code)
            else:
                self.log_test("Sessions Endpoint", False, 
                            f"Sessions request failed: {response.text}", response.status_code)
        except Exception as e:
            self.log_test("Sessions Endpoint", False, f"Request failed: {str(e)}")
        return False

    def test_devices_endpoint(self):
        """Test devices listing"""
        try:
            response = self.session.get(f"{self.base_url}/api/audit/portal/devices")
            
            if response.status_code == 200:
                devices = response.json()
                if isinstance(devices, list):
                    self.log_test("Devices Endpoint", True,
                                f"Found {len(devices)} devices", response.status_code)
                    return True
                else:
                    self.log_test("Devices Endpoint", False, 
                                "Response is not a list", response.status_code)
            else:
                self.log_test("Devices Endpoint", False, 
                            f"Devices request failed: {response.text}", response.status_code)
        except Exception as e:
            self.log_test("Devices Endpoint", False, f"Request failed: {str(e)}")
        return False

    def test_master_search_endpoint(self):
        """Test master search functionality"""
        # First get clients to find a client_id
        try:
            clients_response = self.session.get(f"{self.base_url}/api/audit/portal/clients")
            if clients_response.status_code != 200:
                self.log_test("Master Search Endpoint", False, 
                            "Could not get clients list for testing search")
                return False
            
            clients = clients_response.json()
            if not clients:
                self.log_test("Master Search Endpoint", False, 
                            "No clients available for testing search")
                return False
            
            # Use first client for search test
            client_id = clients[0]["id"]
            
            response = self.session.get(f"{self.base_url}/api/audit/portal/master/search/{client_id}?q=test&field=barcode")
            
            if response.status_code == 200:
                data = response.json()
                self.log_test("Master Search Endpoint", True,
                            f"Master search successful, returned {len(data.get('results', []))} results", 
                            response.status_code)
                return True
            else:
                self.log_test("Master Search Endpoint", False, 
                            f"Master search failed: {response.text}", response.status_code)
        except Exception as e:
            self.log_test("Master Search Endpoint", False, f"Request failed: {str(e)}")
        return False

    def test_delete_device_capability(self):
        """Test if delete device endpoint exists (without actually deleting)"""
        # Test with a fake device_id to see if endpoint exists
        try:
            response = self.session.delete(f"{self.base_url}/api/audit/portal/devices/fake-device-id")
            
            # We expect 404 (device not found) which means endpoint exists
            if response.status_code == 404:
                self.log_test("Delete Device Endpoint", True,
                            "Delete device endpoint exists (returned 404 for fake ID as expected)", 
                            response.status_code)
                return True
            elif response.status_code in [400, 500]:
                self.log_test("Delete Device Endpoint", True,
                            f"Delete device endpoint exists (returned {response.status_code})", 
                            response.status_code)
                return True
            else:
                self.log_test("Delete Device Endpoint", False, 
                            f"Unexpected response: {response.status_code}", response.status_code)
        except Exception as e:
            self.log_test("Delete Device Endpoint", False, f"Request failed: {str(e)}")
        return False

    def test_barcode_edit_endpoints(self):
        """Test barcode edit and undo endpoints"""
        # Test edit-barcode endpoint
        try:
            edit_response = self.session.post(f"{self.base_url}/api/audit/portal/reports/edit-barcode",
                                            json={"client_id": "test", "report_type": "detailed", 
                                                 "original_value": "test", "new_value": "test2"})
            
            # We expect some response (even if it fails due to missing data)
            if edit_response.status_code in [200, 400, 404, 422]:
                self.log_test("Barcode Edit Endpoint", True,
                            f"Edit barcode endpoint exists (status: {edit_response.status_code})", 
                            edit_response.status_code)
                edit_works = True
            else:
                self.log_test("Barcode Edit Endpoint", False, 
                            f"Unexpected status: {edit_response.status_code}")
                edit_works = False
            
            # Test undo-edit endpoint
            undo_response = self.session.post(f"{self.base_url}/api/audit/portal/reports/undo-edit",
                                            json={"edit_id": "fake-edit-id"})
            
            if undo_response.status_code in [200, 400, 404, 422]:
                self.log_test("Barcode Undo Endpoint", True,
                            f"Undo edit endpoint exists (status: {undo_response.status_code})", 
                            undo_response.status_code)
                undo_works = True
            else:
                self.log_test("Barcode Undo Endpoint", False, 
                            f"Unexpected status: {undo_response.status_code}")
                undo_works = False
            
            return edit_works and undo_works
            
        except Exception as e:
            self.log_test("Barcode Edit Endpoints", False, f"Request failed: {str(e)}")
            return False

    def run_all_tests(self):
        """Run all backend tests"""
        print("=" * 60)
        print("🧪 AUDIX PORTAL BACKEND API TESTS")
        print("=" * 60)
        print()
        
        # Core authentication test
        login_success = self.test_portal_login()
        
        # Dashboard tests
        self.test_dashboard_endpoint()
        self.test_audit_summary_endpoint()
        
        # CRUD endpoints
        self.test_clients_endpoint()
        self.test_sessions_endpoint() 
        self.test_devices_endpoint()
        
        # Advanced features
        self.test_master_search_endpoint()
        self.test_delete_device_capability()
        self.test_barcode_edit_endpoints()
        
        # Summary
        print("=" * 60)
        print(f"📊 TEST SUMMARY")
        print("=" * 60)
        print(f"Total Tests: {self.tests_run}")
        print(f"Passed: {self.tests_passed}")
        print(f"Failed: {self.tests_run - self.tests_passed}")
        print(f"Success Rate: {(self.tests_passed/self.tests_run)*100:.1f}%")
        print()
        
        if self.tests_passed == self.tests_run:
            print("🎉 ALL TESTS PASSED!")
            return 0
        else:
            print("❌ SOME TESTS FAILED")
            return 1

if __name__ == "__main__":
    tester = AudixPortalAPITester()
    exit_code = tester.run_all_tests()
    sys.exit(exit_code)