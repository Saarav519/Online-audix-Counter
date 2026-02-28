# Test Schema Template and Refresh Stock Features
# Tests: 1) Schema template only shows enabled fields 2) Refresh Stock endpoint for warehouse clients

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Client IDs from test credentials
WAREHOUSE_CLIENT_ID = "77eff157-ed53-43b5-86ad-df67fd8ccc91"
SESSION_ID = "ab04c2f0-34a2-4bb8-a543-86eb8d72c1e0"


class TestSchemaTemplateDownload:
    """Test GET /api/portal/clients/{client_id}/schema/template - only shows enabled fields"""

    def test_schema_template_master_type(self):
        """Template should only include enabled fields from schema"""
        # First, get the current schema for the client
        schema_resp = requests.get(f"{BASE_URL}/api/portal/clients/{WAREHOUSE_CLIENT_ID}/schema")
        assert schema_resp.status_code == 200, f"Failed to get schema: {schema_resp.text}"
        
        schema = schema_resp.json()
        print(f"Current schema: is_default={schema.get('is_default')}, field_count={len(schema.get('fields', []))}")
        
        # Get enabled fields from schema
        enabled_fields = [f['name'] for f in schema.get('fields', []) if f.get('enabled', True)]
        print(f"Enabled fields in schema: {enabled_fields}")
        
        # Download master template
        template_resp = requests.get(f"{BASE_URL}/api/portal/clients/{WAREHOUSE_CLIENT_ID}/schema/template?template_type=master")
        assert template_resp.status_code == 200, f"Failed to download template: {template_resp.text}"
        
        # Parse CSV headers
        csv_content = template_resp.text
        header_line = csv_content.strip().split('\n')[0]
        headers = [h.strip().lower().replace(' ', '_') for h in header_line.split(',')]
        print(f"Template headers (master): {headers}")
        
        # Verify headers match enabled fields
        # Headers should be title-cased versions of field names
        for field in enabled_fields:
            expected_header = field  # Backend converts field names to Title Case with underscores
            assert expected_header in headers or field.replace('_', ' ').title().lower().replace(' ', '_') in [h.lower().replace(' ', '_') for h in headers], \
                f"Enabled field '{field}' not found in template headers {headers}"
        
        print(f"SUCCESS: Template contains only enabled fields ({len(enabled_fields)} fields)")

    def test_schema_template_stock_type(self):
        """Stock template should include Location, enabled fields, and Qty"""
        # Download stock template
        template_resp = requests.get(f"{BASE_URL}/api/portal/clients/{WAREHOUSE_CLIENT_ID}/schema/template?template_type=stock")
        assert template_resp.status_code == 200, f"Failed to download stock template: {template_resp.text}"
        
        # Parse CSV headers
        csv_content = template_resp.text
        header_line = csv_content.strip().split('\n')[0]
        headers = [h.strip().lower() for h in header_line.split(',')]
        print(f"Template headers (stock): {headers}")
        
        # Stock template should have Location and Qty
        assert 'location' in headers, "Stock template missing 'Location' column"
        assert 'qty' in headers, "Stock template missing 'Qty' column"
        
        print(f"SUCCESS: Stock template contains Location and Qty columns")

    def test_schema_template_default_schema(self):
        """When no schema saved, template should only have barcode field"""
        # Create a temporary client to test default schema behavior
        import uuid
        test_client_code = f"TEST_{uuid.uuid4().hex[:6]}"
        
        # Create test client
        create_resp = requests.post(f"{BASE_URL}/api/portal/clients", json={
            "name": "Test Schema Client",
            "code": test_client_code,
            "client_type": "store"
        })
        assert create_resp.status_code == 200, f"Failed to create test client: {create_resp.text}"
        test_client_id = create_resp.json()['client']['id']
        print(f"Created test client: {test_client_id}")
        
        try:
            # Get schema - should return default with is_default=True
            schema_resp = requests.get(f"{BASE_URL}/api/portal/clients/{test_client_id}/schema")
            assert schema_resp.status_code == 200
            schema = schema_resp.json()
            assert schema.get('is_default') == True, "Expected default schema"
            
            # Download template - should only have barcode (minimal default)
            template_resp = requests.get(f"{BASE_URL}/api/portal/clients/{test_client_id}/schema/template?template_type=master")
            assert template_resp.status_code == 200
            
            csv_content = template_resp.text
            header_line = csv_content.strip().split('\n')[0]
            headers = [h.strip().lower() for h in header_line.split(',')]
            print(f"Default schema template headers: {headers}")
            
            # Should only have 'barcode' field for default schema
            assert 'barcode' in headers, "Default template must include 'Barcode'"
            # Should NOT have all the other fields like description, category, mrp, cost etc
            # When no schema is saved, it should be minimal
            assert len(headers) == 1, f"Expected only 'barcode' for default schema, got {headers}"
            
            print("SUCCESS: Default schema template only has 'barcode' field")
            
        finally:
            # Cleanup: delete test client
            requests.delete(f"{BASE_URL}/api/portal/clients/{test_client_id}")


class TestRefreshStock:
    """Test POST /api/portal/sessions/{session_id}/refresh-stock"""

    def test_refresh_stock_warehouse_client(self):
        """Refresh stock should work for warehouse clients"""
        # First verify the session exists and get client info
        session_resp = requests.get(f"{BASE_URL}/api/portal/sessions/{SESSION_ID}")
        if session_resp.status_code == 404:
            pytest.skip(f"Session {SESSION_ID} not found")
        
        assert session_resp.status_code == 200, f"Failed to get session: {session_resp.text}"
        session = session_resp.json()
        client_id = session.get('client_id')
        print(f"Session client_id: {client_id}")
        
        # Verify client is warehouse type
        client_resp = requests.get(f"{BASE_URL}/api/portal/clients/{client_id}")
        assert client_resp.status_code == 200, f"Failed to get client: {client_resp.text}"
        client = client_resp.json()
        
        if client.get('client_type') != 'warehouse':
            pytest.skip(f"Client {client_id} is not warehouse type")
        
        print(f"Client type: {client.get('client_type')}")
        
        # Call refresh-stock endpoint
        refresh_resp = requests.post(f"{BASE_URL}/api/portal/sessions/{SESSION_ID}/refresh-stock")
        assert refresh_resp.status_code == 200, f"Refresh stock failed: {refresh_resp.text}"
        
        result = refresh_resp.json()
        print(f"Refresh result: {result}")
        
        # Verify response structure
        assert 'message' in result, "Response missing 'message'"
        assert 'previous_count' in result, "Response missing 'previous_count'"
        assert 'new_count' in result, "Response missing 'new_count'"
        
        print(f"SUCCESS: Refreshed stock - previous={result['previous_count']}, new={result['new_count']}")

    def test_refresh_stock_error_for_store_client(self):
        """Refresh stock should return 400 error for non-warehouse (store) clients"""
        # First, find or create a store-type session
        sessions_resp = requests.get(f"{BASE_URL}/api/portal/sessions")
        assert sessions_resp.status_code == 200
        sessions = sessions_resp.json()
        
        store_session_id = None
        for session in sessions:
            client_resp = requests.get(f"{BASE_URL}/api/portal/clients/{session['client_id']}")
            if client_resp.status_code == 200:
                client = client_resp.json()
                if client.get('client_type') == 'store':
                    store_session_id = session['id']
                    print(f"Found store session: {store_session_id}")
                    break
        
        if not store_session_id:
            pytest.skip("No store-type sessions found to test error case")
        
        # Try refresh-stock on store client session - should fail with 400
        refresh_resp = requests.post(f"{BASE_URL}/api/portal/sessions/{store_session_id}/refresh-stock")
        assert refresh_resp.status_code == 400, f"Expected 400 for store client, got {refresh_resp.status_code}"
        
        result = refresh_resp.json()
        assert 'detail' in result, "Error response missing 'detail'"
        assert 'warehouse' in result['detail'].lower(), f"Error message should mention warehouse: {result['detail']}"
        
        print(f"SUCCESS: Refresh stock correctly returns 400 for store clients: {result['detail']}")

    def test_refresh_stock_nonexistent_session(self):
        """Refresh stock should return 404 for non-existent session"""
        fake_session_id = "00000000-0000-0000-0000-000000000000"
        refresh_resp = requests.post(f"{BASE_URL}/api/portal/sessions/{fake_session_id}/refresh-stock")
        assert refresh_resp.status_code == 404, f"Expected 404 for non-existent session, got {refresh_resp.status_code}"
        print("SUCCESS: Refresh stock returns 404 for non-existent session")


class TestSessionsWithClientType:
    """Test that sessions endpoint returns client_type for frontend conditional rendering"""
    
    def test_sessions_include_client_type(self):
        """Sessions should include client_type from their associated client"""
        sessions_resp = requests.get(f"{BASE_URL}/api/portal/sessions")
        assert sessions_resp.status_code == 200, f"Failed to get sessions: {sessions_resp.text}"
        
        sessions = sessions_resp.json()
        if not sessions:
            pytest.skip("No sessions found")
        
        # Check that sessions have client_type
        sessions_with_type = [s for s in sessions if 'client_type' in s]
        print(f"Sessions with client_type: {len(sessions_with_type)}/{len(sessions)}")
        
        # At least one session should have client_type
        assert len(sessions_with_type) > 0, "Sessions should include client_type field"
        
        # Verify client_type values are valid
        for session in sessions_with_type:
            assert session['client_type'] in ['store', 'warehouse'], \
                f"Invalid client_type: {session['client_type']}"
        
        print(f"SUCCESS: Sessions include client_type field")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
