"""
Tests for Warehouse/Store Client Type Feature (Phase 4)
Tests the new client_type field, warehouse stock management, and auto-snapshot functionality.
"""
import pytest
import requests
import os
import io
import csv

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture
def api_session():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


class TestClientTypeOnCreate:
    """Test client_type field handling during client creation"""
    
    def test_create_client_with_warehouse_type(self, api_session):
        """POST /api/portal/clients with client_type='warehouse' returns the type in response"""
        payload = {
            "name": "TEST_Warehouse Client",
            "code": "TEST_WH001",
            "client_type": "warehouse",
            "address": "Test Address"
        }
        response = api_session.post(f"{BASE_URL}/api/portal/clients", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "client" in data
        assert data["client"]["client_type"] == "warehouse"
        assert data["client"]["code"] == "TEST_WH001"
        
        # Cleanup
        api_session.delete(f"{BASE_URL}/api/portal/clients/{data['client']['id']}")
    
    def test_create_client_with_store_type_explicit(self, api_session):
        """POST /api/portal/clients with client_type='store' explicitly"""
        payload = {
            "name": "TEST_Store Client",
            "code": "TEST_ST001",
            "client_type": "store"
        }
        response = api_session.post(f"{BASE_URL}/api/portal/clients", json=payload)
        
        assert response.status_code == 200
        data = response.json()
        assert data["client"]["client_type"] == "store"
        
        # Cleanup
        api_session.delete(f"{BASE_URL}/api/portal/clients/{data['client']['id']}")
    
    def test_create_client_default_type_is_store(self, api_session):
        """POST /api/portal/clients without client_type defaults to 'store'"""
        payload = {
            "name": "TEST_Default Type Client",
            "code": "TEST_DF001"
        }
        response = api_session.post(f"{BASE_URL}/api/portal/clients", json=payload)
        
        assert response.status_code == 200
        data = response.json()
        assert data["client"]["client_type"] == "store", "Default client_type should be 'store'"
        
        # Cleanup
        api_session.delete(f"{BASE_URL}/api/portal/clients/{data['client']['id']}")


class TestGetClientsWithType:
    """Test that GET /api/portal/clients returns client_type field"""
    
    def test_get_clients_returns_client_type(self, api_session):
        """GET /api/portal/clients returns client_type field for all clients"""
        response = api_session.get(f"{BASE_URL}/api/portal/clients")
        
        assert response.status_code == 200
        clients = response.json()
        assert isinstance(clients, list)
        
        # Find the existing warehouse client WH001
        wh_client = next((c for c in clients if c.get("code") == "WH001"), None)
        if wh_client:
            assert wh_client.get("client_type") == "warehouse"
        
        # Check existing store clients
        store_clients = [c for c in clients if c.get("code") in ["RR001", "DM002"]]
        for sc in store_clients:
            # Old clients may not have client_type field, should default to store
            client_type = sc.get("client_type", "store")
            assert client_type == "store" or client_type is None


class TestWarehouseStockImport:
    """Test warehouse client stock import at client level"""
    
    def test_import_stock_for_warehouse_client(self, api_session):
        """POST /api/portal/clients/{id}/import-stock uploads stock CSV for warehouse client"""
        # First create a warehouse client
        payload = {
            "name": "TEST_Import Stock Warehouse",
            "code": "TEST_ISW01",
            "client_type": "warehouse"
        }
        create_res = api_session.post(f"{BASE_URL}/api/portal/clients", json=payload)
        assert create_res.status_code == 200
        client_id = create_res.json()["client"]["id"]
        
        try:
            # Create CSV content
            csv_content = "Location,Barcode,Description,Qty\nBIN-A1,8001234567890,Test Product 1,100\nBIN-A2,8001234567891,Test Product 2,50"
            
            # Upload stock
            files = {'file': ('stock.csv', csv_content, 'text/csv')}
            api_session.headers.pop('Content-Type', None)  # Remove JSON header for file upload
            response = requests.post(
                f"{BASE_URL}/api/portal/clients/{client_id}/import-stock",
                files=files
            )
            api_session.headers['Content-Type'] = 'application/json'  # Restore
            
            assert response.status_code == 200, f"Stock import failed: {response.text}"
            data = response.json()
            assert "record_count" in data
            assert data["record_count"] == 2
            
            # Verify client stock_imported flag
            client_res = api_session.get(f"{BASE_URL}/api/portal/clients/{client_id}")
            assert client_res.status_code == 200
            client_data = client_res.json()
            assert client_data.get("stock_imported") == True
            assert client_data.get("stock_record_count") == 2
            
        finally:
            # Cleanup
            api_session.delete(f"{BASE_URL}/api/portal/clients/{client_id}")
    
    def test_get_client_stock(self, api_session):
        """GET /api/portal/clients/{id}/stock returns stock records"""
        # Use existing warehouse client WH001
        client_id = "77ec8bde-8064-48da-a881-39e491883039"
        
        response = api_session.get(f"{BASE_URL}/api/portal/clients/{client_id}/stock")
        
        assert response.status_code == 200
        data = response.json()
        assert "records" in data
        assert "total" in data
        assert "extra_columns" in data
        assert data["total"] >= 1
        
        # Verify record structure
        if data["records"]:
            record = data["records"][0]
            assert "barcode" in record
            assert "location" in record
            assert "qty" in record
    
    def test_get_client_stock_stats(self, api_session):
        """GET /api/portal/clients/{id}/stock/stats returns statistics"""
        # Use existing warehouse client WH001
        client_id = "77ec8bde-8064-48da-a881-39e491883039"
        
        response = api_session.get(f"{BASE_URL}/api/portal/clients/{client_id}/stock/stats")
        
        assert response.status_code == 200
        data = response.json()
        assert "total_records" in data
        assert "unique_locations" in data
        assert data["total_records"] >= 1
    
    def test_clear_client_stock(self, api_session):
        """DELETE /api/portal/clients/{id}/stock clears client stock"""
        # Create a temp warehouse client and add stock
        payload = {
            "name": "TEST_Clear Stock Warehouse",
            "code": "TEST_CSW01",
            "client_type": "warehouse"
        }
        create_res = api_session.post(f"{BASE_URL}/api/portal/clients", json=payload)
        assert create_res.status_code == 200
        client_id = create_res.json()["client"]["id"]
        
        try:
            # Import stock
            csv_content = "Location,Barcode,Qty\nBIN-A1,123456,10"
            files = {'file': ('stock.csv', csv_content, 'text/csv')}
            api_session.headers.pop('Content-Type', None)
            requests.post(f"{BASE_URL}/api/portal/clients/{client_id}/import-stock", files=files)
            api_session.headers['Content-Type'] = 'application/json'
            
            # Clear stock
            response = api_session.delete(f"{BASE_URL}/api/portal/clients/{client_id}/stock")
            
            assert response.status_code == 200
            data = response.json()
            assert "deleted_count" in data
            
            # Verify stock is cleared
            stock_res = api_session.get(f"{BASE_URL}/api/portal/clients/{client_id}/stock")
            assert stock_res.json()["total"] == 0
            
        finally:
            api_session.delete(f"{BASE_URL}/api/portal/clients/{client_id}")


class TestSessionAutoSnapshotForWarehouse:
    """Test that session creation auto-snapshots stock for warehouse clients"""
    
    def test_session_for_warehouse_auto_snapshots_stock(self, api_session):
        """POST /api/portal/sessions for warehouse client with stock auto-snapshots into expected_stock"""
        # Use existing warehouse client WH001 which has stock
        warehouse_client_id = "77ec8bde-8064-48da-a881-39e491883039"
        
        # Verify warehouse has stock
        stock_res = api_session.get(f"{BASE_URL}/api/portal/clients/{warehouse_client_id}/stock/stats")
        stock_count = stock_res.json().get("total_records", 0)
        assert stock_count > 0, "Warehouse client should have stock for this test"
        
        # Create session
        session_payload = {
            "client_id": warehouse_client_id,
            "name": "TEST_Auto Snapshot Session",
            "variance_mode": "bin-wise",
            "start_date": "2026-02-28T10:00:00Z"
        }
        response = api_session.post(f"{BASE_URL}/api/portal/sessions", json=session_payload)
        
        assert response.status_code == 200, f"Session creation failed: {response.text}"
        data = response.json()
        session_id = data["session"]["id"]
        
        try:
            # Check snapshot message
            assert "snapshot" in data or data["session"].get("expected_stock_imported") == True, \
                "Warehouse session should auto-import stock"
            
            # Verify session has stock_snapshot=True
            session_res = api_session.get(f"{BASE_URL}/api/portal/sessions/{session_id}")
            assert session_res.status_code == 200
            session_data = session_res.json()
            assert session_data.get("stock_snapshot") == True, "Session should have stock_snapshot=True"
            assert session_data.get("expected_stock_imported") == True
            
            # Verify expected_stock was created
            expected_res = api_session.get(f"{BASE_URL}/api/portal/sessions/{session_id}/expected-stock")
            assert expected_res.status_code == 200
            expected_stock = expected_res.json()
            assert len(expected_stock) == stock_count, f"Expected {stock_count} records, got {len(expected_stock)}"
            
        finally:
            # Cleanup session
            api_session.delete(f"{BASE_URL}/api/portal/sessions/{session_id}")
    
    def test_session_for_store_no_auto_snapshot(self, api_session):
        """POST /api/portal/sessions for store client does NOT auto-snapshot"""
        # Use existing store client RR001
        store_client_id = "0a2045d2-dc5f-4f6b-b622-8c2a67788b8d"
        
        session_payload = {
            "client_id": store_client_id,
            "name": "TEST_Store No Snapshot Session",
            "variance_mode": "bin-wise",
            "start_date": "2026-02-28T10:00:00Z"
        }
        response = api_session.post(f"{BASE_URL}/api/portal/sessions", json=session_payload)
        
        assert response.status_code == 200
        data = response.json()
        session_id = data["session"]["id"]
        
        try:
            # Should NOT have snapshot message
            assert "snapshot" not in data
            
            # Verify expected_stock_imported is False
            session_res = api_session.get(f"{BASE_URL}/api/portal/sessions/{session_id}")
            session_data = session_res.json()
            assert session_data.get("expected_stock_imported") == False
            assert session_data.get("stock_snapshot", False) == False
            
            # Verify no expected_stock
            expected_res = api_session.get(f"{BASE_URL}/api/portal/sessions/{session_id}/expected-stock")
            expected_stock = expected_res.json()
            assert len(expected_stock) == 0
            
        finally:
            api_session.delete(f"{BASE_URL}/api/portal/sessions/{session_id}")


class TestGetSessionWithStockSnapshot:
    """Test session retrieval returns stock_snapshot flag"""
    
    def test_get_session_returns_stock_snapshot_flag(self, api_session):
        """GET /api/portal/sessions/{session_id} returns stock_snapshot flag for warehouse sessions"""
        # Create session for warehouse
        warehouse_client_id = "77ec8bde-8064-48da-a881-39e491883039"
        
        session_payload = {
            "client_id": warehouse_client_id,
            "name": "TEST_Snapshot Flag Session",
            "variance_mode": "bin-wise",
            "start_date": "2026-02-28T10:00:00Z"
        }
        create_res = api_session.post(f"{BASE_URL}/api/portal/sessions", json=session_payload)
        assert create_res.status_code == 200
        session_id = create_res.json()["session"]["id"]
        
        try:
            # GET session
            response = api_session.get(f"{BASE_URL}/api/portal/sessions/{session_id}")
            
            assert response.status_code == 200
            data = response.json()
            assert "stock_snapshot" in data
            assert data["stock_snapshot"] == True
            
        finally:
            api_session.delete(f"{BASE_URL}/api/portal/sessions/{session_id}")


class TestExpectedStockFromSnapshot:
    """Test that expected stock endpoint returns snapshot records"""
    
    def test_expected_stock_returns_snapshot_records(self, api_session):
        """GET /api/portal/sessions/{session_id}/expected-stock returns snapshot records for warehouse session"""
        # Create session for warehouse (which will auto-snapshot)
        warehouse_client_id = "77ec8bde-8064-48da-a881-39e491883039"
        
        session_payload = {
            "client_id": warehouse_client_id,
            "name": "TEST_Expected Stock Snapshot",
            "variance_mode": "bin-wise",
            "start_date": "2026-02-28T10:00:00Z"
        }
        create_res = api_session.post(f"{BASE_URL}/api/portal/sessions", json=session_payload)
        assert create_res.status_code == 200
        session_id = create_res.json()["session"]["id"]
        
        try:
            # GET expected stock
            response = api_session.get(f"{BASE_URL}/api/portal/sessions/{session_id}/expected-stock")
            
            assert response.status_code == 200
            records = response.json()
            assert isinstance(records, list)
            assert len(records) > 0, "Should have snapshot records"
            
            # Verify record structure
            record = records[0]
            assert "barcode" in record
            assert "qty" in record
            assert "session_id" in record
            assert record["session_id"] == session_id
            
        finally:
            api_session.delete(f"{BASE_URL}/api/portal/sessions/{session_id}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
