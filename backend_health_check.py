#!/usr/bin/env python3
"""
Quick health check for existing AUDIX backend endpoints after Restore Sync Backup feature testing
"""
import requests
import json

BASE_URL = "https://count-test.preview.emergentagent.com"

def test_portal_login():
    """Test portal login functionality"""
    print("\n=== Portal Login Test ===")
    
    try:
        response = requests.post(
            f"{BASE_URL}/api/portal/login",
            json={"username": "admin", "password": "admin123"},
            timeout=30
        )
        
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            if 'user' in result and result['user'].get('username') == 'admin':
                print("✅ Portal Login PASSED")
                return True
        
        print("❌ Portal Login FAILED")
        return False
        
    except Exception as e:
        print(f"❌ Portal Login FAILED: {e}")
        return False

def test_clients_endpoint():
    """Test clients endpoint"""
    print("\n=== Clients Endpoint Test ===")
    
    try:
        response = requests.get(f"{BASE_URL}/api/portal/clients", timeout=30)
        
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            clients = response.json()
            if isinstance(clients, list):
                print(f"✅ Clients Endpoint PASSED - Found {len(clients)} clients")
                return True
        
        print("❌ Clients Endpoint FAILED")
        return False
        
    except Exception as e:
        print(f"❌ Clients Endpoint FAILED: {e}")
        return False

def test_dashboard():
    """Test dashboard endpoint"""
    print("\n=== Dashboard Test ===")
    
    try:
        response = requests.get(f"{BASE_URL}/api/portal/dashboard", timeout=30)
        
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            if 'stats' in result:
                print("✅ Dashboard PASSED")
                return True
        
        print("❌ Dashboard FAILED")
        return False
        
    except Exception as e:
        print(f"❌ Dashboard FAILED: {e}")
        return False

def main():
    """Run quick health check"""
    print("🏥 AUDIX Backend Health Check Post-Restore Feature")
    print("=" * 60)
    
    tests = [
        test_portal_login,
        test_clients_endpoint, 
        test_dashboard
    ]
    
    passed = 0
    total = len(tests)
    
    for test in tests:
        if test():
            passed += 1
    
    print(f"\n📊 HEALTH CHECK SUMMARY: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 Backend is healthy after Restore Sync Backup feature")
    else:
        print("⚠️  Some backend issues detected")
    
    return passed == total

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)