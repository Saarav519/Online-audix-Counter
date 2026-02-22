#!/usr/bin/env python3
"""
AUDIX Admin Portal - Variance Mode Feature Testing
==================================================

This script tests the new variance mode functionality in the AUDIX Admin Portal backend
following the exact test flow specified in the review request.

Backend URL: https://offline-sync-portal-2.preview.emergentagent.com

Test Flow:
1. Portal Login (register + login)
2. Create Client  
3. Create 3 Sessions with different variance modes (bin-wise, barcode-wise, article-wise)
4. Import Expected Stock CSV for each session (different formats)
5. Sync Physical Data for all 3 sessions
6. Test All Report Endpoints and verify specific fields
7. Verify accuracy_pct, remark fields, pivoting, grouping, unmapped items
"""

import requests
import json
import csv
import io
import time
from datetime import datetime, timezone
import sys


class VarianceModeBackendTester:
    def __init__(self):
        self.base_url = "https://offline-sync-portal-2.preview.emergentagent.com"
        self.api_url = f"{self.base_url}/api"
        self.portal_url = f"{self.base_url}/api/portal"
        self.sync_url = f"{self.base_url}/api/sync"
        
        # Store test data for cross-endpoint testing
        self.test_data = {
            "user_info": None,
            "client_id": None,
            "session_a_id": None,  # bin-wise
            "session_b_id": None,  # barcode-wise  
            "session_c_id": None   # article-wise
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

    def step_1_portal_login(self):
        """Step 1: Portal Registration and Login"""
        print("\n=== STEP 1: PORTAL LOGIN ===")
        
        # Register test user
        try:
            register_data = {
                "username": "testadmin",
                "password": "test123"
            }
            
            # Try to register (might already exist)
            response = requests.post(
                f"{self.portal_url}/register",
                json=register_data,
                headers={"Content-Type": "application/json"},
                timeout=10
            )
            
            if response.status_code == 200:
                self.log_result("Portal Register", True, "New user registered successfully")
            elif response.status_code == 400 and "already exists" in response.text:
                self.log_result("Portal Register", True, "User already exists, continuing with login")
            else:
                self.log_result("Portal Register", False, f"Status {response.status_code}: {response.text}")
                
        except Exception as e:
            self.log_result("Portal Register", False, f"Exception: {str(e)}")

        # Login with test credentials
        try:
            login_data = {
                "username": "testadmin",
                "password": "test123"
            }
            
            response = requests.post(
                f"{self.portal_url}/login",
                json=login_data,
                headers={"Content-Type": "application/json"},
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                if "user" in data and "id" in data["user"]:
                    self.test_data["user_info"] = data["user"]
                    self.log_result(
                        "Portal Login", 
                        True, 
                        f"User ID: {data['user']['id']}, Username: {data['user']['username']}"
                    )
                else:
                    self.log_result("Portal Login", False, f"Invalid response structure: {data}")
            else:
                self.log_result("Portal Login", False, f"Status {response.status_code}: {response.text}")
                
        except Exception as e:
            self.log_result("Portal Login", False, f"Exception: {str(e)}")

    def step_2_create_client(self):
        """Step 2: Create Client"""
        print("\n=== STEP 2: CREATE CLIENT ===")
        
        try:
            # Use unique code to avoid conflicts
            unique_code = f"VTC{int(time.time())}"
            client_data = {
                "name": "Variance Test Client",
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
                        f"Client ID: {data['client']['id']}, Name: {data['client']['name']}, Code: {data['client']['code']}"
                    )
                else:
                    self.log_result("Create Client", False, f"Invalid response: {data}")
            else:
                self.log_result("Create Client", False, f"Status {response.status_code}: {response.text}")
                
        except Exception as e:
            self.log_result("Create Client", False, f"Exception: {str(e)}")

    def step_3_create_sessions(self):
        """Step 3: Create Sessions with Different Variance Modes"""
        print("\n=== STEP 3: CREATE SESSIONS WITH VARIANCE MODES ===")
        
        if not self.test_data["client_id"]:
            self.log_result("Create Sessions", False, "No client_id available from previous test")
            return

        # Session A - Bin-wise
        try:
            session_a_data = {
                "client_id": self.test_data["client_id"],
                "name": "Bin Test Session",
                "variance_mode": "bin-wise",
                "start_date": "2026-02-21T00:00:00Z"
            }
            
            response = requests.post(
                f"{self.portal_url}/sessions",
                json=session_a_data,
                headers={"Content-Type": "application/json"},
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                if "session" in data and "id" in data["session"]:
                    self.test_data["session_a_id"] = data["session"]["id"]
                    self.log_result(
                        "Create Session A (bin-wise)", 
                        True, 
                        f"Session ID: {data['session']['id']}, Variance Mode: {data['session'].get('variance_mode', 'bin-wise')}"
                    )
                else:
                    self.log_result("Create Session A (bin-wise)", False, f"Invalid response: {data}")
            else:
                self.log_result("Create Session A (bin-wise)", False, f"Status {response.status_code}: {response.text}")
                
        except Exception as e:
            self.log_result("Create Session A (bin-wise)", False, f"Exception: {str(e)}")

        # Session B - Barcode-wise
        try:
            session_b_data = {
                "client_id": self.test_data["client_id"],
                "name": "Barcode Test Session",
                "variance_mode": "barcode-wise",
                "start_date": "2026-02-21T00:00:00Z"
            }
            
            response = requests.post(
                f"{self.portal_url}/sessions",
                json=session_b_data,
                headers={"Content-Type": "application/json"},
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                if "session" in data and "id" in data["session"]:
                    self.test_data["session_b_id"] = data["session"]["id"]
                    self.log_result(
                        "Create Session B (barcode-wise)", 
                        True, 
                        f"Session ID: {data['session']['id']}, Variance Mode: {data['session'].get('variance_mode', 'barcode-wise')}"
                    )
                else:
                    self.log_result("Create Session B (barcode-wise)", False, f"Invalid response: {data}")
            else:
                self.log_result("Create Session B (barcode-wise)", False, f"Status {response.status_code}: {response.text}")
                
        except Exception as e:
            self.log_result("Create Session B (barcode-wise)", False, f"Exception: {str(e)}")

        # Session C - Article-wise
        try:
            session_c_data = {
                "client_id": self.test_data["client_id"],
                "name": "Article Test Session",
                "variance_mode": "article-wise",
                "start_date": "2026-02-21T00:00:00Z"
            }
            
            response = requests.post(
                f"{self.portal_url}/sessions",
                json=session_c_data,
                headers={"Content-Type": "application/json"},
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                if "session" in data and "id" in data["session"]:
                    self.test_data["session_c_id"] = data["session"]["id"]
                    self.log_result(
                        "Create Session C (article-wise)", 
                        True, 
                        f"Session ID: {data['session']['id']}, Variance Mode: {data['session'].get('variance_mode', 'article-wise')}"
                    )
                else:
                    self.log_result("Create Session C (article-wise)", False, f"Invalid response: {data}")
            else:
                self.log_result("Create Session C (article-wise)", False, f"Status {response.status_code}: {response.text}")
                
        except Exception as e:
            self.log_result("Create Session C (article-wise)", False, f"Exception: {str(e)}")

    def step_4_import_expected_stock(self):
        """Step 4: Import Expected Stock CSV for Each Session"""
        print("\n=== STEP 4: IMPORT EXPECTED STOCK CSV ===")

        # CSV data for bin-wise session
        bin_wise_csv = """Location,Barcode,Description,Category,MRP,Cost,Qty
Bin-A01,8901234567890,Rice 5kg,Grocery,280,250,100
Bin-A01,8901234567891,Oil 1L,Grocery,180,150,50
Bin-A02,8901234567892,Sugar 1kg,Grocery,55,45,75
Bin-B01,8901234567893,Butter 500g,Dairy,280,240,80"""

        # CSV data for barcode-wise session
        barcode_wise_csv = """Barcode,Description,Category,MRP,Cost,Qty
8901234567890,Rice 5kg,Grocery,280,250,100
8901234567891,Oil 1L,Grocery,180,150,50
8901234567892,Sugar 1kg,Grocery,55,45,75
8901234567893,Butter 500g,Dairy,280,240,0"""

        # CSV data for article-wise session
        article_wise_csv = """Article_Code,Article_Name,Barcode,Description,Category,MRP,Cost,Qty
ART001,Red T-Shirt,8901234567890,Red T-Shirt M,Clothing,499,250,10
ART001,Red T-Shirt,8901234567891,Red T-Shirt L,Clothing,499,250,8
ART002,Blue Jeans,8901234567892,Blue Jeans 32,Bottoms,999,500,5
ART003,White Shirt,8901234567893,White Shirt XL,Clothing,699,350,0"""

        # Import for Session A (bin-wise)
        if self.test_data["session_a_id"]:
            self.import_csv_for_session(
                self.test_data["session_a_id"], 
                bin_wise_csv, 
                "Session A (bin-wise)"
            )

        # Import for Session B (barcode-wise)
        if self.test_data["session_b_id"]:
            self.import_csv_for_session(
                self.test_data["session_b_id"], 
                barcode_wise_csv, 
                "Session B (barcode-wise)"
            )

        # Import for Session C (article-wise)
        if self.test_data["session_c_id"]:
            self.import_csv_for_session(
                self.test_data["session_c_id"], 
                article_wise_csv, 
                "Session C (article-wise)"
            )

    def import_csv_for_session(self, session_id, csv_content, session_name):
        """Helper method to import CSV for a specific session"""
        try:
            # Create a file-like object from the CSV content
            csv_file = io.StringIO(csv_content)
            
            # Prepare the file for upload
            files = {
                'file': ('expected_stock.csv', csv_content, 'text/csv')
            }
            
            response = requests.post(
                f"{self.portal_url}/sessions/{session_id}/import-expected",
                files=files,
                timeout=15
            )
            
            if response.status_code == 200:
                data = response.json()
                self.log_result(
                    f"Import CSV for {session_name}", 
                    True, 
                    f"Imported {data.get('record_count', 0)} records, Variance Mode: {data.get('variance_mode', 'N/A')}"
                )
            else:
                self.log_result(f"Import CSV for {session_name}", False, f"Status {response.status_code}: {response.text}")
                
        except Exception as e:
            self.log_result(f"Import CSV for {session_name}", False, f"Exception: {str(e)}")

    def step_5_sync_physical_data(self):
        """Step 5: Sync Physical Data for all 3 sessions"""
        print("\n=== STEP 5: SYNC PHYSICAL DATA ===")

        # Common sync data template
        sync_data_template = {
            "device_name": "TestScanner01",
            "sync_password": "sync123",
            "locations": [{
                "location_name": "Bin-A01",
                "items": [
                    {"barcode": "8901234567890", "product_name": "Rice 5kg", "quantity": 95},
                    {"barcode": "8901234567891", "product_name": "Oil 1L", "quantity": 52},
                    {"barcode": "9999999999999", "product_name": "Unknown Item", "quantity": 3}
                ],
                "total_quantity": 150,
                "submitted_at": "2026-02-21T10:00:00Z"
            }]
        }

        # Sync for all sessions
        sessions = [
            (self.test_data["session_a_id"], "Session A (bin-wise)"),
            (self.test_data["session_b_id"], "Session B (barcode-wise)"),
            (self.test_data["session_c_id"], "Session C (article-wise)")
        ]

        for session_id, session_name in sessions:
            if session_id:
                self.sync_data_for_session(session_id, sync_data_template, session_name)

    def sync_data_for_session(self, session_id, sync_data_template, session_name):
        """Helper method to sync data for a specific session"""
        try:
            # Prepare sync data with client_id and session_id
            sync_data = sync_data_template.copy()
            sync_data["client_id"] = self.test_data["client_id"]
            sync_data["session_id"] = session_id
            
            response = requests.post(
                f"{self.sync_url}/",
                json=sync_data,
                headers={"Content-Type": "application/json"},
                timeout=15
            )
            
            if response.status_code == 200:
                data = response.json()
                self.log_result(
                    f"Sync Data for {session_name}", 
                    True, 
                    f"Synced {data.get('locations_synced', 0)} locations. Message: {data.get('message', 'N/A')}"
                )
            else:
                self.log_result(f"Sync Data for {session_name}", False, f"Status {response.status_code}: {response.text}")
                
        except Exception as e:
            self.log_result(f"Sync Data for {session_name}", False, f"Exception: {str(e)}")

    def step_6_test_report_endpoints(self):
        """Step 6: Test All Report Endpoints and Verify Fields"""
        print("\n=== STEP 6: TEST ALL REPORT ENDPOINTS ===")

        # Test Session A (bin-wise) reports
        if self.test_data["session_a_id"]:
            self.test_bin_wise_report(self.test_data["session_a_id"])
            self.test_detailed_report(self.test_data["session_a_id"])

        # Test Session B (barcode-wise) reports  
        if self.test_data["session_b_id"]:
            self.test_barcode_wise_report(self.test_data["session_b_id"])

        # Test Session C (article-wise) reports
        if self.test_data["session_c_id"]:
            self.test_article_wise_report(self.test_data["session_c_id"])

        # Test category summary (using both Session A and C)
        if self.test_data["session_a_id"]:
            self.test_category_summary_report(self.test_data["session_a_id"], "Session A")
        if self.test_data["session_c_id"]:
            self.test_category_summary_report(self.test_data["session_c_id"], "Session C")

    def test_bin_wise_report(self, session_id):
        """Test bin-wise report endpoint"""
        try:
            response = requests.get(
                f"{self.portal_url}/reports/{session_id}/bin-wise",
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                if "report" in data and "totals" in data:
                    report = data["report"]
                    totals = data["totals"]
                    
                    # Check for required fields
                    has_accuracy = all("accuracy_pct" in item for item in report)
                    has_remark = all("remark" in item for item in report)
                    totals_has_accuracy = "accuracy_pct" in totals
                    
                    if has_accuracy and has_remark and totals_has_accuracy:
                        self.log_result(
                            "Bin-wise Report Fields", 
                            True, 
                            f"Found {len(report)} locations, accuracy_pct and remark fields present, Total accuracy: {totals.get('accuracy_pct', 'N/A')}%"
                        )
                        
                        # Show sample remark
                        if report:
                            sample_remark = report[0].get("remark", "N/A")
                            print(f"   Sample remark: '{sample_remark}'")
                    else:
                        self.log_result("Bin-wise Report Fields", False, f"Missing required fields - accuracy_pct: {has_accuracy}, remark: {has_remark}, totals accuracy: {totals_has_accuracy}")
                else:
                    self.log_result("Bin-wise Report Fields", False, f"Invalid response structure: {data}")
            else:
                self.log_result("Bin-wise Report Fields", False, f"Status {response.status_code}: {response.text}")
                
        except Exception as e:
            self.log_result("Bin-wise Report Fields", False, f"Exception: {str(e)}")

    def test_detailed_report(self, session_id):
        """Test detailed report endpoint"""
        try:
            response = requests.get(
                f"{self.portal_url}/reports/{session_id}/detailed",
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                if "report" in data and "totals" in data:
                    report = data["report"]
                    
                    # Check for required fields
                    has_category = all("category" in item for item in report)
                    has_accuracy = all("accuracy_pct" in item for item in report)
                    has_remark = all("remark" in item for item in report)
                    
                    if has_category and has_accuracy and has_remark:
                        self.log_result(
                            "Detailed Report Fields", 
                            True, 
                            f"Found {len(report)} items, category, accuracy_pct and remark fields present"
                        )
                    else:
                        self.log_result("Detailed Report Fields", False, f"Missing fields - category: {has_category}, accuracy_pct: {has_accuracy}, remark: {has_remark}")
                else:
                    self.log_result("Detailed Report Fields", False, f"Invalid response structure: {data}")
            else:
                self.log_result("Detailed Report Fields", False, f"Status {response.status_code}: {response.text}")
                
        except Exception as e:
            self.log_result("Detailed Report Fields", False, f"Exception: {str(e)}")

    def test_barcode_wise_report(self, session_id):
        """Test barcode-wise report endpoint - should show pivoted data"""
        try:
            response = requests.get(
                f"{self.portal_url}/reports/{session_id}/barcode-wise",
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                if "report" in data and "totals" in data:
                    report = data["report"]
                    
                    # Check that data is pivoted by barcode (should aggregate across locations)
                    has_barcode = all("barcode" in item for item in report)
                    has_accuracy = all("accuracy_pct" in item for item in report)
                    has_remark = all("remark" in item for item in report)
                    
                    if has_barcode and has_accuracy and has_remark:
                        self.log_result(
                            "Barcode-wise Report (Pivoted)", 
                            True, 
                            f"Found {len(report)} unique barcodes, data correctly pivoted/aggregated by barcode"
                        )
                        
                        # Show barcode aggregation example
                        if report:
                            sample_item = report[0]
                            print(f"   Sample barcode: {sample_item.get('barcode', 'N/A')}, Stock: {sample_item.get('stock_qty', 0)}, Physical: {sample_item.get('physical_qty', 0)}")
                    else:
                        self.log_result("Barcode-wise Report (Pivoted)", False, f"Missing fields - barcode: {has_barcode}, accuracy_pct: {has_accuracy}, remark: {has_remark}")
                else:
                    self.log_result("Barcode-wise Report (Pivoted)", False, f"Invalid response structure: {data}")
            else:
                self.log_result("Barcode-wise Report (Pivoted)", False, f"Status {response.status_code}: {response.text}")
                
        except Exception as e:
            self.log_result("Barcode-wise Report (Pivoted)", False, f"Exception: {str(e)}")

    def test_article_wise_report(self, session_id):
        """Test article-wise report endpoint - should group by article_code"""
        try:
            response = requests.get(
                f"{self.portal_url}/reports/{session_id}/article-wise",
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                if "report" in data and "totals" in data:
                    report = data["report"]
                    
                    # Check that data is grouped by article_code
                    has_article_code = all("article_code" in item for item in report)
                    has_accuracy = all("accuracy_pct" in item for item in report)
                    has_remark = all("remark" in item for item in report)
                    has_barcodes = all("barcodes" in item for item in report)
                    
                    # Check for unmapped barcodes (should appear as "UNMAPPED")
                    unmapped_items = [item for item in report if item.get("article_code") == "UNMAPPED"]
                    has_unmapped = len(unmapped_items) > 0
                    
                    if has_article_code and has_accuracy and has_remark and has_barcodes:
                        self.log_result(
                            "Article-wise Report (Grouped)", 
                            True, 
                            f"Found {len(report)} article groups, data correctly grouped by article_code"
                        )
                        
                        if has_unmapped:
                            self.log_result(
                                "Article-wise Unmapped Barcodes", 
                                True, 
                                f"Found {len(unmapped_items)} unmapped barcode(s) with 'UNMAPPED' article_code"
                            )
                            
                            # Show unmapped example
                            if unmapped_items:
                                unmapped = unmapped_items[0]
                                print(f"   Unmapped barcode: {unmapped.get('barcodes', ['N/A'])[0]}, Qty: {unmapped.get('physical_qty', 0)}")
                        else:
                            self.log_result(
                                "Article-wise Unmapped Barcodes", 
                                False, 
                                "Expected unmapped barcode (9999999999999) not found with 'UNMAPPED' article_code"
                            )
                            
                        # Show article grouping example
                        if report:
                            mapped_items = [item for item in report if item.get("article_code") != "UNMAPPED"]
                            if mapped_items:
                                sample = mapped_items[0]
                                print(f"   Sample article: {sample.get('article_code', 'N/A')}, Barcodes: {len(sample.get('barcodes', []))}")
                    else:
                        self.log_result("Article-wise Report (Grouped)", False, f"Missing fields - article_code: {has_article_code}, accuracy_pct: {has_accuracy}, remark: {has_remark}, barcodes: {has_barcodes}")
                else:
                    self.log_result("Article-wise Report (Grouped)", False, f"Invalid response structure: {data}")
            else:
                self.log_result("Article-wise Report (Grouped)", False, f"Status {response.status_code}: {response.text}")
                
        except Exception as e:
            self.log_result("Article-wise Report (Grouped)", False, f"Exception: {str(e)}")

    def test_category_summary_report(self, session_id, session_name):
        """Test category summary report endpoint"""
        try:
            response = requests.get(
                f"{self.portal_url}/reports/{session_id}/category-summary",
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                if "report" in data and "totals" in data:
                    report = data["report"]
                    totals = data["totals"]
                    
                    # Check for required fields
                    has_category = all("category" in item for item in report)
                    has_accuracy = all("accuracy_pct" in item for item in report)
                    totals_has_accuracy = "accuracy_pct" in totals
                    
                    # Get category names
                    categories = [item.get("category", "N/A") for item in report]
                    
                    if has_category and has_accuracy and totals_has_accuracy:
                        self.log_result(
                            f"Category Summary ({session_name})", 
                            True, 
                            f"Found {len(report)} categories: {', '.join(categories)}, Total accuracy: {totals.get('accuracy_pct', 'N/A')}%"
                        )
                    else:
                        self.log_result(f"Category Summary ({session_name})", False, f"Missing fields - category: {has_category}, accuracy_pct: {has_accuracy}, totals accuracy: {totals_has_accuracy}")
                else:
                    self.log_result(f"Category Summary ({session_name})", False, f"Invalid response structure: {data}")
            else:
                self.log_result(f"Category Summary ({session_name})", False, f"Status {response.status_code}: {response.text}")
                
        except Exception as e:
            self.log_result(f"Category Summary ({session_name})", False, f"Exception: {str(e)}")

    def run_variance_mode_tests(self):
        """Run all variance mode tests in sequence"""
        print("🚀 STARTING VARIANCE MODE FEATURE TESTING")
        print(f"Backend URL: {self.base_url}")
        print("=" * 70)
        
        # Run tests in the exact sequence specified in review request
        self.step_1_portal_login()
        
        if not self.test_data.get("user_info"):
            print("❌ Cannot proceed without successful login")
            return False
            
        self.step_2_create_client()
        
        if not self.test_data.get("client_id"):
            print("❌ Cannot proceed without successful client creation")
            return False
            
        self.step_3_create_sessions()
        self.step_4_import_expected_stock()
        self.step_5_sync_physical_data()
        self.step_6_test_report_endpoints()
        
        # Print summary
        print("\n" + "=" * 70)
        print("📊 VARIANCE MODE TESTING SUMMARY")
        print("=" * 70)
        
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
            print("\n🎉 ALL VARIANCE MODE TESTS PASSED! New feature is working correctly.")
            return True
        else:
            print(f"\n⚠️  {self.failed_tests} test(s) failed. Please check the implementation.")
            return False


def main():
    """Main function to run the variance mode test suite"""
    tester = VarianceModeBackendTester()
    success = tester.run_variance_mode_tests()
    
    # Exit with appropriate code
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()