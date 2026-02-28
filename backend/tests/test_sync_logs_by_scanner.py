"""
Test suite for Phase 2: Scanner-grouped sync logs view
Tests GET /api/portal/sync-logs/by-scanner endpoint
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Known test data from problem statement
CLIENT_ID = "0a2045d2-dc5f-4f6b-b622-8c2a67788b8d"  # Reliance Retail


class TestByScannerEndpoint:
    """Tests for GET /api/portal/sync-logs/by-scanner"""
    
    def test_by_scanner_returns_list(self):
        """Endpoint returns a list of scanner groups"""
        response = requests.get(f"{BASE_URL}/api/portal/sync-logs/by-scanner?client_id={CLIENT_ID}")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        assert len(data) > 0, "Should have at least one scanner"
    
    def test_by_scanner_group_structure(self):
        """Each scanner group has required fields"""
        response = requests.get(f"{BASE_URL}/api/portal/sync-logs/by-scanner?client_id={CLIENT_ID}")
        assert response.status_code == 200
        data = response.json()
        
        # Check first scanner group structure
        scanner = data[0]
        assert "device_name" in scanner, "Should have device_name"
        assert "sync_count" in scanner, "Should have sync_count"
        assert "total_locations" in scanner, "Should have total_locations"
        assert "total_items" in scanner, "Should have total_items"
        assert "total_quantity" in scanner, "Should have total_quantity"
        assert "last_synced_at" in scanner, "Should have last_synced_at"
        assert "sync_dates" in scanner, "Should have sync_dates"
        assert "syncs" in scanner, "Should have syncs array"
    
    def test_by_scanner_syncs_array_structure(self):
        """Each sync entry has required fields: id, sync_date, synced_at, location_count, etc."""
        response = requests.get(f"{BASE_URL}/api/portal/sync-logs/by-scanner?client_id={CLIENT_ID}")
        assert response.status_code == 200
        data = response.json()
        
        # Find a scanner with syncs
        scanner = data[0]
        assert len(scanner["syncs"]) > 0, "Should have at least one sync entry"
        
        sync = scanner["syncs"][0]
        assert "id" in sync, "Sync entry should have id"
        assert "sync_date" in sync, "Sync entry should have sync_date"
        assert "synced_at" in sync, "Sync entry should have synced_at"
        assert "location_count" in sync, "Sync entry should have location_count"
        assert "total_items" in sync, "Sync entry should have total_items"
        assert "total_quantity" in sync, "Sync entry should have total_quantity"
        assert "session_name" in sync, "Sync entry should have session_name"
    
    def test_by_scanner_with_session_filter(self):
        """Endpoint filters by session_id when provided"""
        # First get all scanners to find a valid session_id
        response = requests.get(f"{BASE_URL}/api/portal/sync-logs/by-scanner?client_id={CLIENT_ID}")
        assert response.status_code == 200
        data = response.json()
        
        # Get a session_id from the first sync
        if len(data) > 0 and len(data[0]["syncs"]) > 0:
            session_id = data[0]["syncs"][0]["session_id"]
            
            # Now filter by session
            filtered = requests.get(f"{BASE_URL}/api/portal/sync-logs/by-scanner?client_id={CLIENT_ID}&session_id={session_id}")
            assert filtered.status_code == 200
            filtered_data = filtered.json()
            
            # All syncs should be from this session
            for scanner in filtered_data:
                for sync in scanner["syncs"]:
                    assert sync["session_id"] == session_id, f"All syncs should be from session {session_id}"
    
    def test_by_scanner_sync_count_matches(self):
        """sync_count should match the number of syncs in the array"""
        response = requests.get(f"{BASE_URL}/api/portal/sync-logs/by-scanner?client_id={CLIENT_ID}")
        assert response.status_code == 200
        data = response.json()
        
        for scanner in data:
            assert scanner["sync_count"] == len(scanner["syncs"]), \
                f"Scanner {scanner['device_name']}: sync_count ({scanner['sync_count']}) should match syncs array length ({len(scanner['syncs'])})"
    
    def test_by_scanner_totals_aggregation(self):
        """Total locations/items/quantity should be sum of individual syncs"""
        response = requests.get(f"{BASE_URL}/api/portal/sync-logs/by-scanner?client_id={CLIENT_ID}")
        assert response.status_code == 200
        data = response.json()
        
        for scanner in data:
            total_locations = sum(s["location_count"] for s in scanner["syncs"])
            total_items = sum(s["total_items"] for s in scanner["syncs"])
            total_quantity = sum(s["total_quantity"] for s in scanner["syncs"])
            
            assert scanner["total_locations"] == total_locations, \
                f"Scanner {scanner['device_name']}: total_locations mismatch"
            assert scanner["total_items"] == total_items, \
                f"Scanner {scanner['device_name']}: total_items mismatch"
            assert scanner["total_quantity"] == total_quantity, \
                f"Scanner {scanner['device_name']}: total_quantity mismatch"
    
    def test_by_scanner_without_client_id(self):
        """Endpoint works without client_id (returns all clients' logs)"""
        response = requests.get(f"{BASE_URL}/api/portal/sync-logs/by-scanner")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)


class TestSingleLogExport:
    """Tests for GET /api/portal/sync-logs/{log_id}/export"""
    
    def test_export_single_log_csv(self):
        """Export endpoint returns CSV for a specific sync log"""
        # First get a log ID
        response = requests.get(f"{BASE_URL}/api/portal/sync-logs/by-scanner?client_id={CLIENT_ID}")
        assert response.status_code == 200
        data = response.json()
        
        if len(data) > 0 and len(data[0]["syncs"]) > 0:
            log_id = data[0]["syncs"][0]["id"]
            
            # Export the log
            export_response = requests.get(f"{BASE_URL}/api/portal/sync-logs/{log_id}/export")
            assert export_response.status_code == 200
            
            # Check content type
            content_type = export_response.headers.get("content-type", "")
            assert "text/csv" in content_type, f"Should return CSV, got {content_type}"
            
            # Check content disposition header
            disposition = export_response.headers.get("content-disposition", "")
            assert "attachment" in disposition, "Should have attachment disposition"
            assert ".csv" in disposition, "Filename should end with .csv"
            
            # Check CSV content
            csv_content = export_response.text
            lines = csv_content.strip().split("\n")
            assert len(lines) >= 1, "CSV should have at least header row"
            
            # Check header
            header = lines[0]
            assert "Log ID" in header, "Header should contain Log ID"
            assert "Device" in header, "Header should contain Device"
            assert "Location" in header, "Header should contain Location"
            assert "Barcode" in header, "Header should contain Barcode"
    
    def test_export_nonexistent_log(self):
        """Export endpoint returns 404 for nonexistent log"""
        response = requests.get(f"{BASE_URL}/api/portal/sync-logs/nonexistent-id/export")
        assert response.status_code == 404


class TestPreviousFeatures:
    """Regression tests: verify previous features still work"""
    
    def test_inbox_summary_works(self):
        """GET /api/portal/sync-inbox/summary still works"""
        # Get a session ID first
        sessions = requests.get(f"{BASE_URL}/api/portal/sessions?client_id={CLIENT_ID}")
        if sessions.status_code == 200 and len(sessions.json()) > 0:
            session_id = sessions.json()[0]["id"]
            response = requests.get(f"{BASE_URL}/api/portal/sync-inbox/summary?session_id={session_id}")
            assert response.status_code == 200
            data = response.json()
            assert "total_pending" in data
            assert "scanners" in data
    
    def test_forward_batches_works(self):
        """GET /api/portal/forward-batches still works"""
        sessions = requests.get(f"{BASE_URL}/api/portal/sessions?client_id={CLIENT_ID}")
        if sessions.status_code == 200 and len(sessions.json()) > 0:
            session_id = sessions.json()[0]["id"]
            response = requests.get(f"{BASE_URL}/api/portal/forward-batches?session_id={session_id}")
            assert response.status_code == 200
            assert isinstance(response.json(), list)
    
    def test_grouped_logs_fallback_works(self):
        """GET /api/portal/sync-logs/grouped still works (fallback view)"""
        response = requests.get(f"{BASE_URL}/api/portal/sync-logs/grouped")
        assert response.status_code == 200
        assert isinstance(response.json(), list)
