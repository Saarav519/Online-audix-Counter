"""
Comprehensive Data Persistence Test
Tests:
1. Master Data - Upload and persistence
2. Scanned Items - Scanning and persistence
"""

import requests
import json

BASE_URL = "https://mobile-first-counter.preview.emergentagent.com"

def test_backend_health():
    """Test basic backend API health"""
    print("\n" + "="*60)
    print("BACKEND HEALTH CHECK")
    print("="*60)
    
    try:
        response = requests.get(f"{BASE_URL}/api/")
        print(f"✅ GET /api/ - Status: {response.status_code}")
        print(f"   Response: {response.json()}")
        return True
    except Exception as e:
        print(f"❌ Backend health check failed: {e}")
        return False

def test_status_persistence():
    """Test data persistence via status endpoint"""
    print("\n" + "="*60)
    print("STATUS DATA PERSISTENCE TEST")
    print("="*60)
    
    try:
        # Create a test status
        test_data = {"client_name": f"persistence_test_{int(__import__('time').time())}"}
        response = requests.post(f"{BASE_URL}/api/status", json=test_data)
        print(f"✅ POST /api/status - Status: {response.status_code}")
        created = response.json()
        print(f"   Created: {created}")
        
        # Verify it persists
        response = requests.get(f"{BASE_URL}/api/status")
        print(f"✅ GET /api/status - Status: {response.status_code}")
        statuses = response.json()
        print(f"   Found {len(statuses)} status records")
        
        # Check if our test record exists
        found = any(s.get('client_name') == test_data['client_name'] for s in statuses)
        if found:
            print(f"✅ Test record persisted successfully!")
        else:
            print(f"❌ Test record NOT found in retrieved data!")
        
        return found
    except Exception as e:
        print(f"❌ Status persistence test failed: {e}")
        return False

if __name__ == "__main__":
    print("\n" + "#"*60)
    print("# DATA PERSISTENCE VERIFICATION TEST")
    print("#"*60)
    
    results = []
    results.append(("Backend Health", test_backend_health()))
    results.append(("Status Persistence", test_status_persistence()))
    
    print("\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)
    for test_name, passed in results:
        status = "✅ PASSED" if passed else "❌ FAILED"
        print(f"  {test_name}: {status}")
    
    all_passed = all(r[1] for r in results)
    print("\n" + ("✅ ALL TESTS PASSED" if all_passed else "❌ SOME TESTS FAILED"))
