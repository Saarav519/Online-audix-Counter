#!/usr/bin/env python3

import requests
import json

BACKEND_URL = "https://master-stock-config.preview.emergentagent.com/api"

# Login and get session
login_data = {"username": "admin", "password": "admin123"}
requests.post(f"{BACKEND_URL}/portal/login", json=login_data)

sessions_response = requests.get(f"{BACKEND_URL}/portal/sessions")
session = sessions_response.json()[0]
session_id = session.get('id')

print(f"🔍 DEBUGGING BIN-WISE REPORT FOR SESSION: {session_id}")

# Get bin-wise report
binwise_response = requests.get(f"{BACKEND_URL}/portal/reports/{session_id}/bin-wise")
binwise_data = binwise_response.json()

print(f"Bin-wise report status: {binwise_response.status_code}")
print(f"Response keys: {list(binwise_data.keys())}")

locations = binwise_data.get('locations', [])
print(f"Total locations in report: {len(locations)}")

for i, loc in enumerate(locations[:5]):
    print(f"{i+1}. Location: {loc.get('location')}")
    print(f"   Status: {loc.get('status')}")
    print(f"   Stock: {loc.get('stock_qty')}, Physical: {loc.get('physical_qty')}")
    print()

# Check if we have summary
summary = binwise_data.get('summary', {})
print(f"Summary: {summary}")

# Also check current conflicts
conflicts_response = requests.get(f"{BACKEND_URL}/portal/conflicts")
if conflicts_response.status_code == 200:
    conflicts = conflicts_response.json()
    print(f"\nCurrent conflicts: {len(conflicts)}")
    for conflict in conflicts:
        print(f"- {conflict.get('location_name')} (status: {conflict.get('status')})")