#!/usr/bin/env python3
"""
Comprehensive test script for Master Products (Client-Level) feature and updated report endpoints.
Tests the exact flow specified in the review request.
"""

import requests
import json
import io
import time
import sys

# Backend URL from the review request
BASE_URL = "https://data-sync-preview-5.preview.emergentagent.com"
API_BASE = f"{BASE_URL}/api"

class MasterProductsTest:
    def __init__(self):
        self.session = requests.Session()
        self.client_id = None
        self.session_id = None
        self.test_results = []
        self.failed_tests = []
        
    def log_test(self, test_name, success, details=""):
        """Log test result"""
        status = "✅ PASS" if success else "❌ FAIL"
        message = f"{status}: {test_name}"
        if details:
            message += f" - {details}"
        print(message)
        self.test_results.append({"test": test_name, "success": success, "details": details})
        if not success:
            self.failed_tests.append({"test": test_name, "details": details})
    
    def test_portal_login(self):
        """Test 1: Portal Login"""
        try:
            response = self.session.post(f"{API_BASE}/portal/login", json={
                "username": "admin",
                "password": "admin123"
            })
            
            if response.status_code == 200:
                data = response.json()
                user_info = data.get("user", {})
                self.log_test("Portal Login", True, f"User ID: {user_info.get('id')}, Role: {user_info.get('role')}")
                return True
            else:
                self.log_test("Portal Login", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
        except Exception as e:
            self.log_test("Portal Login", False, f"Exception: {str(e)}")
            return False
    
    def test_create_client(self):
        """Test 2: Create Client"""
        try:
            import random
            client_code = f"MTCX{random.randint(1000, 9999)}"
            
            response = self.session.post(f"{API_BASE}/portal/clients", json={
                "name": "Master Test Client",
                "code": client_code,
                "address": "Test Address"
            })
            
            if response.status_code == 200:
                data = response.json()
                client_info = data.get("client", {})
                self.client_id = client_info.get("id")
                self.log_test("Create Client", True, f"Client ID: {self.client_id}, Code: {client_code}")
                return True
            else:
                self.log_test("Create Client", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
        except Exception as e:
            self.log_test("Create Client", False, f"Exception: {str(e)}")
            return False
    
    def test_import_master_products(self):
        """Test 3: Import Master Products CSV"""
        if not self.client_id:
            self.log_test("Import Master Products", False, "No client_id available")
            return False
        
        try:
            # Create CSV content as specified in the review request
            csv_content = """Barcode,Description,Category,MRP,Cost,Article_Code,Article_Name
8901234567890,Rice 5kg,Grocery,280,250,ART001,Rice Products
8901234567891,Oil 1L,Grocery,180,150,ART002,Cooking Oil
8901234567892,Sugar 1kg,Grocery,55,45,ART003,Sugar
8901234567893,Flour 10kg,Grocery,520,480,ART004,Flour Products
8901234567895,Butter 500g,Dairy,280,240,ART005,Dairy Items
9999999999999,Extra Item,Misc,100,80,ART006,Misc Items"""
            
            files = {"file": ("master_products.csv", io.StringIO(csv_content), "text/csv")}
            
            response = self.session.post(f"{API_BASE}/portal/clients/{self.client_id}/import-master", files=files)
            
            if response.status_code == 200:
                data = response.json()
                product_count = data.get("product_count", 0)
                self.log_test("Import Master Products", True, f"Imported {product_count} products")
                return True
            else:
                self.log_test("Import Master Products", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
        except Exception as e:
            self.log_test("Import Master Products", False, f"Exception: {str(e)}")
            return False
    
    def test_get_master_stats(self):
        """Test 4: Get Master Products Stats"""
        if not self.client_id:
            self.log_test("Get Master Stats", False, "No client_id available")
            return False
        
        try:
            response = self.session.get(f"{API_BASE}/portal/clients/{self.client_id}/master-products/stats")
            
            if response.status_code == 200:
                data = response.json()
                total_products = data.get("total_products", 0)
                categories = data.get("categories", [])
                unique_articles = data.get("unique_articles", 0)
                
                expected_categories = ["Grocery", "Dairy", "Misc"]
                categories_match = all(cat in categories for cat in expected_categories)
                
                self.log_test("Get Master Stats", True, 
                    f"Products: {total_products}, Categories: {len(categories)} {categories}, Articles: {unique_articles}")
                
                # Verify expected values
                if total_products != 6:
                    self.log_test("Master Stats Validation", False, f"Expected 6 products, got {total_products}")
                    return False
                if not categories_match:
                    self.log_test("Master Stats Validation", False, f"Expected categories {expected_categories}, got {categories}")
                    return False
                    
                return True
            else:
                self.log_test("Get Master Stats", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
        except Exception as e:
            self.log_test("Get Master Stats", False, f"Exception: {str(e)}")
            return False
    
    def test_get_master_products(self):
        """Test 5: Get Master Products List"""
        if not self.client_id:
            self.log_test("Get Master Products", False, "No client_id available")
            return False
        
        try:
            response = self.session.get(f"{API_BASE}/portal/clients/{self.client_id}/master-products")
            
            if response.status_code == 200:
                data = response.json()
                products = data.get("products", [])
                total = data.get("total", 0)
                
                self.log_test("Get Master Products", True, f"Retrieved {len(products)} products (Total: {total})")
                
                # Verify some key products
                barcodes_found = [p.get("barcode") for p in products]
                expected_barcodes = ["8901234567890", "8901234567891", "8901234567892"]
                
                for bc in expected_barcodes:
                    if bc not in barcodes_found:
                        self.log_test("Master Products Validation", False, f"Expected barcode {bc} not found")
                        return False
                
                return True
            else:
                self.log_test("Get Master Products", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
        except Exception as e:
            self.log_test("Get Master Products", False, f"Exception: {str(e)}")
            return False
    
    def test_create_session(self):
        """Test 6: Create Session with variance mode"""
        if not self.client_id:
            self.log_test("Create Session", False, "No client_id available")
            return False
        
        try:
            from datetime import datetime, timezone
            
            response = self.session.post(f"{API_BASE}/portal/sessions", json={
                "client_id": self.client_id,
                "name": "Master Products Test Session",
                "variance_mode": "bin-wise",
                "start_date": datetime.now(timezone.utc).isoformat()
            })
            
            if response.status_code == 200:
                data = response.json()
                session_info = data.get("session", {})
                self.session_id = session_info.get("id")
                variance_mode = session_info.get("variance_mode")
                self.log_test("Create Session", True, f"Session ID: {self.session_id}, Mode: {variance_mode}")
                return True
            else:
                self.log_test("Create Session", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
        except Exception as e:
            self.log_test("Create Session", False, f"Exception: {str(e)}")
            return False
    
    def test_import_expected_stock(self):
        """Test 7: Import Expected Stock (quantities only, as requested)"""
        if not self.session_id:
            self.log_test("Import Expected Stock", False, "No session_id available")
            return False
        
        try:
            # CSV with quantities only - description/category/mrp should come from master
            csv_content = """Location,Barcode,Qty
Bin-A01,8901234567890,100
Bin-A01,8901234567891,50
Bin-A02,8901234567892,75"""
            
            files = {"file": ("expected_stock.csv", io.StringIO(csv_content), "text/csv")}
            
            response = self.session.post(f"{API_BASE}/portal/sessions/{self.session_id}/import-expected", files=files)
            
            if response.status_code == 200:
                data = response.json()
                record_count = data.get("record_count", 0)
                variance_mode = data.get("variance_mode", "")
                self.log_test("Import Expected Stock", True, f"Imported {record_count} records, Mode: {variance_mode}")
                return True
            else:
                self.log_test("Import Expected Stock", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
        except Exception as e:
            self.log_test("Import Expected Stock", False, f"Exception: {str(e)}")
            return False
    
    def test_sync_physical_data(self):
        """Test 8: Sync Physical Data with various scenarios"""
        if not self.session_id or not self.client_id:
            self.log_test("Sync Physical Data", False, "Missing session_id or client_id")
            return False
        
        try:
            # Sync data with the 4 scenarios from the review request
            sync_data = {
                "device_name": "test_device_master",
                "sync_password": "test123",
                "client_id": self.client_id,
                "session_id": self.session_id,
                "locations": [
                    {
                        "id": "loc_test_1",
                        "name": "Bin-A01",
                        "items": [
                            {
                                "barcode": "8901234567890",
                                "quantity": 95,
                                "productName": "Rice 5kg",
                                "scannedAt": "2026-02-21T14:00:00Z"
                            },
                            {
                                "barcode": "8901234567895",  # In master + NOT in stock
                                "quantity": 10,
                                "productName": "Butter 500g",
                                "scannedAt": "2026-02-21T14:01:00Z"
                            },
                            {
                                "barcode": "1111111111111",  # NOT in master
                                "quantity": 5,
                                "productName": "Unknown Item",
                                "scannedAt": "2026-02-21T14:02:00Z"
                            }
                        ]
                    }
                ]
            }
            
            response = self.session.post(f"{API_BASE}/sync/", json=sync_data)
            
            if response.status_code == 200:
                data = response.json()
                locations_synced = data.get("locations_synced", 0)
                self.log_test("Sync Physical Data", True, f"Synced {locations_synced} locations")
                return True
            else:
                self.log_test("Sync Physical Data", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
        except Exception as e:
            self.log_test("Sync Physical Data", False, f"Exception: {str(e)}")
            return False
    
    def test_detailed_report_with_master_enrichment(self):
        """Test 9a: Detailed Report with Master Enrichment"""
        if not self.session_id:
            self.log_test("Detailed Report with Master", False, "No session_id available")
            return False
        
        try:
            response = self.session.get(f"{API_BASE}/portal/reports/{self.session_id}/detailed")
            
            if response.status_code == 200:
                data = response.json()
                report = data.get("report", [])
                totals = data.get("totals", {})
                
                self.log_test("Detailed Report with Master", True, f"Found {len(report)} items")
                
                # Verify master enrichment for specific barcodes
                rice_item = None
                oil_item = None
                butter_item = None
                unknown_item = None
                
                for item in report:
                    barcode = item.get("barcode")
                    if barcode == "8901234567890":
                        rice_item = item
                    elif barcode == "8901234567891":
                        oil_item = item
                    elif barcode == "8901234567895":
                        butter_item = item
                    elif barcode == "1111111111111":
                        unknown_item = item
                
                # Verify Rice (in master + in stock → normal variance)
                if rice_item:
                    if rice_item.get("description") != "Rice 5kg" or rice_item.get("category") != "Grocery":
                        self.log_test("Rice Item Master Enrichment", False, 
                            f"Expected description='Rice 5kg', category='Grocery', got description='{rice_item.get('description')}', category='{rice_item.get('category')}'")
                        return False
                    else:
                        self.log_test("Rice Item Master Enrichment", True, "Description and category from master")
                
                # Verify Oil (expected stock had no description, should come from master)
                if oil_item:
                    if oil_item.get("description") != "Oil 1L":
                        self.log_test("Oil Item Master Enrichment", False, 
                            f"Expected description='Oil 1L' from master, got '{oil_item.get('description')}'")
                        return False
                    else:
                        self.log_test("Oil Item Master Enrichment", True, "Description from master (expected had no description)")
                
                # Verify Butter (in master + NOT in stock)
                if butter_item:
                    remark = butter_item.get("remark", "")
                    if "In Master, Not in Stock" not in remark:
                        self.log_test("Butter Item Remark", False, 
                            f"Expected remark containing 'In Master, Not in Stock', got '{remark}'")
                        return False
                    else:
                        self.log_test("Butter Item Remark", True, "Correct 'In Master, Not in Stock' remark")
                
                # Verify Unknown item (NOT in master)
                if unknown_item:
                    remark = unknown_item.get("remark", "")
                    if "Not in Master" not in remark:
                        self.log_test("Unknown Item Remark", False, 
                            f"Expected remark containing 'Not in Master', got '{remark}'")
                        return False
                    else:
                        self.log_test("Unknown Item Remark", True, "Correct 'Not in Master' remark")
                
                return True
            else:
                self.log_test("Detailed Report with Master", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
        except Exception as e:
            self.log_test("Detailed Report with Master", False, f"Exception: {str(e)}")
            return False
    
    def test_barcode_wise_report(self):
        """Test 9b: Barcode-wise Report with Master Enrichment"""
        if not self.session_id:
            self.log_test("Barcode-wise Report", False, "No session_id available")
            return False
        
        try:
            response = self.session.get(f"{API_BASE}/portal/reports/{self.session_id}/barcode-wise")
            
            if response.status_code == 200:
                data = response.json()
                report = data.get("report", [])
                totals = data.get("totals", {})
                
                self.log_test("Barcode-wise Report", True, f"Found {len(report)} barcodes")
                
                # Verify product info enriched from master and in_master/in_expected_stock flags
                for item in report:
                    barcode = item.get("barcode")
                    description = item.get("description", "")
                    in_master = item.get("in_master", False)
                    in_expected_stock = item.get("in_expected_stock", False)
                    
                    if barcode == "8901234567890":
                        if description != "Rice 5kg":
                            self.log_test("Barcode-wise Rice Enrichment", False, f"Expected 'Rice 5kg', got '{description}'")
                            return False
                        if not in_master or not in_expected_stock:
                            self.log_test("Barcode-wise Rice Flags", False, f"Expected in_master=True, in_expected=True, got in_master={in_master}, in_expected={in_expected_stock}")
                            return False
                    elif barcode == "8901234567895":
                        if description != "Butter 500g":
                            self.log_test("Barcode-wise Butter Enrichment", False, f"Expected 'Butter 500g', got '{description}'")
                            return False
                        if not in_master or in_expected_stock:
                            self.log_test("Barcode-wise Butter Flags", False, f"Expected in_master=True, in_expected=False, got in_master={in_master}, in_expected={in_expected_stock}")
                            return False
                    elif barcode == "1111111111111":
                        if in_master:
                            self.log_test("Barcode-wise Unknown Flags", False, f"Expected in_master=False, got {in_master}")
                            return False
                
                self.log_test("Barcode-wise Enrichment Validation", True, "All flags and enrichment correct")
                return True
            else:
                self.log_test("Barcode-wise Report", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
        except Exception as e:
            self.log_test("Barcode-wise Report", False, f"Exception: {str(e)}")
            return False
    
    def test_category_summary_report(self):
        """Test 9c: Category Summary Report"""
        if not self.session_id:
            self.log_test("Category Summary Report", False, "No session_id available")
            return False
        
        try:
            response = self.session.get(f"{API_BASE}/portal/reports/{self.session_id}/category-summary")
            
            if response.status_code == 200:
                data = response.json()
                report = data.get("report", [])
                totals = data.get("totals", {})
                
                self.log_test("Category Summary Report", True, f"Found {len(report)} categories")
                
                # Verify categories come from master (Grocery, Dairy, etc.)
                categories_found = [item.get("category") for item in report]
                expected_categories = ["Grocery", "Dairy"]  # From our test data
                
                for cat in expected_categories:
                    if cat not in categories_found:
                        self.log_test("Category Summary Validation", False, f"Expected category '{cat}' not found. Found: {categories_found}")
                        return False
                
                self.log_test("Category Summary Validation", True, "Categories from master correct")
                return True
            else:
                self.log_test("Category Summary Report", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
        except Exception as e:
            self.log_test("Category Summary Report", False, f"Exception: {str(e)}")
            return False
    
    def test_bin_wise_report(self):
        """Test 9d: Bin-wise Report (should still work correctly)"""
        if not self.session_id:
            self.log_test("Bin-wise Report", False, "No session_id available")
            return False
        
        try:
            response = self.session.get(f"{API_BASE}/portal/reports/{self.session_id}/bin-wise")
            
            if response.status_code == 200:
                data = response.json()
                report = data.get("report", [])
                totals = data.get("totals", {})
                
                self.log_test("Bin-wise Report", True, f"Found {len(report)} locations, Total accuracy: {totals.get('accuracy_pct', 0)}%")
                return True
            else:
                self.log_test("Bin-wise Report", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
        except Exception as e:
            self.log_test("Bin-wise Report", False, f"Exception: {str(e)}")
            return False
    
    def test_clear_master(self):
        """Test 10: Clear Master Products"""
        if not self.client_id:
            self.log_test("Clear Master Products", False, "No client_id available")
            return False
        
        try:
            response = self.session.delete(f"{API_BASE}/portal/clients/{self.client_id}/master-products")
            
            if response.status_code == 200:
                data = response.json()
                deleted_count = data.get("deleted_count", 0)
                self.log_test("Clear Master Products", True, f"Deleted {deleted_count} products")
                return True
            else:
                self.log_test("Clear Master Products", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
        except Exception as e:
            self.log_test("Clear Master Products", False, f"Exception: {str(e)}")
            return False

    def run_all_tests(self):
        """Run all tests in the specified order"""
        print(f"🔍 Starting Master Products Feature Testing")
        print(f"Backend URL: {BASE_URL}")
        print("=" * 80)
        
        # Run tests in order from the review request
        test_methods = [
            self.test_portal_login,
            self.test_create_client,
            self.test_import_master_products,
            self.test_get_master_stats,
            self.test_get_master_products,
            self.test_create_session,
            self.test_import_expected_stock,
            self.test_sync_physical_data,
            self.test_detailed_report_with_master_enrichment,
            self.test_barcode_wise_report,
            self.test_category_summary_report,
            self.test_bin_wise_report,
            self.test_clear_master
        ]
        
        # Execute tests
        for test_method in test_methods:
            try:
                success = test_method()
                if not success:
                    print(f"⚠️ Test failed: {test_method.__name__}")
            except Exception as e:
                print(f"❌ Test error in {test_method.__name__}: {str(e)}")
                self.failed_tests.append({"test": test_method.__name__, "details": f"Exception: {str(e)}"})
        
        # Summary
        total_tests = len(self.test_results)
        passed_tests = len([t for t in self.test_results if t["success"]])
        failed_tests = len(self.failed_tests)
        
        print("\n" + "=" * 80)
        print(f"📊 TEST SUMMARY")
        print(f"Total Tests: {total_tests}")
        print(f"Passed: {passed_tests}")
        print(f"Failed: {failed_tests}")
        print(f"Success Rate: {(passed_tests/total_tests)*100:.1f}%")
        
        if self.failed_tests:
            print(f"\n❌ FAILED TESTS:")
            for failed in self.failed_tests:
                print(f"  - {failed['test']}: {failed['details']}")
        else:
            print(f"\n🎉 ALL TESTS PASSED!")
            
        return len(self.failed_tests) == 0

if __name__ == "__main__":
    tester = MasterProductsTest()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)