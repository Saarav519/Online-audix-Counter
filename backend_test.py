#!/usr/bin/env python3
"""
Backend API Testing Script for AUDIX Admin Portal
Tests the specific endpoints mentioned in the review request after frontend changes.
"""

import requests
import json
import sys
from typing import Dict, Any, List, Optional

BACKEND_URL = "https://tally-app-15.preview.emergentagent.com"
API_BASE = f"{BACKEND_URL}/api"

def make_request(method: str, endpoint: str, data: Optional[Dict] = None, headers: Optional[Dict] = None, expect_csv: bool = False) -> Dict[str, Any]:
    """Make HTTP request with error handling"""
    url = f"{API_BASE}{endpoint}"
    
    try:
        if method.upper() == "GET":
            response = requests.get(url, headers=headers, timeout=30)
        elif method.upper() == "POST":
            response = requests.post(url, json=data, headers=headers, timeout=30)
        elif method.upper() == "PUT":
            response = requests.put(url, json=data, headers=headers, timeout=30)
        elif method.upper() == "DELETE":
            response = requests.delete(url, headers=headers, timeout=30)
        else:
            return {"success": False, "error": f"Unsupported method: {method}"}
        
        # Handle CSV responses
        if expect_csv:
            return {
                "success": response.status_code < 400,
                "status_code": response.status_code,
                "data": response.text if response.content else None,
                "url": url
            }
        
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
    print("Testing Portal Login...")
    
    login_data = {
        "username": "admin",
        "password": "admin123"
    }
    
    result = make_request("POST", "/portal/login", login_data)
    
    if result["success"]:
        print(f"✅ Portal Login: SUCCESS")
        print(f"   User ID: {result['data'].get('user', {}).get('id', 'N/A')}")
        print(f"   Username: {result['data'].get('user', {}).get('username', 'N/A')}")
        print(f"   Role: {result['data'].get('user', {}).get('role', 'N/A')}")
        return {"success": True, "user": result["data"].get("user", {})}
    else:
        print(f"❌ Portal Login: FAILED")
        print(f"   Error: {result.get('error', 'Unknown error')}")
        return {"success": False, "error": result.get("error", "Login failed")}

def test_get_clients() -> Dict[str, Any]:
    """Test getting list of clients to find client IDs"""
    print("\nTesting Get Clients...")
    
    result = make_request("GET", "/portal/clients")
    
    if result["success"]:
        clients = result["data"]
        print(f"✅ Get Clients: SUCCESS")
        print(f"   Found {len(clients)} clients")
        
        # Look for the "xZasdas" client (store type)
        xzasdas_client = None
        for client in clients:
            print(f"   - Client: {client.get('name', 'N/A')}, Type: {client.get('client_type', 'N/A')}, ID: {client.get('id', 'N/A')}")
            if client.get('name') == 'xZasdas' and client.get('client_type') == 'store':
                xzasdas_client = client
        
        return {"success": True, "clients": clients, "xzasdas_client": xzasdas_client}
    else:
        print(f"❌ Get Clients: FAILED")
        print(f"   Error: {result.get('error', 'Unknown error')}")
        return {"success": False, "error": result.get("error", "Failed to get clients")}

def test_client_schema(client_id: str, client_name: str = "") -> Dict[str, Any]:
    """Test getting client schema"""
    print(f"\nTesting Client Schema for {client_name} ({client_id})...")
    
    result = make_request("GET", f"/portal/clients/{client_id}/schema")
    
    if result["success"]:
        schema = result["data"]
        print(f"✅ Client Schema: SUCCESS")
        print(f"   Fields in schema: {len(schema.get('fields', []))}")
        
        # Check for enabled/disabled fields
        enabled_fields = []
        disabled_fields = []
        for field in schema.get('fields', []):
            field_name = field.get('name', 'Unknown')
            is_enabled = field.get('enabled', True)
            if is_enabled:
                enabled_fields.append(field_name)
            else:
                disabled_fields.append(field_name)
        
        print(f"   Enabled fields ({len(enabled_fields)}): {', '.join(enabled_fields)}")
        print(f"   Disabled fields ({len(disabled_fields)}): {', '.join(disabled_fields)}")
        
        return {
            "success": True, 
            "schema": schema, 
            "enabled_fields": enabled_fields, 
            "disabled_fields": disabled_fields
        }
    else:
        print(f"❌ Client Schema: FAILED")
        print(f"   Error: {result.get('error', 'Unknown error')}")
        return {"success": False, "error": result.get("error", "Failed to get schema")}

def test_schema_template(client_id: str, template_type: str, client_name: str = "") -> Dict[str, Any]:
    """Test getting schema template"""
    print(f"\nTesting Schema Template ({template_type}) for {client_name} ({client_id})...")
    
    result = make_request("GET", f"/portal/clients/{client_id}/schema/template?template_type={template_type}", expect_csv=True)
    
    if result["success"]:
        template_data = result["data"]
        print(f"✅ Schema Template ({template_type}): SUCCESS")
        print(f"   CSV Header: {template_data.strip() if template_data else 'No data'}")
        
        # Parse the CSV header to check expected fields
        if template_data and template_type == "master":
            expected_fields = ["Barcode", "Description", "Category", "Mrp"]
            header_fields = [field.strip() for field in template_data.strip().split(',')]
            
            # Check if expected fields are present
            missing_fields = [field for field in expected_fields if field not in header_fields]
            if not missing_fields:
                print(f"   ✅ Master template verification: All expected fields present ({', '.join(expected_fields)})")
            else:
                print(f"   ⚠️ Master template verification: Missing fields: {', '.join(missing_fields)}")
        
        elif template_data and template_type == "stock":
            expected_fields = ["Location", "Barcode", "Description", "Category", "Mrp", "Qty"]
            header_fields = [field.strip() for field in template_data.strip().split(',')]
            
            # Check if expected fields are present
            missing_fields = [field for field in expected_fields if field not in header_fields]
            if not missing_fields:
                print(f"   ✅ Stock template verification: All expected fields present ({', '.join(expected_fields)})")
            else:
                print(f"   ⚠️ Stock template verification: Missing fields: {', '.join(missing_fields)}")
        
        return {"success": True, "template_data": template_data}
    else:
        print(f"❌ Schema Template ({template_type}): FAILED")
        print(f"   Error: {result.get('error', 'Unknown error')}")
        return {"success": False, "error": result.get("error", f"Failed to get {template_type} template")}

def test_dashboard() -> Dict[str, Any]:
    """Test dashboard endpoint"""
    print("\nTesting Dashboard...")
    
    result = make_request("GET", "/portal/dashboard")
    
    if result["success"]:
        dashboard_data = result["data"]
        print(f"✅ Dashboard: SUCCESS")
        print(f"   Stats available: {list(dashboard_data.keys())}")
        return {"success": True, "dashboard": dashboard_data}
    else:
        print(f"❌ Dashboard: FAILED")
        print(f"   Error: {result.get('error', 'Unknown error')}")
        return {"success": False, "error": result.get("error", "Failed to get dashboard")}

def test_sessions() -> Dict[str, Any]:
    """Test sessions endpoint"""
    print("\nTesting Sessions...")
    
    result = make_request("GET", "/portal/sessions")
    
    if result["success"]:
        sessions = result["data"]
        print(f"✅ Sessions: SUCCESS")
        print(f"   Found {len(sessions)} sessions")
        
        # Check if sessions have client_id field
        sessions_with_client_id = []
        for session in sessions:
            if 'client_id' in session:
                sessions_with_client_id.append(session)
                print(f"   - Session: {session.get('name', 'N/A')}, Client ID: {session.get('client_id', 'N/A')}")
        
        print(f"   Sessions with client_id field: {len(sessions_with_client_id)}")
        
        return {"success": True, "sessions": sessions, "sessions_with_client_id": sessions_with_client_id}
    else:
        print(f"❌ Sessions: FAILED")
        print(f"   Error: {result.get('error', 'Unknown error')}")
        return {"success": False, "error": result.get("error", "Failed to get sessions")}

def main():
    """Main testing function"""
    print("=" * 60)
    print("AUDIX Admin Portal Backend API Testing")
    print("=" * 60)
    print(f"Backend URL: {BACKEND_URL}")
    print(f"API Base: {API_BASE}")
    
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
    
    # Test 2: Get Clients (to find client IDs)
    clients_result = test_get_clients()
    if clients_result["success"]:
        tests_passed += 1
    else:
        tests_failed += 1
        failed_tests.append("Get Clients")
        print("\n❌ CRITICAL: Cannot proceed without client data")
        print("=" * 60)
        print(f"FINAL RESULTS: {tests_passed} PASSED, {tests_failed} FAILED")
        return
    
    # Test 3: Schema Endpoint for xZasdas client
    xzasdas_client = clients_result.get("xzasdas_client")
    if xzasdas_client:
        client_id = xzasdas_client["id"]
        client_name = xzasdas_client["name"]
        
        schema_result = test_client_schema(client_id, client_name)
        if schema_result["success"]:
            tests_passed += 1
            
            # Verify that some fields are enabled=true and some are enabled=false
            enabled_fields = schema_result.get("enabled_fields", [])
            disabled_fields = schema_result.get("disabled_fields", [])
            
            if len(enabled_fields) > 0 and len(disabled_fields) > 0:
                print(f"   ✅ Schema verification: Found both enabled ({len(enabled_fields)}) and disabled ({len(disabled_fields)}) fields as expected")
            else:
                print(f"   ⚠️ Schema verification: Expected both enabled and disabled fields, but found enabled={len(enabled_fields)}, disabled={len(disabled_fields)}")
        else:
            tests_failed += 1
            failed_tests.append("Client Schema")
        
        # Test 4: Schema Template - Master
        master_template_result = test_schema_template(client_id, "master", client_name)
        if master_template_result["success"]:
            tests_passed += 1
        else:
            tests_failed += 1
            failed_tests.append("Schema Template (Master)")
        
        # Test 5: Schema Template - Stock
        stock_template_result = test_schema_template(client_id, "stock", client_name)
        if stock_template_result["success"]:
            tests_passed += 1
        else:
            tests_failed += 1
            failed_tests.append("Schema Template (Stock)")
    else:
        print("\n⚠️ WARNING: Could not find 'xZasdas' client (store type)")
        print("   Testing schema endpoints with first available client...")
        
        if clients_result["clients"]:
            first_client = clients_result["clients"][0]
            client_id = first_client["id"]
            client_name = first_client["name"]
            
            schema_result = test_client_schema(client_id, client_name)
            if schema_result["success"]:
                tests_passed += 1
            else:
                tests_failed += 1
                failed_tests.append("Client Schema")
            
            master_template_result = test_schema_template(client_id, "master", client_name)
            if master_template_result["success"]:
                tests_passed += 1
            else:
                tests_failed += 1
                failed_tests.append("Schema Template (Master)")
            
            stock_template_result = test_schema_template(client_id, "stock", client_name)
            if stock_template_result["success"]:
                tests_passed += 1
            else:
                tests_failed += 1
                failed_tests.append("Schema Template (Stock)")
    
    # Test 6: Dashboard
    dashboard_result = test_dashboard()
    if dashboard_result["success"]:
        tests_passed += 1
    else:
        tests_failed += 1
        failed_tests.append("Dashboard")
    
    # Test 7: Sessions
    sessions_result = test_sessions()
    if sessions_result["success"]:
        tests_passed += 1
        
        # Verify that sessions have client_id field
        sessions_with_client_id = sessions_result.get("sessions_with_client_id", [])
        if len(sessions_with_client_id) > 0:
            print(f"   ✅ Sessions verification: Found {len(sessions_with_client_id)} sessions with client_id field as expected")
        else:
            print(f"   ⚠️ Sessions verification: Expected sessions to have client_id field, but none found")
    else:
        tests_failed += 1
        failed_tests.append("Sessions")
    
    # Final Results
    print("\n" + "=" * 60)
    print("FINAL RESULTS")
    print("=" * 60)
    print(f"✅ TESTS PASSED: {tests_passed}")
    print(f"❌ TESTS FAILED: {tests_failed}")
    
    if tests_failed > 0:
        print(f"\nFailed Tests:")
        for test in failed_tests:
            print(f"  - {test}")
    
    print(f"\nSUCCESS RATE: {(tests_passed / (tests_passed + tests_failed)) * 100:.1f}%")
    
    if tests_failed == 0:
        print("\n🎉 ALL TESTS PASSED! Backend APIs are healthy after frontend changes.")
    else:
        print(f"\n⚠️ {tests_failed} tests failed. Backend may need attention.")

if __name__ == "__main__":
    main()