#!/usr/bin/env python3
"""
Backend API Testing for Audix Stock Management App
Tests the FastAPI backend endpoints
"""

import requests
import json
import os
from datetime import datetime
import sys

# Get backend URL from frontend .env file
def get_backend_url():
    try:
        with open('/app/frontend/.env', 'r') as f:
            for line in f:
                if line.startswith('REACT_APP_BACKEND_URL='):
                    return line.split('=', 1)[1].strip()
    except Exception as e:
        print(f"Error reading frontend .env: {e}")
        return None

def test_backend_health():
    """Test basic backend health and connectivity"""
    backend_url = get_backend_url()
    if not backend_url:
        print("❌ Could not get backend URL from frontend/.env")
        return False
    
    print(f"🔍 Testing backend at: {backend_url}")
    
    try:
        # Test root endpoint
        response = requests.get(f"{backend_url}/", timeout=10)
        if response.status_code == 200:
            data = response.json()
            if data.get("message") == "Hello World":
                print("✅ Backend root endpoint working")
                return True
            else:
                print(f"❌ Unexpected response from root: {data}")
                return False
        else:
            print(f"❌ Backend root endpoint failed: {response.status_code}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"❌ Backend connection failed: {e}")
        return False

def test_status_endpoints():
    """Test status check endpoints (POST and GET)"""
    backend_url = get_backend_url()
    if not backend_url:
        return False
    
    try:
        # Test POST /api/status
        test_data = {
            "client_name": "test_client_backend_testing"
        }
        
        response = requests.post(f"{backend_url}/status", 
                               json=test_data, 
                               timeout=10)
        
        if response.status_code == 200:
            created_status = response.json()
            print("✅ POST /api/status working")
            print(f"   Created status with ID: {created_status.get('id')}")
        else:
            print(f"❌ POST /api/status failed: {response.status_code}")
            return False
        
        # Test GET /api/status
        response = requests.get(f"{backend_url}/status", timeout=10)
        
        if response.status_code == 200:
            status_list = response.json()
            print(f"✅ GET /api/status working - Retrieved {len(status_list)} status checks")
            
            # Verify our test data is in the list
            test_found = any(status.get('client_name') == 'test_client_backend_testing' 
                           for status in status_list)
            if test_found:
                print("✅ Test data successfully stored and retrieved")
            else:
                print("⚠️  Test data not found in retrieved list")
            
            return True
        else:
            print(f"❌ GET /api/status failed: {response.status_code}")
            return False
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Status endpoints test failed: {e}")
        return False

def main():
    """Run all backend tests"""
    print("🚀 Starting Backend API Tests for Audix Stock Management")
    print("=" * 60)
    
    # Test backend health
    health_ok = test_backend_health()
    
    if not health_ok:
        print("\n❌ Backend health check failed - skipping other tests")
        return False
    
    # Test status endpoints
    status_ok = test_status_endpoints()
    
    print("\n" + "=" * 60)
    if health_ok and status_ok:
        print("🎉 ALL BACKEND TESTS PASSED")
        return True
    else:
        print("❌ SOME BACKEND TESTS FAILED")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)