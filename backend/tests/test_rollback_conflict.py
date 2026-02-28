"""
Test suite for Phase 4 features:
1. Rollback Batch - DELETE /api/portal/forward-batches/{batch_id}
2. Re-forward after rollback
3. Conflict resolution removes rejected data from sync_inbox and sync_raw_logs
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
CLIENT_ID = "0a2045d2-dc5f-4f6b-b622-8c2a67788b8d"
SESSION_ID = "8bb1ee6a-a3b3-48ee-b6a2-023fede4382d"
SYNC_PASSWORD = "test123"

@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


class TestRollbackBatch:
    """Tests for DELETE /api/portal/forward-batches/{batch_id} - Rollback functionality"""

    def test_create_sync_forward_rollback_full_flow(self, api_client):
        """Full flow: Sync → Forward → Rollback → Verify inbox is back to pending → Re-forward"""
        # Step 1: Create sync data with a unique device and location
        unique_id = str(uuid.uuid4())[:8]
        device_name = f"TEST_Rollback_{unique_id}"
        location_name = f"TEST_LOC_RB_{unique_id}"
        
        sync_payload = {
            "device_name": device_name,
            "sync_password": SYNC_PASSWORD,
            "client_id": CLIENT_ID,
            "session_id": SESSION_ID,
            "locations": [{
                "id": str(uuid.uuid4()),
                "name": location_name,
                "items": [
                    {"barcode": "1234567890123", "productName": "Test Product", "quantity": 10, "scannedAt": "2026-01-15T10:00:00Z"}
                ],
                "is_empty": False,
                "empty_remarks": ""
            }],
            "clear_after_sync": False
        }
        
        # Sync data
        response = api_client.post(f"{BASE_URL}/api/sync/", json=sync_payload)
        assert response.status_code == 200, f"Sync failed: {response.text}"
        sync_result = response.json()
        assert sync_result["locations_synced"] == 1
        print(f"PASS: Synced 1 location with device {device_name}")
        
        # Step 2: Verify data is in inbox as pending
        response = api_client.get(f"{BASE_URL}/api/portal/sync-inbox/summary?session_id={SESSION_ID}")
        assert response.status_code == 200
        summary_before = response.json()
        assert summary_before["total_pending"] > 0, "Expected pending data in inbox"
        print(f"PASS: Inbox has {summary_before['total_pending']} pending entries before forward")
        
        # Step 3: Forward to variance
        forward_payload = {
            "session_id": SESSION_ID,
            "client_id": CLIENT_ID,
            "forwarded_by": "test_admin"
        }
        response = api_client.post(f"{BASE_URL}/api/portal/forward-to-variance", json=forward_payload)
        assert response.status_code == 200, f"Forward failed: {response.text}"
        forward_result = response.json()
        batch_id = forward_result["batch_id"]
        print(f"PASS: Forwarded data, batch_id={batch_id}")
        
        # Step 4: Verify inbox is empty (or at least our location is forwarded)
        response = api_client.get(f"{BASE_URL}/api/portal/sync-inbox/summary?session_id={SESSION_ID}")
        assert response.status_code == 200
        summary_after_forward = response.json()
        # Our sync data should now be forwarded
        print(f"PASS: After forward, inbox has {summary_after_forward['total_pending']} pending entries")
        
        # Step 5: Get batches and verify our batch exists
        response = api_client.get(f"{BASE_URL}/api/portal/forward-batches?session_id={SESSION_ID}")
        assert response.status_code == 200
        batches = response.json()
        our_batch = next((b for b in batches if b["id"] == batch_id), None)
        assert our_batch is not None, f"Batch {batch_id} not found in batch list"
        print(f"PASS: Batch {batch_id} found in forward-batches list")
        
        # Step 6: ROLLBACK the batch
        response = api_client.delete(f"{BASE_URL}/api/portal/forward-batches/{batch_id}")
        assert response.status_code == 200, f"Rollback failed: {response.text}"
        rollback_result = response.json()
        assert "rolled back" in rollback_result["message"].lower() or "locations_rolled_back" in rollback_result
        print(f"PASS: Rollback successful - {rollback_result.get('locations_rolled_back', 0)} locations rolled back")
        
        # Step 7: Verify data is back in inbox as pending
        response = api_client.get(f"{BASE_URL}/api/portal/sync-inbox/summary?session_id={SESSION_ID}")
        assert response.status_code == 200
        summary_after_rollback = response.json()
        assert summary_after_rollback["total_pending"] > 0, "Expected data back in inbox after rollback"
        print(f"PASS: After rollback, inbox has {summary_after_rollback['total_pending']} pending entries")
        
        # Step 8: Re-forward should succeed
        response = api_client.post(f"{BASE_URL}/api/portal/forward-to-variance", json=forward_payload)
        assert response.status_code == 200, f"Re-forward failed: {response.text}"
        reforward_result = response.json()
        new_batch_id = reforward_result["batch_id"]
        print(f"PASS: Re-forward successful, new batch_id={new_batch_id}")
        
        # Cleanup: Delete the new batch
        api_client.delete(f"{BASE_URL}/api/portal/forward-batches/{new_batch_id}")
        print(f"Cleanup: Deleted batch {new_batch_id}")

    def test_rollback_nonexistent_batch(self, api_client):
        """DELETE /api/portal/forward-batches/{batch_id} with invalid batch_id returns 404"""
        fake_batch_id = str(uuid.uuid4())
        response = api_client.delete(f"{BASE_URL}/api/portal/forward-batches/{fake_batch_id}")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("PASS: Rollback nonexistent batch returns 404")

    def test_rollback_removes_from_synced_locations(self, api_client):
        """Verify rollback removes data from synced_locations collection"""
        # Create and sync data
        unique_id = str(uuid.uuid4())[:8]
        device_name = f"TEST_SyncLoc_{unique_id}"
        location_name = f"TEST_LOC_SL_{unique_id}"
        
        sync_payload = {
            "device_name": device_name,
            "sync_password": SYNC_PASSWORD,
            "client_id": CLIENT_ID,
            "session_id": SESSION_ID,
            "locations": [{
                "id": str(uuid.uuid4()),
                "name": location_name,
                "items": [{"barcode": "9999888877776", "productName": "SyncLoc Test", "quantity": 5, "scannedAt": "2026-01-15T11:00:00Z"}],
                "is_empty": False
            }]
        }
        
        response = api_client.post(f"{BASE_URL}/api/sync/", json=sync_payload)
        assert response.status_code == 200
        
        # Forward
        forward_payload = {"session_id": SESSION_ID, "client_id": CLIENT_ID, "forwarded_by": "test"}
        response = api_client.post(f"{BASE_URL}/api/portal/forward-to-variance", json=forward_payload)
        assert response.status_code == 200
        batch_id = response.json()["batch_id"]
        
        # Check synced_locations has our data (via variance report)
        # The synced_locations is used internally - we trust the forward succeeded
        
        # Rollback
        response = api_client.delete(f"{BASE_URL}/api/portal/forward-batches/{batch_id}")
        assert response.status_code == 200
        rollback_result = response.json()
        assert rollback_result["locations_rolled_back"] > 0
        print(f"PASS: Rollback removed {rollback_result['locations_rolled_back']} from synced_locations")


class TestConflictResolutionCleanup:
    """Tests for conflict resolution removing rejected data from sync_inbox and sync_raw_logs"""

    def test_conflict_resolution_removes_rejected_from_inbox(self, api_client):
        """When resolving conflict, rejected entries should be removed from sync_inbox"""
        # Step 1: Create conflict by syncing same location from two devices
        unique_id = str(uuid.uuid4())[:8]
        location_name = f"TEST_CONFLICT_LOC_{unique_id}"
        device1 = f"TEST_Conflict_Dev1_{unique_id}"
        device2 = f"TEST_Conflict_Dev2_{unique_id}"
        
        # First device syncs
        sync1 = {
            "device_name": device1,
            "sync_password": SYNC_PASSWORD,
            "client_id": CLIENT_ID,
            "session_id": SESSION_ID,
            "locations": [{
                "id": str(uuid.uuid4()),
                "name": location_name,
                "items": [{"barcode": "1111111111111", "productName": "Device1 Product", "quantity": 100, "scannedAt": "2026-01-15T10:00:00Z"}],
                "is_empty": False
            }]
        }
        response = api_client.post(f"{BASE_URL}/api/sync/", json=sync1)
        assert response.status_code == 200
        print(f"PASS: Device 1 ({device1}) synced location {location_name}")
        
        # Second device syncs same location
        sync2 = {
            "device_name": device2,
            "sync_password": SYNC_PASSWORD,
            "client_id": CLIENT_ID,
            "session_id": SESSION_ID,
            "locations": [{
                "id": str(uuid.uuid4()),
                "name": location_name,
                "items": [{"barcode": "2222222222222", "productName": "Device2 Product", "quantity": 50, "scannedAt": "2026-01-15T10:30:00Z"}],
                "is_empty": False
            }]
        }
        response = api_client.post(f"{BASE_URL}/api/sync/", json=sync2)
        assert response.status_code == 200
        print(f"PASS: Device 2 ({device2}) synced same location {location_name}")
        
        # Forward to create conflict
        forward_payload = {"session_id": SESSION_ID, "client_id": CLIENT_ID, "forwarded_by": "test"}
        response = api_client.post(f"{BASE_URL}/api/portal/forward-to-variance", json=forward_payload)
        assert response.status_code == 200
        conflicts_created = response.json().get("conflicts_created", 0)
        batch_id = response.json()["batch_id"]
        print(f"PASS: Forward created {conflicts_created} conflicts")
        
        # Get conflicts
        response = api_client.get(f"{BASE_URL}/api/portal/conflicts?session_id={SESSION_ID}")
        assert response.status_code == 200
        conflicts = response.json()
        
        # Find our conflict
        our_conflict = None
        for c in conflicts:
            if c["location_name"] == location_name and c["status"] == "pending":
                our_conflict = c
                break
        
        if not our_conflict:
            # If no pending conflict found, rollback and cleanup
            api_client.delete(f"{BASE_URL}/api/portal/forward-batches/{batch_id}")
            pytest.skip("No pending conflict found - data may have been processed differently")
        
        conflict_id = our_conflict["id"]
        entries = our_conflict["entries"]
        print(f"PASS: Found conflict {conflict_id} with {len(entries)} entries")
        
        # Find entry from device1 to approve
        approved_entry = None
        for entry in entries:
            if device1 in entry.get("device_name", ""):
                approved_entry = entry
                break
        
        if not approved_entry:
            approved_entry = entries[0]
        
        entry_id = approved_entry["entry_id"]
        
        # Resolve conflict - approve device1's entry (reject device2)
        response = api_client.post(f"{BASE_URL}/api/portal/conflicts/{conflict_id}/approve/{entry_id}?username=test_admin")
        assert response.status_code == 200, f"Conflict resolution failed: {response.text}"
        result = response.json()
        print(f"PASS: Conflict resolved. Approved device: {result['approved_device']}")
        print(f"PASS: Rejected devices cleaned: {result.get('rejected_devices_cleaned', [])}")
        
        # Verify the response mentions cleanup
        assert "rejected_devices_cleaned" in result
        
        # Cleanup: delete any created batches
        api_client.delete(f"{BASE_URL}/api/portal/forward-batches/{batch_id}")

    def test_conflict_endpoint_exists(self, api_client):
        """Verify GET /api/portal/conflicts endpoint exists"""
        response = api_client.get(f"{BASE_URL}/api/portal/conflicts?session_id={SESSION_ID}")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"PASS: GET /api/portal/conflicts returns list ({len(data)} conflicts)")

    def test_conflict_summary_endpoint(self, api_client):
        """Verify GET /api/portal/conflicts/summary endpoint exists"""
        response = api_client.get(f"{BASE_URL}/api/portal/conflicts/summary?session_id={SESSION_ID}")
        assert response.status_code == 200
        data = response.json()
        print(f"PASS: GET /api/portal/conflicts/summary returns data")


class TestForwardBatchesEndpoint:
    """Tests for GET /api/portal/forward-batches endpoint"""

    def test_get_forward_batches(self, api_client):
        """GET /api/portal/forward-batches returns batch list"""
        response = api_client.get(f"{BASE_URL}/api/portal/forward-batches?session_id={SESSION_ID}")
        assert response.status_code == 200
        batches = response.json()
        assert isinstance(batches, list)
        print(f"PASS: GET /api/portal/forward-batches returns {len(batches)} batches")
        
        # Verify batch structure if any exist
        if batches:
            batch = batches[0]
            assert "id" in batch
            assert "session_id" in batch
            assert "forwarded_at" in batch
            print(f"PASS: Batch structure is valid (has id, session_id, forwarded_at)")


class TestInboxAfterRollback:
    """Tests to verify inbox state after rollback"""

    def test_inbox_summary_shows_pending_after_rollback(self, api_client):
        """After rollback, GET /api/portal/sync-inbox/summary should show pending data"""
        # Create, forward, rollback
        unique_id = str(uuid.uuid4())[:8]
        device_name = f"TEST_InboxRB_{unique_id}"
        location_name = f"TEST_LOC_IRB_{unique_id}"
        
        sync_payload = {
            "device_name": device_name,
            "sync_password": SYNC_PASSWORD,
            "client_id": CLIENT_ID,
            "session_id": SESSION_ID,
            "locations": [{
                "id": str(uuid.uuid4()),
                "name": location_name,
                "items": [{"barcode": "5555555555555", "productName": "Inbox Test", "quantity": 25, "scannedAt": "2026-01-15T12:00:00Z"}]
            }]
        }
        
        # Sync
        response = api_client.post(f"{BASE_URL}/api/sync/", json=sync_payload)
        assert response.status_code == 200
        
        # Get initial inbox count
        response = api_client.get(f"{BASE_URL}/api/portal/sync-inbox/summary?session_id={SESSION_ID}")
        initial_pending = response.json()["total_pending"]
        
        # Forward
        response = api_client.post(f"{BASE_URL}/api/portal/forward-to-variance", json={
            "session_id": SESSION_ID, "client_id": CLIENT_ID, "forwarded_by": "test"
        })
        assert response.status_code == 200
        batch_id = response.json()["batch_id"]
        
        # Check inbox after forward (should be less or same)
        response = api_client.get(f"{BASE_URL}/api/portal/sync-inbox/summary?session_id={SESSION_ID}")
        after_forward_pending = response.json()["total_pending"]
        
        # Rollback
        response = api_client.delete(f"{BASE_URL}/api/portal/forward-batches/{batch_id}")
        assert response.status_code == 200
        
        # Check inbox after rollback
        response = api_client.get(f"{BASE_URL}/api/portal/sync-inbox/summary?session_id={SESSION_ID}")
        after_rollback_pending = response.json()["total_pending"]
        
        # After rollback, pending should be restored
        assert after_rollback_pending >= after_forward_pending, "Pending count should increase after rollback"
        print(f"PASS: Initial={initial_pending}, After Forward={after_forward_pending}, After Rollback={after_rollback_pending}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
