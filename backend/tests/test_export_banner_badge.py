"""
Tests for Phase 3 features:
1. Export All Session Logs endpoint (GET /api/portal/sync-logs/export with client_id and optional session_id)
2. Inbox pending count for badge display
3. Backend support for pending forward banner (sync-inbox summary)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test data constants
CLIENT_ID = "0a2045d2-dc5f-4f6b-b622-8c2a67788b8d"
SESSION_ID = "8bb1ee6a-a3b3-48ee-b6a2-023fede4382d"


class TestExportAllLogsEndpoint:
    """Tests for GET /api/portal/sync-logs/export endpoint"""
    
    def test_export_all_logs_requires_client_id(self):
        """Export endpoint requires client_id parameter"""
        response = requests.get(f"{BASE_URL}/api/portal/sync-logs/export")
        # Should return 422 (missing required param) or 404 (no data)
        assert response.status_code in [422, 400], f"Expected 422/400, got {response.status_code}"
    
    def test_export_all_logs_with_client_id_only(self):
        """Export all logs for a client (no date/session filter)"""
        response = requests.get(f"{BASE_URL}/api/portal/sync-logs/export?client_id={CLIENT_ID}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        # Check content type is CSV
        content_type = response.headers.get('Content-Type', '')
        assert 'text/csv' in content_type, f"Expected text/csv, got {content_type}"
        
        # Check Content-Disposition header (filename)
        content_disp = response.headers.get('Content-Disposition', '')
        assert 'attachment' in content_disp, f"Expected attachment header, got {content_disp}"
        assert 'sync_logs' in content_disp, f"Expected sync_logs in filename, got {content_disp}"
        assert '_all' in content_disp, f"Expected '_all' suffix in filename for all logs export"
        
        # Check CSV content has headers
        content = response.text
        assert 'Log ID' in content, "CSV should have Log ID column"
        assert 'Device' in content, "CSV should have Device column"
        assert 'Barcode' in content, "CSV should have Barcode column"
    
    def test_export_logs_with_session_id_filter(self):
        """Export logs filtered by session_id"""
        response = requests.get(
            f"{BASE_URL}/api/portal/sync-logs/export?client_id={CLIENT_ID}&session_id={SESSION_ID}"
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        content_type = response.headers.get('Content-Type', '')
        assert 'text/csv' in content_type, f"Expected text/csv, got {content_type}"
        
        # Check filename suffix - should indicate session filter
        content_disp = response.headers.get('Content-Disposition', '')
        assert 'attachment' in content_disp, f"Expected attachment header"
    
    def test_export_logs_with_date_filter(self):
        """Export logs filtered by specific date"""
        response = requests.get(
            f"{BASE_URL}/api/portal/sync-logs/export?client_id={CLIENT_ID}&date=2026-02-22"
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        content_type = response.headers.get('Content-Type', '')
        assert 'text/csv' in content_type, f"Expected text/csv, got {content_type}"
    
    def test_export_nonexistent_client_returns_404(self):
        """Export for non-existent client returns 404"""
        response = requests.get(
            f"{BASE_URL}/api/portal/sync-logs/export?client_id=nonexistent-client-id-12345"
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"


class TestInboxBadgeCount:
    """Tests for inbox summary that powers the badge count on Inbox tab"""
    
    def test_inbox_summary_returns_pending_count(self):
        """Inbox summary returns total_pending for badge display"""
        response = requests.get(
            f"{BASE_URL}/api/portal/sync-inbox/summary?session_id={SESSION_ID}"
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert 'total_pending' in data, "Response should have total_pending field"
        assert 'scanner_count' in data, "Response should have scanner_count field"
        assert isinstance(data['total_pending'], int), "total_pending should be integer"
        assert isinstance(data['scanner_count'], int), "scanner_count should be integer"
    
    def test_inbox_summary_returns_scanner_details(self):
        """Inbox summary returns scanner details for banner display"""
        response = requests.get(
            f"{BASE_URL}/api/portal/sync-inbox/summary?session_id={SESSION_ID}"
        )
        assert response.status_code == 200
        
        data = response.json()
        assert 'scanners' in data, "Response should have scanners array"
        
        if data['total_pending'] > 0:
            # If there's pending data, scanners should have details
            assert len(data['scanners']) > 0, "Should have scanner details when pending > 0"
            scanner = data['scanners'][0]
            assert 'device_name' in scanner, "Scanner should have device_name"
            assert 'location_count' in scanner, "Scanner should have location_count"
            assert 'total_items' in scanner, "Scanner should have total_items"
            assert 'total_quantity' in scanner, "Scanner should have total_quantity"


class TestPendingBannerData:
    """Tests for data that powers the pending forward banner on tabs"""
    
    def test_inbox_summary_provides_banner_info(self):
        """Inbox summary provides all info needed for the pending banner"""
        response = requests.get(
            f"{BASE_URL}/api/portal/sync-inbox/summary?session_id={SESSION_ID}"
        )
        assert response.status_code == 200
        
        data = response.json()
        # Banner needs: pending count, scanner count
        assert 'total_pending' in data, "Need total_pending for banner text"
        assert 'scanner_count' in data, "Need scanner_count for banner text"
        
        # Banner text: "{total_pending} location(s) from {scanner_count} scanner(s) waiting"
        print(f"Banner data: {data['total_pending']} locations from {data['scanner_count']} scanners")


class TestForwardToVarianceButton:
    """Tests for Forward All to Variance endpoint"""
    
    def test_forward_endpoint_exists(self):
        """Forward to variance endpoint exists and responds correctly"""
        # Test with empty payload to check endpoint exists
        response = requests.post(
            f"{BASE_URL}/api/portal/forward-to-variance",
            json={
                "session_id": SESSION_ID,
                "client_id": CLIENT_ID,
                "forwarded_by": "test_admin"
            }
        )
        # Should be 200 (success) or 400 (no pending data)
        assert response.status_code in [200, 400], f"Expected 200/400, got {response.status_code}"
        
        data = response.json()
        if response.status_code == 400:
            assert 'detail' in data, "Error response should have detail"
        else:
            assert 'locations_forwarded' in data, "Success response should have locations_forwarded"
            assert 'conflicts_created' in data, "Success response should have conflicts_created"
            assert 'batch_id' in data, "Success response should have batch_id"


class TestSyncToCreatePendingData:
    """Test sync endpoint to ensure we can create pending inbox data"""
    
    def test_sync_creates_pending_inbox_data(self):
        """Sync creates pending data in inbox for testing banner/badge"""
        response = requests.post(
            f"{BASE_URL}/api/sync/",
            json={
                "device_name": "TEST_Banner_Device",
                "sync_password": "test123",
                "client_id": CLIENT_ID,
                "session_id": SESSION_ID,
                "locations": [
                    {
                        "id": "LOC-BANNER-TEST-001",
                        "name": "Banner Test Location",
                        "items": [
                            {"barcode": "BANNER001", "productName": "Banner Test Product", "quantity": 1, "scannedAt": "2026-01-15T10:00:00Z"}
                        ]
                    }
                ]
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data['locations_synced'] > 0, "Should have synced locations"
        
        # Verify inbox has pending data
        inbox_response = requests.get(
            f"{BASE_URL}/api/portal/sync-inbox/summary?session_id={SESSION_ID}"
        )
        assert inbox_response.status_code == 200
        inbox_data = inbox_response.json()
        assert inbox_data['total_pending'] > 0, "Should have pending data after sync"
        print(f"After sync: {inbox_data['total_pending']} pending locations")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
