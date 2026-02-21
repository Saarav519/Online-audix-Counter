#!/usr/bin/env python3
"""
Backend API Health Check Test
Tests the 3 core endpoints after frontend changes to scanner hook
"""

import requests
import json
import sys
from datetime import datetime

# Backend URL from environment
BACKEND_URL = "https://counter-scanner-view-1.preview.emergentagent.com/api"

def test_root_endpoint():
    """Test GET /api/ - should return Hello World message"""
    print("🔍 Testing GET /api/ (Root endpoint)")
    try:
        response = requests.get(f"{BACKEND_URL}/")
        print(f"   Status: {response.status_code}")
        print(f"   Response: {response.text}")
        
        if response.status_code == 200:
            data = response.json()
            if data.get("message") == "Hello World":
                print("   ✅ PASS: Root endpoint working correctly")
                return True
            else:
                print(f"   ❌ FAIL: Expected 'Hello World', got {data}")
                return False
        else:
            print(f"   ❌ FAIL: Expected status 200, got {response.status_code}")
            return False
            
    except Exception as e:
        print(f"   ❌ ERROR: {str(e)}")
        return False

def test_create_status():
    """Test POST /api/status - should create a status record"""
    print("\n🔍 Testing POST /api/status (Create status record)")
    try:
        payload = {"client_name": "health_check_test"}
        response = requests.post(
            f"{BACKEND_URL}/status", 
            json=payload,
            headers={"Content-Type": "application/json"}
        )
        print(f"   Status: {response.status_code}")
        print(f"   Response: {response.text}")
        
        if response.status_code == 200:
            data = response.json()
            if "id" in data and "client_name" in data and "timestamp" in data:
                print(f"   ✅ PASS: Status record created with ID {data.get('id')}")
                return True, data.get('id')
            else:
                print(f"   ❌ FAIL: Missing expected fields in response")
                return False, None
        else:
            print(f"   ❌ FAIL: Expected status 200, got {response.status_code}")
            return False, None
            
    except Exception as e:
        print(f"   ❌ ERROR: {str(e)}")
        return False, None

def test_get_all_status():
    """Test GET /api/status - should return all status records"""
    print("\n🔍 Testing GET /api/status (Get all status records)")
    try:
        response = requests.get(f"{BACKEND_URL}/status")
        print(f"   Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"   Records found: {len(data)} records")
            if len(data) > 0:
                print(f"   Sample record keys: {list(data[0].keys())}")
            print("   ✅ PASS: Successfully retrieved all status records")
            return True, len(data)
        else:
            print(f"   ❌ FAIL: Expected status 200, got {response.status_code}")
            return False, 0
            
    except Exception as e:
        print(f"   ❌ ERROR: {str(e)}")
        return False, 0

def run_health_check():
    """Run all health check tests"""
    print("=" * 60)
    print("BACKEND API HEALTH CHECK")
    print(f"Backend URL: {BACKEND_URL}")
    print(f"Test time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)
    
    results = []
    
    # Test 1: Root endpoint
    results.append(test_root_endpoint())
    
    # Test 2: Create status
    success, record_id = test_create_status()
    results.append(success)
    
    # Test 3: Get all status
    success, record_count = test_get_all_status()
    results.append(success)
    
    # Summary
    print("\n" + "=" * 60)
    print("HEALTH CHECK SUMMARY")
    print("=" * 60)
    passed = sum(results)
    total = len(results)
    
    print(f"Tests passed: {passed}/{total}")
    
    if passed == total:
        print("🎉 ALL TESTS PASSED - Backend is healthy!")
        return True
    else:
        print("❌ SOME TESTS FAILED - Backend has issues!")
        return False

if __name__ == "__main__":
    success = run_health_check()
    sys.exit(0 if success else 1)