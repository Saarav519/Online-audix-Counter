#!/usr/bin/env python3
"""
AUDIX User Management and Password Reset Backend API Testing
Testing Flow as specified in review request.
Backend URL: https://code-review-hub-19.preview.emergentagent.com
"""

import requests
import json
import sys
from datetime import datetime

# Backend configuration
BACKEND_URL = "https://code-review-hub-19.preview.emergentagent.com"
API_BASE = f"{BACKEND_URL}/api"

class UserManagementTester:
    def __init__(self):
        self.session = requests.Session()
        self.test_user_id = None
        self.admin_user_id = None
        self.test_results = {}
        
    def log_test(self, test_name, success, details):
        """Log test results"""
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} - {test_name}: {details}")
        self.test_results[test_name] = {"success": success, "details": details}
        return success

    def test_1_get_users_list(self):
        """Test 1: GET /api/portal/users - Should return list of users (at least admin user)"""
        try:
            response = self.session.get(f"{API_BASE}/portal/users")
            
            if response.status_code == 200:
                users = response.json()
                if isinstance(users, list) and len(users) > 0:
                    # Find admin user
                    admin_user = next((u for u in users if u.get('username') == 'admin'), None)
                    if admin_user:
                        self.admin_user_id = admin_user.get('id')
                        return self.log_test("GET /api/portal/users", True, 
                            f"Found {len(users)} users including admin user (ID: {self.admin_user_id})")
                    else:
                        return self.log_test("GET /api/portal/users", False, 
                            f"Admin user not found in {len(users)} users")
                else:
                    return self.log_test("GET /api/portal/users", False, 
                        f"Invalid response format or empty list: {users}")
            else:
                return self.log_test("GET /api/portal/users", False, 
                    f"Request failed - Status: {response.status_code}, Response: {response.text}")
                    
        except Exception as e:
            return self.log_test("GET /api/portal/users", False, f"Exception: {str(e)}")

    def test_2_register_new_user(self):
        """Test 2: POST /api/portal/register - Should return success with pending admin approval message"""
        try:
            register_data = {
                "username": "newuser1", 
                "password": "pass123"
            }
            
            response = self.session.post(f"{API_BASE}/portal/register", json=register_data)
            
            if response.status_code == 200:
                result = response.json()
                if "pending admin approval" in result.get("message", "").lower() and "user_id" in result:
                    self.test_user_id = result["user_id"]
                    return self.log_test("POST /api/portal/register", True, 
                        f"User registered successfully with pending approval - User ID: {self.test_user_id}")
                else:
                    return self.log_test("POST /api/portal/register", False, 
                        f"Invalid registration response: {result}")
            elif response.status_code == 400 and "already exists" in response.text:
                # User already exists, try to find them
                users_response = self.session.get(f"{API_BASE}/portal/users")
                if users_response.status_code == 200:
                    users = users_response.json()
                    test_user = next((u for u in users if u.get('username') == 'newuser1'), None)
                    if test_user:
                        self.test_user_id = test_user.get('id')
                        return self.log_test("POST /api/portal/register", True, 
                            f"User already exists - Found User ID: {self.test_user_id}")
                
                return self.log_test("POST /api/portal/register", False, 
                    f"User exists but couldn't find them: {response.text}")
            else:
                return self.log_test("POST /api/portal/register", False, 
                    f"Registration failed - Status: {response.status_code}, Response: {response.text}")
                    
        except Exception as e:
            return self.log_test("POST /api/portal/register", False, f"Exception: {str(e)}")

    def test_3_login_unapproved_user(self):
        """Test 3: POST /api/portal/login with unapproved user - Should FAIL with 403 pending admin approval error"""
        try:
            login_data = {
                "username": "newuser1", 
                "password": "pass123"
            }
            
            response = self.session.post(f"{API_BASE}/portal/login", json=login_data)
            
            if response.status_code == 403:
                error_msg = response.json().get("detail", "")
                if "pending admin approval" in error_msg.lower():
                    return self.log_test("POST /api/portal/login (unapproved)", True, 
                        f"Correctly rejected unapproved user - Error: {error_msg}")
                else:
                    return self.log_test("POST /api/portal/login (unapproved)", False, 
                        f"Wrong error message - Expected 'pending admin approval', got: {error_msg}")
            else:
                return self.log_test("POST /api/portal/login (unapproved)", False, 
                    f"Should have failed with 403 - Status: {response.status_code}, Response: {response.text}")
                    
        except Exception as e:
            return self.log_test("POST /api/portal/login (unapproved)", False, f"Exception: {str(e)}")

    def test_4_approve_user(self):
        """Test 4: PUT /api/portal/users/{user_id}/approve - Should approve the user"""
        try:
            if not self.test_user_id:
                return self.log_test("PUT /api/portal/users/{user_id}/approve", False, "No test_user_id available")
            
            response = self.session.put(f"{API_BASE}/portal/users/{self.test_user_id}/approve")
            
            if response.status_code == 200:
                result = response.json()
                if "approved successfully" in result.get("message", "").lower():
                    return self.log_test("PUT /api/portal/users/{user_id}/approve", True, 
                        f"User approved successfully - Message: {result['message']}")
                else:
                    return self.log_test("PUT /api/portal/users/{user_id}/approve", False, 
                        f"Invalid approval response: {result}")
            else:
                return self.log_test("PUT /api/portal/users/{user_id}/approve", False, 
                    f"Approval failed - Status: {response.status_code}, Response: {response.text}")
                    
        except Exception as e:
            return self.log_test("PUT /api/portal/users/{user_id}/approve", False, f"Exception: {str(e)}")

    def test_5_login_approved_user(self):
        """Test 5: POST /api/portal/login with approved user - Should now SUCCEED"""
        try:
            login_data = {
                "username": "newuser1", 
                "password": "pass123"
            }
            
            response = self.session.post(f"{API_BASE}/portal/login", json=login_data)
            
            if response.status_code == 200:
                result = response.json()
                user_data = result.get("user", {})
                if user_data.get("username") == "newuser1" and "id" in user_data:
                    return self.log_test("POST /api/portal/login (approved)", True, 
                        f"Approved user login successful - Username: {user_data['username']}, Role: {user_data.get('role')}")
                else:
                    return self.log_test("POST /api/portal/login (approved)", False, 
                        f"Invalid login response: {result}")
            else:
                return self.log_test("POST /api/portal/login (approved)", False, 
                    f"Login failed - Status: {response.status_code}, Response: {response.text}")
                    
        except Exception as e:
            return self.log_test("POST /api/portal/login (approved)", False, f"Exception: {str(e)}")

    def test_6_reset_password(self):
        """Test 6: POST /api/portal/reset-password - Should reset password"""
        try:
            reset_data = {
                "username": "newuser1", 
                "new_password": "newpass456"
            }
            
            response = self.session.post(f"{API_BASE}/portal/reset-password", json=reset_data)
            
            if response.status_code == 200:
                result = response.json()
                if "password reset successful" in result.get("message", "").lower():
                    return self.log_test("POST /api/portal/reset-password", True, 
                        f"Password reset successful - Message: {result['message']}")
                else:
                    return self.log_test("POST /api/portal/reset-password", False, 
                        f"Invalid reset response: {result}")
            else:
                return self.log_test("POST /api/portal/reset-password", False, 
                    f"Reset failed - Status: {response.status_code}, Response: {response.text}")
                    
        except Exception as e:
            return self.log_test("POST /api/portal/reset-password", False, f"Exception: {str(e)}")

    def test_7_login_with_new_password(self):
        """Test 7: POST /api/portal/login with new password - Should succeed"""
        try:
            login_data = {
                "username": "newuser1", 
                "password": "newpass456"
            }
            
            response = self.session.post(f"{API_BASE}/portal/login", json=login_data)
            
            if response.status_code == 200:
                result = response.json()
                user_data = result.get("user", {})
                if user_data.get("username") == "newuser1":
                    return self.log_test("POST /api/portal/login (new password)", True, 
                        f"Login with new password successful - Username: {user_data['username']}")
                else:
                    return self.log_test("POST /api/portal/login (new password)", False, 
                        f"Invalid login response: {result}")
            else:
                return self.log_test("POST /api/portal/login (new password)", False, 
                    f"Login failed - Status: {response.status_code}, Response: {response.text}")
                    
        except Exception as e:
            return self.log_test("POST /api/portal/login (new password)", False, f"Exception: {str(e)}")

    def test_8_toggle_user_active(self):
        """Test 8: PUT /api/portal/users/{user_id}/toggle-active - Should disable user"""
        try:
            if not self.test_user_id:
                return self.log_test("PUT /api/portal/users/{user_id}/toggle-active", False, "No test_user_id available")
            
            response = self.session.put(f"{API_BASE}/portal/users/{self.test_user_id}/toggle-active")
            
            if response.status_code == 200:
                result = response.json()
                message = result.get("message", "").lower()
                is_active = result.get("is_active")
                if "disabled" in message and is_active is False:
                    return self.log_test("PUT /api/portal/users/{user_id}/toggle-active", True, 
                        f"User disabled successfully - Message: {result['message']}, is_active: {is_active}")
                else:
                    return self.log_test("PUT /api/portal/users/{user_id}/toggle-active", False, 
                        f"Invalid toggle response: {result}")
            else:
                return self.log_test("PUT /api/portal/users/{user_id}/toggle-active", False, 
                    f"Toggle failed - Status: {response.status_code}, Response: {response.text}")
                    
        except Exception as e:
            return self.log_test("PUT /api/portal/users/{user_id}/toggle-active", False, f"Exception: {str(e)}")

    def test_9_login_disabled_user(self):
        """Test 9: POST /api/portal/login with disabled user - Should FAIL with 403 account disabled error"""
        try:
            login_data = {
                "username": "newuser1", 
                "password": "newpass456"
            }
            
            response = self.session.post(f"{API_BASE}/portal/login", json=login_data)
            
            if response.status_code == 403:
                error_msg = response.json().get("detail", "")
                if "disabled" in error_msg.lower():
                    return self.log_test("POST /api/portal/login (disabled)", True, 
                        f"Correctly rejected disabled user - Error: {error_msg}")
                else:
                    return self.log_test("POST /api/portal/login (disabled)", False, 
                        f"Wrong error message - Expected 'disabled', got: {error_msg}")
            else:
                return self.log_test("POST /api/portal/login (disabled)", False, 
                    f"Should have failed with 403 - Status: {response.status_code}, Response: {response.text}")
                    
        except Exception as e:
            return self.log_test("POST /api/portal/login (disabled)", False, f"Exception: {str(e)}")

    def test_10_change_user_role(self):
        """Test 10: PUT /api/portal/users/{user_id}/role - Should change role to admin"""
        try:
            if not self.test_user_id:
                return self.log_test("PUT /api/portal/users/{user_id}/role", False, "No test_user_id available")
            
            role_data = {"role": "admin"}
            response = self.session.put(f"{API_BASE}/portal/users/{self.test_user_id}/role", json=role_data)
            
            if response.status_code == 200:
                result = response.json()
                if "role changed to admin" in result.get("message", "").lower():
                    return self.log_test("PUT /api/portal/users/{user_id}/role", True, 
                        f"User role changed successfully - Message: {result['message']}")
                else:
                    return self.log_test("PUT /api/portal/users/{user_id}/role", False, 
                        f"Invalid role change response: {result}")
            else:
                return self.log_test("PUT /api/portal/users/{user_id}/role", False, 
                    f"Role change failed - Status: {response.status_code}, Response: {response.text}")
                    
        except Exception as e:
            return self.log_test("PUT /api/portal/users/{user_id}/role", False, f"Exception: {str(e)}")

    def test_11_delete_test_user(self):
        """Test 11: DELETE /api/portal/users/{user_id} - Should delete the test user"""
        try:
            if not self.test_user_id:
                return self.log_test("DELETE /api/portal/users/{user_id}", False, "No test_user_id available")
            
            response = self.session.delete(f"{API_BASE}/portal/users/{self.test_user_id}")
            
            if response.status_code == 200:
                result = response.json()
                if "deleted successfully" in result.get("message", "").lower():
                    return self.log_test("DELETE /api/portal/users/{user_id}", True, 
                        f"User deleted successfully - Message: {result['message']}")
                else:
                    return self.log_test("DELETE /api/portal/users/{user_id}", False, 
                        f"Invalid delete response: {result}")
            else:
                return self.log_test("DELETE /api/portal/users/{user_id}", False, 
                    f"Delete failed - Status: {response.status_code}, Response: {response.text}")
                    
        except Exception as e:
            return self.log_test("DELETE /api/portal/users/{user_id}", False, f"Exception: {str(e)}")

    def test_12_delete_admin_user_should_fail(self):
        """Test 12: DELETE /api/portal/users/{admin_id} - Should FAIL with 400 cannot delete admin"""
        try:
            if not self.admin_user_id:
                return self.log_test("DELETE /api/portal/users/{admin_id} (should fail)", False, "No admin_user_id available")
            
            response = self.session.delete(f"{API_BASE}/portal/users/{self.admin_user_id}")
            
            if response.status_code == 400:
                error_msg = response.json().get("detail", "")
                if "cannot delete" in error_msg.lower() and "admin" in error_msg.lower():
                    return self.log_test("DELETE /api/portal/users/{admin_id} (should fail)", True, 
                        f"Correctly prevented admin deletion - Error: {error_msg}")
                else:
                    return self.log_test("DELETE /api/portal/users/{admin_id} (should fail)", False, 
                        f"Wrong error message - Expected 'cannot delete admin', got: {error_msg}")
            else:
                return self.log_test("DELETE /api/portal/users/{admin_id} (should fail)", False, 
                    f"Should have failed with 400 - Status: {response.status_code}, Response: {response.text}")
                    
        except Exception as e:
            return self.log_test("DELETE /api/portal/users/{admin_id} (should fail)", False, f"Exception: {str(e)}")

    def test_13_dashboard_users_stats(self):
        """Test 13: GET /api/portal/dashboard - Should return total_users and pending_users (NOT unread_alerts)"""
        try:
            response = self.session.get(f"{API_BASE}/portal/dashboard")
            
            if response.status_code == 200:
                result = response.json()
                stats = result.get("stats", {})
                
                if "total_users" in stats and "pending_users" in stats:
                    total_users = stats["total_users"]
                    pending_users = stats["pending_users"]
                    
                    # Check that unread_alerts is NOT present
                    if "unread_alerts" not in stats:
                        return self.log_test("GET /api/portal/dashboard", True, 
                            f"Dashboard correctly returns user stats - total_users: {total_users}, pending_users: {pending_users}, no unread_alerts field")
                    else:
                        return self.log_test("GET /api/portal/dashboard", False, 
                            f"Dashboard still contains unread_alerts field - Stats: {stats}")
                else:
                    return self.log_test("GET /api/portal/dashboard", False, 
                        f"Missing total_users or pending_users in stats - Stats: {stats}")
            else:
                return self.log_test("GET /api/portal/dashboard", False, 
                    f"Dashboard request failed - Status: {response.status_code}, Response: {response.text}")
                    
        except Exception as e:
            return self.log_test("GET /api/portal/dashboard", False, f"Exception: {str(e)}")

    def run_all_tests(self):
        """Run all tests in sequence"""
        print(f"🚀 AUDIX User Management and Password Reset Backend API Testing")
        print(f"Backend URL: {BACKEND_URL}")
        print("=" * 80)
        
        tests = [
            self.test_1_get_users_list,
            self.test_2_register_new_user,
            self.test_3_login_unapproved_user,
            self.test_4_approve_user,
            self.test_5_login_approved_user,
            self.test_6_reset_password,
            self.test_7_login_with_new_password,
            self.test_8_toggle_user_active,
            self.test_9_login_disabled_user,
            self.test_10_change_user_role,
            self.test_11_delete_test_user,
            self.test_12_delete_admin_user_should_fail,
            self.test_13_dashboard_users_stats
        ]
        
        passed = 0
        total = len(tests)
        
        for test in tests:
            if test():
                passed += 1
            print()  # Add space between tests
        
        print("=" * 80)
        print(f"🎯 TEST SUMMARY: {passed}/{total} tests passed ({passed/total*100:.1f}%)")
        
        if passed == total:
            print("🎉 ALL TESTS PASSED - USER MANAGEMENT AND PASSWORD RESET APIs WORKING CORRECTLY")
        else:
            print("⚠️  SOME TESTS FAILED - CHECK DETAILS ABOVE")
            
        return passed == total

if __name__ == "__main__":
    tester = UserManagementTester()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)