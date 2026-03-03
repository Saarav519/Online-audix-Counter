# ============================================================
# AUDIX SaaS PLATFORM — FULL IMPLEMENTATION GUIDE
# ============================================================
# 
# YE DOCUMENT EK AGENT KO DENA HAI JO ACCOUNT B (LIVE - audix.co.in)
# PE KAAM KAREGA. ISMEIN SAB KUCH HAI — CONTEXT, CODE, STEPS, TESTING.
#
# AGENT KO PHASE-BY-PHASE IMPLEMENT KARNA HAI.
# EK PHASE COMPLETE HONE KE BAAD HI AGLA PHASE SHURU KARE.
#
# ============================================================

---

## SECTION A: CURRENT STATE — KYA HAI ABHI

### A1. Application Overview
Audix is an audit/inventory reconciliation platform:
- **Scanner App** (Android/Capacitor): Field workers scan barcodes at warehouse/store locations
- **Web Portal** (React): Admin portal for managing clients, sessions, reports, sync data
- **Backend** (FastAPI + MongoDB): Central API server

### A2. Current Tech Stack
- Backend: Python FastAPI, Motor (async MongoDB driver), Pydantic
- Frontend: React.js, Tailwind CSS, Radix UI components, React Router
- Database: MongoDB
- Scanner: Capacitor (Android wrapper for React app)
- Deployment: Emergent Platform

### A3. Current File Structure
```
repo/
├── backend/
│   ├── server.py              # 4900+ lines — ALL backend code in one file
│   ├── requirements.txt
│   └── .env                   # MONGO_URL, DB_NAME
├── frontend/
│   ├── src/
│   │   ├── App.js             # Router — portal routes + scanner routes
│   │   ├── pages/
│   │   │   ├── portal/        # Admin portal pages (desktop/web)
│   │   │   │   ├── PortalLogin.jsx
│   │   │   │   ├── PortalLayout.jsx
│   │   │   │   ├── PortalDashboard.jsx
│   │   │   │   ├── PortalClients.jsx
│   │   │   │   ├── PortalSessions.jsx
│   │   │   │   ├── PortalDevices.jsx
│   │   │   │   ├── PortalReports.jsx
│   │   │   │   ├── PortalSyncLogs.jsx
│   │   │   │   ├── PortalUsers.jsx
│   │   │   │   └── PortalConflicts.jsx
│   │   │   ├── Login.jsx          # Scanner login
│   │   │   ├── ScanItems.jsx      # Scanner main page
│   │   │   ├── MasterData.jsx     # Scanner master data
│   │   │   ├── Reports.jsx        # Scanner reports
│   │   │   ├── Settings.jsx       # Scanner sync settings
│   │   │   ├── Dashboard.jsx
│   │   │   └── Locations.jsx
│   │   ├── components/
│   │   │   ├── Layout.jsx
│   │   │   ├── MobileOnlyGuard.jsx    # Blocks desktop for scanner routes
│   │   │   ├── PWAInstallPrompt.jsx
│   │   │   ├── ErrorBoundary.jsx
│   │   │   └── ui/                     # Radix/shadcn components
│   │   ├── context/AppContext.js       # Scanner app state
│   │   ├── data/mockData.js
│   │   ├── utils/
│   │   └── hooks/
│   ├── android/                # Capacitor Android project
│   ├── capacitor.config.json
│   ├── package.json
│   └── .env                    # REACT_APP_BACKEND_URL
└── .github/
    └── workflows/              # Current: pushes to separate repo for APK build
```

### A4. Current API Route Prefixes
```
api_router    → /api/audit/portal/...    (portal endpoints)
sync_router   → /api/audit/sync/...      (scanner sync endpoints)
api_router    → /api/...                  (general endpoints)
```

### A5. Current Auth System
- Portal: HTTP Basic Auth (username/password sent with every request)
- Scanner: Device name + sync password (simple verification)
- Portal users stored in `portal_users` collection
- Default admin: username=admin, password=admin123

### A6. Current Database Collections
```
portal_users        — admin portal users
clients             — client companies (Reliance, DMart etc.)
audit_sessions      — audit sessions per client
master_products     — product catalog per client
expected_stock      — expected inventory per session
client_stock        — warehouse-level stock
client_schemas      — per-client field definitions
synced_locations    — variance data (forwarded from inbox)
sync_inbox          — staging area (pending forward)
sync_raw_logs       — raw sync audit trail
sync_staging        — chunked sync temp storage
conflict_locations  — duplicate location conflicts
devices             — registered scanner devices
alerts              — system alerts
reco_adjustments    — reconciliation adjustments
status_checks       — health checks
```

### A7. IMPORTANT — Current Problems to Fix
1. **No multi-tenancy** — all data is shared, single user system
2. **No subscription** — anyone can use for free
3. **No desktop app** — portal only works in browser
4. **Scanner APK builds in separate repo** — uses GitHub token to push code to another repo
5. **Portal is slow** on web — needs desktop app with local caching
6. **No super admin** — no way to track users/revenue

---

## SECTION B: TARGET STATE — KYA BANANA HAI

### B1. Final Architecture
```
audix.co.in (Website):
├── / (Landing Page — public, marketing)
├── /pricing (Subscription plans — public)
├── /register (New company registration — public)
├── /login (User login — public)
├── /dashboard (User dashboard — after login)
│   ├── Download Scanner APK link
│   ├── Download Desktop EXE link
│   ├── Manage subscription
│   └── Account settings
├── /portal/* (REMOVED or redirects to "Download Desktop App")
└── /superadmin/* (Owner-only admin panel)

Scanner App (.apk — downloaded from website):
├── Login with tenant credentials
├── Scan barcodes
├── Sync to server (data goes to that tenant only)
└── Auto-update check

Desktop App (.exe — downloaded from website):
├── Login with tenant credentials
├── Full portal experience (dashboard, clients, reports, etc.)
├── Local SQLite cache for speed
├── System tray, notifications
└── Auto-update from GitHub Releases

GitHub (SINGLE repo):
├── All code
├── GitHub Actions:
│   ├── Build APK (on version tag)
│   ├── Build EXE (on version tag)
│   └── Deploy website (on push to main)
└── Releases (APK + EXE download links)
```

### B2. Data Flow
```
Scanner App ──(JWT auth)──→ Backend API ←──(JWT auth)── Desktop App
       │                        │                           │
       │                   MongoDB                          │
       │              (tenant_id isolation)                  │
       │                        │                           │
       └── tenant_id: "abc" ────┼──── tenant_id: "abc" ────┘
                                │
                    tenant_id: "xyz" (different company)
                    ← Cannot see "abc" data
```

---

## SECTION C: PHASE-BY-PHASE IMPLEMENTATION

================================================================
## PHASE 1: MULTI-TENANT ARCHITECTURE + JWT AUTH
## Priority: HIGHEST — Do this FIRST
## Estimated time: 1-2 sessions
================================================================

### WHAT TO DO:
1. Add JWT authentication (replace HTTP Basic)
2. Add `tenant_id` to all database collections
3. Add `tenants` and `tenant_users` collections
4. Modify every API endpoint to filter by tenant_id
5. Create registration flow for new tenants

### STEP 1.1: Install new dependencies

```bash
pip install python-jose[cryptography] passlib[bcrypt]
```

Add to requirements.txt:
```
python-jose[cryptography]>=3.3.0
```

### STEP 1.2: Add to backend .env
```
JWT_SECRET=generate-a-random-64-character-string-here-use-openssl-rand
JWT_ALGORITHM=HS256
JWT_EXPIRY_HOURS=24
SUPERADMIN_USERNAME=audixowner
SUPERADMIN_PASSWORD=<OWNER WILL PROVIDE>
```

### STEP 1.3: New Auth Module

Create file: `backend/auth.py`
```python
from jose import jwt, JWTError
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import os
import hashlib

JWT_SECRET = os.environ.get("JWT_SECRET")
JWT_ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256")
JWT_EXPIRY_HOURS = int(os.environ.get("JWT_EXPIRY_HOURS", "24"))

security_bearer = HTTPBearer()

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def verify_password(password: str, password_hash: str) -> bool:
    return hash_password(password) == password_hash

def create_jwt_token(user_id: str, tenant_id: str, username: str, role: str) -> str:
    payload = {
        "user_id": user_id,
        "tenant_id": tenant_id,
        "username": username,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS),
        "iat": datetime.now(timezone.utc)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_jwt_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security_bearer)) -> dict:
    """Extract and verify user from JWT token. Returns dict with user_id, tenant_id, role."""
    token = credentials.credentials
    payload = decode_jwt_token(token)
    return {
        "user_id": payload["user_id"],
        "tenant_id": payload["tenant_id"],
        "username": payload["username"],
        "role": payload["role"]
    }

async def verify_superadmin(credentials: HTTPAuthorizationCredentials = Depends(security_bearer)) -> dict:
    """Verify that the user is the platform super admin."""
    user = await get_current_user(credentials)
    if user["role"] != "superadmin":
        raise HTTPException(status_code=403, detail="Super admin access required")
    return user
```

### STEP 1.4: New Database Collections

**`tenants` collection:**
```json
{
    "id": "uuid",
    "company_name": "Reliance Retail",
    "company_code": "reliance-retail",
    "owner_user_id": "uuid",
    "plan": "free_trial",
    "subscription_status": "trial",
    "subscription_expiry": "2026-04-15T00:00:00Z",
    "max_scanners": 2,
    "max_desktops": 1,
    "max_clients": 2,
    "max_sessions": 5,
    "created_at": "2026-03-15T00:00:00Z",
    "is_active": true
}
```

**`tenant_users` collection:**
```json
{
    "id": "uuid",
    "tenant_id": "uuid",
    "username": "mukesh",
    "email": "mukesh@reliance.com",
    "password_hash": "sha256hash",
    "role": "owner",
    "is_active": true,
    "is_approved": true,
    "last_login": "2026-03-15T10:30:00Z",
    "created_at": "2026-03-15T00:00:00Z"
}
```
Roles: "owner" (1 per tenant, who registered), "admin", "viewer", "scanner_operator"

### STEP 1.5: New Registration + Login Endpoints

```python
# --- REGISTRATION (New tenant + owner user) ---
@api_router.post("/auth/register")
async def register_tenant(data: dict):
    """Register a new company/tenant with owner account."""
    company_name = data.get("company_name", "").strip()
    username = data.get("username", "").strip()
    email = data.get("email", "").strip()
    password = data.get("password", "")
    
    # Validations
    if not all([company_name, username, password]):
        raise HTTPException(400, "company_name, username, password required")
    
    # Check username uniqueness across ALL tenants
    existing = await db.tenant_users.find_one({"username": username})
    if existing:
        raise HTTPException(400, "Username already taken")
    
    # Check email uniqueness (if provided)
    if email:
        existing_email = await db.tenant_users.find_one({"email": email})
        if existing_email:
            raise HTTPException(400, "Email already registered")
    
    # Create tenant
    tenant_id = str(uuid.uuid4())
    tenant = {
        "id": tenant_id,
        "company_name": company_name,
        "company_code": company_name.lower().replace(" ", "-"),
        "owner_user_id": None,  # Will update after user creation
        "plan": "free_trial",
        "subscription_status": "trial",
        "subscription_expiry": (datetime.now(timezone.utc) + timedelta(days=14)).isoformat(),
        "max_scanners": 2,
        "max_desktops": 1,
        "max_clients": 2,
        "max_sessions": 5,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "is_active": True
    }
    
    # Create owner user
    user_id = str(uuid.uuid4())
    user = {
        "id": user_id,
        "tenant_id": tenant_id,
        "username": username,
        "email": email,
        "password_hash": hash_password(password),
        "role": "owner",
        "is_active": True,
        "is_approved": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    tenant["owner_user_id"] = user_id
    
    await db.tenants.insert_one(tenant)
    await db.tenant_users.insert_one(user)
    
    # Generate JWT
    token = create_jwt_token(user_id, tenant_id, username, "owner")
    
    return {
        "message": "Registration successful! 14-day free trial activated.",
        "token": token,
        "user": {"id": user_id, "username": username, "role": "owner"},
        "tenant": {"id": tenant_id, "company_name": company_name, "plan": "free_trial"}
    }


# --- LOGIN ---
@api_router.post("/auth/login")
async def login(data: dict):
    username = data.get("username", "")
    password = data.get("password", "")
    
    # Check if superadmin login
    if username == os.environ.get("SUPERADMIN_USERNAME") and password == os.environ.get("SUPERADMIN_PASSWORD"):
        token = create_jwt_token("superadmin", "superadmin", username, "superadmin")
        return {
            "token": token,
            "user": {"id": "superadmin", "username": username, "role": "superadmin"},
            "tenant": None
        }
    
    # Regular user login
    user = await db.tenant_users.find_one({"username": username}, {"_id": 0})
    if not user or not verify_password(password, user.get("password_hash", "")):
        raise HTTPException(401, "Invalid credentials")
    
    if not user.get("is_active", True):
        raise HTTPException(403, "Account disabled")
    if not user.get("is_approved", True):
        raise HTTPException(403, "Account pending approval")
    
    # Check tenant active
    tenant = await db.tenants.find_one({"id": user["tenant_id"]}, {"_id": 0})
    if not tenant or not tenant.get("is_active", True):
        raise HTTPException(403, "Organization account is disabled")
    
    # Check subscription
    expiry = tenant.get("subscription_expiry", "")
    if expiry and datetime.fromisoformat(expiry) < datetime.now(timezone.utc):
        if tenant.get("subscription_status") not in ("expired",):
            await db.tenants.update_one(
                {"id": tenant["id"]},
                {"$set": {"subscription_status": "expired"}}
            )
        raise HTTPException(403, "Subscription expired. Please renew at audix.co.in/pricing")
    
    # Update last login
    await db.tenant_users.update_one(
        {"id": user["id"]},
        {"$set": {"last_login": datetime.now(timezone.utc).isoformat()}}
    )
    
    token = create_jwt_token(user["id"], user["tenant_id"], user["username"], user["role"])
    
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "username": user["username"],
            "role": user["role"],
            "email": user.get("email", "")
        },
        "tenant": {
            "id": tenant["id"],
            "company_name": tenant["company_name"],
            "plan": tenant.get("plan", "free_trial"),
            "subscription_status": tenant.get("subscription_status", "trial")
        }
    }
```

### STEP 1.6: Modify ALL Existing Endpoints

**PATTERN — Apply this to EVERY existing endpoint:**

BEFORE (current):
```python
@portal_router.get("/clients")
async def get_clients():
    clients = await db.clients.find({}, {"_id": 0}).to_list(1000)
    return clients
```

AFTER (with tenant isolation):
```python
@portal_router.get("/clients")
async def get_clients(current_user: dict = Depends(get_current_user)):
    tenant_id = current_user["tenant_id"]
    clients = await db.clients.find({"tenant_id": tenant_id}, {"_id": 0}).to_list(1000)
    return clients
```

**EVERY create/insert must include tenant_id:**

BEFORE:
```python
new_client = Client(**client.model_dump())
doc = new_client.model_dump()
await db.clients.insert_one(doc)
```

AFTER:
```python
new_client = Client(**client.model_dump())
doc = new_client.model_dump()
doc["tenant_id"] = current_user["tenant_id"]  # ADD THIS LINE
await db.clients.insert_one(doc)
```

**Apply this pattern to ALL endpoints in server.py. Every find(), find_one(), count_documents(), 
distinct(), aggregate() must include {"tenant_id": tenant_id} in the query filter.
Every insert_one(), insert_many() must include tenant_id in the document.**

### STEP 1.7: Sync Endpoints — Scanner Auth

Scanner devices also need tenant association. Modify sync auth:

```python
# Scanner login — device registers under a tenant
@sync_router.post("/device-login")
async def scanner_device_login(data: dict):
    """Scanner app calls this to get JWT token for syncing."""
    username = data.get("username", "")
    password = data.get("password", "")
    device_name = data.get("device_name", "")
    
    user = await db.tenant_users.find_one({"username": username}, {"_id": 0})
    if not user or not verify_password(password, user.get("password_hash", "")):
        raise HTTPException(401, "Invalid credentials")
    
    tenant_id = user["tenant_id"]
    
    # Register/update device under this tenant
    existing_device = await db.devices.find_one({
        "device_name": device_name, "tenant_id": tenant_id
    })
    if not existing_device:
        device_doc = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "device_name": device_name,
            "registered_by": user["id"],
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.devices.insert_one(device_doc)
    
    # Return JWT that scanner will use for all sync calls
    token = create_jwt_token(user["id"], tenant_id, username, "scanner_operator")
    
    return {
        "token": token,
        "tenant_id": tenant_id,
        "device_name": device_name
    }
```

Modify existing sync endpoint to use JWT instead of device_name+password:
```python
@sync_router.post("/")
async def sync_data(sync_request: SyncRequest, current_user: dict = Depends(get_current_user)):
    tenant_id = current_user["tenant_id"]
    # ... rest of sync logic, but add tenant_id to all documents
```

### STEP 1.8: Database Migration Script

Run this ONCE to add tenant_id to existing data:
```python
# backend/migrate_to_multitenant.py
# Run: python migrate_to_multitenant.py

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
import uuid
from datetime import datetime, timezone

async def migrate():
    client = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    db = client[os.environ.get("DB_NAME", "audix_db")]
    
    # Create a default tenant for existing data
    default_tenant_id = str(uuid.uuid4())
    
    # Check if migration already done
    existing_tenant = await db.tenants.find_one({})
    if existing_tenant:
        print("Migration already done. Skipping.")
        return
    
    # Create default tenant
    await db.tenants.insert_one({
        "id": default_tenant_id,
        "company_name": "Default (Migrated)",
        "company_code": "default",
        "plan": "enterprise",
        "subscription_status": "active",
        "subscription_expiry": "2027-12-31T00:00:00Z",
        "max_scanners": -1,
        "max_desktops": -1,
        "max_clients": -1,
        "max_sessions": -1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "is_active": True
    })
    
    # Migrate existing portal_users to tenant_users
    portal_users = await db.portal_users.find({}, {"_id": 0}).to_list(10000)
    for pu in portal_users:
        await db.tenant_users.insert_one({
            "id": pu.get("id", str(uuid.uuid4())),
            "tenant_id": default_tenant_id,
            "username": pu["username"],
            "email": "",
            "password_hash": pu["password_hash"],
            "role": "owner" if pu.get("role") == "admin" else pu.get("role", "viewer"),
            "is_active": pu.get("is_active", True),
            "is_approved": pu.get("is_approved", True),
            "created_at": pu.get("created_at", datetime.now(timezone.utc).isoformat())
        })
    
    # Add tenant_id to all existing collections
    collections_to_migrate = [
        "clients", "audit_sessions", "master_products", "expected_stock",
        "client_stock", "client_schemas", "synced_locations", "sync_inbox",
        "sync_raw_logs", "devices", "alerts", "conflict_locations", "reco_adjustments"
    ]
    
    for coll_name in collections_to_migrate:
        result = await db[coll_name].update_many(
            {"tenant_id": {"$exists": False}},
            {"$set": {"tenant_id": default_tenant_id}}
        )
        print(f"  {coll_name}: updated {result.modified_count} documents")
    
    # Create indexes
    for coll_name in collections_to_migrate:
        await db[coll_name].create_index([("tenant_id", 1)])
    
    await db.tenant_users.create_index([("username", 1)], unique=True)
    await db.tenant_users.create_index([("tenant_id", 1)])
    await db.tenants.create_index([("id", 1)], unique=True)
    
    print(f"\nMigration complete! Default tenant_id: {default_tenant_id}")
    print(f"Migrated {len(portal_users)} users")

asyncio.run(migrate())
```

### STEP 1.9: Frontend Changes for JWT

**Replace HTTP Basic Auth with JWT Token in ALL frontend API calls:**

Create/update: `frontend/src/utils/api.js`
```javascript
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// Get stored JWT token
export const getToken = () => localStorage.getItem('audix_token');
export const getUser = () => {
    const u = localStorage.getItem('audix_user');
    return u ? JSON.parse(u) : null;
};
export const getTenant = () => {
    const t = localStorage.getItem('audix_tenant');
    return t ? JSON.parse(t) : null;
};

// Authenticated fetch wrapper
export const apiFetch = async (endpoint, options = {}) => {
    const token = getToken();
    const headers = {
        ...options.headers,
    };
    
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    // Don't set Content-Type for FormData (file uploads)
    if (!(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }
    
    const response = await fetch(`${BACKEND_URL}${endpoint}`, {
        ...options,
        headers
    });
    
    if (response.status === 401) {
        // Token expired — redirect to login
        localStorage.removeItem('audix_token');
        localStorage.removeItem('audix_user');
        localStorage.removeItem('audix_tenant');
        window.location.href = '/login';
        throw new Error('Session expired. Please login again.');
    }
    
    if (response.status === 403) {
        const data = await response.json();
        if (data.detail && data.detail.includes('Subscription expired')) {
            window.location.href = '/pricing';
            throw new Error(data.detail);
        }
        throw new Error(data.detail || 'Access denied');
    }
    
    return response;
};

// Login function
export const login = async (username, password) => {
    const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'Login failed');
    
    localStorage.setItem('audix_token', data.token);
    localStorage.setItem('audix_user', JSON.stringify(data.user));
    localStorage.setItem('audix_tenant', JSON.stringify(data.tenant));
    
    return data;
};

// Register function
export const register = async (companyName, username, email, password) => {
    const response = await fetch(`${BACKEND_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            company_name: companyName,
            username,
            email,
            password
        })
    });
    
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'Registration failed');
    
    localStorage.setItem('audix_token', data.token);
    localStorage.setItem('audix_user', JSON.stringify(data.user));
    localStorage.setItem('audix_tenant', JSON.stringify(data.tenant));
    
    return data;
};

// Logout
export const logout = () => {
    localStorage.removeItem('audix_token');
    localStorage.removeItem('audix_user');
    localStorage.removeItem('audix_tenant');
    // Keep portalUser/portalAuth for backward compatibility during migration
    localStorage.removeItem('portalUser');
    localStorage.removeItem('portalAuth');
    window.location.href = '/login';
};
```

**Then replace ALL existing fetch calls in portal pages:**

BEFORE (current pattern in every portal page):
```javascript
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
// ...
const response = await fetch(`${BACKEND_URL}/api/audit/portal/clients`);
```

AFTER:
```javascript
import { apiFetch } from '../../utils/api';
// ...
const response = await apiFetch('/api/audit/portal/clients');
```

**Do this for EVERY file in frontend/src/pages/portal/:**
- PortalDashboard.jsx
- PortalClients.jsx
- PortalSessions.jsx
- PortalDevices.jsx
- PortalReports.jsx
- PortalSyncLogs.jsx
- PortalUsers.jsx
- PortalConflicts.jsx

And for scanner pages:
- Settings.jsx (sync calls)

### STEP 1.10: Testing Phase 1

After implementing, test these:
```bash
# 1. Register new tenant
curl -X POST https://audix.co.in/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"company_name":"Test Company","username":"testuser","email":"test@test.com","password":"test123"}'
# Should return: token, user, tenant

# 2. Login
curl -X POST https://audix.co.in/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"test123"}'
# Should return: token

# 3. Access clients (with token)
TOKEN="<token from step 2>"
curl -X GET https://audix.co.in/api/audit/portal/clients \
  -H "Authorization: Bearer $TOKEN"
# Should return: empty array (new tenant, no clients yet)

# 4. Create client under this tenant
curl -X POST https://audix.co.in/api/audit/portal/clients \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Client","code":"TC001","client_type":"store"}'

# 5. Register another tenant
curl -X POST https://audix.co.in/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"company_name":"Other Company","username":"otheruser","password":"other123"}'

# 6. Login as other tenant and check clients
TOKEN2="<token from step 5>"
curl -X GET https://audix.co.in/api/audit/portal/clients \
  -H "Authorization: Bearer $TOKEN2"
# Should return: empty array (NOT Test Company's client!)
# THIS IS THE CRITICAL TEST — data isolation

# 7. Superadmin login
curl -X POST https://audix.co.in/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"<SUPERADMIN_USERNAME>","password":"<SUPERADMIN_PASSWORD>"}'
```

================================================================
## PHASE 2: SUBSCRIPTION SYSTEM (RAZORPAY)
## Priority: HIGH
## Estimated time: 1 session
## PREREQUISITE: Owner must provide Razorpay API keys
================================================================

### WHAT TO DO:
1. Integrate Razorpay payment gateway
2. Create subscription plans in database
3. Create payment/checkout flow
4. Handle webhooks for payment confirmation
5. Add subscription check middleware to all endpoints

### STEP 2.1: Owner Must Provide These Keys
```
RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxx      # From razorpay.com dashboard
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx # From razorpay.com dashboard
RAZORPAY_WEBHOOK_SECRET=xxxxxxxxxxxx         # From razorpay.com → Settings → Webhooks
```

Add to backend .env

### STEP 2.2: Install Razorpay
```bash
pip install razorpay
```

### STEP 2.3: Subscription Endpoints

```python
import razorpay

razorpay_client = razorpay.Client(
    auth=(os.environ["RAZORPAY_KEY_ID"], os.environ["RAZORPAY_KEY_SECRET"])
)

@api_router.get("/subscription/plans")
async def get_plans():
    """Public endpoint — list available plans"""
    plans = await db.subscription_plans.find({}, {"_id": 0}).to_list(100)
    if not plans:
        # Seed default plans
        default_plans = [
            {
                "id": "basic",
                "name": "Basic",
                "monthly_price": 999,
                "yearly_price": 9990,
                "currency": "INR",
                "max_scanners": 1,
                "max_desktops": 1,
                "max_clients": 2,
                "max_sessions": 5,
                "support": "email",
                "features": ["1 Scanner", "1 Desktop App", "2 Clients", "5 Sessions", "Email Support"]
            },
            {
                "id": "pro",
                "name": "Professional",
                "monthly_price": 2499,
                "yearly_price": 24990,
                "currency": "INR",
                "max_scanners": 5,
                "max_desktops": 3,
                "max_clients": 10,
                "max_sessions": -1,
                "support": "priority",
                "features": ["5 Scanners", "3 Desktop Apps", "10 Clients", "Unlimited Sessions", "Priority Support"]
            },
            {
                "id": "enterprise",
                "name": "Enterprise",
                "monthly_price": 4999,
                "yearly_price": 49990,
                "currency": "INR",
                "max_scanners": -1,
                "max_desktops": -1,
                "max_clients": -1,
                "max_sessions": -1,
                "support": "dedicated",
                "features": ["Unlimited Scanners", "Unlimited Desktops", "Unlimited Clients", "Unlimited Sessions", "Dedicated Support"]
            }
        ]
        await db.subscription_plans.insert_many(default_plans)
        plans = default_plans
    return plans


@api_router.post("/subscription/create-order")
async def create_subscription_order(data: dict, current_user: dict = Depends(get_current_user)):
    """Create Razorpay order for subscription payment."""
    plan_id = data.get("plan_id")
    billing_cycle = data.get("billing_cycle", "monthly")  # monthly or yearly
    
    plan = await db.subscription_plans.find_one({"id": plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(404, "Plan not found")
    
    amount = plan["monthly_price"] if billing_cycle == "monthly" else plan["yearly_price"]
    amount_paise = int(amount * 100)  # Razorpay uses paise
    
    # Create Razorpay order
    order = razorpay_client.order.create({
        "amount": amount_paise,
        "currency": "INR",
        "receipt": f"order_{current_user['tenant_id']}_{plan_id}",
        "notes": {
            "tenant_id": current_user["tenant_id"],
            "plan_id": plan_id,
            "billing_cycle": billing_cycle
        }
    })
    
    # Store order in DB
    await db.payment_orders.insert_one({
        "order_id": order["id"],
        "tenant_id": current_user["tenant_id"],
        "user_id": current_user["user_id"],
        "plan_id": plan_id,
        "billing_cycle": billing_cycle,
        "amount": amount,
        "currency": "INR",
        "status": "created",
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    return {
        "order_id": order["id"],
        "amount": amount,
        "currency": "INR",
        "razorpay_key_id": os.environ["RAZORPAY_KEY_ID"],
        "plan_name": plan["name"],
        "billing_cycle": billing_cycle
    }


@api_router.post("/subscription/verify-payment")
async def verify_payment(data: dict, current_user: dict = Depends(get_current_user)):
    """Verify Razorpay payment after user completes checkout."""
    razorpay_order_id = data.get("razorpay_order_id")
    razorpay_payment_id = data.get("razorpay_payment_id")
    razorpay_signature = data.get("razorpay_signature")
    
    # Verify signature
    try:
        razorpay_client.utility.verify_payment_signature({
            "razorpay_order_id": razorpay_order_id,
            "razorpay_payment_id": razorpay_payment_id,
            "razorpay_signature": razorpay_signature
        })
    except Exception:
        raise HTTPException(400, "Payment verification failed")
    
    # Get order details
    order = await db.payment_orders.find_one({"order_id": razorpay_order_id}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")
    
    plan = await db.subscription_plans.find_one({"id": order["plan_id"]}, {"_id": 0})
    
    # Calculate expiry
    if order["billing_cycle"] == "monthly":
        expiry = datetime.now(timezone.utc) + timedelta(days=30)
    else:
        expiry = datetime.now(timezone.utc) + timedelta(days=365)
    
    # Update tenant subscription
    await db.tenants.update_one(
        {"id": current_user["tenant_id"]},
        {"$set": {
            "plan": order["plan_id"],
            "subscription_status": "active",
            "subscription_expiry": expiry.isoformat(),
            "max_scanners": plan.get("max_scanners", 1),
            "max_desktops": plan.get("max_desktops", 1),
            "max_clients": plan.get("max_clients", 2),
            "max_sessions": plan.get("max_sessions", 5)
        }}
    )
    
    # Record payment
    await db.payments.insert_one({
        "id": str(uuid.uuid4()),
        "tenant_id": current_user["tenant_id"],
        "order_id": razorpay_order_id,
        "payment_id": razorpay_payment_id,
        "plan_id": order["plan_id"],
        "billing_cycle": order["billing_cycle"],
        "amount": order["amount"],
        "currency": "INR",
        "status": "paid",
        "paid_at": datetime.now(timezone.utc).isoformat()
    })
    
    # Update order status
    await db.payment_orders.update_one(
        {"order_id": razorpay_order_id},
        {"$set": {"status": "paid", "payment_id": razorpay_payment_id}}
    )
    
    return {"message": "Payment successful! Subscription activated.", "plan": order["plan_id"], "expiry": expiry.isoformat()}
```

### STEP 2.4: Subscription Check Middleware

Add this to every portal endpoint:
```python
async def check_subscription(current_user: dict = Depends(get_current_user)):
    """Check if tenant has active subscription. Use as dependency."""
    if current_user["role"] == "superadmin":
        return current_user  # Superadmin bypasses subscription check
    
    tenant = await db.tenants.find_one({"id": current_user["tenant_id"]}, {"_id": 0})
    if not tenant:
        raise HTTPException(403, "Tenant not found")
    
    status = tenant.get("subscription_status", "")
    expiry = tenant.get("subscription_expiry", "")
    
    if status == "expired":
        raise HTTPException(403, "Subscription expired. Renew at audix.co.in/pricing")
    
    if expiry:
        try:
            exp_dt = datetime.fromisoformat(expiry)
            if exp_dt < datetime.now(timezone.utc):
                await db.tenants.update_one(
                    {"id": tenant["id"]},
                    {"$set": {"subscription_status": "expired"}}
                )
                raise HTTPException(403, "Subscription expired. Renew at audix.co.in/pricing")
        except ValueError:
            pass
    
    return current_user

# USE: Replace Depends(get_current_user) with Depends(check_subscription) on ALL portal endpoints
```

### STEP 2.5: Frontend — Pricing Page & Checkout

Create `frontend/src/pages/Pricing.jsx` — show plans, Razorpay checkout button.
Use Razorpay's JavaScript SDK: `<script src="https://checkout.razorpay.com/v1/checkout.js"></script>`

On plan select:
1. Call `/api/subscription/create-order` → get order_id
2. Open Razorpay checkout popup with order_id
3. On success → call `/api/subscription/verify-payment` with payment details
4. Redirect to dashboard

================================================================
## PHASE 3: DESKTOP APP (ELECTRON)  
## Priority: HIGH
## Estimated time: 1 session
================================================================

### WHAT TO DO:
1. Add Electron configuration to the project
2. Create main process file
3. Configure electron-builder for Windows .exe
4. Set up auto-update via GitHub Releases

### STEP 3.1: Project Structure for Electron
```
repo/
├── electron/
│   ├── main.js           # Main process
│   ├── preload.js        # Preload script
│   └── assets/
│       ├── icon.ico       # Windows icon (256x256)
│       ├── icon.png       # PNG icon
│       └── tray-icon.png  # 16x16 or 32x32 tray icon
├── package.json           # ROOT package.json (Electron config)
├── frontend/
│   └── ... (existing)
└── backend/
    └── ... (existing)
```

### STEP 3.2: Root package.json (NEW FILE — repo root, not inside frontend/)
```json
{
  "name": "audix-desktop",
  "version": "1.0.0",
  "description": "Audix Data Management — Desktop Portal",
  "main": "electron/main.js",
  "scripts": {
    "electron:dev": "electron .",
    "electron:build:win": "electron-builder --win",
    "electron:build:mac": "electron-builder --mac",
    "electron:build:linux": "electron-builder --linux"
  },
  "build": {
    "appId": "com.audix.portal",
    "productName": "Audix Data Management",
    "copyright": "Copyright © 2026 Audix",
    "directories": {
      "output": "dist-electron",
      "buildResources": "electron/assets"
    },
    "files": [
      "electron/**/*",
      "frontend/build/**/*"
    ],
    "win": {
      "target": [
        {
          "target": "nsis",
          "arch": ["x64"]
        }
      ],
      "icon": "electron/assets/icon.ico"
    },
    "nsis": {
      "oneClick": false,
      "perMachine": true,
      "allowToChangeInstallationDirectory": true,
      "installerIcon": "electron/assets/icon.ico",
      "uninstallerIcon": "electron/assets/icon.ico",
      "installerHeaderIcon": "electron/assets/icon.ico",
      "shortcutName": "Audix Portal",
      "createDesktopShortcut": true,
      "createStartMenuShortcut": true
    },
    "publish": {
      "provider": "github",
      "owner": "YOUR_GITHUB_USERNAME",
      "repo": "YOUR_REPO_NAME",
      "releaseType": "release"
    }
  },
  "devDependencies": {
    "electron": "^28.0.0",
    "electron-builder": "^24.9.1"
  },
  "dependencies": {
    "electron-updater": "^6.1.7"
  }
}
```

### STEP 3.3: electron/main.js
```javascript
const { app, BrowserWindow, Tray, Menu, nativeImage, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
}

let mainWindow;
let tray;

const BACKEND_URL = 'https://audix.co.in';

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1024,
        minHeight: 700,
        title: 'Audix Data Management',
        icon: path.join(__dirname, 'assets/icon.png'),
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    // Load portal from website
    mainWindow.loadURL(`${BACKEND_URL}/portal`);

    // Create tray icon
    const trayIcon = nativeImage.createFromPath(
        path.join(__dirname, 'assets/tray-icon.png')
    ).resize({ width: 16, height: 16 });
    
    tray = new Tray(trayIcon);
    tray.setToolTip('Audix Data Management');
    tray.setContextMenu(Menu.buildFromTemplate([
        { label: 'Open Audix', click: () => { mainWindow.show(); mainWindow.focus(); } },
        { type: 'separator' },
        { label: 'Check for Updates', click: () => autoUpdater.checkForUpdatesAndNotify() },
        { type: 'separator' },
        { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } }
    ]));
    
    tray.on('double-click', () => { mainWindow.show(); mainWindow.focus(); });

    // Minimize to tray on close (don't quit)
    mainWindow.on('close', (event) => {
        if (!app.isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });

    // Check for updates silently
    autoUpdater.checkForUpdatesAndNotify();
}

app.whenReady().then(createWindow);

app.on('second-instance', () => {
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
    }
});

app.on('before-quit', () => { app.isQuitting = true; });

// Auto-update
autoUpdater.on('update-available', (info) => {
    dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Available',
        message: `Version ${info.version} is available. Downloading...`,
        buttons: ['OK']
    });
});

autoUpdater.on('update-downloaded', (info) => {
    dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Ready',
        message: `Version ${info.version} downloaded. Restart to install?`,
        buttons: ['Restart Now', 'Later']
    }).then((result) => {
        if (result.response === 0) {
            autoUpdater.quitAndInstall();
        }
    });
});
```

### STEP 3.4: electron/preload.js
```javascript
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    isDesktopApp: true,
    platform: process.platform,
    version: require('../package.json').version
});
```

### STEP 3.5: Build Desktop App
```bash
# In repo root:
cd frontend && yarn build && cd ..    # Build React app first
npm run electron:build:win             # Build Windows .exe
# Output: dist-electron/Audix Data Management Setup 1.0.0.exe
```

================================================================
## PHASE 4: GITHUB ACTIONS — SINGLE REPO BUILDS
## Priority: HIGH
## Estimated time: 1 session
================================================================

### WHAT TO DO:
1. Remove the current workflow that pushes to separate repo
2. Create workflows for APK build, EXE build, Web deploy — all in SAME repo
3. Use version tags to trigger release builds

### STEP 4.1: DELETE the current cross-repo push workflow
Find and delete the workflow file that:
- Pushes scanner code to another repo using GitHub token
- Uses `actions/checkout` + `git push` to external repo
DELETE THIS FILE. It's no longer needed.

### STEP 4.2: Create `.github/workflows/release.yml`
```yaml
name: Build & Release

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:
    inputs:
      build_apk:
        description: 'Build Scanner APK'
        type: boolean
        default: true
      build_desktop:
        description: 'Build Desktop EXE'
        type: boolean
        default: true

jobs:
  # ---- JOB 1: Build Scanner APK ----
  build-apk:
    if: github.event_name == 'push' || github.event.inputs.build_apk == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
      
      - name: Setup Java
        uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '17'
      
      - name: Setup Android SDK
        uses: android-actions/setup-android@v3
      
      - name: Install dependencies
        working-directory: frontend
        run: yarn install --frozen-lockfile
      
      - name: Build React
        working-directory: frontend
        run: yarn build
        env:
          REACT_APP_BACKEND_URL: https://audix.co.in
      
      - name: Capacitor Sync
        working-directory: frontend
        run: npx cap sync android
      
      - name: Build APK
        working-directory: frontend/android
        run: |
          chmod +x gradlew
          ./gradlew assembleRelease
      
      - name: Sign APK
        if: env.KEYSTORE_BASE64 != ''
        uses: r0adkll/sign-android-release@v1
        with:
          releaseDirectory: frontend/android/app/build/outputs/apk/release
          signingKeyBase64: ${{ secrets.KEYSTORE_BASE64 }}
          alias: ${{ secrets.KEY_ALIAS }}
          keyStorePassword: ${{ secrets.KEYSTORE_PASSWORD }}
          keyPassword: ${{ secrets.KEY_PASSWORD }}
        env:
          KEYSTORE_BASE64: ${{ secrets.KEYSTORE_BASE64 }}
      
      - name: Rename APK
        run: |
          VERSION=${GITHUB_REF_NAME:-manual}
          find frontend/android/app/build/outputs/apk/release -name "*.apk" -exec cp {} Audix-Scanner-${VERSION}.apk \;
      
      - name: Upload APK Artifact
        uses: actions/upload-artifact@v4
        with:
          name: scanner-apk
          path: Audix-Scanner-*.apk

  # ---- JOB 2: Build Desktop EXE ----
  build-desktop:
    if: github.event_name == 'push' || github.event.inputs.build_desktop == 'true'
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
      
      - name: Install frontend dependencies
        working-directory: frontend
        run: yarn install --frozen-lockfile
      
      - name: Build React
        working-directory: frontend
        run: yarn build
        env:
          REACT_APP_BACKEND_URL: https://audix.co.in
      
      - name: Install Electron dependencies
        run: npm install
      
      - name: Build Windows EXE
        run: npm run electron:build:win
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      
      - name: Upload EXE Artifact
        uses: actions/upload-artifact@v4
        with:
          name: desktop-exe
          path: dist-electron/*.exe

  # ---- JOB 3: Create GitHub Release ----
  create-release:
    needs: [build-apk, build-desktop]
    if: startsWith(github.ref, 'refs/tags/')
    runs-on: ubuntu-latest
    steps:
      - name: Download APK
        uses: actions/download-artifact@v4
        with:
          name: scanner-apk
          path: release-files/
      
      - name: Download EXE
        uses: actions/download-artifact@v4
        with:
          name: desktop-exe
          path: release-files/
      
      - name: Create Release
        uses: softprops/action-gh-release@v1
        with:
          files: release-files/*
          generate_release_notes: true
          name: "Audix ${{ github.ref_name }}"
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### STEP 4.3: How to use
```bash
# Make changes, commit
git add . && git commit -m "Fix bug xyz"
git push origin main
# → Only web deploy happens (if you add a deploy job)

# Release new version (builds APK + EXE):
git tag v2.2.0
git push origin v2.2.0
# → GitHub Actions builds APK + EXE + creates Release with download links

# Manual build (without tag):
# Go to GitHub → Actions → "Build & Release" → Run workflow
```

### STEP 4.4: GitHub Secrets to Configure
Go to GitHub → Your Repo → Settings → Secrets and variables → Actions
Add these secrets:
```
KEYSTORE_BASE64     → Base64 encoded Android keystore file
KEY_ALIAS           → Keystore alias name
KEYSTORE_PASSWORD   → Keystore password
KEY_PASSWORD        → Key password
```
Note: GITHUB_TOKEN is automatic, no setup needed.

================================================================
## PHASE 5: AUTO-UPDATE + VERSION API
## Priority: MEDIUM
## Estimated time: 30 minutes
================================================================

### Backend endpoint:
```python
@api_router.get("/app/latest-version")
async def get_latest_version():
    """Check latest app versions. Called by desktop app and scanner on startup."""
    version_config = await db.app_versions.find_one({"id": "latest"}, {"_id": 0})
    if not version_config:
        version_config = {
            "id": "latest",
            "scanner_version": "1.0.0",
            "desktop_version": "1.0.0",
            "scanner_download_url": "https://github.com/OWNER/REPO/releases/latest/download/Audix-Scanner.apk",
            "desktop_download_url": "https://github.com/OWNER/REPO/releases/latest/download/Audix-Portal-Setup.exe",
            "force_update": False,
            "changelog": ""
        }
        await db.app_versions.insert_one(version_config)
    return version_config
```

Desktop auto-update is already handled by electron-updater in Phase 3.
Scanner can check `/api/app/latest-version` on startup and show update dialog.

================================================================
## PHASE 6: SUPER ADMIN PANEL
## Priority: MEDIUM
## Estimated time: 1 session
================================================================

### Backend — Super Admin Endpoints:
```python
@api_router.get("/superadmin/dashboard")
async def superadmin_dashboard(user=Depends(verify_superadmin)):
    total_tenants = await db.tenants.count_documents({})
    active = await db.tenants.count_documents({"subscription_status": "active"})
    trial = await db.tenants.count_documents({"subscription_status": "trial"})
    expired = await db.tenants.count_documents({"subscription_status": "expired"})
    
    total_revenue_agg = await db.payments.aggregate([
        {"$match": {"status": "paid"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    total_revenue = total_revenue_agg[0]["total"] if total_revenue_agg else 0
    
    monthly_revenue_agg = await db.payments.aggregate([
        {"$match": {
            "status": "paid",
            "paid_at": {"$gte": datetime.now(timezone.utc).replace(day=1).isoformat()}
        }},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    monthly_revenue = monthly_revenue_agg[0]["total"] if monthly_revenue_agg else 0
    
    recent_signups = await db.tenants.find({}, {"_id": 0}).sort("created_at", -1).limit(10).to_list(10)
    
    return {
        "total_tenants": total_tenants,
        "active_subscriptions": active,
        "trial_subscriptions": trial,
        "expired_subscriptions": expired,
        "total_revenue": total_revenue,
        "monthly_revenue": monthly_revenue,
        "recent_signups": recent_signups
    }

@api_router.get("/superadmin/tenants")
async def list_tenants(user=Depends(verify_superadmin)):
    tenants = await db.tenants.find({}, {"_id": 0}).to_list(100000)
    for t in tenants:
        t["user_count"] = await db.tenant_users.count_documents({"tenant_id": t["id"]})
        t["client_count"] = await db.clients.count_documents({"tenant_id": t["id"]})
        t["device_count"] = await db.devices.count_documents({"tenant_id": t["id"]})
        t["total_syncs"] = await db.sync_raw_logs.count_documents({"tenant_id": t["id"]})
    return tenants

@api_router.put("/superadmin/tenants/{tenant_id}/toggle-active")
async def toggle_tenant(tenant_id: str, user=Depends(verify_superadmin)):
    tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    if not tenant:
        raise HTTPException(404, "Tenant not found")
    new_status = not tenant.get("is_active", True)
    await db.tenants.update_one({"id": tenant_id}, {"$set": {"is_active": new_status}})
    return {"message": f"Tenant {'enabled' if new_status else 'disabled'}"}

@api_router.put("/superadmin/tenants/{tenant_id}/extend-subscription")
async def extend_subscription(tenant_id: str, data: dict, user=Depends(verify_superadmin)):
    days = data.get("days", 30)
    tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    if not tenant:
        raise HTTPException(404, "Tenant not found")
    
    current_expiry = datetime.fromisoformat(tenant.get("subscription_expiry", datetime.now(timezone.utc).isoformat()))
    if current_expiry < datetime.now(timezone.utc):
        current_expiry = datetime.now(timezone.utc)
    new_expiry = current_expiry + timedelta(days=days)
    
    await db.tenants.update_one(
        {"id": tenant_id},
        {"$set": {"subscription_expiry": new_expiry.isoformat(), "subscription_status": "active"}}
    )
    return {"message": f"Subscription extended by {days} days", "new_expiry": new_expiry.isoformat()}

@api_router.put("/superadmin/app-versions")
async def update_app_versions(data: dict, user=Depends(verify_superadmin)):
    await db.app_versions.update_one(
        {"id": "latest"},
        {"$set": data},
        upsert=True
    )
    return {"message": "App versions updated"}
```

### Frontend — Super Admin Pages:
Create pages under `frontend/src/pages/superadmin/`:
- `SuperAdminLogin.jsx` — login with superadmin credentials
- `SuperAdminLayout.jsx` — sidebar with navigation
- `SuperAdminDashboard.jsx` — overview cards (tenants, revenue, signups)
- `SuperAdminTenants.jsx` — list all tenants, enable/disable, extend subscription
- `SuperAdminRevenue.jsx` — payment history, revenue charts
- `SuperAdminVersions.jsx` — manage app version numbers

================================================================
## PHASE 7: WEBSITE LANDING PAGE + DOWNLOAD PAGE
## Priority: MEDIUM
## Estimated time: 1 session
================================================================

### New Frontend Pages:
```
frontend/src/pages/
├── public/
│   ├── LandingPage.jsx      # Hero, features, pricing CTA, testimonials
│   ├── PricingPage.jsx      # 3 plan cards, comparison table, CTA
│   ├── RegisterPage.jsx     # Company registration form
│   └── LoginPage.jsx        # Universal login (redirects based on role)
├── user/
│   ├── UserDashboard.jsx    # After login — download links, subscription info
│   └── AccountSettings.jsx  # Change password, manage team members
├── portal/                  # EXISTING — no changes needed
├── superadmin/              # NEW from Phase 6
└── scanner/                 # EXISTING scanner pages — no changes needed
```

### Router Changes (App.js):
```javascript
// Public routes (no auth)
<Route path="/" element={<LandingPage />} />
<Route path="/pricing" element={<PricingPage />} />
<Route path="/register" element={<RegisterPage />} />
<Route path="/login" element={<LoginPage />} />

// User dashboard (after login, shows downloads + subscription)
<Route path="/dashboard" element={<AuthGuard><UserDashboard /></AuthGuard>} />
<Route path="/account" element={<AuthGuard><AccountSettings /></AuthGuard>} />

// Portal routes (existing — accessed via desktop app or direct URL)
<Route path="/portal/*" element={...} />

// Super admin routes
<Route path="/superadmin/*" element={...} />

// Scanner routes (existing — mobile only)
<Route path="/scan" element={...} />
```

### Download Page Logic:
```javascript
// UserDashboard.jsx — show download links only for active subscribers
const UserDashboard = () => {
    const tenant = getTenant();
    const [versions, setVersions] = useState(null);
    
    useEffect(() => {
        apiFetch('/api/app/latest-version')
            .then(r => r.json())
            .then(setVersions);
    }, []);
    
    const isActive = tenant?.subscription_status === 'active' || tenant?.subscription_status === 'trial';
    
    return (
        <div>
            <h1>Welcome, {tenant?.company_name}!</h1>
            <p>Plan: {tenant?.plan} | Status: {tenant?.subscription_status}</p>
            
            {isActive ? (
                <div>
                    <h2>Download Apps</h2>
                    <a href={versions?.scanner_download_url}>Download Scanner APK (v{versions?.scanner_version})</a>
                    <a href={versions?.desktop_download_url}>Download Desktop App (v{versions?.desktop_version})</a>
                </div>
            ) : (
                <div>
                    <p>Subscription expired. <a href="/pricing">Renew now</a></p>
                </div>
            )}
        </div>
    );
};
```

---

## SECTION D: OWNER TASKS (Agent CANNOT do these)

### D1. Keys & Credentials Owner Must Provide BEFORE Implementation:

| # | What | Where to get | When needed |
|---|------|-------------|-------------|
| 1 | JWT_SECRET | Generate: `openssl rand -hex 32` | Phase 1 |
| 2 | SUPERADMIN_USERNAME | Owner decides | Phase 1 |
| 3 | SUPERADMIN_PASSWORD | Owner decides (strong!) | Phase 1 |
| 4 | RAZORPAY_KEY_ID | razorpay.com → Dashboard → Settings → API Keys | Phase 2 |
| 5 | RAZORPAY_KEY_SECRET | razorpay.com → Dashboard → Settings → API Keys | Phase 2 |
| 6 | RAZORPAY_WEBHOOK_SECRET | razorpay.com → Settings → Webhooks | Phase 2 |
| 7 | Android Keystore | Generate via keytool (agent can help) | Phase 4 |
| 8 | Subscription pricing | Owner decides (Basic/Pro/Enterprise rates) | Phase 2 |
| 9 | App icons | Owner provides or agent creates | Phase 3 |

### D2. After Each Phase, Owner Should Test:
- Phase 1: Register 2 tenants → verify data isolation
- Phase 2: Make test payment on Razorpay test mode → verify activation
- Phase 3: Install .exe on Windows → verify it works
- Phase 4: Push a tag → verify APK + EXE appear in GitHub Releases
- Phase 5: Update version → verify desktop app shows update prompt
- Phase 6: Login as superadmin → verify all tenants visible
- Phase 7: Visit audix.co.in → verify landing page, register, download flow

---

## SECTION E: IMPORTANT RULES FOR IMPLEMENTING AGENT

1. **DO NOT break existing functionality** — scanner sync, reports, all must keep working
2. **Phase 1 MUST be done first** — everything else depends on tenant_id
3. **Test data isolation after Phase 1** — this is the MOST critical test
4. **Keep the portal routes working** — desktop app loads /portal/* pages
5. **Use JWT everywhere** — no more HTTP Basic Auth after Phase 1
6. **Run migration script** — existing data needs tenant_id added
7. **Backend .env must have all new keys** before starting
8. **Don't create separate repos** — everything in ONE repo
9. **GitHub Actions builds in SAME repo** — no cross-repo token push
10. **Start with Approach A for desktop** (load website URL) — local build later

---

## SECTION F: IMPLEMENTATION ORDER (STRICT)

```
1. Phase 1: Multi-Tenant + JWT Auth
   ↓ Test → verify data isolation
2. Phase 2: Subscription (Razorpay)  
   ↓ Test → verify payment flow
3. Phase 7: Landing Page + Download Page
   ↓ Test → verify public pages work
4. Phase 3: Desktop App (Electron)
   ↓ Test → verify .exe builds and runs
5. Phase 4: GitHub Actions CI/CD
   ↓ Test → verify tag push creates release
6. Phase 6: Super Admin Panel
   ↓ Test → verify admin can see all tenants
7. Phase 5: Auto-Update
   ↓ Test → verify update notification
```

---

END OF IMPLEMENTATION GUIDE
