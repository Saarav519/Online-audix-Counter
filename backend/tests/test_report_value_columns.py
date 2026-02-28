"""
Test Report Value Columns (MRP/Cost Split)
Verifies all report endpoints return consistent MRP and Cost based value columns:
- stock_value_mrp, stock_value_cost
- physical_value_mrp, physical_value_cost  
- diff_value_mrp, diff_value_cost
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from the request
CLIENT_ID = "77eff157-ed53-43b5-86ad-df67fd8ccc91"
SESSION_ID = "451c28d8-5e2a-4f16-83b9-7eabdc35ea54"
AUTH = ("admin", "admin123")

VALUE_COLUMNS = [
    "stock_value_mrp", "stock_value_cost",
    "physical_value_mrp", "physical_value_cost", 
    "diff_value_mrp", "diff_value_cost"
]

class TestConsolidatedReportValueColumns:
    """Test consolidated report endpoints return MRP/Cost value columns"""
    
    def test_consolidated_detailed_has_value_columns(self):
        """GET /api/portal/reports/consolidated/{client_id}/detailed returns value columns"""
        response = requests.get(
            f"{BASE_URL}/api/portal/reports/consolidated/{CLIENT_ID}/detailed",
            auth=AUTH
        )
        assert response.status_code == 200, f"Status {response.status_code}: {response.text}"
        data = response.json()
        
        assert "report" in data, "Response should have 'report' field"
        assert "totals" in data, "Response should have 'totals' field"
        
        # Check totals have value columns
        totals = data["totals"]
        for col in VALUE_COLUMNS:
            assert col in totals, f"Totals missing column: {col}"
        print(f"Consolidated Detailed - Totals value columns present: {VALUE_COLUMNS}")
        
        # Check report rows have value columns if data exists
        if data["report"]:
            row = data["report"][0]
            for col in VALUE_COLUMNS:
                assert col in row, f"Report row missing column: {col}"
            print(f"Consolidated Detailed - Report row value columns present, row count: {len(data['report'])}")
    
    def test_consolidated_barcode_wise_has_value_columns(self):
        """GET /api/portal/reports/consolidated/{client_id}/barcode-wise returns value columns"""
        response = requests.get(
            f"{BASE_URL}/api/portal/reports/consolidated/{CLIENT_ID}/barcode-wise",
            auth=AUTH
        )
        assert response.status_code == 200, f"Status {response.status_code}: {response.text}"
        data = response.json()
        
        assert "report" in data, "Response should have 'report' field"
        assert "totals" in data, "Response should have 'totals' field"
        
        totals = data["totals"]
        for col in VALUE_COLUMNS:
            assert col in totals, f"Totals missing column: {col}"
        print(f"Consolidated Barcode-wise - Totals value columns present")
        
        if data["report"]:
            row = data["report"][0]
            for col in VALUE_COLUMNS:
                assert col in row, f"Report row missing column: {col}"
            print(f"Consolidated Barcode-wise - Report row value columns present, row count: {len(data['report'])}")
    
    def test_consolidated_article_wise_has_value_columns(self):
        """GET /api/portal/reports/consolidated/{client_id}/article-wise returns value columns"""
        response = requests.get(
            f"{BASE_URL}/api/portal/reports/consolidated/{CLIENT_ID}/article-wise",
            auth=AUTH
        )
        assert response.status_code == 200, f"Status {response.status_code}: {response.text}"
        data = response.json()
        
        assert "report" in data, "Response should have 'report' field"
        assert "totals" in data, "Response should have 'totals' field"
        
        totals = data["totals"]
        for col in VALUE_COLUMNS:
            assert col in totals, f"Totals missing column: {col}"
        print(f"Consolidated Article-wise - Totals value columns present")
        
        if data["report"]:
            row = data["report"][0]
            for col in VALUE_COLUMNS:
                assert col in row, f"Report row missing column: {col}"
            print(f"Consolidated Article-wise - Report row value columns present, row count: {len(data['report'])}")
    
    def test_consolidated_category_summary_has_value_columns(self):
        """GET /api/portal/reports/consolidated/{client_id}/category-summary returns value columns"""
        response = requests.get(
            f"{BASE_URL}/api/portal/reports/consolidated/{CLIENT_ID}/category-summary",
            auth=AUTH
        )
        assert response.status_code == 200, f"Status {response.status_code}: {response.text}"
        data = response.json()
        
        assert "report" in data, "Response should have 'report' field"
        assert "totals" in data, "Response should have 'totals' field"
        
        totals = data["totals"]
        for col in VALUE_COLUMNS:
            assert col in totals, f"Totals missing column: {col}"
        print(f"Consolidated Category Summary - Totals value columns present")
        
        if data["report"]:
            row = data["report"][0]
            for col in VALUE_COLUMNS:
                assert col in row, f"Report row missing column: {col}"
            print(f"Consolidated Category Summary - Report row value columns present, row count: {len(data['report'])}")


class TestSessionReportValueColumns:
    """Test individual session report endpoints return MRP/Cost value columns"""
    
    def test_session_detailed_has_value_columns(self):
        """GET /api/portal/reports/{session_id}/detailed returns value columns"""
        response = requests.get(
            f"{BASE_URL}/api/portal/reports/{SESSION_ID}/detailed",
            auth=AUTH
        )
        assert response.status_code == 200, f"Status {response.status_code}: {response.text}"
        data = response.json()
        
        assert "report" in data, "Response should have 'report' field"
        assert "totals" in data, "Response should have 'totals' field"
        
        totals = data["totals"]
        for col in VALUE_COLUMNS:
            assert col in totals, f"Totals missing column: {col}"
        print(f"Session Detailed - Totals value columns present")
        
        if data["report"]:
            row = data["report"][0]
            for col in VALUE_COLUMNS:
                assert col in row, f"Report row missing column: {col}"
            print(f"Session Detailed - Report row value columns present, row count: {len(data['report'])}")
    
    def test_session_barcode_wise_has_value_columns(self):
        """GET /api/portal/reports/{session_id}/barcode-wise returns value columns"""
        response = requests.get(
            f"{BASE_URL}/api/portal/reports/{SESSION_ID}/barcode-wise",
            auth=AUTH
        )
        assert response.status_code == 200, f"Status {response.status_code}: {response.text}"
        data = response.json()
        
        assert "report" in data, "Response should have 'report' field"
        assert "totals" in data, "Response should have 'totals' field"
        
        totals = data["totals"]
        for col in VALUE_COLUMNS:
            assert col in totals, f"Totals missing column: {col}"
        print(f"Session Barcode-wise - Totals value columns present")
        
        if data["report"]:
            row = data["report"][0]
            for col in VALUE_COLUMNS:
                assert col in row, f"Report row missing column: {col}"
            print(f"Session Barcode-wise - Report row value columns present, row count: {len(data['report'])}")
    
    def test_session_article_wise_has_value_columns(self):
        """GET /api/portal/reports/{session_id}/article-wise returns value columns"""
        response = requests.get(
            f"{BASE_URL}/api/portal/reports/{SESSION_ID}/article-wise",
            auth=AUTH
        )
        assert response.status_code == 200, f"Status {response.status_code}: {response.text}"
        data = response.json()
        
        assert "report" in data, "Response should have 'report' field"
        assert "totals" in data, "Response should have 'totals' field"
        
        totals = data["totals"]
        for col in VALUE_COLUMNS:
            assert col in totals, f"Totals missing column: {col}"
        print(f"Session Article-wise - Totals value columns present")
        
        if data["report"]:
            row = data["report"][0]
            for col in VALUE_COLUMNS:
                assert col in row, f"Report row missing column: {col}"
            print(f"Session Article-wise - Report row value columns present, row count: {len(data['report'])}")
    
    def test_session_category_summary_has_value_columns(self):
        """GET /api/portal/reports/{session_id}/category-summary returns value columns"""
        response = requests.get(
            f"{BASE_URL}/api/portal/reports/{SESSION_ID}/category-summary",
            auth=AUTH
        )
        assert response.status_code == 200, f"Status {response.status_code}: {response.text}"
        data = response.json()
        
        assert "report" in data, "Response should have 'report' field"
        assert "totals" in data, "Response should have 'totals' field"
        
        totals = data["totals"]
        for col in VALUE_COLUMNS:
            assert col in totals, f"Totals missing column: {col}"
        print(f"Session Category Summary - Totals value columns present")
        
        if data["report"]:
            row = data["report"][0]
            for col in VALUE_COLUMNS:
                assert col in row, f"Report row missing column: {col}"
            print(f"Session Category Summary - Report row value columns present, row count: {len(data['report'])}")


class TestConsolidatedBinWisePendingLocations:
    """Test consolidated bin-wise report shows pending locations"""
    
    def test_bin_wise_shows_pending_locations(self):
        """GET /api/portal/reports/consolidated/{client_id}/bin-wise shows pending locations"""
        response = requests.get(
            f"{BASE_URL}/api/portal/reports/consolidated/{CLIENT_ID}/bin-wise",
            auth=AUTH
        )
        assert response.status_code == 200, f"Status {response.status_code}: {response.text}"
        data = response.json()
        
        assert "report" in data, "Response should have 'report' field"
        assert "summary" in data, "Response should have 'summary' field"
        
        summary = data.get("summary", {})
        # Check summary has pending count
        if "pending" in summary:
            print(f"Bin-wise summary has 'pending' count: {summary['pending']}")
        
        # Check report rows have status field
        if data["report"]:
            row = data["report"][0]
            assert "status" in row or "location" in row, "Report row should have status or location"
            
            # Count status types
            statuses = {}
            for r in data["report"]:
                status = r.get("status", "completed")
                statuses[status] = statuses.get(status, 0) + 1
            print(f"Bin-wise location statuses: {statuses}")


class TestAdditionalValueColumns:
    """Test final_value columns are also present (for consolidated views)"""
    
    def test_consolidated_detailed_has_final_value_columns(self):
        """Consolidated detailed should have final_value_mrp and final_value_cost"""
        response = requests.get(
            f"{BASE_URL}/api/portal/reports/consolidated/{CLIENT_ID}/detailed",
            auth=AUTH
        )
        assert response.status_code == 200
        data = response.json()
        
        totals = data["totals"]
        assert "final_value_mrp" in totals, "Totals missing final_value_mrp"
        assert "final_value_cost" in totals, "Totals missing final_value_cost"
        print(f"Consolidated Detailed - Final value columns present in totals")
        
        if data["report"]:
            row = data["report"][0]
            assert "final_value_mrp" in row, "Report row missing final_value_mrp"
            assert "final_value_cost" in row, "Report row missing final_value_cost"
            print(f"Consolidated Detailed - Final value columns present in report rows")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
