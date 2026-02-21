#!/usr/bin/env python3
"""
Backend Health Check Test Script for AUDIX Stock Management App
Tests the 3 core API endpoints after frontend changes
"""

import requests
import json
import sys
from datetime import datetime

# Backend URL from frontend/.env
BACKEND_URL = "https://mobile-counter-view.preview.emergentagent.com/api"

def test_root_endpoint():
    """Test GET /api/ endpoint"""
    print("🔍 Testing GET /api/ endpoint...")
    try:
        response = requests.get(f"{BACKEND_URL}/", timeout=10)
        print(f"   Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"   Response: {data}")
            
            if data.get("message") == "Hello World":
                print("   ✅ ROOT ENDPOINT - PASSED")
                return True
            else:
                print("   ❌ ROOT ENDPOINT - FAILED: Incorrect message")
                return False
        else:
            print(f"   ❌ ROOT ENDPOINT - FAILED: Status {response.status_code}")
            return False
            
    except requests.exceptions.RequestException as e:
        print(f"   ❌ ROOT ENDPOINT - FAILED: {e}")
        return False

def test_create_status():
    """Test POST /api/status endpoint"""
    print("\n🔍 Testing POST /api/status endpoint...")
    try:
        payload = {"client_name": "test"}
        response = requests.post(f"{BACKEND_URL}/status", 
                               json=payload, 
                               headers={"Content-Type": "application/json"},
                               timeout=10)
        print(f"   Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"   Response: {data}")
            
            # Verify required fields
            required_fields = ["id", "client_name", "timestamp"]
            if all(field in data for field in required_fields):
                if data["client_name"] == "test" and data["id"]:
                    print("   ✅ CREATE STATUS - PASSED")
                    return True, data["id"]
                else:
                    print("   ❌ CREATE STATUS - FAILED: Invalid field values")
                    return False, None
            else:
                print("   ❌ CREATE STATUS - FAILED: Missing required fields")
                return False, None
        else:
            print(f"   ❌ CREATE STATUS - FAILED: Status {response.status_code}")
            return False, None
            
    except requests.exceptions.RequestException as e:
        print(f"   ❌ CREATE STATUS - FAILED: {e}")
        return False, None

def test_get_status():
    """Test GET /api/status endpoint"""
    print("\n🔍 Testing GET /api/status endpoint...")
    try:
        response = requests.get(f"{BACKEND_URL}/status", timeout=10)
        print(f"   Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"   Response: Found {len(data)} records")
            
            if isinstance(data, list):
                print("   ✅ GET STATUS - PASSED")
                return True, len(data)
            else:
                print("   ❌ GET STATUS - FAILED: Response is not a list")
                return False, 0
        else:
            print(f"   ❌ GET STATUS - FAILED: Status {response.status_code}")
            return False, 0
            
    except requests.exceptions.RequestException as e:
        print(f"   ❌ GET STATUS - FAILED: {e}")
        return False, 0

def main():
    """Main test execution"""
    print("=" * 60)
    print("🚀 AUDIX STOCK MANAGEMENT - BACKEND HEALTH CHECK")
    print("=" * 60)
    print(f"Backend URL: {BACKEND_URL}")
    print(f"Test Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()
    
    # Track test results
    results = []
    
    # Test 1: Root endpoint
    results.append(test_root_endpoint())
    
    # Test 2: Create status
    create_passed, created_id = test_create_status()
    results.append(create_passed)
    
    # Test 3: Get status
    get_passed, record_count = test_get_status()
    results.append(get_passed)
    
    # Summary
    print("\n" + "=" * 60)
    print("📊 TEST SUMMARY")
    print("=" * 60)
    passed = sum(results)
    total = len(results)
    
    print(f"✅ Tests Passed: {passed}/{total}")
    print(f"❌ Tests Failed: {total - passed}/{total}")
    
    if passed == total:
        print("\n🎉 ALL BACKEND HEALTH CHECKS PASSED!")
        print("   Backend is healthy and ready for production use.")
        return True
    else:
        print(f"\n⚠️  {total - passed} BACKEND HEALTH CHECK(S) FAILED!")
        print("   Backend requires attention before production use.")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)