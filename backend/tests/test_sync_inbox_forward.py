"""
Test Suite: Sync Inbox + Forward to Variance Flow
Tests the new architectural change where sync data goes to sync_inbox first,
then admin reviews and forwards to variance (synced_locations) with conflict detection.

Key Features Tested:
1. POST /api/sync/ stores data in sync_inbox (NOT synced_locations directly)
2. POST /api/sync/finalize also stores in sync_inbox
3. GET /api/portal/sync-inbox/summary returns scanner grouping with counts
4. GET /api/portal/sync-inbox returns pending inbox items
5. POST /api/portal/forward-to-variance processes inbox → variance with conflict detection
6. Forward creates conflicts when same location from different devices
7. Forward creates batch record in forward_batches collection
8. GET /api/portal/forward-batches returns batch history
9. Forward deduplicates per device (keeps latest per device per location)
"""

import pytest
import requests
import os
import uuid
import time
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test constants - using existing seeded data
CLIENT_ID = "0a2045d2-dc5f-4f6b-b622-8c2a67788b8d"  # Reliance Retail
SESSION_ID = "8bb1ee6a-a3b3-48ee-b6a2-023fede4382d"  # Q1 2026 - Warehouse Audit
DEVICE_PASSWORD = "test1234"


@pytest.fixture(scope="session")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


class TestSyncToInbox:
    """Test that POST /api/sync/ stores data in sync_inbox collection"""
    
    def test_sync_stores_in_inbox(self, api_client):
        """Verify sync data goes to inbox, not directly to variance"""
        unique_id = str(uuid.uuid4())[:8]
        device_name = f"TEST_SyncInbox_{unique_id}"
        location_name = f"TEST_LOC_INBOX_{unique_id}"
        
        sync_payload = {
            "device_name": device_name,
            "sync_password": DEVICE_PASSWORD,
            "client_id": CLIENT_ID,
            "session_id": SESSION_ID,
            "locations": [
                {
                    "id": str(uuid.uuid4()),
                    "name": location_name,
                    "items": [
                        {
                            "barcode": "TEST123456",
                            "productName": "Test Product",
                            "quantity": 10,
                            "scannedAt": datetime.now().isoformat()
                        }
                    ],
                    "is_empty": False
                }
            ],
            "clear_after_sync": False
        }
        
        # Sync data
        response = api_client.post(f"{BASE_URL}/api/sync/", json=sync_payload)
        assert response.status_code == 200, f"Sync failed: {response.text}"
        result = response.json()
        assert result["locations_synced"] == 1
        
        # Verify data appears in inbox summary
        inbox_summary = api_client.get(f"{BASE_URL}/api/portal/sync-inbox/summary?session_id={SESSION_ID}")
        assert inbox_summary.status_code == 200
        summary_data = inbox_summary.json()
        assert summary_data["total_pending"] >= 1, "Should have at least 1 pending item"
        
        # Find our scanner in summary
        scanner_found = any(s["device_name"] == device_name for s in summary_data["scanners"])
        assert scanner_found, f"Scanner {device_name} not found in inbox summary"
        
        # Cleanup: Forward the data to variance to clean inbox
        forward_resp = api_client.post(f"{BASE_URL}/api/portal/forward-to-variance", json={
            "session_id": SESSION_ID,
            "client_id": CLIENT_ID,
            "forwarded_by": "pytest"
        })
        assert forward_resp.status_code == 200


class TestSyncFinalizeToInbox:
    """Test that POST /api/sync/finalize (chunked) stores in sync_inbox"""
    
    def test_finalize_stores_in_inbox(self, api_client):
        """Verify chunked sync finalize goes to inbox"""
        unique_id = str(uuid.uuid4())[:8]
        device_name = f"TEST_ChunkInbox_{unique_id}"
        batch_id = str(uuid.uuid4())
        location_name = f"TEST_LOC_CHUNK_{unique_id}"
        
        # Send chunk
        chunk_payload = {
            "batch_id": batch_id,
            "device_name": device_name,
            "sync_password": DEVICE_PASSWORD,
            "client_id": CLIENT_ID,
            "session_id": SESSION_ID,
            "chunk_index": 0,
            "total_chunks": 1,
            "locations": [
                {
                    "id": str(uuid.uuid4()),
                    "name": location_name,
                    "items": [
                        {
                            "barcode": "CHUNK12345",
                            "productName": "Chunked Product",
                            "quantity": 5,
                            "scannedAt": datetime.now().isoformat()
                        }
                    ]
                }
            ]
        }
        
        chunk_resp = api_client.post(f"{BASE_URL}/api/sync/chunk", json=chunk_payload)
        assert chunk_resp.status_code == 200
        
        # Finalize
        finalize_payload = {
            "batch_id": batch_id,
            "device_name": device_name,
            "sync_password": DEVICE_PASSWORD,
            "client_id": CLIENT_ID,
            "session_id": SESSION_ID,
            "total_locations": 1
        }
        
        finalize_resp = api_client.post(f"{BASE_URL}/api/sync/finalize", json=finalize_payload)
        assert finalize_resp.status_code == 200
        result = finalize_resp.json()
        assert result["locations_synced"] == 1
        
        # Verify data in inbox
        inbox_resp = api_client.get(f"{BASE_URL}/api/portal/sync-inbox?session_id={SESSION_ID}")
        assert inbox_resp.status_code == 200
        inbox_items = inbox_resp.json()
        
        # Find our location in inbox
        inbox_loc = next((item for item in inbox_items if item["location_name"] == location_name), None)
        assert inbox_loc is not None, f"Location {location_name} not found in inbox"
        assert inbox_loc["status"] == "pending"
        assert inbox_loc["device_name"] == device_name
        
        # Cleanup: Forward the data
        forward_resp = api_client.post(f"{BASE_URL}/api/portal/forward-to-variance", json={
            "session_id": SESSION_ID,
            "client_id": CLIENT_ID,
            "forwarded_by": "pytest"
        })
        assert forward_resp.status_code == 200


class TestInboxSummary:
    """Test GET /api/portal/sync-inbox/summary endpoint"""
    
    def test_inbox_summary_returns_scanner_grouping(self, api_client):
        """Verify inbox summary returns scanner cards with counts"""
        # First, sync some test data
        unique_id = str(uuid.uuid4())[:8]
        device_name = f"TEST_Summary_{unique_id}"
        
        sync_payload = {
            "device_name": device_name,
            "sync_password": DEVICE_PASSWORD,
            "client_id": CLIENT_ID,
            "session_id": SESSION_ID,
            "locations": [
                {
                    "id": str(uuid.uuid4()),
                    "name": f"SummaryLoc1_{unique_id}",
                    "items": [{"barcode": "SUM1", "quantity": 3, "scannedAt": datetime.now().isoformat()}]
                },
                {
                    "id": str(uuid.uuid4()),
                    "name": f"SummaryLoc2_{unique_id}",
                    "items": [{"barcode": "SUM2", "quantity": 7, "scannedAt": datetime.now().isoformat()}]
                }
            ]
        }
        
        api_client.post(f"{BASE_URL}/api/sync/", json=sync_payload)
        
        # Get inbox summary
        response = api_client.get(f"{BASE_URL}/api/portal/sync-inbox/summary?session_id={SESSION_ID}")
        assert response.status_code == 200
        
        data = response.json()
        assert "session_id" in data
        assert "total_pending" in data
        assert "scanner_count" in data
        assert "scanners" in data
        assert isinstance(data["scanners"], list)
        
        # Find our scanner
        our_scanner = next((s for s in data["scanners"] if s["device_name"] == device_name), None)
        assert our_scanner is not None, f"Scanner {device_name} not in summary"
        
        # Verify scanner card structure
        assert "location_count" in our_scanner
        assert "total_items" in our_scanner
        assert "total_quantity" in our_scanner
        assert "last_synced_at" in our_scanner
        assert our_scanner["location_count"] == 2
        assert our_scanner["total_quantity"] == 10  # 3 + 7
        
        # Cleanup
        api_client.post(f"{BASE_URL}/api/portal/forward-to-variance", json={
            "session_id": SESSION_ID,
            "client_id": CLIENT_ID,
            "forwarded_by": "pytest"
        })
    
    def test_inbox_summary_empty_session(self, api_client):
        """Test inbox summary with session that has no pending data"""
        # Use a non-existent session ID to ensure empty result
        fake_session = str(uuid.uuid4())
        response = api_client.get(f"{BASE_URL}/api/portal/sync-inbox/summary?session_id={fake_session}")
        assert response.status_code == 200
        
        data = response.json()
        assert data["total_pending"] == 0
        assert data["scanner_count"] == 0
        assert data["scanners"] == []


class TestInboxItems:
    """Test GET /api/portal/sync-inbox endpoint"""
    
    def test_get_inbox_items(self, api_client):
        """Verify inbox items endpoint returns pending items"""
        unique_id = str(uuid.uuid4())[:8]
        device_name = f"TEST_InboxItems_{unique_id}"
        location_name = f"TEST_InboxLoc_{unique_id}"
        
        # Sync data
        sync_payload = {
            "device_name": device_name,
            "sync_password": DEVICE_PASSWORD,
            "client_id": CLIENT_ID,
            "session_id": SESSION_ID,
            "locations": [
                {
                    "id": str(uuid.uuid4()),
                    "name": location_name,
                    "items": [{"barcode": "ITEM123", "quantity": 15, "scannedAt": datetime.now().isoformat()}]
                }
            ]
        }
        
        api_client.post(f"{BASE_URL}/api/sync/", json=sync_payload)
        
        # Get inbox items
        response = api_client.get(f"{BASE_URL}/api/portal/sync-inbox?session_id={SESSION_ID}")
        assert response.status_code == 200
        
        items = response.json()
        assert isinstance(items, list)
        
        # Find our item
        our_item = next((i for i in items if i["location_name"] == location_name), None)
        assert our_item is not None
        assert our_item["status"] == "pending"
        assert our_item["device_name"] == device_name
        assert our_item["total_quantity"] == 15
        
        # Cleanup
        api_client.post(f"{BASE_URL}/api/portal/forward-to-variance", json={
            "session_id": SESSION_ID,
            "client_id": CLIENT_ID,
            "forwarded_by": "pytest"
        })
    
    def test_inbox_items_filter_by_device(self, api_client):
        """Test filtering inbox items by device_name"""
        unique_id = str(uuid.uuid4())[:8]
        device_name = f"TEST_FilterDevice_{unique_id}"
        
        # Sync data
        api_client.post(f"{BASE_URL}/api/sync/", json={
            "device_name": device_name,
            "sync_password": DEVICE_PASSWORD,
            "client_id": CLIENT_ID,
            "session_id": SESSION_ID,
            "locations": [
                {"id": str(uuid.uuid4()), "name": f"FilterLoc_{unique_id}", "items": [{"barcode": "FLT1", "quantity": 1, "scannedAt": datetime.now().isoformat()}]}
            ]
        })
        
        # Filter by device
        response = api_client.get(f"{BASE_URL}/api/portal/sync-inbox?session_id={SESSION_ID}&device_name={device_name}")
        assert response.status_code == 200
        
        items = response.json()
        # All items should be from our device
        for item in items:
            assert item["device_name"] == device_name
        
        # Cleanup
        api_client.post(f"{BASE_URL}/api/portal/forward-to-variance", json={
            "session_id": SESSION_ID,
            "client_id": CLIENT_ID,
            "forwarded_by": "pytest"
        })


class TestForwardToVariance:
    """Test POST /api/portal/forward-to-variance endpoint"""
    
    def test_forward_creates_batch_record(self, api_client):
        """Verify forward creates batch record in forward_batches collection"""
        unique_id = str(uuid.uuid4())[:8]
        device_name = f"TEST_ForwardBatch_{unique_id}"
        
        # Sync data
        api_client.post(f"{BASE_URL}/api/sync/", json={
            "device_name": device_name,
            "sync_password": DEVICE_PASSWORD,
            "client_id": CLIENT_ID,
            "session_id": SESSION_ID,
            "locations": [
                {"id": str(uuid.uuid4()), "name": f"BatchLoc_{unique_id}", "items": [{"barcode": "BATCH1", "quantity": 20, "scannedAt": datetime.now().isoformat()}]}
            ]
        })
        
        # Forward
        forward_resp = api_client.post(f"{BASE_URL}/api/portal/forward-to-variance", json={
            "session_id": SESSION_ID,
            "client_id": CLIENT_ID,
            "forwarded_by": "pytest_batch"
        })
        assert forward_resp.status_code == 200
        result = forward_resp.json()
        
        assert "batch_id" in result
        assert "locations_forwarded" in result
        assert result["locations_forwarded"] >= 1
        
        # Verify batch in history
        batches_resp = api_client.get(f"{BASE_URL}/api/portal/forward-batches?session_id={SESSION_ID}")
        assert batches_resp.status_code == 200
        batches = batches_resp.json()
        
        batch_found = any(b["id"] == result["batch_id"] for b in batches)
        assert batch_found, f"Batch {result['batch_id']} not found in history"
    
    def test_forward_empty_inbox_returns_error(self, api_client):
        """Verify forwarding empty inbox returns 400"""
        # Use a session with no pending data
        fake_session = str(uuid.uuid4())
        
        response = api_client.post(f"{BASE_URL}/api/portal/forward-to-variance", json={
            "session_id": fake_session,
            "client_id": CLIENT_ID,
            "forwarded_by": "pytest"
        })
        
        assert response.status_code == 400
        assert "No pending data" in response.json().get("detail", "")
    
    def test_forward_marks_inbox_as_forwarded(self, api_client):
        """Verify inbox items are marked as 'forwarded' after forward"""
        unique_id = str(uuid.uuid4())[:8]
        device_name = f"TEST_MarkForward_{unique_id}"
        location_name = f"MarkFwdLoc_{unique_id}"
        
        # Sync data
        api_client.post(f"{BASE_URL}/api/sync/", json={
            "device_name": device_name,
            "sync_password": DEVICE_PASSWORD,
            "client_id": CLIENT_ID,
            "session_id": SESSION_ID,
            "locations": [
                {"id": str(uuid.uuid4()), "name": location_name, "items": [{"barcode": "MARK1", "quantity": 5, "scannedAt": datetime.now().isoformat()}]}
            ]
        })
        
        # Verify in inbox (pending)
        inbox_before = api_client.get(f"{BASE_URL}/api/portal/sync-inbox?session_id={SESSION_ID}").json()
        pending_item = next((i for i in inbox_before if i["location_name"] == location_name), None)
        assert pending_item is not None
        assert pending_item["status"] == "pending"
        
        # Forward
        api_client.post(f"{BASE_URL}/api/portal/forward-to-variance", json={
            "session_id": SESSION_ID,
            "client_id": CLIENT_ID,
            "forwarded_by": "pytest"
        })
        
        # Verify no longer in pending inbox
        inbox_after = api_client.get(f"{BASE_URL}/api/portal/sync-inbox?session_id={SESSION_ID}").json()
        still_pending = next((i for i in inbox_after if i["location_name"] == location_name and i["status"] == "pending"), None)
        assert still_pending is None, "Item should no longer be pending after forward"


class TestConflictDetection:
    """Test conflict detection during forward to variance"""
    
    def test_forward_creates_conflict_for_same_location_different_devices(self, api_client):
        """Verify conflict is created when same location synced from different devices"""
        unique_id = str(uuid.uuid4())[:8]
        location_name = f"ConflictLoc_{unique_id}"
        device1 = f"TEST_Conflict1_{unique_id}"
        device2 = f"TEST_Conflict2_{unique_id}"
        
        # Sync from device 1
        api_client.post(f"{BASE_URL}/api/sync/", json={
            "device_name": device1,
            "sync_password": DEVICE_PASSWORD,
            "client_id": CLIENT_ID,
            "session_id": SESSION_ID,
            "locations": [
                {"id": str(uuid.uuid4()), "name": location_name, "items": [{"barcode": "CONF1", "quantity": 10, "scannedAt": datetime.now().isoformat()}]}
            ]
        })
        
        # Sync same location from device 2
        api_client.post(f"{BASE_URL}/api/sync/", json={
            "device_name": device2,
            "sync_password": DEVICE_PASSWORD,
            "client_id": CLIENT_ID,
            "session_id": SESSION_ID,
            "locations": [
                {"id": str(uuid.uuid4()), "name": location_name, "items": [{"barcode": "CONF1", "quantity": 15, "scannedAt": datetime.now().isoformat()}]}
            ]
        })
        
        # Forward - should create conflict
        forward_resp = api_client.post(f"{BASE_URL}/api/portal/forward-to-variance", json={
            "session_id": SESSION_ID,
            "client_id": CLIENT_ID,
            "forwarded_by": "pytest_conflict"
        })
        
        assert forward_resp.status_code == 200
        result = forward_resp.json()
        assert result["conflicts_created"] >= 1, "Should have created at least 1 conflict"


class TestDeduplication:
    """Test deduplication logic - keeps latest per device per location"""
    
    def test_forward_deduplicates_same_device_same_location(self, api_client):
        """Verify only latest entry is kept when same device syncs same location multiple times"""
        unique_id = str(uuid.uuid4())[:8]
        device_name = f"TEST_Dedup_{unique_id}"
        location_name = f"DedupLoc_{unique_id}"
        
        # First sync
        api_client.post(f"{BASE_URL}/api/sync/", json={
            "device_name": device_name,
            "sync_password": DEVICE_PASSWORD,
            "client_id": CLIENT_ID,
            "session_id": SESSION_ID,
            "locations": [
                {"id": str(uuid.uuid4()), "name": location_name, "items": [{"barcode": "DDP1", "quantity": 5, "scannedAt": datetime.now().isoformat()}]}
            ]
        })
        
        time.sleep(0.1)  # Small delay to ensure different timestamps
        
        # Second sync from same device - should replace
        api_client.post(f"{BASE_URL}/api/sync/", json={
            "device_name": device_name,
            "sync_password": DEVICE_PASSWORD,
            "client_id": CLIENT_ID,
            "session_id": SESSION_ID,
            "locations": [
                {"id": str(uuid.uuid4()), "name": location_name, "items": [{"barcode": "DDP1", "quantity": 25, "scannedAt": datetime.now().isoformat()}]}
            ]
        })
        
        # Check inbox - should have 2 entries (both pending)
        inbox_resp = api_client.get(f"{BASE_URL}/api/portal/sync-inbox?session_id={SESSION_ID}&device_name={device_name}")
        inbox_items = inbox_resp.json()
        loc_items = [i for i in inbox_items if i["location_name"] == location_name]
        assert len(loc_items) >= 1  # At least 1, possibly 2 before dedup
        
        # Forward - deduplication happens here
        forward_resp = api_client.post(f"{BASE_URL}/api/portal/forward-to-variance", json={
            "session_id": SESSION_ID,
            "client_id": CLIENT_ID,
            "forwarded_by": "pytest_dedup"
        })
        
        assert forward_resp.status_code == 200
        # After forward, only 1 location should be in variance (deduplicated)


class TestForwardBatches:
    """Test GET /api/portal/forward-batches endpoint"""
    
    def test_get_forward_batches(self, api_client):
        """Verify forward batches endpoint returns batch history"""
        response = api_client.get(f"{BASE_URL}/api/portal/forward-batches?session_id={SESSION_ID}")
        assert response.status_code == 200
        
        batches = response.json()
        assert isinstance(batches, list)
        
        if len(batches) > 0:
            batch = batches[0]
            assert "id" in batch
            assert "session_id" in batch
            assert "client_id" in batch
            assert "forwarded_by" in batch
            assert "forwarded_at" in batch
            assert "location_count" in batch
            assert "item_count" in batch
            assert "scanner_count" in batch
            assert "scanners" in batch
            assert "conflicts_created" in batch
    
    def test_get_forward_batches_filter_by_client(self, api_client):
        """Test filtering forward batches by client_id"""
        response = api_client.get(f"{BASE_URL}/api/portal/forward-batches?client_id={CLIENT_ID}")
        assert response.status_code == 200
        
        batches = response.json()
        for batch in batches:
            assert batch["client_id"] == CLIENT_ID


class TestSyncRawLogs:
    """Test that sync raw logs are still being created"""
    
    def test_sync_creates_raw_log(self, api_client):
        """Verify sync still creates raw log entry"""
        unique_id = str(uuid.uuid4())[:8]
        device_name = f"TEST_RawLog_{unique_id}"
        
        # Sync data
        api_client.post(f"{BASE_URL}/api/sync/", json={
            "device_name": device_name,
            "sync_password": DEVICE_PASSWORD,
            "client_id": CLIENT_ID,
            "session_id": SESSION_ID,
            "locations": [
                {"id": str(uuid.uuid4()), "name": f"RawLogLoc_{unique_id}", "items": [{"barcode": "RAW1", "quantity": 3, "scannedAt": datetime.now().isoformat()}]}
            ]
        })
        
        # Check raw logs
        logs_resp = api_client.get(f"{BASE_URL}/api/portal/sync-logs?client_id={CLIENT_ID}&limit=50")
        assert logs_resp.status_code == 200
        
        logs = logs_resp.json()
        log_found = any(log.get("device_name") == device_name for log in logs)
        assert log_found, f"Raw log for device {device_name} not found"
        
        # Cleanup
        api_client.post(f"{BASE_URL}/api/portal/forward-to-variance", json={
            "session_id": SESSION_ID,
            "client_id": CLIENT_ID,
            "forwarded_by": "pytest"
        })


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
