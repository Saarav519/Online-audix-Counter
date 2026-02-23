"""
Chunked Sync API Tests

Tests for the chunked sync implementation:
1. POST /api/sync/chunk - Upload chunk of locations to staging
2. POST /api/sync/finalize - Validate and move staging → live
3. DELETE /api/sync/staging/{batch_id} - Clear staged data
4. POST /api/sync/ - Original endpoint backward compatibility
"""

import pytest
import requests
import os
import uuid
from typing import List, Dict, Any

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test data constants
CLIENT_ID = "0a2045d2-dc5f-4f6b-b622-8c2a67788b8d"  # Reliance Retail
SESSION_ID = "8bb1ee6a-a3b3-48ee-b6a2-023fede4382d"  # Q1 2026 - Warehouse Audit
TEST_DEVICE_NAME = "TEST_ChunkSync_Device"
TEST_SYNC_PASSWORD = "testsyncpass123"


def generate_test_locations(count: int, prefix: str = "CHUNK") -> List[Dict[str, Any]]:
    """Generate test location data"""
    locations = []
    for i in range(count):
        locations.append({
            "id": f"loc-{prefix}-{i}",
            "name": f"TEST_Location_{prefix}_{i}",
            "is_empty": False,
            "empty_remarks": "",
            "items": [
                {
                    "barcode": f"TEST{prefix}{i}001",
                    "productName": f"Test Product {prefix} {i}",
                    "price": 100.0 + i,
                    "quantity": 5 + i,
                    "scannedAt": "2026-02-23T10:00:00Z"
                }
            ]
        })
    return locations


class TestChunkEndpoint:
    """Tests for POST /api/sync/chunk endpoint"""
    
    def test_chunk_upload_success(self):
        """Test successful chunk upload to staging"""
        batch_id = f"TEST_batch_{uuid.uuid4().hex[:8]}"
        locations = generate_test_locations(2, "CHUNK1")
        
        response = requests.post(
            f"{BASE_URL}/api/sync/chunk",
            json={
                "batch_id": batch_id,
                "device_name": TEST_DEVICE_NAME,
                "sync_password": TEST_SYNC_PASSWORD,
                "client_id": CLIENT_ID,
                "session_id": SESSION_ID,
                "chunk_index": 0,
                "total_chunks": 1,
                "locations": locations
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Chunk received"
        assert data["batch_id"] == batch_id
        assert data["chunk_index"] == 0
        assert data["total_chunks"] == 1
        
        # Cleanup staging
        requests.delete(f"{BASE_URL}/api/sync/staging/{batch_id}")
    
    def test_chunk_upload_multiple_chunks(self):
        """Test uploading multiple chunks sequentially"""
        batch_id = f"TEST_batch_multi_{uuid.uuid4().hex[:8]}"
        
        # Upload 3 chunks
        for i in range(3):
            locations = generate_test_locations(2, f"MULTI{i}")
            response = requests.post(
                f"{BASE_URL}/api/sync/chunk",
                json={
                    "batch_id": batch_id,
                    "device_name": TEST_DEVICE_NAME,
                    "sync_password": TEST_SYNC_PASSWORD,
                    "client_id": CLIENT_ID,
                    "session_id": SESSION_ID,
                    "chunk_index": i,
                    "total_chunks": 3,
                    "locations": locations
                }
            )
            assert response.status_code == 200
            assert response.json()["chunk_index"] == i
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/sync/staging/{batch_id}")
    
    def test_chunk_with_invalid_session(self):
        """Test chunk upload with non-existent session_id"""
        batch_id = f"TEST_batch_invalid_{uuid.uuid4().hex[:8]}"
        
        response = requests.post(
            f"{BASE_URL}/api/sync/chunk",
            json={
                "batch_id": batch_id,
                "device_name": TEST_DEVICE_NAME,
                "sync_password": TEST_SYNC_PASSWORD,
                "client_id": CLIENT_ID,
                "session_id": "invalid-session-id-12345",  # Non-existent
                "chunk_index": 0,
                "total_chunks": 1,
                "locations": []
            }
        )
        
        assert response.status_code == 404
        assert "Session not found" in response.json().get("detail", "")
    
    def test_chunk_auto_registers_device(self):
        """Test that a new device is auto-registered on first chunk"""
        batch_id = f"TEST_batch_newdev_{uuid.uuid4().hex[:8]}"
        new_device = f"TEST_NewDevice_{uuid.uuid4().hex[:8]}"
        
        response = requests.post(
            f"{BASE_URL}/api/sync/chunk",
            json={
                "batch_id": batch_id,
                "device_name": new_device,
                "sync_password": "newpassword123",
                "client_id": CLIENT_ID,
                "session_id": SESSION_ID,
                "chunk_index": 0,
                "total_chunks": 1,
                "locations": []
            }
        )
        
        assert response.status_code == 200
        assert response.json()["message"] == "Chunk received"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/sync/staging/{batch_id}")


class TestFinalizeEndpoint:
    """Tests for POST /api/sync/finalize endpoint"""
    
    def test_finalize_success(self):
        """Test successful finalization: staging → live"""
        batch_id = f"TEST_batch_final_{uuid.uuid4().hex[:8]}"
        locations = generate_test_locations(3, "FINAL")
        
        # Upload all locations as single chunk
        chunk_response = requests.post(
            f"{BASE_URL}/api/sync/chunk",
            json={
                "batch_id": batch_id,
                "device_name": TEST_DEVICE_NAME,
                "sync_password": TEST_SYNC_PASSWORD,
                "client_id": CLIENT_ID,
                "session_id": SESSION_ID,
                "chunk_index": 0,
                "total_chunks": 1,
                "locations": locations
            }
        )
        assert chunk_response.status_code == 200
        
        # Finalize
        finalize_response = requests.post(
            f"{BASE_URL}/api/sync/finalize",
            json={
                "batch_id": batch_id,
                "device_name": TEST_DEVICE_NAME,
                "sync_password": TEST_SYNC_PASSWORD,
                "client_id": CLIENT_ID,
                "session_id": SESSION_ID,
                "total_locations": 3
            }
        )
        
        assert finalize_response.status_code == 200
        data = finalize_response.json()
        assert data["message"] == "Sync finalized successfully"
        assert data["locations_synced"] == 3
        assert data["batch_id"] == batch_id
        assert "sync_date" in data
    
    def test_finalize_no_staged_data(self):
        """Test finalize with no staged data returns 404"""
        batch_id = f"TEST_batch_nostage_{uuid.uuid4().hex[:8]}"
        
        response = requests.post(
            f"{BASE_URL}/api/sync/finalize",
            json={
                "batch_id": batch_id,
                "device_name": TEST_DEVICE_NAME,
                "sync_password": TEST_SYNC_PASSWORD,
                "client_id": CLIENT_ID,
                "session_id": SESSION_ID,
                "total_locations": 5
            }
        )
        
        assert response.status_code == 404
        assert "No staged data found" in response.json().get("detail", "")
    
    def test_finalize_missing_chunks(self):
        """Test finalize rejects when chunks are missing"""
        batch_id = f"TEST_batch_missing_{uuid.uuid4().hex[:8]}"
        
        # Upload chunk 0 and chunk 2, skip chunk 1 (missing)
        for i in [0, 2]:
            locations = generate_test_locations(2, f"SKIP{i}")
            requests.post(
                f"{BASE_URL}/api/sync/chunk",
                json={
                    "batch_id": batch_id,
                    "device_name": TEST_DEVICE_NAME,
                    "sync_password": TEST_SYNC_PASSWORD,
                    "client_id": CLIENT_ID,
                    "session_id": SESSION_ID,
                    "chunk_index": i,
                    "total_chunks": 3,
                    "locations": locations
                }
            )
        
        # Try to finalize - should fail due to missing chunk 1
        response = requests.post(
            f"{BASE_URL}/api/sync/finalize",
            json={
                "batch_id": batch_id,
                "device_name": TEST_DEVICE_NAME,
                "sync_password": TEST_SYNC_PASSWORD,
                "client_id": CLIENT_ID,
                "session_id": SESSION_ID,
                "total_locations": 6  # 3 chunks * 2 locations
            }
        )
        
        assert response.status_code == 400
        assert "Missing chunks" in response.json().get("detail", "")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/sync/staging/{batch_id}")
    
    def test_finalize_location_count_mismatch(self):
        """Test finalize rejects when total_locations doesn't match"""
        batch_id = f"TEST_batch_mismatch_{uuid.uuid4().hex[:8]}"
        
        # Upload 3 locations
        locations = generate_test_locations(3, "MISMATCH")
        requests.post(
            f"{BASE_URL}/api/sync/chunk",
            json={
                "batch_id": batch_id,
                "device_name": TEST_DEVICE_NAME,
                "sync_password": TEST_SYNC_PASSWORD,
                "client_id": CLIENT_ID,
                "session_id": SESSION_ID,
                "chunk_index": 0,
                "total_chunks": 1,
                "locations": locations
            }
        )
        
        # Try to finalize with wrong count
        response = requests.post(
            f"{BASE_URL}/api/sync/finalize",
            json={
                "batch_id": batch_id,
                "device_name": TEST_DEVICE_NAME,
                "sync_password": TEST_SYNC_PASSWORD,
                "client_id": CLIENT_ID,
                "session_id": SESSION_ID,
                "total_locations": 10  # Wrong - should be 3
            }
        )
        
        assert response.status_code == 400
        assert "Location count mismatch" in response.json().get("detail", "")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/sync/staging/{batch_id}")
    
    def test_finalize_invalid_password(self):
        """Test finalize with wrong sync password"""
        batch_id = f"TEST_batch_wrongpw_{uuid.uuid4().hex[:8]}"
        
        # Upload with correct password
        locations = generate_test_locations(1, "WRONGPW")
        requests.post(
            f"{BASE_URL}/api/sync/chunk",
            json={
                "batch_id": batch_id,
                "device_name": TEST_DEVICE_NAME,
                "sync_password": TEST_SYNC_PASSWORD,
                "client_id": CLIENT_ID,
                "session_id": SESSION_ID,
                "chunk_index": 0,
                "total_chunks": 1,
                "locations": locations
            }
        )
        
        # Try finalize with wrong password
        response = requests.post(
            f"{BASE_URL}/api/sync/finalize",
            json={
                "batch_id": batch_id,
                "device_name": TEST_DEVICE_NAME,
                "sync_password": "wrong_password",  # Wrong
                "client_id": CLIENT_ID,
                "session_id": SESSION_ID,
                "total_locations": 1
            }
        )
        
        assert response.status_code == 401
        assert "Invalid sync password" in response.json().get("detail", "")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/sync/staging/{batch_id}")


class TestStagingCleanup:
    """Tests for DELETE /api/sync/staging/{batch_id} endpoint"""
    
    def test_clear_staging_success(self):
        """Test clearing staged data for a batch"""
        batch_id = f"TEST_batch_clear_{uuid.uuid4().hex[:8]}"
        
        # Upload 2 chunks
        for i in range(2):
            locations = generate_test_locations(2, f"CLEAR{i}")
            requests.post(
                f"{BASE_URL}/api/sync/chunk",
                json={
                    "batch_id": batch_id,
                    "device_name": TEST_DEVICE_NAME,
                    "sync_password": TEST_SYNC_PASSWORD,
                    "client_id": CLIENT_ID,
                    "session_id": SESSION_ID,
                    "chunk_index": i,
                    "total_chunks": 2,
                    "locations": locations
                }
            )
        
        # Clear staging
        response = requests.delete(f"{BASE_URL}/api/sync/staging/{batch_id}")
        
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Staging data cleared"
        assert data["deleted_chunks"] == 2
    
    def test_clear_nonexistent_batch(self):
        """Test clearing staging for non-existent batch returns 0 deleted"""
        response = requests.delete(f"{BASE_URL}/api/sync/staging/nonexistent-batch-12345")
        
        assert response.status_code == 200
        assert response.json()["deleted_chunks"] == 0


class TestOriginalSyncEndpoint:
    """Tests for backward compatibility with POST /api/sync/"""
    
    def test_original_sync_still_works(self):
        """Test that original sync endpoint still functions"""
        locations = generate_test_locations(2, "ORIG")
        
        response = requests.post(
            f"{BASE_URL}/api/sync/",
            json={
                "device_name": TEST_DEVICE_NAME,
                "sync_password": TEST_SYNC_PASSWORD,
                "client_id": CLIENT_ID,
                "session_id": SESSION_ID,
                "locations": locations,
                "clear_after_sync": False
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Sync successful"
        assert data["locations_synced"] == 2
        assert "sync_date" in data
    
    def test_original_sync_empty_locations(self):
        """Test original sync with no locations"""
        response = requests.post(
            f"{BASE_URL}/api/sync/",
            json={
                "device_name": TEST_DEVICE_NAME,
                "sync_password": TEST_SYNC_PASSWORD,
                "client_id": CLIENT_ID,
                "session_id": SESSION_ID,
                "locations": [],
                "clear_after_sync": False
            }
        )
        
        assert response.status_code == 200
        assert response.json()["locations_synced"] == 0


class TestEndToEndChunkedSync:
    """End-to-end tests for the complete chunked sync flow"""
    
    def test_full_chunked_sync_flow(self):
        """Test complete flow: upload chunks → finalize → verify in synced_locations"""
        batch_id = f"TEST_e2e_{uuid.uuid4().hex[:8]}"
        total_locations = 15  # Test with >10 to ensure chunking works
        
        # Calculate chunks (10 per chunk as per frontend CHUNK_SIZE)
        CHUNK_SIZE = 10
        all_locations = generate_test_locations(total_locations, "E2E")
        chunks = [all_locations[i:i+CHUNK_SIZE] for i in range(0, len(all_locations), CHUNK_SIZE)]
        
        # Upload all chunks
        for idx, chunk in enumerate(chunks):
            response = requests.post(
                f"{BASE_URL}/api/sync/chunk",
                json={
                    "batch_id": batch_id,
                    "device_name": TEST_DEVICE_NAME,
                    "sync_password": TEST_SYNC_PASSWORD,
                    "client_id": CLIENT_ID,
                    "session_id": SESSION_ID,
                    "chunk_index": idx,
                    "total_chunks": len(chunks),
                    "locations": chunk
                }
            )
            assert response.status_code == 200, f"Chunk {idx} upload failed"
        
        # Finalize
        finalize_response = requests.post(
            f"{BASE_URL}/api/sync/finalize",
            json={
                "batch_id": batch_id,
                "device_name": TEST_DEVICE_NAME,
                "sync_password": TEST_SYNC_PASSWORD,
                "client_id": CLIENT_ID,
                "session_id": SESSION_ID,
                "total_locations": total_locations
            }
        )
        
        assert finalize_response.status_code == 200
        assert finalize_response.json()["locations_synced"] == total_locations
        
        # Verify staging is cleaned up - trying to finalize again should fail
        retry_response = requests.post(
            f"{BASE_URL}/api/sync/finalize",
            json={
                "batch_id": batch_id,
                "device_name": TEST_DEVICE_NAME,
                "sync_password": TEST_SYNC_PASSWORD,
                "client_id": CLIENT_ID,
                "session_id": SESSION_ID,
                "total_locations": total_locations
            }
        )
        assert retry_response.status_code == 404  # No staged data (cleaned up)
    
    def test_chunked_sync_with_empty_bins(self):
        """Test chunked sync handles empty bins correctly"""
        batch_id = f"TEST_empty_{uuid.uuid4().hex[:8]}"
        
        locations = [
            {
                "id": "empty-bin-1",
                "name": "TEST_EmptyBin_1",
                "is_empty": True,
                "empty_remarks": "Bin found empty during count",
                "items": []
            },
            {
                "id": "normal-loc-1",
                "name": "TEST_NormalLoc_1",
                "is_empty": False,
                "items": [{"barcode": "TESTEMPTY001", "productName": "Product", "quantity": 5, "scannedAt": "2026-02-23T10:00:00Z"}]
            }
        ]
        
        # Upload
        requests.post(
            f"{BASE_URL}/api/sync/chunk",
            json={
                "batch_id": batch_id,
                "device_name": TEST_DEVICE_NAME,
                "sync_password": TEST_SYNC_PASSWORD,
                "client_id": CLIENT_ID,
                "session_id": SESSION_ID,
                "chunk_index": 0,
                "total_chunks": 1,
                "locations": locations
            }
        )
        
        # Finalize
        response = requests.post(
            f"{BASE_URL}/api/sync/finalize",
            json={
                "batch_id": batch_id,
                "device_name": TEST_DEVICE_NAME,
                "sync_password": TEST_SYNC_PASSWORD,
                "client_id": CLIENT_ID,
                "session_id": SESSION_ID,
                "total_locations": 2
            }
        )
        
        assert response.status_code == 200
        assert response.json()["locations_synced"] == 2


class TestSyncConfigEndpoint:
    """Tests for GET /api/sync/config endpoint"""
    
    def test_get_sync_config(self):
        """Test getting available clients and sessions for device config"""
        response = requests.get(f"{BASE_URL}/api/sync/config")
        
        assert response.status_code == 200
        data = response.json()
        
        assert "clients" in data
        assert "sessions" in data
        assert isinstance(data["clients"], list)
        assert isinstance(data["sessions"], list)
        
        # Verify we have our test client
        client_ids = [c["id"] for c in data["clients"]]
        assert CLIENT_ID in client_ids


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
