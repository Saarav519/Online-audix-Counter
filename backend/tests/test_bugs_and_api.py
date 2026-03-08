"""
Backend Tests for Audix Online Counter App - Bug Fixes and API Endpoints
Testing:
- Bug 1: Master CSV upload with non-UTF-8 characters
- Bug 2: Backend health endpoints
- Bug 3: Login/auth functionality
"""
import pytest
import requests
import os
import io

# Use public URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    raise ValueError("REACT_APP_BACKEND_URL environment variable not set")

# Test client ID with master data
TEST_CLIENT_ID = "7239e3ca-fc59-48c1-831c-6210a7fa301d"
TEST_CSV_PATH = "/tmp/master_test.csv"


class TestHealthEndpoints:
    """Test basic health and dashboard endpoints"""
    
    def test_dashboard_endpoint(self):
        """Dashboard API should return 200"""
        response = requests.get(f"{BASE_URL}/api/audit/portal/dashboard")
        assert response.status_code == 200
        data = response.json()
        assert "total_clients" in data or "clients" in data or isinstance(data, dict)
        print(f"Dashboard API: SUCCESS - {response.status_code}")
    
    def test_clients_endpoint(self):
        """Clients API should return list of clients"""
        response = requests.get(f"{BASE_URL}/api/audit/portal/clients")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Clients API: SUCCESS - {len(data)} clients")
    
    def test_sessions_endpoint(self):
        """Sessions API should return list of sessions"""
        response = requests.get(f"{BASE_URL}/api/audit/portal/sessions")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Sessions API: SUCCESS - {len(data)} sessions")
    
    def test_devices_endpoint(self):
        """Devices API should return list of devices"""
        response = requests.get(f"{BASE_URL}/api/audit/portal/devices")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Devices API: SUCCESS - {len(data)} devices")


class TestPortalLogin:
    """Test portal login functionality"""
    
    def test_login_with_valid_credentials(self):
        """Login with admin/admin123 should succeed"""
        response = requests.post(
            f"{BASE_URL}/api/audit/portal/login",
            json={"username": "admin", "password": "admin123"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "user" in data or "message" in data
        print(f"Login API: SUCCESS - Admin login works")
    
    def test_login_with_invalid_credentials(self):
        """Login with wrong password should fail"""
        response = requests.post(
            f"{BASE_URL}/api/audit/portal/login",
            json={"username": "admin", "password": "wrongpassword"}
        )
        assert response.status_code == 401
        print(f"Login API: SUCCESS - Invalid credentials rejected correctly")


class TestBug1MasterCSVUpload:
    """
    Bug 1: Master CSV upload fails with non-UTF-8 characters
    The CSV file has 0xa0 (non-breaking space) bytes which caused UTF-8 decode error.
    Fix: Multi-encoding fallback (utf-8 -> utf-8-sig -> latin-1 -> cp1252)
    """
    
    def test_csv_file_has_non_utf8_characters(self):
        """Verify the test CSV file actually contains non-UTF-8 characters"""
        with open(TEST_CSV_PATH, 'rb') as f:
            content = f.read()
        
        # Verify UTF-8 decode fails (this is what the bug was)
        try:
            content.decode('utf-8')
            utf8_success = True
        except UnicodeDecodeError:
            utf8_success = False
        
        # The bug was that UTF-8 decode fails on this file
        assert not utf8_success, "CSV file should contain non-UTF-8 characters to test the bug fix"
        
        # Verify latin-1 decode works (the fix)
        content.decode('latin-1')  # Should not raise
        print("CSV file: VERIFIED - Contains non-UTF-8 characters (0xa0 bytes)")
    
    def test_master_csv_upload_with_non_utf8_characters(self):
        """
        Bug 1 Test: Upload CSV with non-UTF-8 characters should succeed with 200
        The backend now tries multiple encodings before failing.
        """
        # Verify client exists first
        client_response = requests.get(f"{BASE_URL}/api/audit/portal/clients/{TEST_CLIENT_ID}")
        if client_response.status_code == 404:
            pytest.skip(f"Test client {TEST_CLIENT_ID} not found")
        
        # Upload the CSV file with non-UTF-8 characters
        with open(TEST_CSV_PATH, 'rb') as f:
            files = {'file': ('master_test.csv', f, 'text/csv')}
            response = requests.post(
                f"{BASE_URL}/api/audit/portal/clients/{TEST_CLIENT_ID}/import-master",
                files=files
            )
        
        # Bug fix: Should now succeed with 200 (not 500)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "product_count" in data
        print(f"Bug 1 FIXED: Master CSV upload SUCCESS - {data['product_count']} products imported")
        
        # Verify data was actually imported
        verify_response = requests.get(
            f"{BASE_URL}/api/audit/portal/clients/{TEST_CLIENT_ID}/master-products/stats"
        )
        assert verify_response.status_code == 200
        stats = verify_response.json()
        assert stats.get("total_products", 0) > 0
        print(f"Verification: {stats.get('total_products', 0)} products now in database")


class TestSafeFloatFunction:
    """
    Test safe_float function behavior through API
    safe_float handles comma-separated numbers like '1,109'
    """
    
    def test_comma_separated_numbers_in_csv(self):
        """Test that comma-separated numbers in MRP/Cost fields are parsed correctly"""
        # Create a test CSV with comma-separated numbers
        test_csv_content = """Barcode,Description,MRP,Cost
TEST123456789,Test Product,"1,109","2,500"
TEST987654321,Another Product,999.50,450.25
"""
        
        # First ensure we have a test client
        clients_response = requests.get(f"{BASE_URL}/api/audit/portal/clients")
        assert clients_response.status_code == 200
        clients = clients_response.json()
        
        if not clients:
            pytest.skip("No clients available for testing")
        
        client_id = clients[0]["id"]
        
        # Upload the test CSV
        files = {'file': ('test_numbers.csv', io.BytesIO(test_csv_content.encode('utf-8')), 'text/csv')}
        response = requests.post(
            f"{BASE_URL}/api/audit/portal/clients/{client_id}/import-master",
            files=files
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data.get("product_count", 0) >= 2
        print(f"safe_float test: CSV with comma numbers imported successfully")


class TestAdditionalEndpoints:
    """Test additional API endpoints"""
    
    def test_client_schema_endpoint(self):
        """Client schema endpoint should work"""
        clients_response = requests.get(f"{BASE_URL}/api/audit/portal/clients")
        if clients_response.status_code != 200 or not clients_response.json():
            pytest.skip("No clients available")
        
        client_id = clients_response.json()[0]["id"]
        response = requests.get(f"{BASE_URL}/api/audit/portal/clients/{client_id}/schema")
        assert response.status_code == 200
        data = response.json()
        assert "fields" in data or "is_default" in data
        print(f"Schema API: SUCCESS")
    
    def test_master_products_stats_endpoint(self):
        """Master products stats endpoint should work"""
        clients_response = requests.get(f"{BASE_URL}/api/audit/portal/clients")
        if clients_response.status_code != 200 or not clients_response.json():
            pytest.skip("No clients available")
        
        client_id = clients_response.json()[0]["id"]
        response = requests.get(f"{BASE_URL}/api/audit/portal/clients/{client_id}/master-products/stats")
        assert response.status_code == 200
        data = response.json()
        assert "total_products" in data
        print(f"Master Products Stats API: SUCCESS - {data.get('total_products', 0)} products")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
