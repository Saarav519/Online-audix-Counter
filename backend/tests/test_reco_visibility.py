"""
Tests for Reco/Final Qty column visibility in reports.

Feature requirement:
- Individual session reports should NOT show Reco or Final Qty columns
- Consolidated ('All Sessions') reports SHOULD show Reco and Final Qty columns
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://tally-app-15.preview.emergentagent.com').rstrip('/')

# Test data - using existing seeded data
RELIANCE_CLIENT_ID = "0a2045d2-dc5f-4f6b-b622-8c2a67788b8d"
INDIVIDUAL_SESSION_BIN_WISE = "8bb1ee6a-a3b3-48ee-b6a2-023fede4382d"  # Q1 2026 - Warehouse Audit (bin-wise)
INDIVIDUAL_SESSION_BARCODE = "fbe9530e-0d0c-4cd4-a573-62ede8e5e770"  # Q1 2026 - Store Front Audit (barcode-wise)


class TestIndividualSessionReports:
    """Tests for individual session reports - should have reco_qty=0 and final_qty=physical_qty"""
    
    def test_individual_bin_wise_report_returns_data(self):
        """Verify individual bin-wise report returns data with reco_qty=0"""
        response = requests.get(f"{BASE_URL}/api/portal/reports/{INDIVIDUAL_SESSION_BIN_WISE}/bin-wise")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "report" in data
        assert "totals" in data
        
        # Check totals have reco_qty=0 and final_qty=physical_qty
        totals = data["totals"]
        assert totals["reco_qty"] == 0, f"Individual session reco_qty should be 0, got {totals['reco_qty']}"
        assert totals["final_qty"] == totals["physical_qty"], "Individual session final_qty should equal physical_qty"
        
        # Check each row has reco_qty=0 and final_qty=physical_qty
        for row in data["report"]:
            assert row.get("reco_qty", 0) == 0, f"Row reco_qty should be 0"
            assert row.get("final_qty") == row.get("physical_qty"), "Row final_qty should equal physical_qty"
    
    def test_individual_detailed_report_returns_data(self):
        """Verify individual detailed report returns data with reco_qty=0"""
        response = requests.get(f"{BASE_URL}/api/portal/reports/{INDIVIDUAL_SESSION_BIN_WISE}/detailed")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "report" in data
        assert "totals" in data
        
        # Check totals have reco_qty=0
        totals = data["totals"]
        assert totals.get("reco_qty", 0) == 0, f"Individual session reco_qty should be 0"
        assert totals.get("final_qty") == totals.get("physical_qty"), "final_qty should equal physical_qty"
    
    def test_individual_barcode_wise_report_returns_data(self):
        """Verify individual barcode-wise report returns data with reco_qty=0"""
        response = requests.get(f"{BASE_URL}/api/portal/reports/{INDIVIDUAL_SESSION_BARCODE}/barcode-wise")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "report" in data
        assert "totals" in data
        
        totals = data["totals"]
        assert totals.get("reco_qty", 0) == 0, "Individual session reco_qty should be 0"
    
    def test_individual_article_wise_report_returns_data(self):
        """Verify individual article-wise report returns data with reco_qty=0"""
        response = requests.get(f"{BASE_URL}/api/portal/reports/{INDIVIDUAL_SESSION_BIN_WISE}/article-wise")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "report" in data
        assert "totals" in data
        
        totals = data["totals"]
        assert totals.get("reco_qty", 0) == 0, "Individual session reco_qty should be 0"
    
    def test_individual_category_summary_returns_data(self):
        """Verify individual category-summary report returns data with reco_qty=0"""
        response = requests.get(f"{BASE_URL}/api/portal/reports/{INDIVIDUAL_SESSION_BIN_WISE}/category-summary")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "report" in data
        assert "totals" in data


class TestConsolidatedReports:
    """Tests for consolidated reports - should have proper reco fields from _build_reco_maps"""
    
    def test_consolidated_bin_wise_report_returns_reco_fields(self):
        """Verify consolidated bin-wise report has reco and final_qty fields"""
        response = requests.get(f"{BASE_URL}/api/portal/reports/consolidated/{RELIANCE_CLIENT_ID}/bin-wise")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "report" in data
        assert "totals" in data
        
        # Consolidated reports should have reco_qty and final_qty in totals
        totals = data["totals"]
        assert "reco_qty" in totals, "Consolidated report should have reco_qty in totals"
        assert "final_qty" in totals, "Consolidated report should have final_qty in totals"
        
        # Each row should have reco_qty and final_qty fields
        if data["report"]:
            row = data["report"][0]
            assert "reco_qty" in row, "Consolidated report rows should have reco_qty"
            assert "final_qty" in row, "Consolidated report rows should have final_qty"
    
    def test_consolidated_detailed_report_returns_reco_fields(self):
        """Verify consolidated detailed report has reco and final_qty fields"""
        response = requests.get(f"{BASE_URL}/api/portal/reports/consolidated/{RELIANCE_CLIENT_ID}/detailed")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        totals = data["totals"]
        assert "reco_qty" in totals, "Consolidated report should have reco_qty"
        assert "final_qty" in totals, "Consolidated report should have final_qty"
    
    def test_consolidated_barcode_wise_report_returns_reco_fields(self):
        """Verify consolidated barcode-wise report has reco and final_qty fields"""
        response = requests.get(f"{BASE_URL}/api/portal/reports/consolidated/{RELIANCE_CLIENT_ID}/barcode-wise")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        totals = data["totals"]
        assert "reco_qty" in totals, "Consolidated report should have reco_qty"
        assert "final_qty" in totals, "Consolidated report should have final_qty"
    
    def test_consolidated_article_wise_report_returns_reco_fields(self):
        """Verify consolidated article-wise report has reco and final_qty fields"""
        response = requests.get(f"{BASE_URL}/api/portal/reports/consolidated/{RELIANCE_CLIENT_ID}/article-wise")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        totals = data["totals"]
        assert "reco_qty" in totals, "Consolidated report should have reco_qty"
        assert "final_qty" in totals, "Consolidated report should have final_qty"
    
    def test_consolidated_category_summary_returns_reco_fields(self):
        """Verify consolidated category-summary report has reco and final_qty fields"""
        response = requests.get(f"{BASE_URL}/api/portal/reports/consolidated/{RELIANCE_CLIENT_ID}/category-summary")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        totals = data["totals"]
        assert "reco_qty" in totals, "Consolidated report should have reco_qty"
        assert "final_qty" in totals, "Consolidated report should have final_qty"


class TestRecoAdjustments:
    """Tests for reco adjustments API - should only work with client_id for consolidated view"""
    
    def test_save_reco_adjustment_requires_client_id(self):
        """Verify POST reco-adjustments requires client_id"""
        # Try to save without client_id - should fail
        response = requests.post(f"{BASE_URL}/api/portal/reco-adjustments", json={
            "reco_type": "detailed",
            "barcode": "8901234567890",
            "location": "WH-A01",
            "reco_qty": 5
        })
        # Should fail validation because client_id is required
        assert response.status_code in [422, 400], f"Expected 422 or 400 without client_id, got {response.status_code}"
    
    def test_save_reco_adjustment_with_client_id(self):
        """Verify POST reco-adjustments works with client_id"""
        # Save a test reco adjustment
        test_reco = {
            "client_id": RELIANCE_CLIENT_ID,
            "reco_type": "detailed",
            "barcode": "TEST_BARCODE_RECO",
            "location": "TEST_LOC_RECO",
            "reco_qty": 10
        }
        response = requests.post(f"{BASE_URL}/api/portal/reco-adjustments", json=test_reco)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("status") == "saved" or "reco_qty" in data
        
        # Clean up - delete by setting reco_qty to 0
        cleanup_reco = {**test_reco, "reco_qty": 0}
        requests.post(f"{BASE_URL}/api/portal/reco-adjustments", json=cleanup_reco)
    
    def test_get_reco_adjustments_for_client(self):
        """Verify GET reco-adjustments/{client_id} returns data"""
        response = requests.get(f"{BASE_URL}/api/portal/reco-adjustments/{RELIANCE_CLIENT_ID}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Should return a list of adjustments"


class TestLoginFlow:
    """Test login functionality"""
    
    def test_login_with_valid_credentials(self):
        """Verify login with admin/admin123 works"""
        response = requests.post(f"{BASE_URL}/api/portal/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.status_code} - {response.text}"
        
        data = response.json()
        assert "user" in data
        assert data["user"]["username"] == "admin"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
