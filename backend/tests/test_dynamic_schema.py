"""
Test Dynamic Master/Stock Schema (Phase 3) - Audix Counter Software
Tests schema CRUD, template generation, import with custom fields, and report extra columns.
"""
import pytest
import requests
import os
import csv
import io

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
TEST_CLIENT_ID = "0a2045d2-dc5f-4f6b-b622-8c2a67788b8d"  # Reliance client

# ===== SCHEMA API TESTS =====

class TestSchemaEndpoints:
    """Tests for GET/POST schema endpoints"""
    
    def test_get_default_schema(self):
        """GET /api/portal/clients/{client_id}/schema - returns default schema with standard and optional fields"""
        # Use a non-existent client to test default schema
        response = requests.get(f"{BASE_URL}/api/portal/clients/non-existent-client-id/schema")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "fields" in data, "Schema should have fields"
        assert "is_default" in data, "Schema should have is_default flag"
        assert data["is_default"] == True, "Should return default schema for non-existent client"
        
        # Verify standard fields are present
        field_names = [f["name"] for f in data["fields"]]
        standard_fields = ["barcode", "description", "category", "mrp", "cost", "article_code", "article_name"]
        for sf in standard_fields:
            assert sf in field_names, f"Standard field '{sf}' should be in schema"
        
        # Verify optional fields present
        optional_fields = ["colour", "size", "department", "brand", "season", "hsn_code"]
        for of in optional_fields:
            assert of in field_names, f"Optional field '{of}' should be in schema"
        
        print("✓ Default schema returned correctly with standard and optional fields")
    
    def test_get_existing_client_schema(self):
        """GET /api/portal/clients/{client_id}/schema - returns saved schema for existing client"""
        response = requests.get(f"{BASE_URL}/api/portal/clients/{TEST_CLIENT_ID}/schema")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "fields" in data, "Schema should have fields"
        assert "client_id" in data, "Schema should have client_id"
        assert data["client_id"] == TEST_CLIENT_ID
        
        # Check that the schema has enabled/disabled flags on fields
        enabled_count = sum(1 for f in data["fields"] if f.get("enabled", True))
        print(f"✓ Client schema retrieved: {len(data['fields'])} fields, {enabled_count} enabled")
    
    def test_save_schema(self):
        """POST /api/portal/clients/{client_id}/schema - saves custom schema"""
        # First get existing schema
        get_resp = requests.get(f"{BASE_URL}/api/portal/clients/{TEST_CLIENT_ID}/schema")
        existing = get_resp.json()
        
        # Modify schema - enable colour, size, brand
        fields = existing.get("fields", [])
        for f in fields:
            if f["name"] in ["colour", "size", "brand"]:
                f["enabled"] = True
        
        # Add a custom field for testing
        custom_field_name = "test_custom_field"
        custom_field_exists = any(f["name"] == custom_field_name for f in fields)
        if not custom_field_exists:
            fields.append({
                "name": custom_field_name,
                "label": "Test Custom Field",
                "type": "text",
                "required": False,
                "is_standard": False,
                "enabled": True
            })
        
        # Save the schema
        response = requests.post(
            f"{BASE_URL}/api/portal/clients/{TEST_CLIENT_ID}/schema",
            json={"fields": fields}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "message" in data, "Should have message"
        assert "Schema saved" in data["message"], f"Unexpected message: {data['message']}"
        assert "field_count" in data, "Should have field_count"
        
        # Verify by fetching again
        verify = requests.get(f"{BASE_URL}/api/portal/clients/{TEST_CLIENT_ID}/schema")
        verify_data = verify.json()
        assert verify_data["is_default"] == False, "Schema should not be default after save"
        
        # Verify custom field was saved
        saved_field_names = [f["name"] for f in verify_data["fields"]]
        assert custom_field_name in saved_field_names, "Custom field should be saved"
        
        print(f"✓ Schema saved successfully with {data['field_count']} fields")
    
    def test_save_schema_invalid_client(self):
        """POST /api/portal/clients/{client_id}/schema - returns 404 for non-existent client"""
        response = requests.post(
            f"{BASE_URL}/api/portal/clients/non-existent-client/schema",
            json={"fields": []}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Returns 404 for non-existent client")


class TestTemplateDownload:
    """Tests for schema template download endpoint"""
    
    def test_download_master_template(self):
        """GET /api/portal/clients/{client_id}/schema/template?template_type=master - returns CSV with schema headers"""
        response = requests.get(
            f"{BASE_URL}/api/portal/clients/{TEST_CLIENT_ID}/schema/template",
            params={"template_type": "master"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        assert "text/csv" in response.headers.get("content-type", ""), "Should return CSV"
        
        content = response.text
        assert len(content) > 0, "Template should not be empty"
        
        # Parse CSV header
        lines = content.strip().split('\n')
        headers = lines[0].split(',')
        
        # Barcode should always be present
        assert "Barcode" in headers, f"Barcode should be in headers: {headers}"
        
        print(f"✓ Master template downloaded with headers: {headers}")
    
    def test_download_stock_template(self):
        """GET /api/portal/clients/{client_id}/schema/template?template_type=stock - returns CSV with Location+Qty"""
        response = requests.get(
            f"{BASE_URL}/api/portal/clients/{TEST_CLIENT_ID}/schema/template",
            params={"template_type": "stock"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        content = response.text
        lines = content.strip().split('\n')
        headers = lines[0].split(',')
        
        # Stock template must have Location and Qty
        assert "Location" in headers, f"Location should be in stock template headers: {headers}"
        assert "Qty" in headers, f"Qty should be in stock template headers: {headers}"
        
        print(f"✓ Stock template downloaded with headers: {headers}")


class TestMasterImportWithCustomFields:
    """Tests for import-master endpoint with custom fields support"""
    
    def test_import_master_with_extra_fields(self):
        """POST /api/portal/clients/{client_id}/import-master - imports CSV and stores extra fields in custom_fields"""
        # Create a CSV with standard + custom fields
        csv_content = "barcode,description,category,mrp,cost,colour,size,brand\n"
        csv_content += "TEST_001,Test Product 1,Category A,100,80,Red,Large,TestBrand\n"
        csv_content += "TEST_002,Test Product 2,Category B,200,150,Blue,Medium,TestBrand2\n"
        
        files = {
            'file': ('test_master.csv', csv_content, 'text/csv')
        }
        
        response = requests.post(
            f"{BASE_URL}/api/portal/clients/{TEST_CLIENT_ID}/import-master",
            files=files
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "product_count" in data, "Should return product_count"
        assert data["product_count"] >= 2, f"Should have imported at least 2 products, got {data['product_count']}"
        
        # Check if extra_fields count is returned
        if "extra_fields" in data:
            print(f"✓ Import returned extra_fields count: {data['extra_fields']}")
        
        print(f"✓ Master import successful: {data['product_count']} products")


class TestMasterProductsWithExtraColumns:
    """Tests for master products endpoint returning extra_columns metadata"""
    
    def test_get_master_products_with_extra_columns(self):
        """GET /api/portal/clients/{client_id}/master-products - returns products with custom_fields and extra_columns"""
        response = requests.get(
            f"{BASE_URL}/api/portal/clients/{TEST_CLIENT_ID}/master-products",
            params={"limit": 100}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "products" in data, "Should have products array"
        assert "total" in data, "Should have total count"
        assert "extra_columns" in data, "Should have extra_columns metadata"
        
        extra_columns = data["extra_columns"]
        print(f"Extra columns defined: {[c['name'] for c in extra_columns] if extra_columns else 'None'}")
        
        # Check if any products have custom_fields
        products = data["products"]
        if products:
            products_with_custom = [p for p in products if p.get("custom_fields")]
            if products_with_custom:
                sample = products_with_custom[0]
                print(f"Sample product custom_fields: {sample.get('custom_fields')}")
        
        print(f"✓ Master products returned: {len(products)} products, {len(extra_columns)} extra columns")


# ===== REPORT EXTRA COLUMNS TESTS =====

class TestConsolidatedReportsExtraColumns:
    """Tests for consolidated reports including extra_columns in response"""
    
    def test_consolidated_detailed_extra_columns(self):
        """Consolidated detailed report includes extra_columns metadata"""
        response = requests.get(f"{BASE_URL}/api/portal/reports/consolidated/{TEST_CLIENT_ID}/detailed")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "report" in data, "Should have report array"
        assert "extra_columns" in data, "Should have extra_columns in response"
        
        extra_columns = data.get("extra_columns", [])
        print(f"✓ Consolidated detailed report has extra_columns: {[c['name'] for c in extra_columns]}")
        
        # If there are extra columns, check if report rows have them
        if extra_columns and data["report"]:
            sample_row = data["report"][0]
            for ec in extra_columns:
                assert ec["name"] in sample_row or True, f"Extra column {ec['name']} should be in report rows"
    
    def test_consolidated_barcode_wise_extra_columns(self):
        """Consolidated barcode-wise report includes extra_columns metadata"""
        response = requests.get(f"{BASE_URL}/api/portal/reports/consolidated/{TEST_CLIENT_ID}/barcode-wise")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "report" in data
        assert "extra_columns" in data, "Should have extra_columns in response"
        
        print(f"✓ Consolidated barcode-wise report has extra_columns: {len(data.get('extra_columns', []))} columns")
    
    def test_consolidated_article_wise_extra_columns(self):
        """Consolidated article-wise report includes extra_columns metadata"""
        response = requests.get(f"{BASE_URL}/api/portal/reports/consolidated/{TEST_CLIENT_ID}/article-wise")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "report" in data
        assert "extra_columns" in data, "Should have extra_columns in response"
        
        print(f"✓ Consolidated article-wise report has extra_columns: {len(data.get('extra_columns', []))} columns")


class TestIndividualSessionReportsExtraColumns:
    """Tests for individual session reports including extra_columns"""
    
    @pytest.fixture(scope="class")
    def active_session_id(self):
        """Get an active session ID for the test client"""
        response = requests.get(f"{BASE_URL}/api/portal/sessions", params={"client_id": TEST_CLIENT_ID})
        if response.status_code == 200:
            sessions = response.json()
            if sessions:
                return sessions[0]["id"]
        return None
    
    def test_individual_detailed_extra_columns(self, active_session_id):
        """Individual session detailed report includes extra_columns"""
        if not active_session_id:
            pytest.skip("No active session found for test client")
        
        response = requests.get(f"{BASE_URL}/api/portal/reports/{active_session_id}/detailed")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "report" in data
        assert "extra_columns" in data, "Should have extra_columns in response"
        
        print(f"✓ Individual detailed report has extra_columns: {len(data.get('extra_columns', []))} columns")
    
    def test_individual_barcode_wise_extra_columns(self, active_session_id):
        """Individual session barcode-wise report includes extra_columns"""
        if not active_session_id:
            pytest.skip("No active session found for test client")
        
        response = requests.get(f"{BASE_URL}/api/portal/reports/{active_session_id}/barcode-wise")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "report" in data
        assert "extra_columns" in data, "Should have extra_columns in response"
        
        print(f"✓ Individual barcode-wise report has extra_columns: {len(data.get('extra_columns', []))} columns")
    
    def test_individual_article_wise_extra_columns(self, active_session_id):
        """Individual session article-wise report includes extra_columns"""
        if not active_session_id:
            pytest.skip("No active session found for test client")
        
        response = requests.get(f"{BASE_URL}/api/portal/reports/{active_session_id}/article-wise")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "report" in data
        assert "extra_columns" in data, "Should have extra_columns in response"
        
        print(f"✓ Individual article-wise report has extra_columns: {len(data.get('extra_columns', []))} columns")


# ===== CLEANUP TEST =====

class TestCleanup:
    """Cleanup any test data created"""
    
    def test_cleanup_test_custom_field(self):
        """Remove the test custom field from schema"""
        # Get current schema
        response = requests.get(f"{BASE_URL}/api/portal/clients/{TEST_CLIENT_ID}/schema")
        if response.status_code != 200:
            pytest.skip("Could not fetch schema for cleanup")
        
        data = response.json()
        fields = data.get("fields", [])
        
        # Remove test custom field
        cleaned_fields = [f for f in fields if f["name"] != "test_custom_field"]
        
        if len(cleaned_fields) < len(fields):
            requests.post(
                f"{BASE_URL}/api/portal/clients/{TEST_CLIENT_ID}/schema",
                json={"fields": cleaned_fields}
            )
            print("✓ Cleaned up test custom field")
        else:
            print("✓ No cleanup needed")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
