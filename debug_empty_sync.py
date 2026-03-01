#!/usr/bin/env python3
"""
Debug script to check what's in the database after syncing an empty location
"""

import requests
import json
from datetime import datetime

# Backend configuration
BACKEND_URL = "https://count-test.preview.emergentagent.com"
API_BASE = f"{BACKEND_URL}/api"

def debug_sync_and_report():
    session = requests.Session()
    
    # Login
    login_data = {"username": "admin", "password": "admin123"}
    login_response = session.post(f"{API_BASE}/portal/login", json=login_data)
    print(f"Login status: {login_response.status_code}")
    
    # Get sessions
    sessions_response = session.get(f"{API_BASE}/portal/sessions")
    sessions = sessions_response.json()
    first_session = sessions[0]
    session_id = first_session.get("id")
    client_id = first_session.get("client_id")
    
    print(f"Using session_id: {session_id}, client_id: {client_id}")
    
    # Sync empty location with different name
    import time
    unique_location = f"EMPTY-DEBUG-{int(time.time() % 10000)}"
    
    sync_data = {
        "device_name": "debug-empty-sync",
        "sync_password": "audix2024",
        "client_id": client_id,
        "session_id": session_id,
        "locations": [
            {
                "name": unique_location,
                "is_empty": True,
                "empty_remarks": "Empty Bin — Debug test location",
                "items": []
            }
        ]
    }
    
    sync_response = session.post(f"{API_BASE}/sync/", json=sync_data)
    print(f"Sync status: {sync_response.status_code}")
    print(f"Sync response: {sync_response.json()}")
    
    # Check bin-wise report
    report_response = session.get(f"{API_BASE}/portal/reports/{session_id}/bin-wise")
    report_data = report_response.json()
    
    print(f"\nBin-wise Report Summary: {report_data.get('summary', {})}")
    
    locations = report_data.get('report', [])
    print(f"Total locations in report: {len(locations)}")
    
    # Look for our debug location
    debug_location = None
    for loc in locations:
        if loc.get('location') == unique_location:
            debug_location = loc
            break
    
    if debug_location:
        print(f"Found debug location: {debug_location}")
    else:
        print(f"Debug location '{unique_location}' NOT found in report")
        print(f"Available locations: {[loc.get('location') for loc in locations]}")
        
        # Check if any location has is_empty = True
        empty_locations = [loc for loc in locations if loc.get('is_empty') is True]
        print(f"Locations with is_empty=True: {empty_locations}")

if __name__ == "__main__":
    debug_sync_and_report()