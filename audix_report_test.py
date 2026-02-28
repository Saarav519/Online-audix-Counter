#!/usr/bin/env python3
"""
AUDIX Admin Portal Backend Report API Testing Script
Tests the specific report endpoints to verify they remain healthy after frontend changes.
Focus: Verifying reco_qty, final_qty, final_value_mrp, and final_value_cost fields.
"""

import requests
import json
import sys
from typing import Dict, Any, List, Optional

BACKEND_URL = "https://counter-preview-2.preview.emergentagent.com"
API_BASE = f"{BACKEND_URL}/api"

def make_request(method: str, endpoint: str, data: Optional[Dict] = None, headers: Optional[Dict] = None) -> Dict[str, Any]:
    """Make HTTP request with error handling"""
    url = f"{API_BASE}{endpoint}"
    
    try:
        if method.upper() == "GET":
            response = requests.get(url, headers=headers, timeout=30)
        elif method.upper() == "POST":
            response = requests.post(url, json=data, headers=headers, timeout=30)
        else:
            return {"success": False, "error": f"Unsupported method: {method}"}
        
        return {
            "success": response.status_code < 400,
            "status_code": response.status_code,
            "data": response.json() if response.content else None,
            "url": url
        }
    except requests.exceptions.Timeout:
        return {"success": False, "error": "Request timeout", "url": url}
    except requests.exceptions.ConnectionError:
        return {"success": False, "error": "Connection error", "url": url}
    except Exception as e:
        return {"success": False, "error": str(e), "url": url}

def test_portal_login() -> Dict[str, Any]:
    """Test portal login with admin/admin123 credentials"""
    print("1. Testing Portal Login...")
    
    login_data = {
        "username": "admin",
        "password": "admin123"
    }
    
    result = make_request("POST", "/portal/login", login_data)
    
    if result["success"]:
        user_data = result['data'].get('user', {})
        print(f"   ✅ SUCCESS - User ID: {user_data.get('id', 'N/A')}, Username: {user_data.get('username', 'N/A')}, Role: {user_data.get('role', 'N/A')}")
        return {"success": True, "user": user_data}
    else:
        print(f"   ❌ FAILED - Error: {result.get('error', 'Unknown error')}")
        return {"success": False, "error": result.get("error", "Login failed")}

def test_get_clients() -> Dict[str, Any]:
    """Test getting list of clients to find client IDs"""
    print("\n2. Testing Get Clients...")
    
    result = make_request("GET", "/portal/clients")
    
    if result["success"]:
        clients = result["data"]
        print(f"   ✅ SUCCESS - Found {len(clients)} clients:")
        
        target_client = None
        for client in clients:
            client_name = client.get('name', 'N/A')
            client_type = client.get('client_type', 'N/A')
            client_id = client.get('id', 'N/A')
            print(f"      - {client_name} ({client_type}): {client_id}")
            
            # Look for a client with data - prefer the first one
            if not target_client:
                target_client = client
        
        return {"success": True, "clients": clients, "target_client": target_client}
    else:
        print(f"   ❌ FAILED - Error: {result.get('error', 'Unknown error')}")
        return {"success": False, "error": result.get("error", "Failed to get clients")}

def test_get_sessions() -> Dict[str, Any]:
    """Test getting list of sessions"""
    print("\n3. Testing Get Sessions...")
    
    result = make_request("GET", "/portal/sessions")
    
    if result["success"]:
        sessions = result["data"]
        print(f"   ✅ SUCCESS - Found {len(sessions)} sessions")
        
        sessions_with_client_type = []
        for session in sessions:
            if 'client_type' in session:
                sessions_with_client_type.append(session)
                print(f"      - Session: {session.get('name', 'N/A')}, Client Type: {session.get('client_type', 'N/A')}")
        
        return {"success": True, "sessions": sessions, "sessions_with_client_type": sessions_with_client_type}
    else:
        print(f"   ❌ FAILED - Error: {result.get('error', 'Unknown error')}")
        return {"success": False, "error": result.get("error", "Failed to get sessions")}

def verify_report_fields(report_data: Dict, report_type: str, required_fields: List[str]) -> Dict[str, Any]:
    """Verify that report contains required fields"""
    if not isinstance(report_data, dict):
        return {"success": False, "error": "Report data is not a dictionary"}
    
    # Check for report array
    report_items = report_data.get("report", [])
    if not report_items:
        return {"success": False, "error": "No report items found"}
    
    # Check for totals object
    totals = report_data.get("totals", {})
    if not totals:
        return {"success": False, "error": "No totals object found"}
    
    # Verify required fields in report items (check first item)
    first_item = report_items[0] if report_items else {}
    missing_fields = []
    present_fields = []
    
    for field in required_fields:
        if field in first_item:
            present_fields.append(field)
        else:
            missing_fields.append(field)
    
    # Also check if totals has the fields (if applicable)
    totals_fields = []
    for field in required_fields:
        if field in totals:
            totals_fields.append(field)
    
    return {
        "success": len(missing_fields) == 0,
        "report_items_count": len(report_items),
        "present_fields": present_fields,
        "missing_fields": missing_fields,
        "totals_fields": totals_fields,
        "sample_item": first_item
    }

def test_consolidated_bin_wise_report(client_id: str, client_name: str) -> Dict[str, Any]:
    """Test consolidated bin-wise report"""
    print(f"\n4. Testing Consolidated Bin-wise Report for {client_name}...")
    
    result = make_request("GET", f"/portal/reports/consolidated/{client_id}/bin-wise")
    
    if result["success"]:
        report_data = result["data"]
        
        # Verify required fields: reco_qty and final_qty
        required_fields = ["reco_qty", "final_qty"]
        verification = verify_report_fields(report_data, "bin-wise", required_fields)
        
        if verification["success"]:
            print(f"   ✅ SUCCESS - Report has {verification['report_items_count']} items")
            print(f"      Required fields present: {', '.join(verification['present_fields'])}")
            if verification['totals_fields']:
                print(f"      Totals fields present: {', '.join(verification['totals_fields'])}")
            return {"success": True, "verification": verification}
        else:
            print(f"   ❌ FIELD VERIFICATION FAILED - Missing fields: {', '.join(verification['missing_fields'])}")
            return {"success": False, "error": f"Missing required fields: {verification['missing_fields']}"}
    else:
        print(f"   ❌ FAILED - Error: {result.get('error', 'Unknown error')}")
        return {"success": False, "error": result.get("error", "Failed to get bin-wise report")}

def test_consolidated_detailed_report(client_id: str, client_name: str) -> Dict[str, Any]:
    """Test consolidated detailed report"""
    print(f"\n5. Testing Consolidated Detailed Report for {client_name}...")
    
    result = make_request("GET", f"/portal/reports/consolidated/{client_id}/detailed")
    
    if result["success"]:
        report_data = result["data"]
        
        # Verify required fields: final_value_mrp and final_value_cost
        required_fields = ["final_value_mrp", "final_value_cost"]
        verification = verify_report_fields(report_data, "detailed", required_fields)
        
        if verification["success"]:
            print(f"   ✅ SUCCESS - Report has {verification['report_items_count']} items")
            print(f"      Required fields present: {', '.join(verification['present_fields'])}")
            if verification['totals_fields']:
                print(f"      Totals fields present: {', '.join(verification['totals_fields'])}")
            return {"success": True, "verification": verification}
        else:
            print(f"   ❌ FIELD VERIFICATION FAILED - Missing fields: {', '.join(verification['missing_fields'])}")
            return {"success": False, "error": f"Missing required fields: {verification['missing_fields']}"}
    else:
        print(f"   ❌ FAILED - Error: {result.get('error', 'Unknown error')}")
        return {"success": False, "error": result.get("error", "Failed to get detailed report")}

def test_consolidated_barcode_wise_report(client_id: str, client_name: str) -> Dict[str, Any]:
    """Test consolidated barcode-wise report"""
    print(f"\n6. Testing Consolidated Barcode-wise Report for {client_name}...")
    
    result = make_request("GET", f"/portal/reports/consolidated/{client_id}/barcode-wise")
    
    if result["success"]:
        report_data = result["data"]
        
        # Verify required fields: reco_qty, final_qty, final_value_mrp, final_value_cost
        required_fields = ["reco_qty", "final_qty", "final_value_mrp", "final_value_cost"]
        verification = verify_report_fields(report_data, "barcode-wise", required_fields)
        
        if verification["success"]:
            print(f"   ✅ SUCCESS - Report has {verification['report_items_count']} items")
            print(f"      Required fields present: {', '.join(verification['present_fields'])}")
            if verification['totals_fields']:
                print(f"      Totals fields present: {', '.join(verification['totals_fields'])}")
            return {"success": True, "verification": verification}
        else:
            print(f"   ❌ FIELD VERIFICATION FAILED - Missing fields: {', '.join(verification['missing_fields'])}")
            return {"success": False, "error": f"Missing required fields: {verification['missing_fields']}"}
    else:
        print(f"   ❌ FAILED - Error: {result.get('error', 'Unknown error')}")
        return {"success": False, "error": result.get("error", "Failed to get barcode-wise report")}

def test_consolidated_category_summary(client_id: str, client_name: str) -> Dict[str, Any]:
    """Test consolidated category summary"""
    print(f"\n7. Testing Consolidated Category Summary for {client_name}...")
    
    result = make_request("GET", f"/portal/reports/consolidated/{client_id}/category-summary")
    
    if result["success"]:
        report_data = result["data"]
        
        # Verify required fields: reco_qty, final_qty, final_value_mrp, final_value_cost
        required_fields = ["reco_qty", "final_qty", "final_value_mrp", "final_value_cost"]
        verification = verify_report_fields(report_data, "category-summary", required_fields)
        
        if verification["success"]:
            print(f"   ✅ SUCCESS - Report has {verification['report_items_count']} items")
            print(f"      Required fields present: {', '.join(verification['present_fields'])}")
            if verification['totals_fields']:
                print(f"      Totals fields present: {', '.join(verification['totals_fields'])}")
            return {"success": True, "verification": verification}
        else:
            print(f"   ❌ FIELD VERIFICATION FAILED - Missing fields: {', '.join(verification['missing_fields'])}")
            return {"success": False, "error": f"Missing required fields: {verification['missing_fields']}"}
    else:
        print(f"   ❌ FAILED - Error: {result.get('error', 'Unknown error')}")
        return {"success": False, "error": result.get("error", "Failed to get category summary")}

def test_dashboard() -> Dict[str, Any]:
    """Test dashboard endpoint"""
    print(f"\n8. Testing Dashboard...")
    
    result = make_request("GET", "/portal/dashboard")
    
    if result["success"]:
        dashboard_data = result["data"]
        print(f"   ✅ SUCCESS - Dashboard returns stats: {list(dashboard_data.keys())}")
        return {"success": True, "dashboard": dashboard_data}
    else:
        print(f"   ❌ FAILED - Error: {result.get('error', 'Unknown error')}")
        return {"success": False, "error": result.get("error", "Failed to get dashboard")}

def main():
    """Main testing function"""
    print("=" * 80)
    print("AUDIX Admin Portal Backend Report API Testing")
    print("Focus: Verifying reco_qty, final_qty, final_value_mrp, final_value_cost fields")
    print("=" * 80)
    print(f"Backend URL: {BACKEND_URL}")
    
    tests_passed = 0
    tests_failed = 0
    failed_tests = []
    
    # Test 1: Portal Login
    login_result = test_portal_login()
    if login_result["success"]:
        tests_passed += 1
    else:
        tests_failed += 1
        failed_tests.append("Portal Login")
        print("\n❌ CRITICAL: Cannot proceed without authentication")
        return
    
    # Test 2: Get Clients
    clients_result = test_get_clients()
    if clients_result["success"]:
        tests_passed += 1
    else:
        tests_failed += 1
        failed_tests.append("Get Clients")
        print("\n❌ CRITICAL: Cannot proceed without client data")
        return
    
    # Test 3: Get Sessions
    sessions_result = test_get_sessions()
    if sessions_result["success"]:
        tests_passed += 1
    else:
        tests_failed += 1
        failed_tests.append("Get Sessions")
    
    # Get target client for report testing
    target_client = clients_result.get("target_client")
    if not target_client:
        print("\n❌ CRITICAL: No target client found for report testing")
        return
    
    client_id = target_client["id"]
    client_name = target_client["name"]
    
    # Test 4: Consolidated Bin-wise Report
    bin_wise_result = test_consolidated_bin_wise_report(client_id, client_name)
    if bin_wise_result["success"]:
        tests_passed += 1
    else:
        tests_failed += 1
        failed_tests.append("Consolidated Bin-wise Report")
    
    # Test 5: Consolidated Detailed Report
    detailed_result = test_consolidated_detailed_report(client_id, client_name)
    if detailed_result["success"]:
        tests_passed += 1
    else:
        tests_failed += 1
        failed_tests.append("Consolidated Detailed Report")
    
    # Test 6: Consolidated Barcode-wise Report
    barcode_result = test_consolidated_barcode_wise_report(client_id, client_name)
    if barcode_result["success"]:
        tests_passed += 1
    else:
        tests_failed += 1
        failed_tests.append("Consolidated Barcode-wise Report")
    
    # Test 7: Consolidated Category Summary
    category_result = test_consolidated_category_summary(client_id, client_name)
    if category_result["success"]:
        tests_passed += 1
    else:
        tests_failed += 1
        failed_tests.append("Consolidated Category Summary")
    
    # Test 8: Dashboard
    dashboard_result = test_dashboard()
    if dashboard_result["success"]:
        tests_passed += 1
    else:
        tests_failed += 1
        failed_tests.append("Dashboard")
    
    # Final Results
    print("\n" + "=" * 80)
    print("FINAL TEST RESULTS")
    print("=" * 80)
    print(f"✅ TESTS PASSED: {tests_passed}")
    print(f"❌ TESTS FAILED: {tests_failed}")
    
    if tests_failed > 0:
        print(f"\nFailed Tests:")
        for test in failed_tests:
            print(f"  - {test}")
    
    success_rate = (tests_passed / (tests_passed + tests_failed)) * 100 if (tests_passed + tests_failed) > 0 else 0
    print(f"\nSUCCESS RATE: {success_rate:.1f}%")
    
    if tests_failed == 0:
        print("\n🎉 ALL TESTS PASSED! Report endpoints are healthy after frontend changes.")
        print("✅ All required fields (reco_qty, final_qty, final_value_mrp, final_value_cost) verified.")
    else:
        print(f"\n⚠️ {tests_failed} tests failed. Some report endpoints may need attention.")

if __name__ == "__main__":
    main()