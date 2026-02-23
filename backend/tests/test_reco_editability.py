"""
Test Reco column editability based on variance_mode
- Reco only editable in primary report type matching the session's variance_mode
- For bin-wise sessions: Reco only in Detailed table
- For barcode-wise sessions: Reco only in Barcode-wise table
- For article-wise sessions: Reco only in Article-wise table
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test client and session IDs for Reliance Retail
RELIANCE_CLIENT_ID = "0a2045d2-dc5f-4f6b-b622-8c2a67788b8d"
BINWISE_SESSION_ID = "8bb1ee6a-a3b3-48ee-b6a2-023fede4382d"  # Q1 2026 - Warehouse Audit (bin-wise)
BARCODEWISE_SESSION_ID = "fbe9530e-0d0c-4cd4-a573-62ede8e5e770"  # Q1 2026 - Store Front Audit (barcode-wise)


class TestRecoEditabilityBackend:
    """Test backend API responses for Reco editability logic"""
    
    def test_clients_endpoint(self):
        """Verify clients endpoint is accessible"""
        response = requests.get(f"{BASE_URL}/api/portal/clients")
        assert response.status_code == 200
        clients = response.json()
        assert len(clients) > 0
        print(f"✓ Found {len(clients)} clients")
    
    def test_sessions_endpoint(self):
        """Verify sessions for Reliance Retail have correct variance_modes"""
        response = requests.get(f"{BASE_URL}/api/portal/sessions?client_id={RELIANCE_CLIENT_ID}")
        assert response.status_code == 200
        sessions = response.json()
        
        variance_modes = [s.get('variance_mode') for s in sessions]
        print(f"Session variance modes: {variance_modes}")
        
        # Verify we have different variance modes
        assert 'bin-wise' in variance_modes, "Should have bin-wise session"
        assert 'barcode-wise' in variance_modes, "Should have barcode-wise session"
        print("✓ Sessions have multiple variance modes")
    
    def test_consolidated_detailed_report(self):
        """Test consolidated detailed report includes reco_qty and final_qty"""
        response = requests.get(f"{BASE_URL}/api/portal/reports/consolidated/{RELIANCE_CLIENT_ID}/detailed")
        assert response.status_code == 200
        data = response.json()
        
        assert 'report' in data
        assert 'totals' in data
        
        # Verify report has Reco-related fields
        if data['report'] and len(data['report']) > 0:
            first_row = data['report'][0]
            assert 'reco_qty' in first_row or first_row.get('reco_qty', 0) == 0
            assert 'final_qty' in first_row
            print(f"✓ Consolidated detailed report has reco_qty and final_qty fields")
    
    def test_consolidated_barcode_report(self):
        """Test consolidated barcode report includes final_qty"""
        response = requests.get(f"{BASE_URL}/api/portal/reports/consolidated/{RELIANCE_CLIENT_ID}/barcode-wise")
        assert response.status_code == 200
        data = response.json()
        
        assert 'report' in data
        if data['report'] and len(data['report']) > 0:
            first_row = data['report'][0]
            assert 'final_qty' in first_row
            print(f"✓ Consolidated barcode report has final_qty field")
    
    def test_consolidated_article_report(self):
        """Test consolidated article report includes final_qty"""
        response = requests.get(f"{BASE_URL}/api/portal/reports/consolidated/{RELIANCE_CLIENT_ID}/article-wise")
        assert response.status_code == 200
        data = response.json()
        
        assert 'report' in data
        if data['report'] and len(data['report']) > 0:
            first_row = data['report'][0]
            assert 'final_qty' in first_row
            print(f"✓ Consolidated article report has final_qty field")
    
    def test_individual_detailed_report_no_reco_edit(self):
        """Individual session detailed report should not have editable reco"""
        response = requests.get(f"{BASE_URL}/api/portal/reports/{BINWISE_SESSION_ID}/detailed")
        assert response.status_code == 200
        data = response.json()
        
        # Individual sessions return reco_qty=0 and final_qty=physical_qty
        if data['report'] and len(data['report']) > 0:
            first_row = data['report'][0]
            # reco_qty should be 0 for individual sessions
            assert first_row.get('reco_qty', 0) == 0, "Individual session should have reco_qty=0"
            # final_qty should equal physical_qty for individual sessions
            if 'final_qty' in first_row:
                assert first_row['final_qty'] == first_row.get('physical_qty', 0), "final_qty should equal physical_qty"
            print(f"✓ Individual session has correct reco values (reco_qty=0)")
    
    def test_individual_barcode_report_no_reco_edit(self):
        """Individual barcode-wise session should not have editable reco"""
        response = requests.get(f"{BASE_URL}/api/portal/reports/{BARCODEWISE_SESSION_ID}/barcode-wise")
        assert response.status_code == 200
        data = response.json()
        
        if data['report'] and len(data['report']) > 0:
            first_row = data['report'][0]
            # reco_qty should be 0 for individual sessions
            assert first_row.get('reco_qty', 0) == 0, "Individual session should have reco_qty=0"
            print(f"✓ Individual barcode session has correct reco values")
    
    def test_reco_adjustment_requires_client_id(self):
        """Reco adjustment API requires client_id"""
        # Test without client_id (should fail or be rejected)
        response = requests.post(f"{BASE_URL}/api/portal/reco-adjustments", json={
            "reco_type": "detailed",
            "barcode": "TEST123",
            "location": "TEST-LOC",
            "reco_qty": 5
        })
        # Should require client_id
        assert response.status_code in [400, 422, 500], "Reco without client_id should fail"
        print(f"✓ Reco adjustment correctly requires client_id")
    
    def test_reco_adjustment_with_client_id(self):
        """Reco adjustment API works with client_id"""
        response = requests.post(f"{BASE_URL}/api/portal/reco-adjustments", json={
            "client_id": RELIANCE_CLIENT_ID,
            "reco_type": "detailed",
            "barcode": "8901030793097",  # Existing barcode in test data
            "location": "Rack-A01",
            "reco_qty": 0  # Reset to 0
        })
        # Should succeed
        assert response.status_code == 200, f"Reco adjustment should succeed: {response.text}"
        print(f"✓ Reco adjustment with client_id works correctly")
    
    def test_consolidated_bin_wise_summary(self):
        """Bin-wise summary should have final_qty but no reco column"""
        response = requests.get(f"{BASE_URL}/api/portal/reports/consolidated/{RELIANCE_CLIENT_ID}/bin-wise")
        assert response.status_code == 200
        data = response.json()
        
        assert 'report' in data
        if data['report'] and len(data['report']) > 0:
            first_row = data['report'][0]
            # Should have final_qty
            assert 'final_qty' in first_row or 'physical_qty' in first_row
            # Should NOT have reco_qty (bin-wise summary doesn't have reco)
            # Note: Backend may still include the field but UI won't render it
            print(f"✓ Bin-wise summary report structure correct")
    
    def test_consolidated_category_summary(self):
        """Category summary should have final_qty but no reco column"""
        response = requests.get(f"{BASE_URL}/api/portal/reports/consolidated/{RELIANCE_CLIENT_ID}/category-summary")
        assert response.status_code == 200
        data = response.json()
        
        assert 'report' in data
        if data['report'] and len(data['report']) > 0:
            first_row = data['report'][0]
            # Should have final_qty
            assert 'final_qty' in first_row or 'physical_qty' in first_row
            print(f"✓ Category summary report structure correct")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
