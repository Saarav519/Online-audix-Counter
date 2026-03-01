#!/usr/bin/env python3
"""
Backend API Testing Script for Audix Counter Software
Tests the specific endpoints mentioned in the review request.
"""

import requests
import json
import sys
import tempfile
import os
from typing import Dict, Any, List, Optional

# Use the production URL from frontend/.env
BACKEND_URL = "https://count-test.preview.emergentagent.com"
API_BASE = f"{BACKEND_URL}/api"

def make_request(method: str, endpoint: str, data: Optional[Dict] = None, headers: Optional[Dict] = None, files: Optional[Dict] = None) -> Dict[str, Any]:
    """Make HTTP request with error handling"""
    url = f"{API_BASE}{endpoint}"
    
    try:
        if method.upper() == "GET":
            response = requests.get(url, headers=headers, timeout=30)
        elif method.upper() == "POST":
            if files:
                response = requests.post(url, data=data, files=files, headers=headers, timeout=30)
            else:
                response = requests.post(url, json=data, headers=headers, timeout=30)
        elif method.upper() == "PUT":
            response = requests.put(url, json=data, headers=headers, timeout=30)
        elif method.upper() == "DELETE":
            response = requests.delete(url, headers=headers, timeout=30)
        else:
            return {"success": False, "error": f"Unsupported method: {method}"}
        
        return {
            "success": response.status_code < 400,
            "status_code": response.status_code,
            "data": response.json() if response.content and response.headers.get('content-type', '').startswith('application/json') else response.text,
            "url": url
        }
    except requests.exceptions.Timeout:
        return {"success": False, "error": "Request timeout", "url": url}
    except requests.exceptions.ConnectionError:
        return {"success": False, "error": "Connection error", "url": url}
    except Exception as e:
        return {"success": False, "error": str(e), "url": url}

def create_test_csv():
    """Create a test CSV file for backup upload testing"""
    csv_content = """location,barcode,product_name,price,quantity,scanned_at
A1-01,1234567890123,Test Product 1,25.99,5,2024-01-15T10:30:00Z
A1-02,2345678901234,Test Product 2,15.50,3,2024-01-15T10:35:00Z
B2-01,3456789012345,Test Product 3,45.00,2,2024-01-15T10:40:00Z
B2-02,4567890123456,Test Product 4,12.75,7,2024-01-15T10:45:00Z
C3-01,5678901234567,Test Product 5,33.25,4,2024-01-15T10:50:00Z"""
    
    # Create temporary CSV file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False) as f:
        f.write(csv_content)
        return f.name

def test_get_clients() -> Dict[str, Any]:
    """Test GET /api/portal/clients"""
    print("Testing GET /api/portal/clients...")
    
    result = make_request("GET", "/portal/clients")
    
    if result["success"]:
        clients = result["data"]
        print(f"✅ GET /api/portal/clients: SUCCESS")
        print(f"   Found {len(clients)} clients")
        
        if clients:
            print(f"   First client: {clients[0].get('name', 'N/A')} (ID: {clients[0].get('id', 'N/A')})")
            return {"success": True, "clients": clients, "first_client": clients[0]}
        else:
            print("   ⚠️  No clients found")
            return {"success": True, "clients": [], "first_client": None}
    else:
        print(f"❌ GET /api/portal/clients: FAILED")
        print(f"   Status Code: {result.get('status_code', 'N/A')}")
        print(f"   Error: {result.get('error', 'Unknown error')}")
        return {"success": False, "error": result.get("error", "Failed to get clients")}

def test_get_sessions_for_client(client_id: str) -> Dict[str, Any]:
    """Test GET /api/portal/sessions?client_id={client_id}"""
    print(f"\nTesting GET /api/portal/sessions?client_id={client_id}...")
    
    result = make_request("GET", f"/portal/sessions?client_id={client_id}")
    
    if result["success"]:
        sessions = result["data"]
        print(f"✅ GET /api/portal/sessions: SUCCESS")
        print(f"   Found {len(sessions)} sessions for client {client_id}")
        
        if sessions:
            print(f"   First session: {sessions[0].get('name', 'N/A')} (ID: {sessions[0].get('id', 'N/A')})")
            return {"success": True, "sessions": sessions, "first_session": sessions[0]}
        else:
            print("   ⚠️  No sessions found for this client")
            return {"success": True, "sessions": [], "first_session": None}
    else:
        print(f"❌ GET /api/portal/sessions: FAILED")
        print(f"   Status Code: {result.get('status_code', 'N/A')}")
        print(f"   Error: {result.get('error', 'Unknown error')}")
        return {"success": False, "error": result.get("error", "Failed to get sessions")}

def test_backup_upload_with_existing_session(client_name: str, session_id: str) -> Dict[str, Any]:
    """Test POST /api/portal/sync-inbox/upload-backup with existing session_id"""
    print(f"\nTesting backup upload with existing session_id: {session_id}...")
    
    # Create test CSV file
    csv_file_path = create_test_csv()
    
    try:
        with open(csv_file_path, 'rb') as f:
            files = {'file': ('test_backup.csv', f, 'text/csv')}
            data = {
                'client_name': client_name,
                'session_id': session_id,  # Use existing session
                'variance_mode': 'bin-wise',
                'device_name': 'test-scanner'
            }
            
            result = make_request("POST", "/portal/sync-inbox/upload-backup", data=data, files=files)
            
            if result["success"]:
                response_data = result["data"]
                print(f"✅ Backup upload with existing session_id: SUCCESS")
                print(f"   Used existing session: {response_data.get('used_existing_session', False)}")
                print(f"   Session ID: {response_data.get('session_id', 'N/A')}")
                print(f"   Locations restored: {response_data.get('locations_restored', 0)}")
                print(f"   Total items: {response_data.get('total_items', 0)}")
                
                # Verify it used existing session and did NOT create new one
                used_existing = response_data.get('used_existing_session', False)
                returned_session_id = response_data.get('session_id', '')
                
                if used_existing and returned_session_id == session_id:
                    print("   ✅ Verification: Correctly used existing session, did not create new one")
                    return {"success": True, "used_existing_session": True, "data": response_data}
                else:
                    print("   ❌ Verification: Failed - should have used existing session")
                    return {"success": False, "error": "Did not use existing session as expected"}
            else:
                print(f"❌ Backup upload with existing session_id: FAILED")
                print(f"   Status Code: {result.get('status_code', 'N/A')}")
                print(f"   Error: {result.get('error', 'Unknown error')}")
                return {"success": False, "error": result.get("error", "Backup upload failed")}
    finally:
        # Clean up temp file
        if os.path.exists(csv_file_path):
            os.unlink(csv_file_path)

def test_backup_upload_with_invalid_session(client_name: str) -> Dict[str, Any]:
    """Test POST /api/portal/sync-inbox/upload-backup with invalid session_id (should return 404)"""
    print(f"\nTesting backup upload with invalid session_id...")
    
    # Create test CSV file
    csv_file_path = create_test_csv()
    
    try:
        with open(csv_file_path, 'rb') as f:
            files = {'file': ('test_backup.csv', f, 'text/csv')}
            data = {
                'client_name': client_name,
                'session_id': 'invalid-session-id-12345',  # Invalid session ID
                'variance_mode': 'bin-wise',
                'device_name': 'test-scanner'
            }
            
            result = make_request("POST", "/portal/sync-inbox/upload-backup", data=data, files=files)
            
            # Should return 404 for invalid session_id
            if result["status_code"] == 404:
                print(f"✅ Backup upload with invalid session_id: SUCCESS (correctly returned 404)")
                return {"success": True, "correctly_returned_404": True}
            elif result["success"]:
                print(f"❌ Backup upload with invalid session_id: FAILED (should have returned 404, but succeeded)")
                return {"success": False, "error": "Should have failed with 404 for invalid session_id"}
            else:
                print(f"❌ Backup upload with invalid session_id: FAILED")
                print(f"   Status Code: {result.get('status_code', 'N/A')} (expected 404)")
                print(f"   Error: {result.get('error', 'Unknown error')}")
                return {"success": False, "error": f"Unexpected error: {result.get('error', 'Unknown')}"} 
    finally:
        # Clean up temp file
        if os.path.exists(csv_file_path):
            os.unlink(csv_file_path)

def test_backup_upload_with_session_name(client_name: str) -> Dict[str, Any]:
    """Test POST /api/portal/sync-inbox/upload-backup with empty session_id but valid session_name (should create new session)"""
    print(f"\nTesting backup upload with session_name (should create new session)...")
    
    # Create test CSV file
    csv_file_path = create_test_csv()
    
    try:
        with open(csv_file_path, 'rb') as f:
            files = {'file': ('test_backup.csv', f, 'text/csv')}
            data = {
                'client_name': client_name,
                'session_name': 'New Test Session from Backup Upload',  # Should create new session
                'session_id': '',  # Empty session_id
                'variance_mode': 'bin-wise',
                'device_name': 'test-scanner'
            }
            
            result = make_request("POST", "/portal/sync-inbox/upload-backup", data=data, files=files)
            
            if result["success"]:
                response_data = result["data"]
                print(f"✅ Backup upload with session_name: SUCCESS")
                print(f"   Used existing session: {response_data.get('used_existing_session', False)}")
                print(f"   Session ID: {response_data.get('session_id', 'N/A')}")
                print(f"   Session Name: {response_data.get('session_name', 'N/A')}")
                print(f"   Locations restored: {response_data.get('locations_restored', 0)}")
                
                # Verify it created new session
                used_existing = response_data.get('used_existing_session', True)
                session_name = response_data.get('session_name', '')
                
                if not used_existing and 'New Test Session' in session_name:
                    print("   ✅ Verification: Correctly created new session")
                    return {"success": True, "created_new_session": True, "data": response_data}
                else:
                    print("   ❌ Verification: Failed - should have created new session")
                    return {"success": False, "error": "Did not create new session as expected"}
            else:
                print(f"❌ Backup upload with session_name: FAILED")
                print(f"   Status Code: {result.get('status_code', 'N/A')}")
                print(f"   Error: {result.get('error', 'Unknown error')}")
                return {"success": False, "error": result.get("error", "Backup upload failed")}
    finally:
        # Clean up temp file
        if os.path.exists(csv_file_path):
            os.unlink(csv_file_path)

def test_client_schema(client_id: str) -> Dict[str, Any]:
    """Test GET /api/portal/clients/{client_id}/schema - should return fields with enabled flag"""
    print(f"\nTesting GET /api/portal/clients/{client_id}/schema...")
    
    result = make_request("GET", f"/portal/clients/{client_id}/schema")
    
    if result["success"]:
        schema = result["data"]
        print(f"✅ GET /api/portal/clients/{client_id}/schema: SUCCESS")
        
        # Verify schema structure
        if "fields" in schema and isinstance(schema["fields"], list):
            print(f"   Fields in schema: {len(schema['fields'])}")
            
            # Check that fields have 'enabled' flag
            fields_with_enabled = 0
            enabled_fields = []
            disabled_fields = []
            
            for field in schema["fields"]:
                if "enabled" in field:
                    fields_with_enabled += 1
                    if field["enabled"]:
                        enabled_fields.append(field.get("name", "unnamed"))
                    else:
                        disabled_fields.append(field.get("name", "unnamed"))
            
            print(f"   Fields with 'enabled' flag: {fields_with_enabled}/{len(schema['fields'])}")
            print(f"   Enabled fields: {', '.join(enabled_fields)}")
            print(f"   Disabled fields: {', '.join(disabled_fields)}")
            
            if fields_with_enabled == len(schema["fields"]):
                print("   ✅ Verification: All fields have 'enabled' flag as expected")
                return {"success": True, "schema": schema, "enabled_fields": enabled_fields, "disabled_fields": disabled_fields}
            else:
                print("   ❌ Verification: Some fields missing 'enabled' flag")
                return {"success": False, "error": "Some fields missing 'enabled' flag"}
        else:
            print("   ❌ Verification: Schema missing 'fields' array")
            return {"success": False, "error": "Schema missing 'fields' array"}
    else:
        print(f"❌ GET /api/portal/clients/{client_id}/schema: FAILED")
        print(f"   Status Code: {result.get('status_code', 'N/A')}")
        print(f"   Error: {result.get('error', 'Unknown error')}")
        return {"success": False, "error": result.get("error", "Failed to get schema")}

def test_consolidated_reports(client_id: str) -> Dict[str, Any]:
    """Test consolidated report endpoints"""
    print(f"\nTesting consolidated report endpoints for client {client_id}...")
    
    reports_to_test = [
        ("detailed", "/portal/reports/consolidated/{}/detailed"),
        ("bin-wise", "/portal/reports/consolidated/{}/bin-wise")
    ]
    
    results = {}
    
    for report_name, endpoint_template in reports_to_test:
        endpoint = endpoint_template.format(client_id)
        print(f"\n  Testing {report_name} report: GET {endpoint}")
        
        result = make_request("GET", endpoint)
        
        if result["success"]:
            report_data = result["data"]
            print(f"  ✅ {report_name} report: SUCCESS")
            
            # Basic validation of report structure
            if isinstance(report_data, dict):
                if "report" in report_data:
                    report_items = report_data["report"]
                    print(f"     Report items: {len(report_items) if isinstance(report_items, list) else 'Not a list'}")
                
                if "totals" in report_data:
                    totals = report_data["totals"]
                    print(f"     Totals available: {list(totals.keys()) if isinstance(totals, dict) else 'Not a dict'}")
                
                if "summary" in report_data:
                    summary = report_data["summary"]
                    print(f"     Summary available: {list(summary.keys()) if isinstance(summary, dict) else 'Not a dict'}")
            
            results[report_name] = {"success": True, "data": report_data}
        else:
            print(f"  ❌ {report_name} report: FAILED")
            print(f"     Status Code: {result.get('status_code', 'N/A')}")
            print(f"     Error: {result.get('error', 'Unknown error')}")
            results[report_name] = {"success": False, "error": result.get("error", f"{report_name} report failed")}
    
    # Overall success if both reports work
    all_successful = all(r["success"] for r in results.values())
    return {
        "success": all_successful, 
        "results": results,
        "successful_reports": [name for name, r in results.items() if r["success"]],
        "failed_reports": [name for name, r in results.items() if not r["success"]]
    }

def main():
    """Main testing function for specific review request features"""
    print("=" * 80)
    print("AUDIX COUNTER SOFTWARE - BACKEND API TESTING")
    print("Focus: Backup Upload with session_id, Schema endpoint, Report endpoints")
    print("=" * 80)
    print(f"Backend URL: {BACKEND_URL}")
    print(f"API Base: {API_BASE}")
    
    tests_passed = 0
    tests_failed = 0
    failed_tests = []
    
    # Test 1: Get Clients
    print("\n" + "="*60)
    print("TEST 1: GET CLIENTS")
    print("="*60)
    
    clients_result = test_get_clients()
    if clients_result["success"] and clients_result.get("first_client"):
        tests_passed += 1
        client = clients_result["first_client"]
        client_id = client["id"]
        client_name = client["name"]
        print(f"Using client: {client_name} (ID: {client_id})")
    else:
        tests_failed += 1
        failed_tests.append("Get Clients")
        print("\n❌ CRITICAL: Cannot proceed without client data")
        return
    
    # Test 2: Get Sessions for Client
    print("\n" + "="*60)
    print("TEST 2: GET SESSIONS FOR CLIENT")
    print("="*60)
    
    sessions_result = test_get_sessions_for_client(client_id)
    if sessions_result["success"]:
        tests_passed += 1
        existing_session = sessions_result.get("first_session")
        if existing_session:
            existing_session_id = existing_session["id"]
            print(f"Found existing session for testing: {existing_session.get('name', 'N/A')} (ID: {existing_session_id})")
        else:
            existing_session_id = None
            print("No existing sessions found - will test session creation")
    else:
        tests_failed += 1
        failed_tests.append("Get Sessions")
        existing_session_id = None
    
    # Test 3: Backup Upload Tests
    print("\n" + "="*60)
    print("TEST 3: BACKUP UPLOAD WITH EXISTING SESSION_ID")
    print("="*60)
    
    if existing_session_id:
        backup_existing_result = test_backup_upload_with_existing_session(client_name, existing_session_id)
        if backup_existing_result["success"]:
            tests_passed += 1
        else:
            tests_failed += 1
            failed_tests.append("Backup Upload - Existing Session")
    else:
        print("⚠️  Skipping existing session test - no sessions available")
        tests_failed += 1
        failed_tests.append("Backup Upload - Existing Session (No sessions available)")
    
    # Test 4: Backup Upload with Invalid Session ID
    print("\n" + "="*60)
    print("TEST 4: BACKUP UPLOAD WITH INVALID SESSION_ID")
    print("="*60)
    
    backup_invalid_result = test_backup_upload_with_invalid_session(client_name)
    if backup_invalid_result["success"]:
        tests_passed += 1
    else:
        tests_failed += 1
        failed_tests.append("Backup Upload - Invalid Session")
    
    # Test 5: Backup Upload with Session Name
    print("\n" + "="*60)
    print("TEST 5: BACKUP UPLOAD WITH SESSION NAME")
    print("="*60)
    
    backup_new_result = test_backup_upload_with_session_name(client_name)
    if backup_new_result["success"]:
        tests_passed += 1
    else:
        tests_failed += 1
        failed_tests.append("Backup Upload - New Session")
    
    # Test 6: Schema Endpoint
    print("\n" + "="*60)
    print("TEST 6: CLIENT SCHEMA ENDPOINT")
    print("="*60)
    
    schema_result = test_client_schema(client_id)
    if schema_result["success"]:
        tests_passed += 1
    else:
        tests_failed += 1
        failed_tests.append("Client Schema")
    
    # Test 7: Report Endpoints
    print("\n" + "="*60)
    print("TEST 7: CONSOLIDATED REPORT ENDPOINTS")
    print("="*60)
    
    reports_result = test_consolidated_reports(client_id)
    if reports_result["success"]:
        tests_passed += 1
    else:
        tests_failed += 1
        failed_tests.append("Consolidated Reports")
    
    # Final Results
    print("\n" + "="*80)
    print("FINAL RESULTS")
    print("="*80)
    print(f"✅ TESTS PASSED: {tests_passed}")
    print(f"❌ TESTS FAILED: {tests_failed}")
    
    if tests_failed > 0:
        print(f"\nFailed Tests:")
        for test in failed_tests:
            print(f"  - {test}")
    
    success_rate = (tests_passed / (tests_passed + tests_failed)) * 100 if (tests_passed + tests_failed) > 0 else 0
    print(f"\nSUCCESS RATE: {success_rate:.1f}%")
    
    if tests_failed == 0:
        print("\n🎉 ALL TESTS PASSED! Backend APIs are working correctly for the requested features.")
    else:
        print(f"\n⚠️  {tests_failed} tests failed. Backend may need attention for the requested features.")
    
    return tests_failed == 0

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)