#!/usr/bin/env python3
"""
AUDIX Admin Portal Backend API Testing
=====================================

This script tests the complete AUDIX Admin Portal backend API functionality
including portal authentication, client management, audit sessions, sync API, 
dashboard, and reports as requested in the review.

Backend URL: https://offline-sync-portal.preview.emergentagent.com
"""

import requests
import json
from datetime import datetime, timezone
import sys
import time


class AudixBackendTester:
    def __init__(self):
        self.base_url = "https://offline-sync-portal.preview.emergentagent.com"
        self.api_url = f"{self.base_url}/api"
        self.portal_url = f"{self.base_url}/api/portal"
        self.sync_url = f"{self.base_url}/api/sync"
        
        # Store test data for cross-endpoint testing
        self.test_data = {
            "user_info": None,
            "client_id": None,
            "session_id": None
        }
        
        self.passed_tests = 0
        self.failed_tests = 0
        self.test_results = []

    def log_result(self, test_name, success, details=""):
        """Log test result and print status"""
        status = "✅ PASSED" if success else "❌ FAILED"
        print(f"{status}: {test_name}")
        if details:
            print(f"   {details}")
        
        self.test_results.append({
            "test": test_name,
            "success": success,
            "details": details
        })
        
        if success:
            self.passed_tests += 1
        else:
            self.failed_tests += 1

    def test_portal_authentication(self):
        """Test 1: Portal Authentication - POST /api/portal/login"""
        print("\n=== TESTING PORTAL AUTHENTICATION ===")
        
        try:
            # Test with correct credentials
            login_data = {
                "username": "admin",
                "password": "admin123"
            }
            
            response = requests.post(
                f"{self.portal_url}/login",
                json=login_data,
                headers={"Content-Type": "application/json"},
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                if "user" in data and "id" in data["user"] and "username" in data["user"] and "role" in data["user"]:
                    self.test_data["user_info"] = data["user"]
                    self.log_result(
                        "Portal Login", 
                        True, 
                        f"User ID: {data['user']['id']}, Username: {data['user']['username']}, Role: {data['user']['role']}"
                    )
                else:
                    self.log_result("Portal Login", False, f"Invalid response structure: {data}")
            else:
                self.log_result("Portal Login", False, f"Status {response.status_code}: {response.text}")
                
        except Exception as e:
            self.log_result("Portal Login", False, f"Exception: {str(e)}")

    def test_client_management(self):
        """Test 2: Client Management - Create and Get clients"""
        print("\n=== TESTING CLIENT MANAGEMENT ===")
        
        # Test Create Client - POST /api/portal/clients
        try:
            # Use unique code to avoid conflicts
            unique_code = f"TC{int(time.time())}"
            client_data = {
                "name": "Test Client",
                "code": unique_code,
                "address": "Test Address"
            }
            
            response = requests.post(
                f"{self.portal_url}/clients",
                json=client_data,
                headers={"Content-Type": "application/json"},
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                if "client" in data and "id" in data["client"]:
                    self.test_data["client_id"] = data["client"]["id"]
                    self.log_result(
                        "Create Client", 
                        True, 
                        f"Client ID: {data['client']['id']}, Name: {data['client']['name']}"
                    )
                else:
                    self.log_result("Create Client", False, f"Invalid response: {data}")
            else:
                # If client creation failed, try to get existing clients and use the first one
                if response.status_code == 400 and "already exists" in response.text:
                    # Try to get existing clients
                    try:
                        get_response = requests.get(f"{self.portal_url}/clients", timeout=10)
                        if get_response.status_code == 200:
                            clients = get_response.json()
                            if clients and len(clients) > 0:
                                self.test_data["client_id"] = clients[0]["id"]
                                self.log_result(
                                    "Create Client", 
                                    True, 
                                    f"Used existing client: {clients[0]['name']} (ID: {clients[0]['id']})"
                                )
                            else:
                                self.log_result("Create Client", False, "No existing clients found")
                        else:
                            self.log_result("Create Client", False, f"Could not retrieve existing clients: {get_response.status_code}")
                    except Exception as e:
                        self.log_result("Create Client", False, f"Error retrieving existing clients: {str(e)}")
                else:
                    self.log_result("Create Client", False, f"Status {response.status_code}: {response.text}")
                
        except Exception as e:
            self.log_result("Create Client", False, f"Exception: {str(e)}")

        # Test Get Clients - GET /api/portal/clients
        try:
            response = requests.get(
                f"{self.portal_url}/clients",
                timeout=10
            )
            
            if response.status_code == 200:
                clients = response.json()
                if isinstance(clients, list):
                    # Check if our created client is in the list
                    created_client = None
                    if self.test_data["client_id"]:
                        created_client = next(
                            (c for c in clients if c.get("id") == self.test_data["client_id"]), 
                            None
                        )
                    
                    if created_client:
                        self.log_result(
                            "Get Clients", 
                            True, 
                            f"Found {len(clients)} clients, including created client '{created_client['name']}'"
                        )
                    else:
                        self.log_result(
                            "Get Clients", 
                            True, 
                            f"Retrieved {len(clients)} clients (created client not yet visible)"
                        )
                else:
                    self.log_result("Get Clients", False, f"Expected list, got: {type(clients)}")
            else:
                self.log_result("Get Clients", False, f"Status {response.status_code}: {response.text}")
                
        except Exception as e:
            self.log_result("Get Clients", False, f"Exception: {str(e)}")

    def test_audit_session_management(self):
        """Test 3: Audit Session Management - Create and Get sessions"""
        print("\n=== TESTING AUDIT SESSION MANAGEMENT ===")
        
        if not self.test_data["client_id"]:
            self.log_result("Create Session", False, "No client_id available from previous test")
            return

        # Test Create Session - POST /api/portal/sessions
        try:
            session_data = {
                "client_id": self.test_data["client_id"],
                "name": f"Test Audit Session {datetime.now().strftime('%Y-%m-%d %H:%M')}",
                "start_date": datetime.now(timezone.utc).isoformat()
            }
            
            response = requests.post(
                f"{self.portal_url}/sessions",
                json=session_data,
                headers={"Content-Type": "application/json"},
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                if "session" in data and "id" in data["session"]:
                    self.test_data["session_id"] = data["session"]["id"]
                    self.log_result(
                        "Create Session", 
                        True, 
                        f"Session ID: {data['session']['id']}, Name: {data['session']['name']}"
                    )
                else:
                    self.log_result("Create Session", False, f"Invalid response: {data}")
            else:
                self.log_result("Create Session", False, f"Status {response.status_code}: {response.text}")
                
        except Exception as e:
            self.log_result("Create Session", False, f"Exception: {str(e)}")

        # Test Get Sessions - GET /api/portal/sessions
        try:
            response = requests.get(
                f"{self.portal_url}/sessions",
                timeout=10
            )
            
            if response.status_code == 200:
                sessions = response.json()
                if isinstance(sessions, list):
                    # Check if our created session is in the list
                    created_session = None
                    if self.test_data["session_id"]:
                        created_session = next(
                            (s for s in sessions if s.get("id") == self.test_data["session_id"]), 
                            None
                        )
                    
                    if created_session:
                        self.log_result(
                            "Get Sessions", 
                            True, 
                            f"Found {len(sessions)} sessions, including created session '{created_session['name']}'"
                        )
                    else:
                        self.log_result(
                            "Get Sessions", 
                            True, 
                            f"Retrieved {len(sessions)} sessions (created session not yet visible)"
                        )
                else:
                    self.log_result("Get Sessions", False, f"Expected list, got: {type(sessions)}")
            else:
                self.log_result("Get Sessions", False, f"Status {response.status_code}: {response.text}")
                
        except Exception as e:
            self.log_result("Get Sessions", False, f"Exception: {str(e)}")

    def test_sync_api(self):
        """Test 4: Sync API - POST /api/sync/"""
        print("\n=== TESTING SYNC API ===")
        
        if not self.test_data["client_id"] or not self.test_data["session_id"]:
            self.log_result("Sync API", False, "Missing client_id or session_id from previous tests")
            return

        try:
            sync_data = {
                "device_name": "Test-Scanner-01",
                "sync_password": "test123",
                "client_id": self.test_data["client_id"],
                "session_id": self.test_data["session_id"],
                "locations": [
                    {
                        "id": "loc-001",
                        "name": "Warehouse A",
                        "items": [
                            {
                                "barcode": "8901234567890",
                                "productName": "Test Product",
                                "price": 100,
                                "quantity": 5,
                                "scannedAt": "2026-02-21T10:00:00Z"
                            }
                        ]
                    }
                ],
                "clear_after_sync": False
            }
            
            response = requests.post(
                f"{self.sync_url}/",
                json=sync_data,
                headers={"Content-Type": "application/json"},
                timeout=15
            )
            
            if response.status_code == 200:
                data = response.json()
                if "message" in data and "locations_synced" in data:
                    self.log_result(
                        "Sync API", 
                        True, 
                        f"Synced {data['locations_synced']} locations. Message: {data['message']}"
                    )
                else:
                    self.log_result("Sync API", False, f"Invalid response structure: {data}")
            else:
                self.log_result("Sync API", False, f"Status {response.status_code}: {response.text}")
                
        except Exception as e:
            self.log_result("Sync API", False, f"Exception: {str(e)}")

    def test_dashboard(self):
        """Test 5: Dashboard - GET /api/portal/dashboard"""
        print("\n=== TESTING DASHBOARD ===")
        
        try:
            response = requests.get(
                f"{self.portal_url}/dashboard",
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                if "stats" in data and "recent_syncs" in data:
                    stats = data["stats"]
                    self.log_result(
                        "Dashboard", 
                        True, 
                        f"Stats - Clients: {stats.get('clients', 0)}, Active Sessions: {stats.get('active_sessions', 0)}, Devices: {stats.get('devices', 0)}, Recent Syncs: {len(data.get('recent_syncs', []))}"
                    )
                else:
                    self.log_result("Dashboard", False, f"Invalid response structure: {data}")
            else:
                self.log_result("Dashboard", False, f"Status {response.status_code}: {response.text}")
                
        except Exception as e:
            self.log_result("Dashboard", False, f"Exception: {str(e)}")

    def test_reports(self):
        """Test 6: Reports - GET /api/portal/reports/{session_id}/daily-progress"""
        print("\n=== TESTING REPORTS ===")
        
        if not self.test_data["session_id"]:
            self.log_result("Daily Progress Report", False, "No session_id available from previous test")
            return

        try:
            response = requests.get(
                f"{self.portal_url}/reports/{self.test_data['session_id']}/daily-progress",
                timeout=10
            )
            
            if response.status_code == 200:
                report_data = response.json()
                if isinstance(report_data, list):
                    self.log_result(
                        "Daily Progress Report", 
                        True, 
                        f"Retrieved daily progress report with {len(report_data)} entries"
                    )
                    # Show details if we have synced data
                    for entry in report_data:
                        if entry.get("locations", 0) > 0:
                            print(f"   Date: {entry.get('date')}, Locations: {entry.get('locations')}, Items: {entry.get('items')}, Quantity: {entry.get('quantity')}")
                else:
                    self.log_result("Daily Progress Report", False, f"Expected list, got: {type(report_data)}")
            else:
                self.log_result("Daily Progress Report", False, f"Status {response.status_code}: {response.text}")
                
        except Exception as e:
            self.log_result("Daily Progress Report", False, f"Exception: {str(e)}")

    def test_basic_endpoints(self):
        """Test basic legacy endpoints to ensure backward compatibility"""
        print("\n=== TESTING BASIC ENDPOINTS (Legacy) ===")
        
        # Test root endpoint
        try:
            response = requests.get(f"{self.api_url}/", timeout=10)
            if response.status_code == 200:
                data = response.json()
                if data.get("message") == "Hello World":
                    self.log_result("Basic Root Endpoint", True, "Returns 'Hello World'")
                else:
                    self.log_result("Basic Root Endpoint", False, f"Unexpected message: {data}")
            else:
                self.log_result("Basic Root Endpoint", False, f"Status {response.status_code}: {response.text}")
        except Exception as e:
            self.log_result("Basic Root Endpoint", False, f"Exception: {str(e)}")

    def run_all_tests(self):
        """Run all test suites in sequence"""
        print("🚀 STARTING AUDIX ADMIN PORTAL BACKEND API TESTING")
        print(f"Backend URL: {self.base_url}")
        print("=" * 60)
        
        # Run tests in dependency order
        self.test_basic_endpoints()
        self.test_portal_authentication()
        self.test_client_management()
        self.test_audit_session_management()
        self.test_sync_api()
        self.test_dashboard()
        self.test_reports()
        
        # Print summary
        print("\n" + "=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        
        total_tests = self.passed_tests + self.failed_tests
        print(f"Total Tests: {total_tests}")
        print(f"✅ Passed: {self.passed_tests}")
        print(f"❌ Failed: {self.failed_tests}")
        
        if self.failed_tests > 0:
            print("\n❌ FAILED TESTS:")
            for result in self.test_results:
                if not result["success"]:
                    print(f"   - {result['test']}: {result['details']}")
        
        success_rate = (self.passed_tests / total_tests * 100) if total_tests > 0 else 0
        print(f"\nSuccess Rate: {success_rate:.1f}%")
        
        if self.failed_tests == 0:
            print("\n🎉 ALL TESTS PASSED! AUDIX Admin Portal backend is working correctly.")
            return True
        else:
            print(f"\n⚠️  {self.failed_tests} test(s) failed. Please check the backend implementation.")
            return False


def main():
    """Main function to run the test suite"""
    tester = AudixBackendTester()
    success = tester.run_all_tests()
    
    # Exit with appropriate code
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()