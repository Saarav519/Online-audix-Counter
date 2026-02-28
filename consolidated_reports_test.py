#!/usr/bin/env python3
"""
AUDIX Consolidated Reports Testing
Testing Flow as specified in review request:
1. Login with admin/admin123
2. Get clients and pick first client (Reliance Retail)
3. Test all 5 consolidated report endpoints
4. Verify existing individual session reports still work

Backend URL: https://master-stock-config.preview.emergentagent.com
"""

import requests
import json
import sys

# Backend configuration
BACKEND_URL = "https://master-stock-config.preview.emergentagent.com"
API_BASE = f"{BACKEND_URL}/api"

class ConsolidatedReportsTester:
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
        """Test 1: Login with admin/admin123"""
        try:
            login_data = {"username": "admin", "password": "admin123"}
            response = self.session.post(f"{API_BASE}/portal/login", json=login_data)
            
            if response.status_code == 200:
                login_response = response.json()
                # Handle nested user object
                user_data = login_response.get("user", login_response)
                if "id" in user_data and "username" in user_data:
                    self.admin_token = user_data.get("id")
                    return self.log_test("Portal Login", True, 
                        f"Admin login successful - User ID: {user_data['id']}, Username: {user_data['username']}")
                else:
                    return self.log_test("Portal Login", False, f"Invalid login response format: {login_response}")
            else:
                return self.log_test("Portal Login", False, 
                    f"Login failed - Status: {response.status_code}, Response: {response.text}")
                    
        except Exception as e:
            return self.log_test("Portal Login", False, f"Exception: {str(e)}")

    def test_2_get_clients(self):
        """Test 2: Get clients and pick first one (preferably Reliance Retail)"""
        try:
            response = self.session.get(f"{API_BASE}/portal/clients")
            
            if response.status_code == 200:
                clients = response.json()
                if isinstance(clients, list) and len(clients) > 0:
                    # Look for Reliance Retail first, otherwise take first client
                    reliance_client = None
                    for client in clients:
                        if "reliance" in client.get("name", "").lower() or "retail" in client.get("name", "").lower():
                            reliance_client = client
                            break
                    
                    selected_client = reliance_client if reliance_client else clients[0]
                    self.client_id = selected_client["id"]
                    
                    return self.log_test("Get Clients", True, 
                        f"Found {len(clients)} clients. Selected: {selected_client['name']} (ID: {selected_client['id']})")
                else:
                    return self.log_test("Get Clients", False, f"No clients found or invalid response: {clients}")
            else:
                return self.log_test("Get Clients", False, 
                    f"Get clients failed - Status: {response.status_code}, Response: {response.text}")
                    
        except Exception as e:
            return self.log_test("Get Clients", False, f"Exception: {str(e)}")

    def test_3_consolidated_bin_wise(self):
        """Test 3: Consolidated Bin-wise Report"""
        try:
            if not self.client_id:
                return self.log_test("Consolidated Bin-wise Report", False, "No client_id available")
            
            response = self.session.get(f"{API_BASE}/portal/reports/consolidated/{self.client_id}/bin-wise")
            
            if response.status_code == 200:
                data = response.json()
                
                # Verify required structure
                if "report" in data and "totals" in data:
                    report = data["report"]
                    totals = data["totals"]
                    
                    # Check totals structure
                    required_total_fields = ["stock_qty", "physical_qty", "difference_qty", "accuracy_pct"]
                    missing_total_fields = [f for f in required_total_fields if f not in totals]
                    
                    if missing_total_fields:
                        return self.log_test("Consolidated Bin-wise Report", False, 
                            f"Missing totals fields: {missing_total_fields}")
                    
                    # Check report structure if data exists
                    if isinstance(report, list):
                        if len(report) > 0:
                            # Check first row structure
                            required_fields = ["location", "stock_qty", "physical_qty", "accuracy_pct", "remark"]
                            first_row = report[0]
                            missing_fields = [f for f in required_fields if f not in first_row]
                            
                            if missing_fields:
                                return self.log_test("Consolidated Bin-wise Report", False, 
                                    f"Missing report fields: {missing_fields}")
                            
                            return self.log_test("Consolidated Bin-wise Report", True, 
                                f"Report contains {len(report)} locations. Totals: Stock={totals['stock_qty']}, Physical={totals['physical_qty']}, Accuracy={totals['accuracy_pct']}%")
                        else:
                            return self.log_test("Consolidated Bin-wise Report", True, 
                                "Report structure valid but no data found (empty report)")
                    else:
                        return self.log_test("Consolidated Bin-wise Report", False, 
                            f"Report is not a list: {type(report)}")
                else:
                    return self.log_test("Consolidated Bin-wise Report", False, 
                        f"Missing 'report' or 'totals' in response: {data}")
            else:
                return self.log_test("Consolidated Bin-wise Report", False, 
                    f"Request failed - Status: {response.status_code}, Response: {response.text}")
                    
        except Exception as e:
            return self.log_test("Consolidated Bin-wise Report", False, f"Exception: {str(e)}")

    def test_4_consolidated_detailed(self):
        """Test 4: Consolidated Detailed Report"""
        try:
            if not self.client_id:
                return self.log_test("Consolidated Detailed Report", False, "No client_id available")
            
            response = self.session.get(f"{API_BASE}/portal/reports/consolidated/{self.client_id}/detailed")
            
            if response.status_code == 200:
                data = response.json()
                
                # Verify required structure
                if "report" in data and "totals" in data:
                    report = data["report"]
                    totals = data["totals"]
                    
                    # Check totals structure (detailed uses diff_qty, not difference_qty)
                    required_total_fields = ["stock_qty", "physical_qty", "diff_qty", "accuracy_pct"]
                    missing_total_fields = [f for f in required_total_fields if f not in totals]
                    
                    if missing_total_fields:
                        return self.log_test("Consolidated Detailed Report", False, 
                            f"Missing totals fields: {missing_total_fields}")
                    
                    # Check report structure if data exists
                    if isinstance(report, list):
                        if len(report) > 0:
                            # Check first row structure
                            required_fields = ["barcode", "location", "stock_qty", "physical_qty", "accuracy_pct", "remark"]
                            first_row = report[0]
                            missing_fields = [f for f in required_fields if f not in first_row]
                            
                            if missing_fields:
                                return self.log_test("Consolidated Detailed Report", False, 
                                    f"Missing report fields: {missing_fields}")
                            
                            return self.log_test("Consolidated Detailed Report", True, 
                                f"Report contains {len(report)} items. Totals: Stock={totals['stock_qty']}, Physical={totals['physical_qty']}, Accuracy={totals['accuracy_pct']}%")
                        else:
                            return self.log_test("Consolidated Detailed Report", True, 
                                "Report structure valid but no data found (empty report)")
                    else:
                        return self.log_test("Consolidated Detailed Report", False, 
                            f"Report is not a list: {type(report)}")
                else:
                    return self.log_test("Consolidated Detailed Report", False, 
                        f"Missing 'report' or 'totals' in response: {data}")
            else:
                return self.log_test("Consolidated Detailed Report", False, 
                    f"Request failed - Status: {response.status_code}, Response: {response.text}")
                    
        except Exception as e:
            return self.log_test("Consolidated Detailed Report", False, f"Exception: {str(e)}")

    def test_5_consolidated_barcode_wise(self):
        """Test 5: Consolidated Barcode-wise Report"""
        try:
            if not self.client_id:
                return self.log_test("Consolidated Barcode-wise Report", False, "No client_id available")
            
            response = self.session.get(f"{API_BASE}/portal/reports/consolidated/{self.client_id}/barcode-wise")
            
            if response.status_code == 200:
                data = response.json()
                
                # Verify required structure
                if "report" in data and "totals" in data:
                    report = data["report"]
                    totals = data["totals"]
                    
                    # Check totals structure (barcode-wise uses diff_qty)
                    required_total_fields = ["stock_qty", "physical_qty", "diff_qty", "accuracy_pct"]
                    missing_total_fields = [f for f in required_total_fields if f not in totals]
                    
                    if missing_total_fields:
                        return self.log_test("Consolidated Barcode-wise Report", False, 
                            f"Missing totals fields: {missing_total_fields}")
                    
                    # Check report structure if data exists
                    if isinstance(report, list):
                        if len(report) > 0:
                            # Check first row structure
                            required_fields = ["barcode", "stock_qty", "physical_qty", "accuracy_pct", "remark"]
                            first_row = report[0]
                            missing_fields = [f for f in required_fields if f not in first_row]
                            
                            if missing_fields:
                                return self.log_test("Consolidated Barcode-wise Report", False, 
                                    f"Missing report fields: {missing_fields}")
                            
                            return self.log_test("Consolidated Barcode-wise Report", True, 
                                f"Report contains {len(report)} barcodes. Totals: Stock={totals['stock_qty']}, Physical={totals['physical_qty']}, Accuracy={totals['accuracy_pct']}%")
                        else:
                            return self.log_test("Consolidated Barcode-wise Report", True, 
                                "Report structure valid but no data found (empty report)")
                    else:
                        return self.log_test("Consolidated Barcode-wise Report", False, 
                            f"Report is not a list: {type(report)}")
                else:
                    return self.log_test("Consolidated Barcode-wise Report", False, 
                        f"Missing 'report' or 'totals' in response: {data}")
            else:
                return self.log_test("Consolidated Barcode-wise Report", False, 
                    f"Request failed - Status: {response.status_code}, Response: {response.text}")
                    
        except Exception as e:
            return self.log_test("Consolidated Barcode-wise Report", False, f"Exception: {str(e)}")

    def test_6_consolidated_article_wise(self):
        """Test 6: Consolidated Article-wise Report"""
        try:
            if not self.client_id:
                return self.log_test("Consolidated Article-wise Report", False, "No client_id available")
            
            response = self.session.get(f"{API_BASE}/portal/reports/consolidated/{self.client_id}/article-wise")
            
            if response.status_code == 200:
                data = response.json()
                
                # Verify required structure
                if "report" in data and "totals" in data:
                    report = data["report"]
                    totals = data["totals"]
                    
                    # Check totals structure (article-wise uses diff_qty)
                    required_total_fields = ["stock_qty", "physical_qty", "diff_qty", "accuracy_pct"]
                    missing_total_fields = [f for f in required_total_fields if f not in totals]
                    
                    if missing_total_fields:
                        return self.log_test("Consolidated Article-wise Report", False, 
                            f"Missing totals fields: {missing_total_fields}")
                    
                    # Check report structure if data exists
                    if isinstance(report, list):
                        if len(report) > 0:
                            # Check first row structure
                            required_fields = ["article_code", "stock_qty", "physical_qty", "accuracy_pct", "remark"]
                            first_row = report[0]
                            missing_fields = [f for f in required_fields if f not in first_row]
                            
                            if missing_fields:
                                return self.log_test("Consolidated Article-wise Report", False, 
                                    f"Missing report fields: {missing_fields}")
                            
                            return self.log_test("Consolidated Article-wise Report", True, 
                                f"Report contains {len(report)} articles. Totals: Stock={totals['stock_qty']}, Physical={totals['physical_qty']}, Accuracy={totals['accuracy_pct']}%")
                        else:
                            return self.log_test("Consolidated Article-wise Report", True, 
                                "Report structure valid but no data found (empty report)")
                    else:
                        return self.log_test("Consolidated Article-wise Report", False, 
                            f"Report is not a list: {type(report)}")
                else:
                    return self.log_test("Consolidated Article-wise Report", False, 
                        f"Missing 'report' or 'totals' in response: {data}")
            else:
                return self.log_test("Consolidated Article-wise Report", False, 
                    f"Request failed - Status: {response.status_code}, Response: {response.text}")
                    
        except Exception as e:
            return self.log_test("Consolidated Article-wise Report", False, f"Exception: {str(e)}")

    def test_7_consolidated_category_summary(self):
        """Test 7: Consolidated Category Summary Report"""
        try:
            if not self.client_id:
                return self.log_test("Consolidated Category Summary", False, "No client_id available")
            
            response = self.session.get(f"{API_BASE}/portal/reports/consolidated/{self.client_id}/category-summary")
            
            if response.status_code == 200:
                data = response.json()
                
                # Verify required structure
                if "report" in data and "totals" in data:
                    report = data["report"]
                    totals = data["totals"]
                    
                    # Check totals structure (category-summary uses diff_qty)
                    required_total_fields = ["stock_qty", "physical_qty", "diff_qty", "accuracy_pct"]
                    missing_total_fields = [f for f in required_total_fields if f not in totals]
                    
                    if missing_total_fields:
                        return self.log_test("Consolidated Category Summary", False, 
                            f"Missing totals fields: {missing_total_fields}")
                    
                    # Check report structure if data exists
                    if isinstance(report, list):
                        if len(report) > 0:
                            # Check first row structure
                            required_fields = ["category", "stock_qty", "physical_qty", "accuracy_pct", "remark"]
                            first_row = report[0]
                            missing_fields = [f for f in required_fields if f not in first_row]
                            
                            if missing_fields:
                                return self.log_test("Consolidated Category Summary", False, 
                                    f"Missing report fields: {missing_fields}")
                            
                            return self.log_test("Consolidated Category Summary", True, 
                                f"Report contains {len(report)} categories. Totals: Stock={totals['stock_qty']}, Physical={totals['physical_qty']}, Accuracy={totals['accuracy_pct']}%")
                        else:
                            return self.log_test("Consolidated Category Summary", True, 
                                "Report structure valid but no data found (empty report)")
                    else:
                        return self.log_test("Consolidated Category Summary", False, 
                            f"Report is not a list: {type(report)}")
                else:
                    return self.log_test("Consolidated Category Summary", False, 
                        f"Missing 'report' or 'totals' in response: {data}")
            else:
                return self.log_test("Consolidated Category Summary", False, 
                    f"Request failed - Status: {response.status_code}, Response: {response.text}")
                    
        except Exception as e:
            return self.log_test("Consolidated Category Summary", False, f"Exception: {str(e)}")

    def test_8_get_sessions_for_client(self):
        """Test 8: Get sessions to test individual reports"""
        try:
            if not self.client_id:
                return self.log_test("Get Sessions for Client", False, "No client_id available")
            
            response = self.session.get(f"{API_BASE}/portal/sessions?client_id={self.client_id}")
            
            if response.status_code == 200:
                sessions = response.json()
                
                if isinstance(sessions, list):
                    if len(sessions) > 0:
                        self.session_id = sessions[0]["id"]
                        return self.log_test("Get Sessions for Client", True, 
                            f"Found {len(sessions)} sessions for client. Selected session ID: {self.session_id}")
                    else:
                        return self.log_test("Get Sessions for Client", True, 
                            "No sessions found for client (this is normal if no data has been created yet)")
                else:
                    return self.log_test("Get Sessions for Client", False, 
                        f"Sessions response is not a list: {type(sessions)}")
            else:
                return self.log_test("Get Sessions for Client", False, 
                    f"Get sessions failed - Status: {response.status_code}, Response: {response.text}")
                    
        except Exception as e:
            return self.log_test("Get Sessions for Client", False, f"Exception: {str(e)}")

    def test_9_individual_session_bin_wise(self):
        """Test 9: Individual Session Bin-wise Report (backward compatibility)"""
        try:
            if not self.session_id:
                return self.log_test("Individual Session Bin-wise Report", True, 
                    "Skipped - No session available (this is normal if no data has been created yet)")
            
            response = self.session.get(f"{API_BASE}/portal/reports/{self.session_id}/bin-wise")
            
            if response.status_code == 200:
                data = response.json()
                
                # Verify required structure
                if "report" in data and "totals" in data:
                    report = data["report"]
                    totals = data["totals"]
                    
                    # Check totals structure
                    required_total_fields = ["stock_qty", "physical_qty", "difference_qty", "accuracy_pct"]
                    missing_total_fields = [f for f in required_total_fields if f not in totals]
                    
                    if missing_total_fields:
                        return self.log_test("Individual Session Bin-wise Report", False, 
                            f"Missing totals fields: {missing_total_fields}")
                    
                    return self.log_test("Individual Session Bin-wise Report", True, 
                        f"Individual session report working. Report contains {len(report)} items")
                else:
                    return self.log_test("Individual Session Bin-wise Report", False, 
                        f"Missing 'report' or 'totals' in response: {data}")
            else:
                return self.log_test("Individual Session Bin-wise Report", False, 
                    f"Request failed - Status: {response.status_code}, Response: {response.text}")
                    
        except Exception as e:
            return self.log_test("Individual Session Bin-wise Report", False, f"Exception: {str(e)}")

    def run_all_tests(self):
        """Run all tests in sequence"""
        print(f"🚀 AUDIX Consolidated Reports Testing")
        print(f"Backend URL: {BACKEND_URL}")
        print("=" * 80)
        
        tests = [
            self.test_1_portal_login,
            self.test_2_get_clients,
            self.test_3_consolidated_bin_wise,
            self.test_4_consolidated_detailed,
            self.test_5_consolidated_barcode_wise,
            self.test_6_consolidated_article_wise,
            self.test_7_consolidated_category_summary,
            self.test_8_get_sessions_for_client,
            self.test_9_individual_session_bin_wise
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
            print("🎉 ALL CONSOLIDATED REPORT TESTS PASSED")
        else:
            print("⚠️  SOME TESTS FAILED - CHECK DETAILS ABOVE")
            
        return passed == total

if __name__ == "__main__":
    tester = ConsolidatedReportsTester()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)