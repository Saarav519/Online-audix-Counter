#!/usr/bin/env python3
"""
Priority Test: Stock > Master > Physical scan data

Tests the CORRECTED report priority logic as specified in the review request.
This is the exact test scenario described in the review request.
"""

import requests
import json
import io
import time
import sys

# Backend URL from the review request
BASE_URL = "https://data-sync-tester.preview.emergentagent.com"
API_BASE = f"{BASE_URL}/api"

class PriorityTest:
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
    
    def test_1_register_login(self):
        """Test 1: Register/Login"""
        try:
            response = self.session.post(f"{API_BASE}/portal/login", json={
                "username": "admin",
                "password": "admin123"
            })
            
            if response.status_code == 200:
                data = response.json()
                user_info = data.get("user", {})
                self.log_test("1. Register/Login", True, f"User ID: {user_info.get('id')}")
                return True
            else:
                self.log_test("1. Register/Login", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
        except Exception as e:
            self.log_test("1. Register/Login", False, f"Exception: {str(e)}")
            return False
    
    def test_2_create_client(self):
        """Test 2: Create Client"""
        try:
            response = self.session.post(f"{API_BASE}/portal/clients", json={
                "name": "Priority Test Client",
                "code": "PRI01"
            })
            
            if response.status_code == 200:
                data = response.json()
                client_info = data.get("client", {})
                self.client_id = client_info.get("id")
                self.log_test("2. Create Client", True, f"Client ID: {self.client_id}")
                return True
            else:
                self.log_test("2. Create Client", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
        except Exception as e:
            self.log_test("2. Create Client", False, f"Exception: {str(e)}")
            return False
    
    def test_3_upload_master_products(self):
        """Test 3: Upload Master Products"""
        if not self.client_id:
            self.log_test("3. Upload Master Products", False, "No client_id available")
            return False
        
        try:
            # CSV content exactly as specified in review request
            csv_content = """Barcode,Description,Category,MRP,Cost,Article_Code,Article_Name
1111111111111,Master Rice 5kg,Master Grocery,280,250,ART001,Rice Products
2222222222222,Master Oil 1L,Master Cooking,180,150,ART002,Oil Products
3333333333333,Master Sugar 1kg,Master Sweets,55,45,ART003,Sugar Products
4444444444444,Master Butter 500g,Master Dairy,280,240,ART004,Dairy Items
5555555555555,Master Cheese 200g,Master Dairy,120,100,ART005,Cheese Items"""
            
            files = {"file": ("master_products.csv", io.StringIO(csv_content), "text/csv")}
            
            response = self.session.post(f"{API_BASE}/portal/clients/{self.client_id}/import-master", files=files)
            
            if response.status_code == 200:
                data = response.json()
                product_count = data.get("product_count", 0)
                self.log_test("3. Upload Master Products", True, f"Imported {product_count} products")
                return True
            else:
                self.log_test("3. Upload Master Products", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
        except Exception as e:
            self.log_test("3. Upload Master Products", False, f"Exception: {str(e)}")
            return False
    
    def test_4_create_session(self):
        """Test 4: Create Session"""
        if not self.client_id:
            self.log_test("4. Create Session", False, "No client_id available")
            return False
        
        try:
            from datetime import datetime, timezone
            
            response = self.session.post(f"{API_BASE}/portal/sessions", json={
                "client_id": self.client_id,
                "name": "Priority Test Session",
                "variance_mode": "bin-wise",
                "start_date": datetime.now(timezone.utc).isoformat()
            })
            
            if response.status_code == 200:
                data = response.json()
                session_info = data.get("session", {})
                self.session_id = session_info.get("id")
                self.log_test("4. Create Session", True, f"Session ID: {self.session_id}")
                return True
            else:
                self.log_test("4. Create Session", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
        except Exception as e:
            self.log_test("4. Create Session", False, f"Exception: {str(e)}")
            return False
    
    def test_5_import_expected_stock(self):
        """Test 5: Import Expected Stock WITH product details"""
        if not self.session_id:
            self.log_test("5. Import Expected Stock", False, "No session_id available")
            return False
        
        try:
            # CSV content exactly as specified in review request
            # NOTE: This tests the key scenarios:
            # - 1111111111111: Stock has FULL details → should use STOCK details
            # - 2222222222222: Stock has NO details → should FALLBACK to master
            # - 3333333333333: Stock has FULL details → should use STOCK details
            csv_content = """Location,Barcode,Description,Category,MRP,Cost,Qty
Bin-A,1111111111111,Stock Rice 10kg,Stock Grocery,350,300,100
Bin-A,2222222222222,,,,,50
Bin-B,3333333333333,Stock Sugar Premium,Stock Premium,75,60,30"""
            
            files = {"file": ("expected_stock.csv", io.StringIO(csv_content), "text/csv")}
            
            response = self.session.post(f"{API_BASE}/portal/sessions/{self.session_id}/import-expected", files=files)
            
            if response.status_code == 200:
                data = response.json()
                record_count = data.get("record_count", 0)
                self.log_test("5. Import Expected Stock", True, f"Imported {record_count} records")
                return True
            else:
                self.log_test("5. Import Expected Stock", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
        except Exception as e:
            self.log_test("5. Import Expected Stock", False, f"Exception: {str(e)}")
            return False
    
    def test_6_sync_physical_data(self):
        """Test 6: Sync Physical Data"""
        if not self.session_id or not self.client_id:
            self.log_test("6. Sync Physical Data", False, "Missing session_id or client_id")
            return False
        
        try:
            # Sync data exactly as specified in review request
            sync_data = {
                "device_name": "test-device",
                "sync_password": "audix2024",
                "client_id": self.client_id,
                "session_id": self.session_id,
                "locations": [
                    {
                        "location_name": "Bin-A",
                        "items": [
                            {"barcode": "1111111111111", "product_name": "Scan Rice", "quantity": 95},
                            {"barcode": "2222222222222", "product_name": "Scan Oil", "quantity": 48}
                        ]
                    },
                    {
                        "location_name": "Bin-B",
                        "items": [
                            {"barcode": "4444444444444", "product_name": "Scan Butter", "quantity": 10},
                            {"barcode": "9999999999999", "product_name": "Scan Unknown", "quantity": 5}
                        ]
                    }
                ]
            }
            
            response = self.session.post(f"{API_BASE}/sync/", json=sync_data)
            
            if response.status_code == 200:
                data = response.json()
                locations_synced = data.get("locations_synced", 0)
                self.log_test("6. Sync Physical Data", True, f"Synced {locations_synced} locations")
                return True
            else:
                self.log_test("6. Sync Physical Data", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
        except Exception as e:
            self.log_test("6. Sync Physical Data", False, f"Exception: {str(e)}")
            return False
    
    def test_7_detailed_report_priority_verification(self):
        """Test 7: CRITICAL TEST - Detailed Report Priority Verification"""
        if not self.session_id:
            self.log_test("7. Detailed Report Priority", False, "No session_id available")
            return False
        
        try:
            response = self.session.get(f"{API_BASE}/portal/reports/{self.session_id}/detailed")
            
            if response.status_code == 200:
                data = response.json()
                report = data.get("report", [])
                
                # Create lookup dict by barcode for easy testing
                report_by_barcode = {}
                for item in report:
                    barcode = item.get("barcode")
                    report_by_barcode[barcode] = item
                
                print(f"\n🔍 PRIORITY VERIFICATION - Testing {len(report)} items")
                
                # Test a. Barcode 1111111111111 (In stock WITH details + in master + scanned)
                item_a = report_by_barcode.get("1111111111111")
                if item_a:
                    expected_desc = "Stock Rice 10kg"
                    expected_cat = "Stock Grocery"
                    expected_mrp = 350
                    expected_cost = 300
                    
                    actual_desc = item_a.get("description")
                    actual_cat = item_a.get("category")
                    actual_mrp = item_a.get("mrp")
                    actual_cost = item_a.get("cost")
                    
                    if actual_desc == expected_desc and actual_cat == expected_cat and actual_mrp == expected_mrp and actual_cost == expected_cost:
                        self.log_test("7a. Scenario A Priority", True, 
                            f"✅ Stock details used: {actual_desc}, {actual_cat}, MRP:{actual_mrp}, Cost:{actual_cost}")
                    else:
                        self.log_test("7a. Scenario A Priority", False, 
                            f"Expected Stock details ('{expected_desc}', '{expected_cat}', {expected_mrp}, {expected_cost}) but got ('{actual_desc}', '{actual_cat}', {actual_mrp}, {actual_cost})")
                        return False
                else:
                    self.log_test("7a. Scenario A Priority", False, "Barcode 1111111111111 not found in report")
                    return False
                
                # Test b. Barcode 2222222222222 (In stock WITHOUT details + in master + scanned)
                item_b = report_by_barcode.get("2222222222222")
                if item_b:
                    expected_desc = "Master Oil 1L"  # FALLBACK to master
                    expected_cat = "Master Cooking"
                    
                    actual_desc = item_b.get("description")
                    actual_cat = item_b.get("category")
                    
                    if actual_desc == expected_desc and actual_cat == expected_cat:
                        self.log_test("7b. Scenario B Priority", True, 
                            f"✅ Master fallback used: {actual_desc}, {actual_cat}")
                    else:
                        self.log_test("7b. Scenario B Priority", False, 
                            f"Expected Master fallback ('{expected_desc}', '{expected_cat}') but got ('{actual_desc}', '{actual_cat}')")
                        return False
                else:
                    self.log_test("7b. Scenario B Priority", False, "Barcode 2222222222222 not found in report")
                    return False
                
                # Test c. Barcode 3333333333333 (In stock WITH details + in master + NOT scanned)
                item_c = report_by_barcode.get("3333333333333")
                if item_c:
                    expected_desc = "Stock Sugar Premium"  # Stock details should be used
                    actual_desc = item_c.get("description")
                    remark = item_c.get("remark", "")
                    
                    if actual_desc == expected_desc and "Not Scanned" in remark:
                        self.log_test("7c. Scenario C Priority", True, 
                            f"✅ Stock details + Not Scanned remark: {actual_desc}")
                    else:
                        self.log_test("7c. Scenario C Priority", False, 
                            f"Expected Stock details '{expected_desc}' with 'Not Scanned' remark, got '{actual_desc}', remark: '{remark}'")
                        return False
                else:
                    self.log_test("7c. Scenario C Priority", False, "Barcode 3333333333333 not found in report")
                    return False
                
                # Test d. Barcode 4444444444444 (NOT in stock + in master + scanned)
                item_d = report_by_barcode.get("4444444444444")
                if item_d:
                    expected_desc = "Master Butter 500g"  # Master details should be used
                    actual_desc = item_d.get("description")
                    remark = item_d.get("remark", "")
                    
                    if actual_desc == expected_desc and "In Master, Not in Stock" in remark:
                        self.log_test("7d. Scenario D Priority", True, 
                            f"✅ Master details + correct remark: {actual_desc}")
                    else:
                        self.log_test("7d. Scenario D Priority", False, 
                            f"Expected Master details '{expected_desc}' with 'In Master, Not in Stock' remark, got '{actual_desc}', remark: '{remark}'")
                        return False
                else:
                    self.log_test("7d. Scenario D Priority", False, "Barcode 4444444444444 not found in report")
                    return False
                
                # Test e. Barcode 9999999999999 (NOT in stock + NOT in master + scanned)
                item_e = report_by_barcode.get("9999999999999")
                if item_e:
                    expected_desc = "Scan Unknown"  # Physical scan (last resort)
                    actual_desc = item_e.get("description")
                    remark = item_e.get("remark", "")
                    
                    if actual_desc == expected_desc and "Not in Master" in remark:
                        self.log_test("7e. Scenario E Priority", True, 
                            f"✅ Physical scan details + correct remark: {actual_desc}")
                    else:
                        self.log_test("7e. Scenario E Priority", False, 
                            f"Expected Physical scan details '{expected_desc}' with 'Not in Master' remark, got '{actual_desc}', remark: '{remark}'")
                        return False
                else:
                    self.log_test("7e. Scenario E Priority", False, "Barcode 9999999999999 not found in report")
                    return False
                
                self.log_test("7. Detailed Report Priority", True, "All 5 priority scenarios verified correctly")
                return True
            else:
                self.log_test("7. Detailed Report Priority", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
        except Exception as e:
            self.log_test("7. Detailed Report Priority", False, f"Exception: {str(e)}")
            return False
    
    def test_8_barcode_wise_report_priority(self):
        """Test 8: Barcode-wise Report Priority"""
        if not self.session_id:
            self.log_test("8. Barcode-wise Report Priority", False, "No session_id available")
            return False
        
        try:
            response = self.session.get(f"{API_BASE}/portal/reports/{self.session_id}/barcode-wise")
            
            if response.status_code == 200:
                data = response.json()
                report = data.get("report", [])
                
                # Check that same priority applies
                report_by_barcode = {}
                for item in report:
                    barcode = item.get("barcode")
                    report_by_barcode[barcode] = item
                
                # Spot check a few items
                item_a = report_by_barcode.get("1111111111111")
                if item_a and item_a.get("description") == "Stock Rice 10kg":
                    self.log_test("8a. Barcode-wise Stock Priority", True, "Stock details used correctly")
                else:
                    self.log_test("8a. Barcode-wise Stock Priority", False, f"Expected Stock details, got {item_a.get('description') if item_a else 'None'}")
                    return False
                
                item_b = report_by_barcode.get("2222222222222")
                if item_b and item_b.get("description") == "Master Oil 1L":
                    self.log_test("8b. Barcode-wise Master Fallback", True, "Master fallback used correctly")
                else:
                    self.log_test("8b. Barcode-wise Master Fallback", False, f"Expected Master fallback, got {item_b.get('description') if item_b else 'None'}")
                    return False
                
                self.log_test("8. Barcode-wise Report Priority", True, "Priority working correctly")
                return True
            else:
                self.log_test("8. Barcode-wise Report Priority", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
        except Exception as e:
            self.log_test("8. Barcode-wise Report Priority", False, f"Exception: {str(e)}")
            return False
    
    def test_9_category_summary_priority(self):
        """Test 9: Category Summary Priority"""
        if not self.session_id:
            self.log_test("9. Category Summary Priority", False, "No session_id available")
            return False
        
        try:
            response = self.session.get(f"{API_BASE}/portal/reports/{self.session_id}/category-summary")
            
            if response.status_code == 200:
                data = response.json()
                report = data.get("report", [])
                
                # Verify categories use stock first, master fallback
                categories_found = [item.get("category") for item in report]
                expected_categories = ["Stock Grocery", "Stock Premium", "Master Cooking", "Master Dairy"]
                
                stock_categories = [cat for cat in categories_found if cat.startswith("Stock")]
                master_categories = [cat for cat in categories_found if cat.startswith("Master")]
                
                if "Stock Grocery" in categories_found and "Master Cooking" in categories_found:
                    self.log_test("9. Category Summary Priority", True, 
                        f"Categories using priority: {categories_found}")
                    return True
                else:
                    self.log_test("9. Category Summary Priority", False, 
                        f"Expected Stock/Master category mix, got {categories_found}")
                    return False
            else:
                self.log_test("9. Category Summary Priority", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
        except Exception as e:
            self.log_test("9. Category Summary Priority", False, f"Exception: {str(e)}")
            return False

    def run_all_tests(self):
        """Run all tests in the specified order"""
        print(f"🎯 PRIORITY TESTING: Stock > Master > Physical scan data")
        print(f"Backend URL: {BASE_URL}")
        print("=" * 80)
        
        # Run tests in order from the review request
        test_methods = [
            self.test_1_register_login,
            self.test_2_create_client,
            self.test_3_upload_master_products,
            self.test_4_create_session,
            self.test_5_import_expected_stock,
            self.test_6_sync_physical_data,
            self.test_7_detailed_report_priority_verification,
            self.test_8_barcode_wise_report_priority,
            self.test_9_category_summary_priority
        ]
        
        # Execute tests
        for test_method in test_methods:
            try:
                success = test_method()
                if not success:
                    print(f"⚠️ Test failed: {test_method.__name__}")
                    # Don't continue if critical priority test fails
                    if "priority" in test_method.__name__.lower():
                        print(f"🛑 Critical priority test failed, stopping execution")
                        break
            except Exception as e:
                print(f"❌ Test error in {test_method.__name__}: {str(e)}")
                self.failed_tests.append({"test": test_method.__name__, "details": f"Exception: {str(e)}"})
                break
        
        # Summary
        total_tests = len(self.test_results)
        passed_tests = len([t for t in self.test_results if t["success"]])
        failed_tests = len(self.failed_tests)
        
        print("\n" + "=" * 80)
        print(f"🎯 PRIORITY TEST SUMMARY")
        print(f"Total Tests: {total_tests}")
        print(f"Passed: {passed_tests}")
        print(f"Failed: {failed_tests}")
        if total_tests > 0:
            print(f"Success Rate: {(passed_tests/total_tests)*100:.1f}%")
        
        if self.failed_tests:
            print(f"\n❌ FAILED TESTS:")
            for failed in self.failed_tests:
                print(f"  - {failed['test']}: {failed['details']}")
        else:
            print(f"\n🎉 ALL PRIORITY TESTS PASSED!")
            print(f"✅ PRIORITY VERIFIED: Stock > Master > Physical scan data working correctly")
            
        return len(self.failed_tests) == 0

if __name__ == "__main__":
    tester = PriorityTest()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)