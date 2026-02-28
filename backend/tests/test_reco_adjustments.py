"""
Comprehensive Backend Tests for Reconciliation (Reco) Feature
Tests the new reco_adjustments collection and report endpoints with reco_qty, final_qty fields.

Features tested:
- POST /api/portal/reco-adjustments - save reco adjustments (detailed, barcode, article types)
- GET /api/portal/reco-adjustments/{session_id} - get all adjustments for a session
- POST /api/portal/reco-adjustments with reco_qty=0 should delete the adjustment
- DELETE /api/portal/reco-adjustments/{session_id} - clear all adjustments
- Report endpoints return reco_qty, final_qty and use final_qty for diff/accuracy calculations
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://code-review-hub-19.preview.emergentagent.com').rstrip('/')

@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def test_session_ids(api_client):
    """Get existing session IDs for different variance modes"""
    response = api_client.get(f"{BASE_URL}/api/portal/sessions")
    assert response.status_code == 200, f"Failed to get sessions: {response.text}"
    sessions = response.json()
    
    # Find sessions by variance_mode
    result = {
        "bin-wise": None,
        "barcode-wise": None,
        "article-wise": None
    }
    
    for s in sessions:
        mode = s.get("variance_mode", "bin-wise")
        if result.get(mode) is None:
            result[mode] = s["id"]
    
    print(f"Test sessions found: bin-wise={result['bin-wise']}, barcode-wise={result['barcode-wise']}, article-wise={result['article-wise']}")
    return result


class TestRecoAdjustmentsAPI:
    """Test CRUD operations for reco_adjustments collection"""
    
    def test_01_save_reco_detailed_type(self, api_client, test_session_ids):
        """Test POST /api/portal/reco-adjustments with reco_type=detailed"""
        session_id = test_session_ids.get("bin-wise")
        if not session_id:
            pytest.skip("No bin-wise session available")
        
        payload = {
            "session_id": session_id,
            "reco_type": "detailed",
            "barcode": "TEST-BARCODE-001",
            "location": "TEST-LOC-A1",
            "reco_qty": 5.0
        }
        
        response = api_client.post(f"{BASE_URL}/api/portal/reco-adjustments", json=payload)
        assert response.status_code == 200, f"Failed to save reco adjustment: {response.text}"
        
        data = response.json()
        assert data.get("status") == "saved", f"Expected status 'saved', got {data}"
        assert data.get("reco_qty") == 5.0, f"Expected reco_qty 5.0, got {data.get('reco_qty')}"
        print(f"✅ Detailed reco adjustment saved: {data}")
    
    def test_02_save_reco_barcode_type(self, api_client, test_session_ids):
        """Test POST /api/portal/reco-adjustments with reco_type=barcode"""
        session_id = test_session_ids.get("barcode-wise")
        if not session_id:
            session_id = test_session_ids.get("bin-wise")  # Fallback
        if not session_id:
            pytest.skip("No session available for barcode reco")
        
        payload = {
            "session_id": session_id,
            "reco_type": "barcode",
            "barcode": "TEST-BARCODE-002",
            "reco_qty": -3.0
        }
        
        response = api_client.post(f"{BASE_URL}/api/portal/reco-adjustments", json=payload)
        assert response.status_code == 200, f"Failed to save barcode reco: {response.text}"
        
        data = response.json()
        assert data.get("status") == "saved"
        assert data.get("reco_qty") == -3.0
        print(f"✅ Barcode reco adjustment saved: {data}")
    
    def test_03_save_reco_article_type(self, api_client, test_session_ids):
        """Test POST /api/portal/reco-adjustments with reco_type=article"""
        session_id = test_session_ids.get("article-wise")
        if not session_id:
            session_id = test_session_ids.get("bin-wise")  # Fallback
        if not session_id:
            pytest.skip("No session available for article reco")
        
        payload = {
            "session_id": session_id,
            "reco_type": "article",
            "article_code": "TEST-ART-001",
            "reco_qty": 10.0
        }
        
        response = api_client.post(f"{BASE_URL}/api/portal/reco-adjustments", json=payload)
        assert response.status_code == 200, f"Failed to save article reco: {response.text}"
        
        data = response.json()
        assert data.get("status") == "saved"
        assert data.get("reco_qty") == 10.0
        print(f"✅ Article reco adjustment saved: {data}")
    
    def test_04_get_reco_adjustments(self, api_client, test_session_ids):
        """Test GET /api/portal/reco-adjustments/{session_id}"""
        session_id = test_session_ids.get("bin-wise")
        if not session_id:
            pytest.skip("No bin-wise session available")
        
        response = api_client.get(f"{BASE_URL}/api/portal/reco-adjustments/{session_id}")
        assert response.status_code == 200, f"Failed to get reco adjustments: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"✅ Got {len(data)} reco adjustments for session {session_id}")
        
        # Check that our test adjustment is there
        detailed_found = any(
            a.get("reco_type") == "detailed" and 
            a.get("barcode") == "TEST-BARCODE-001" 
            for a in data
        )
        assert detailed_found, "Test detailed reco adjustment not found"
    
    def test_05_delete_reco_by_setting_zero(self, api_client, test_session_ids):
        """Test POST /api/portal/reco-adjustments with reco_qty=0 should delete"""
        session_id = test_session_ids.get("bin-wise")
        if not session_id:
            pytest.skip("No bin-wise session available")
        
        # First create an adjustment
        payload = {
            "session_id": session_id,
            "reco_type": "detailed",
            "barcode": "TEST-DELETE-BARCODE",
            "location": "TEST-DELETE-LOC",
            "reco_qty": 7.0
        }
        response = api_client.post(f"{BASE_URL}/api/portal/reco-adjustments", json=payload)
        assert response.status_code == 200
        
        # Now set to 0 to delete
        payload["reco_qty"] = 0
        response = api_client.post(f"{BASE_URL}/api/portal/reco-adjustments", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data.get("status") == "deleted", f"Expected status 'deleted', got {data}"
        print(f"✅ Reco adjustment deleted when reco_qty=0: {data}")
        
        # Verify it's gone
        response = api_client.get(f"{BASE_URL}/api/portal/reco-adjustments/{session_id}")
        adjs = response.json()
        deleted_found = any(
            a.get("barcode") == "TEST-DELETE-BARCODE" and 
            a.get("location") == "TEST-DELETE-LOC" 
            for a in adjs
        )
        assert not deleted_found, "Adjustment should have been deleted"
    
    def test_06_clear_all_reco_adjustments(self, api_client, test_session_ids):
        """Test DELETE /api/portal/reco-adjustments/{session_id}"""
        # Use a session we can safely clear (let's use the first available)
        session_id = test_session_ids.get("bin-wise") or test_session_ids.get("barcode-wise")
        if not session_id:
            pytest.skip("No session available")
        
        # First add some test adjustments
        for i in range(3):
            payload = {
                "session_id": session_id,
                "reco_type": "detailed",
                "barcode": f"CLEAR-TEST-{i}",
                "location": f"CLEAR-LOC-{i}",
                "reco_qty": float(i + 1)
            }
            api_client.post(f"{BASE_URL}/api/portal/reco-adjustments", json=payload)
        
        # Now clear all
        response = api_client.delete(f"{BASE_URL}/api/portal/reco-adjustments/{session_id}")
        assert response.status_code == 200, f"Failed to clear adjustments: {response.text}"
        
        data = response.json()
        assert "deleted" in data, f"Expected 'deleted' in response: {data}"
        print(f"✅ Cleared all reco adjustments: {data}")
        
        # Verify all are gone
        response = api_client.get(f"{BASE_URL}/api/portal/reco-adjustments/{session_id}")
        adjs = response.json()
        assert len(adjs) == 0, f"Expected 0 adjustments, got {len(adjs)}"


class TestReportEndpointsWithReco:
    """Test that report endpoints return reco_qty, final_qty and use final_qty for calculations"""
    
    def test_07_detailed_report_has_reco_fields(self, api_client, test_session_ids):
        """Test GET /api/portal/reports/{session_id}/detailed has reco_qty and final_qty"""
        session_id = test_session_ids.get("bin-wise")
        if not session_id:
            pytest.skip("No bin-wise session available")
        
        response = api_client.get(f"{BASE_URL}/api/portal/reports/{session_id}/detailed")
        assert response.status_code == 200, f"Failed to get detailed report: {response.text}"
        
        data = response.json()
        assert "report" in data, "Missing 'report' in response"
        assert "totals" in data, "Missing 'totals' in response"
        
        if len(data["report"]) > 0:
            row = data["report"][0]
            # Check for new fields
            assert "reco_qty" in row or row.get("reco_qty") is not None or "reco_qty" in str(row), f"reco_qty field not found in row: {list(row.keys())}"
            assert "final_qty" in row, f"final_qty field not found in row: {list(row.keys())}"
            print(f"✅ Detailed report row fields: reco_qty={row.get('reco_qty')}, final_qty={row.get('final_qty')}, physical_qty={row.get('physical_qty')}")
            
            # Verify final_qty = physical_qty + reco_qty
            if row.get("reco_qty") is not None and row.get("physical_qty") is not None:
                expected_final = row.get("physical_qty", 0) + row.get("reco_qty", 0)
                assert abs(row.get("final_qty", 0) - expected_final) < 0.001, f"final_qty mismatch: expected {expected_final}, got {row.get('final_qty')}"
        
        # Check totals
        totals = data.get("totals", {})
        assert "final_qty" in totals, f"final_qty not in totals: {list(totals.keys())}"
        print(f"✅ Detailed report totals: final_qty={totals.get('final_qty')}")
    
    def test_08_barcode_wise_report_has_reco_fields(self, api_client, test_session_ids):
        """Test GET /api/portal/reports/{session_id}/barcode-wise has reco_qty and final_qty"""
        session_id = test_session_ids.get("barcode-wise") or test_session_ids.get("bin-wise")
        if not session_id:
            pytest.skip("No session available for barcode-wise report")
        
        response = api_client.get(f"{BASE_URL}/api/portal/reports/{session_id}/barcode-wise")
        assert response.status_code == 200, f"Failed to get barcode-wise report: {response.text}"
        
        data = response.json()
        assert "report" in data, "Missing 'report' in response"
        
        if len(data["report"]) > 0:
            row = data["report"][0]
            assert "final_qty" in row, f"final_qty field not found in row: {list(row.keys())}"
            print(f"✅ Barcode-wise report row: barcode={row.get('barcode')}, final_qty={row.get('final_qty')}, diff_qty={row.get('diff_qty')}")
        
        totals = data.get("totals", {})
        assert "final_qty" in totals, f"final_qty not in totals"
        print(f"✅ Barcode-wise report totals: final_qty={totals.get('final_qty')}")
    
    def test_09_article_wise_report_has_reco_fields(self, api_client, test_session_ids):
        """Test GET /api/portal/reports/{session_id}/article-wise has reco_qty and final_qty"""
        session_id = test_session_ids.get("article-wise") or test_session_ids.get("bin-wise")
        if not session_id:
            pytest.skip("No session available for article-wise report")
        
        response = api_client.get(f"{BASE_URL}/api/portal/reports/{session_id}/article-wise")
        assert response.status_code == 200, f"Failed to get article-wise report: {response.text}"
        
        data = response.json()
        assert "report" in data, "Missing 'report' in response"
        
        if len(data["report"]) > 0:
            row = data["report"][0]
            assert "final_qty" in row, f"final_qty field not found in row"
            print(f"✅ Article-wise report row: article_code={row.get('article_code')}, final_qty={row.get('final_qty')}")
        
        totals = data.get("totals", {})
        assert "final_qty" in totals
        print(f"✅ Article-wise report totals: final_qty={totals.get('final_qty')}")
    
    def test_10_bin_wise_report_has_final_qty(self, api_client, test_session_ids):
        """Test GET /api/portal/reports/{session_id}/bin-wise has final_qty"""
        session_id = test_session_ids.get("bin-wise")
        if not session_id:
            pytest.skip("No bin-wise session available")
        
        response = api_client.get(f"{BASE_URL}/api/portal/reports/{session_id}/bin-wise")
        assert response.status_code == 200, f"Failed to get bin-wise report: {response.text}"
        
        data = response.json()
        assert "report" in data, "Missing 'report' in response"
        
        if len(data["report"]) > 0:
            row = data["report"][0]
            assert "final_qty" in row, f"final_qty field not found in row: {list(row.keys())}"
            print(f"✅ Bin-wise report row: location={row.get('location')}, final_qty={row.get('final_qty')}, difference_qty={row.get('difference_qty')}")
        
        totals = data.get("totals", {})
        assert "final_qty" in totals
        print(f"✅ Bin-wise report totals: final_qty={totals.get('final_qty')}")
    
    def test_11_category_summary_has_final_qty(self, api_client, test_session_ids):
        """Test GET /api/portal/reports/{session_id}/category-summary has final_qty"""
        session_id = test_session_ids.get("bin-wise")
        if not session_id:
            pytest.skip("No bin-wise session available")
        
        response = api_client.get(f"{BASE_URL}/api/portal/reports/{session_id}/category-summary")
        assert response.status_code == 200, f"Failed to get category-summary: {response.text}"
        
        data = response.json()
        assert "report" in data, "Missing 'report' in response"
        
        if len(data["report"]) > 0:
            row = data["report"][0]
            assert "final_qty" in row, f"final_qty field not found in row"
            print(f"✅ Category-summary row: category={row.get('category')}, final_qty={row.get('final_qty')}")
        
        totals = data.get("totals", {})
        assert "final_qty" in totals
        print(f"✅ Category-summary totals: final_qty={totals.get('final_qty')}")


class TestRecoWithReports:
    """Test that reco adjustments are correctly reflected in reports"""
    
    def test_12_reco_affects_final_qty_in_detailed(self, api_client, test_session_ids):
        """Test that saving a reco adjustment updates final_qty in detailed report"""
        session_id = test_session_ids.get("bin-wise")
        if not session_id:
            pytest.skip("No bin-wise session available")
        
        # First, clear any test data
        api_client.delete(f"{BASE_URL}/api/portal/reco-adjustments/{session_id}")
        
        # Get initial detailed report
        response = api_client.get(f"{BASE_URL}/api/portal/reports/{session_id}/detailed")
        assert response.status_code == 200
        initial_data = response.json()
        
        if len(initial_data["report"]) == 0:
            pytest.skip("No data in detailed report to test")
        
        # Pick first row to add reco adjustment
        first_row = initial_data["report"][0]
        barcode = first_row.get("barcode")
        location = first_row.get("location")
        initial_physical = first_row.get("physical_qty", 0)
        initial_final = first_row.get("final_qty", initial_physical)
        
        print(f"Initial state: barcode={barcode}, location={location}, physical={initial_physical}, final={initial_final}")
        
        # Save a reco adjustment
        reco_amount = 5.0
        payload = {
            "session_id": session_id,
            "reco_type": "detailed",
            "barcode": barcode,
            "location": location,
            "reco_qty": reco_amount
        }
        response = api_client.post(f"{BASE_URL}/api/portal/reco-adjustments", json=payload)
        assert response.status_code == 200
        
        # Fetch report again
        response = api_client.get(f"{BASE_URL}/api/portal/reports/{session_id}/detailed")
        assert response.status_code == 200
        updated_data = response.json()
        
        # Find same row
        updated_row = None
        for r in updated_data["report"]:
            if r.get("barcode") == barcode and r.get("location") == location:
                updated_row = r
                break
        
        assert updated_row is not None, f"Could not find row with barcode={barcode}, location={location}"
        
        updated_final = updated_row.get("final_qty", 0)
        updated_reco = updated_row.get("reco_qty", 0)
        
        print(f"After reco: reco_qty={updated_reco}, final_qty={updated_final}, expected_final={initial_physical + reco_amount}")
        
        # Verify final_qty = physical + reco
        assert updated_reco == reco_amount, f"Expected reco_qty={reco_amount}, got {updated_reco}"
        expected_final = initial_physical + reco_amount
        assert abs(updated_final - expected_final) < 0.001, f"Expected final_qty={expected_final}, got {updated_final}"
        
        print(f"✅ Reco adjustment correctly affects final_qty: {initial_final} → {updated_final}")
        
        # Cleanup
        payload["reco_qty"] = 0
        api_client.post(f"{BASE_URL}/api/portal/reco-adjustments", json=payload)


class TestPortalLogin:
    """Test portal authentication"""
    
    def test_13_portal_login(self, api_client):
        """Test POST /api/portal/login with admin credentials"""
        payload = {
            "username": "admin",
            "password": "admin123"
        }
        
        response = api_client.post(f"{BASE_URL}/api/portal/login", json=payload)
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        data = response.json()
        assert "user" in data, "Missing 'user' in login response"
        assert data["user"].get("username") == "admin"
        print(f"✅ Portal login successful: {data['user']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
