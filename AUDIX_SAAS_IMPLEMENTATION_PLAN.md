# AUDIX SaaS Platform — Complete Implementation Plan
# Share this with the implementing agent on Account B (Live - audix.co.in)

---

## TABLE OF CONTENTS
1. Current State & Problems
2. Target State (What We Want)
3. Overall Architecture
4. Phase-wise Implementation
   - Phase 1: Multi-Tenant Architecture
   - Phase 2: Subscription System
   - Phase 3: Desktop App (Electron)
   - Phase 4: GitHub Actions CI/CD (APK + EXE + Deploy)
   - Phase 5: Auto-Update System
   - Phase 6: Super Admin Panel
   - Phase 7: Website Landing + Download Page
5. Database Schema Changes
6. API Changes
7. Security & Data Isolation
8. Scaling Strategy
9. File Structure
10. Important Notes & Constraints

---

## 1. CURRENT STATE & PROBLEMS

### What exists now:
- **Web Portal** running on audix.co.in (Account B on Emergent platform)
- **Scanner App** (React + Capacitor Android app) — currently pushes code to ANOTHER GitHub repo using token to build APK via GitHub Actions artifacts
- **Backend**: FastAPI + MongoDB
- **Frontend**: React.js (portal + scanner in same codebase)
- **Account A** (development/testing only) — separate Emergent account, NOT connected to production

### Problems to solve:
- Scanner app code is being pushed to a DIFFERENT repo for APK build — this should happen in the SAME repo
- No multi-tenant support — currently single user system
- No subscription/payment system
- No desktop app — portal runs only in browser (slow)
- No user data isolation
- No super admin panel to track users
- No auto-update system for apps

---

## 2. TARGET STATE (WHAT WE WANT)

```
audix.co.in (Single Website):
├── Landing Page (public)
├── Register / Login (new users)
├── Subscription Plans & Payment (Razorpay)
├── Download Page (Scanner APK + Desktop EXE)
├── Super Admin Panel (only for Audix owner)
└── User Dashboard (after login, before downloading apps)

Scanner App (.apk):
├── Downloaded from website
├── User registers/login with their account
├── Scans barcodes, syncs to server
├── Data goes ONLY to that user's tenant
└── Auto-update check on app open

Desktop App (.exe):
├── Downloaded from website  
├── User registers/login with their account
├── Shows dashboard, reports, clients, sessions
├── Local cache (SQLite) for offline + speed
├── Auto-update on app open
└── SAP-like experience — install and use

GitHub (Single Repo):
├── All code in ONE repo
├── GitHub Actions builds:
│   ├── Scanner APK (on push/release)
│   ├── Desktop EXE (on push/release)
│   └── Web deploy trigger (on push to main)
└── No more pushing to separate repos!
```

---

## 3. OVERALL ARCHITECTURE

```
                    ┌──────────────────────┐
                    │   audix.co.in        │
                    │   (Website + API)    │
                    │                      │
                    │   - Landing Page     │
                    │   - Auth / Register  │
                    │   - Subscription     │
                    │   - Download Links   │
                    │   - Super Admin      │
                    │   - API Server       │
                    └──────────┬───────────┘
                               │
                    Central API (FastAPI)
                               │
              ┌────────────────┼────────────────┐
              │                │                │
     ┌────────▼──────┐ ┌──────▼───────┐ ┌──────▼───────┐
     │  Tenant A     │ │  Tenant B    │ │  Tenant C    │
     │               │ │              │ │              │
     │  Scanner App  │ │  Scanner App │ │  Scanner App │
     │  Desktop App  │ │  Desktop App │ │  Desktop App │
     │               │ │              │ │              │
     │  Data: A only │ │  Data: B only│ │  Data: C only│
     └───────────────┘ └──────────────┘ └──────────────┘
     
     MongoDB (Single DB, tenant_id based isolation)
```

---

## 4. PHASE-WISE IMPLEMENTATION

---

### PHASE 1: MULTI-TENANT ARCHITECTURE (Do this FIRST)

**Goal:** Every user (company) gets isolated data. No user can see another user's data.

#### 1.1 New `tenants` collection:
```json
{
  "id": "tenant_uuid",
  "company_name": "Reliance Retail",
  "owner_user_id": "user_uuid",
  "plan": "pro",
  "subscription_status": "active",
  "subscription_expiry": "2026-12-31",
  "max_scanners": 5,
  "max_desktops": 3,
  "max_clients": 10,
  "max_sessions": -1,
  "created_at": "2026-01-15",
  "is_active": true
}
```

#### 1.2 New `tenant_users` collection:
```json
{
  "id": "user_uuid",
  "tenant_id": "tenant_uuid",
  "username": "mukesh",
  "password_hash": "...",
  "email": "mukesh@reliance.com",
  "role": "admin",
  "is_active": true,
  "created_at": "2026-01-15"
}
```
- `role`: "owner" (who registered), "admin", "viewer", "scanner_operator"
- Owner can add more users to their tenant

#### 1.3 Add `tenant_id` to ALL existing collections:
Every existing collection MUST have `tenant_id` field:
- `clients` → add `tenant_id`
- `audit_sessions` → add `tenant_id`
- `master_products` → add `tenant_id`
- `expected_stock` → add `tenant_id`
- `synced_locations` → add `tenant_id`
- `sync_inbox` → add `tenant_id`
- `sync_raw_logs` → add `tenant_id`
- `devices` → add `tenant_id`
- `alerts` → add `tenant_id`
- `client_schemas` → add `tenant_id`
- `client_stock` → add `tenant_id`
- `conflict_locations` → add `tenant_id`
- `reco_adjustments` → add `tenant_id`

#### 1.4 Modify ALL API endpoints:
Every endpoint must:
1. Extract `tenant_id` from the authenticated user's JWT token
2. Add `tenant_id` filter to every database query
3. Add `tenant_id` to every insert operation

**Example - Before:**
```python
@portal_router.get("/clients")
async def get_clients():
    clients = await db.clients.find({}, {"_id": 0}).to_list(1000)
    return clients
```

**Example - After:**
```python
@portal_router.get("/clients")
async def get_clients(current_user: dict = Depends(get_current_user)):
    tenant_id = current_user["tenant_id"]
    clients = await db.clients.find(
        {"tenant_id": tenant_id}, {"_id": 0}
    ).to_list(1000)
    return clients
```

#### 1.5 Authentication Change:
- Replace HTTP Basic Auth with **JWT Token** based auth
- On login → generate JWT with `{user_id, tenant_id, role}` 
- Every API call → verify JWT → extract tenant_id
- Scanner app also uses JWT for sync calls

```python
# JWT Token payload structure:
{
    "user_id": "user_uuid",
    "tenant_id": "tenant_uuid",
    "username": "mukesh",
    "role": "admin",
    "exp": 1735689600  # expiry timestamp
}
```

#### 1.6 Registration Flow:
```
New user visits audix.co.in
    → Register (company name, email, password)
    → Creates new tenant + owner user
    → Email verification (optional, can add later)
    → Redirect to subscription page
    → After payment → account activated
    → Can now download apps and start using
```

---

### PHASE 2: SUBSCRIPTION SYSTEM

**Goal:** Users pay monthly/yearly to use the software.

#### 2.1 Subscription Plans:
```json
// plans collection
[
  {
    "id": "basic",
    "name": "Basic",
    "monthly_price": 999,
    "yearly_price": 9990,
    "currency": "INR",
    "features": {
      "max_scanners": 1,
      "max_desktops": 1,
      "max_clients": 2,
      "max_sessions": 5,
      "support": "email"
    }
  },
  {
    "id": "pro",
    "name": "Professional",
    "monthly_price": 2499,
    "yearly_price": 24990,
    "currency": "INR",
    "features": {
      "max_scanners": 5,
      "max_desktops": 3,
      "max_clients": 10,
      "max_sessions": -1,
      "support": "priority"
    }
  },
  {
    "id": "enterprise",
    "name": "Enterprise",
    "monthly_price": 4999,
    "yearly_price": 49990,
    "currency": "INR",
    "features": {
      "max_scanners": -1,
      "max_desktops": -1,
      "max_clients": -1,
      "max_sessions": -1,
      "support": "dedicated"
    }
  }
]
```

#### 2.2 Payment Integration — Razorpay:
```
User selects plan
    → Razorpay checkout opens
    → Payment successful
    → Webhook callback to backend
    → Backend activates subscription
    → User can now use apps
```

**Required:**
- Razorpay account (razorpay.com)
- API Key + Secret
- Webhook endpoint for payment confirmation
- Subscription API for recurring payments

#### 2.3 Subscription Middleware:
```python
# Every API call checks subscription status
async def check_subscription(current_user: dict = Depends(get_current_user)):
    tenant = await db.tenants.find_one({"id": current_user["tenant_id"]})
    
    if tenant["subscription_status"] != "active":
        raise HTTPException(403, "Subscription expired. Please renew.")
    
    if tenant["subscription_expiry"] < datetime.now():
        # Mark as expired
        await db.tenants.update_one(
            {"id": tenant["id"]},
            {"$set": {"subscription_status": "expired"}}
        )
        raise HTTPException(403, "Subscription expired. Please renew.")
    
    return current_user
```

#### 2.4 Limit Enforcement:
```python
# Example: Check scanner limit before registering new device
async def register_device(device: DeviceRegister, user = Depends(check_subscription)):
    tenant = await db.tenants.find_one({"id": user["tenant_id"]})
    current_devices = await db.devices.count_documents({"tenant_id": user["tenant_id"]})
    max_scanners = tenant.get("max_scanners", 1)
    
    if max_scanners != -1 and current_devices >= max_scanners:
        raise HTTPException(403, f"Scanner limit reached ({max_scanners}). Upgrade plan.")
    
    # ... proceed with registration
```

---

### PHASE 3: DESKTOP APP (ELECTRON)

**Goal:** Convert the React portal into an installable .exe desktop application.

#### 3.1 Electron Setup:
Add these files to the project root:

**`electron/main.js`** — Main Electron process:
```javascript
const { app, BrowserWindow, Tray, Menu, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

let mainWindow;
let tray;

// Backend URL — production server
const BACKEND_URL = 'https://audix.co.in';

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1024,
        minHeight: 700,
        icon: path.join(__dirname, 'assets/icon.png'),
        title: 'Audix Data Management',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    // Load the production website portal
    mainWindow.loadURL(`${BACKEND_URL}/portal`);

    // OR load local build (for offline-first approach):
    // mainWindow.loadFile(path.join(__dirname, '../build/index.html'));

    // System tray
    tray = new Tray(path.join(__dirname, 'assets/tray-icon.png'));
    const contextMenu = Menu.buildFromTemplate([
        { label: 'Open Audix', click: () => mainWindow.show() },
        { label: 'Quit', click: () => app.quit() }
    ]);
    tray.setToolTip('Audix Data Management');
    tray.setContextMenu(contextMenu);

    // Minimize to tray instead of closing
    mainWindow.on('close', (event) => {
        event.preventDefault();
        mainWindow.hide();
    });

    // Check for updates
    autoUpdater.checkForUpdatesAndNotify();
}

app.whenReady().then(createWindow);

// Auto-update events
autoUpdater.on('update-available', () => {
    mainWindow.webContents.send('update-available');
});

autoUpdater.on('update-downloaded', () => {
    mainWindow.webContents.send('update-downloaded');
    // Auto install after 5 seconds
    setTimeout(() => autoUpdater.quitAndInstall(), 5000);
});
```

**`electron/preload.js`** — Bridge between Electron and React:
```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    isDesktopApp: true,
    onUpdateAvailable: (callback) => ipcRenderer.on('update-available', callback),
    onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', callback),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    // Local cache operations (SQLite)
    cacheData: (key, data) => ipcRenderer.invoke('cache-data', key, data),
    getCachedData: (key) => ipcRenderer.invoke('get-cached-data', key),
});
```

#### 3.2 Package.json additions for Electron:
```json
{
  "name": "audix-desktop",
  "version": "1.0.0",
  "main": "electron/main.js",
  "scripts": {
    "electron:dev": "electron .",
    "electron:build": "electron-builder",
    "electron:build:win": "electron-builder --win",
    "electron:build:mac": "electron-builder --mac"
  },
  "build": {
    "appId": "com.audix.portal",
    "productName": "Audix Data Management",
    "directories": {
      "output": "dist-electron"
    },
    "win": {
      "target": "nsis",
      "icon": "electron/assets/icon.ico"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "installerIcon": "electron/assets/icon.ico",
      "uninstallerIcon": "electron/assets/icon.ico",
      "shortcutName": "Audix"
    },
    "publish": {
      "provider": "github",
      "owner": "YOUR_GITHUB_USERNAME",
      "repo": "YOUR_REPO_NAME"
    }
  },
  "devDependencies": {
    "electron": "^28.0.0",
    "electron-builder": "^24.9.1",
    "electron-updater": "^6.1.7"
  }
}
```

#### 3.3 Two approaches for Desktop App:

**Approach A: Load website URL (Simple, recommended to start)**
```javascript
// electron/main.js
mainWindow.loadURL('https://audix.co.in/portal');
// Desktop app is basically a dedicated browser for your portal
// + system tray, notifications, auto-update
```
Pros: No separate build needed, always latest
Cons: Needs internet always

**Approach B: Local build + API sync (Hybrid, SAP-like)**
```javascript
// electron/main.js  
// Load locally built React app
mainWindow.loadFile(path.join(__dirname, '../build/index.html'));
// React app calls API at audix.co.in
// + local SQLite cache for offline viewing
```
Pros: Fast, works offline for viewing cached data
Cons: Need to build React app into desktop package

**Recommendation: Start with Approach A, upgrade to B later**

---

### PHASE 4: GITHUB ACTIONS CI/CD (MOST IMPORTANT CHANGE)

**Goal:** Single repo, single push → Website deploy + APK build + EXE build. 
**No more pushing to separate repo!**

#### 4.1 Repository Structure (Single Repo):
```
audix-repo/
├── backend/                    # FastAPI backend
│   ├── server.py
│   ├── requirements.txt
│   └── .env
├── frontend/                   # React frontend (Portal + Scanner UI)
│   ├── src/
│   ├── public/
│   ├── package.json
│   ├── android/                # Capacitor Android (for APK)
│   ├── capacitor.config.json
│   └── electron/               # Electron desktop app
│       ├── main.js
│       ├── preload.js
│       └── assets/
├── .github/
│   └── workflows/
│       ├── deploy-web.yml      # Deploy website on push to main
│       ├── build-apk.yml       # Build Scanner APK
│       └── build-desktop.yml   # Build Desktop EXE
├── package.json                # Root package.json (for Electron)
└── README.md
```

#### 4.2 GitHub Actions — Deploy Website:
```yaml
# .github/workflows/deploy-web.yml
name: Deploy Website

on:
  push:
    branches: [main]
    paths:
      - 'backend/**'
      - 'frontend/src/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Deploy to production server
        run: |
          # Option 1: SSH and git pull
          # Option 2: API webhook to trigger deployment
          # Option 3: rsync files to server
          # This depends on how Account B deployment works
          # Emergent platform may have its own deploy mechanism
          echo "Deploy to audix.co.in"
```

#### 4.3 GitHub Actions — Build Scanner APK:
```yaml
# .github/workflows/build-apk.yml
name: Build Scanner APK

on:
  push:
    tags:
      - 'v*'           # Trigger on version tags like v2.1.0
  workflow_dispatch:    # Manual trigger option

jobs:
  build-apk:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'yarn'
          cache-dependency-path: frontend/yarn.lock
      
      - name: Setup Java (for Android build)
        uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '17'
      
      - name: Setup Android SDK
        uses: android-actions/setup-android@v3
      
      - name: Install frontend dependencies
        working-directory: frontend
        run: yarn install --frozen-lockfile
      
      - name: Build React app
        working-directory: frontend
        run: yarn build
        env:
          REACT_APP_BACKEND_URL: https://audix.co.in
      
      - name: Sync Capacitor
        working-directory: frontend
        run: |
          npx cap sync android
      
      - name: Build APK
        working-directory: frontend/android
        run: |
          chmod +x gradlew
          ./gradlew assembleRelease
      
      # Sign APK (if you have keystore)
      - name: Sign APK
        uses: r0adkll/sign-android-release@v1
        if: env.KEYSTORE_BASE64 != ''
        with:
          releaseDirectory: frontend/android/app/build/outputs/apk/release
          signingKeyBase64: ${{ secrets.KEYSTORE_BASE64 }}
          alias: ${{ secrets.KEY_ALIAS }}
          keyStorePassword: ${{ secrets.KEYSTORE_PASSWORD }}
          keyPassword: ${{ secrets.KEY_PASSWORD }}
        env:
          KEYSTORE_BASE64: ${{ secrets.KEYSTORE_BASE64 }}
      
      - name: Upload APK to GitHub Release
        uses: softprops/action-gh-release@v1
        if: startsWith(github.ref, 'refs/tags/')
        with:
          files: |
            frontend/android/app/build/outputs/apk/release/*.apk
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      
      # Also upload as artifact (for non-tag builds)
      - name: Upload APK Artifact
        uses: actions/upload-artifact@v4
        with:
          name: scanner-apk
          path: frontend/android/app/build/outputs/apk/release/*.apk
```

#### 4.4 GitHub Actions — Build Desktop EXE:
```yaml
# .github/workflows/build-desktop.yml
name: Build Desktop App

on:
  push:
    tags:
      - 'v*'           # Trigger on version tags
  workflow_dispatch:    # Manual trigger

jobs:
  build-windows:
    runs-on: windows-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'yarn'
          cache-dependency-path: frontend/yarn.lock
      
      - name: Install frontend dependencies
        working-directory: frontend
        run: yarn install --frozen-lockfile
      
      - name: Build React app
        working-directory: frontend
        run: yarn build
        env:
          REACT_APP_BACKEND_URL: https://audix.co.in
      
      - name: Install Electron dependencies
        run: |
          npm install electron electron-builder electron-updater --save-dev
      
      - name: Build Windows EXE
        run: |
          npx electron-builder --win --publish never
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      
      - name: Upload EXE to GitHub Release
        uses: softprops/action-gh-release@v1
        if: startsWith(github.ref, 'refs/tags/')
        with:
          files: |
            dist-electron/*.exe
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      
      - name: Upload EXE Artifact
        uses: actions/upload-artifact@v4
        with:
          name: desktop-exe
          path: dist-electron/*.exe
```

#### 4.5 Combined Workflow (All-in-one on release):
```yaml
# .github/workflows/release.yml
name: Release All

on:
  push:
    tags:
      - 'v*'

jobs:
  build-apk:
    # ... (same as above APK workflow)
    
  build-desktop:
    # ... (same as above Desktop workflow)
    
  deploy-web:
    # ... (deploy to audix.co.in)
    
  create-release:
    needs: [build-apk, build-desktop]
    runs-on: ubuntu-latest
    steps:
      - name: Download APK artifact
        uses: actions/download-artifact@v4
        with:
          name: scanner-apk
          path: ./release-assets/
      
      - name: Download EXE artifact
        uses: actions/download-artifact@v4
        with:
          name: desktop-exe
          path: ./release-assets/
      
      - name: Create GitHub Release
        uses: softprops/action-gh-release@v1
        with:
          files: release-assets/*
          generate_release_notes: true
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

#### 4.6 How to trigger builds:
```bash
# Release new version (triggers all builds):
git tag v2.1.0
git push origin v2.1.0

# This will:
# 1. Build Scanner APK
# 2. Build Desktop EXE  
# 3. Deploy website
# 4. Create GitHub Release with APK + EXE downloads
```

#### 4.7 STOP pushing to separate repo:
- Remove the current workflow that pushes scanner code to another repo
- Delete the GitHub token/secret used for cross-repo push
- All builds happen in THIS repo's GitHub Actions
- APK artifacts are in THIS repo's Releases

---

### PHASE 5: AUTO-UPDATE SYSTEM

#### 5.1 Desktop App Auto-Update:
```javascript
// electron/main.js — already included above
// Uses electron-updater library
// Checks GitHub Releases for new version
// Downloads and installs automatically

autoUpdater.checkForUpdatesAndNotify();

// Flow:
// 1. App opens → checks GitHub Releases for newer version
// 2. If new version found → download in background
// 3. Show notification: "Update available, will install on restart"
// 4. On next restart → new version installed
```

#### 5.2 Scanner App Update Check:
```javascript
// In Scanner App (React/Capacitor)
// Add version check on app startup

const checkForUpdate = async () => {
    try {
        const response = await fetch('https://audix.co.in/api/app/latest-version');
        const data = await response.json();
        
        const currentVersion = '2.0.0'; // from app config
        
        if (data.scanner_version !== currentVersion) {
            // Show update dialog
            showUpdateDialog(data.scanner_download_url);
        }
    } catch (e) {
        // Offline or error — skip update check
    }
};
```

#### 5.3 Version API endpoint:
```python
# Backend endpoint to check latest versions
@api_router.get("/app/latest-version")
async def get_latest_version():
    return {
        "scanner_version": "2.1.0",
        "scanner_download_url": "https://github.com/YOUR_REPO/releases/latest/download/Audix-Scanner.apk",
        "desktop_version": "1.0.0",
        "desktop_download_url": "https://github.com/YOUR_REPO/releases/latest/download/Audix-Portal-Setup.exe",
        "force_update": False,       # True = must update, block usage
        "changelog": "Bug fixes and performance improvements"
    }
```

---

### PHASE 6: SUPER ADMIN PANEL

**Goal:** Audix owner (you) can track all users, subscriptions, revenue.

#### 6.1 Super Admin Routes:
```
/superadmin/login          → Special login (hardcoded superadmin credentials)
/superadmin/dashboard      → Overview: users, revenue, active subscriptions
/superadmin/tenants        → List all tenants/companies
/superadmin/tenants/:id    → View specific tenant details & data usage
/superadmin/subscriptions  → All subscriptions, payments, expiries
/superadmin/revenue        → Revenue charts (monthly, yearly)
/superadmin/app-versions   → Manage app versions, force update toggle
/superadmin/announcements  → Send notifications to all users
```

#### 6.2 Super Admin API:
```python
SUPERADMIN_USERNAME = os.environ.get("SUPERADMIN_USERNAME")
SUPERADMIN_PASSWORD = os.environ.get("SUPERADMIN_PASSWORD")

@api_router.get("/superadmin/dashboard")
async def superadmin_dashboard(user = Depends(verify_superadmin)):
    total_tenants = await db.tenants.count_documents({})
    active_subs = await db.tenants.count_documents({"subscription_status": "active"})
    total_revenue = await db.payments.aggregate([
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    
    return {
        "total_tenants": total_tenants,
        "active_subscriptions": active_subs,
        "expired_subscriptions": total_tenants - active_subs,
        "total_revenue": total_revenue[0]["total"] if total_revenue else 0,
        "recent_signups": await db.tenants.find({}).sort("created_at", -1).limit(10).to_list(10)
    }

@api_router.get("/superadmin/tenants")
async def list_all_tenants(user = Depends(verify_superadmin)):
    tenants = await db.tenants.find({}, {"_id": 0}).to_list(10000)
    for t in tenants:
        t["user_count"] = await db.tenant_users.count_documents({"tenant_id": t["id"]})
        t["client_count"] = await db.clients.count_documents({"tenant_id": t["id"]})
        t["device_count"] = await db.devices.count_documents({"tenant_id": t["id"]})
        t["sync_count"] = await db.sync_raw_logs.count_documents({"tenant_id": t["id"]})
    return tenants

@api_router.put("/superadmin/tenants/{tenant_id}/disable")
async def disable_tenant(tenant_id: str, user = Depends(verify_superadmin)):
    await db.tenants.update_one({"id": tenant_id}, {"$set": {"is_active": False}})
    return {"message": "Tenant disabled"}
```

---

### PHASE 7: WEBSITE LANDING + DOWNLOAD PAGE

#### 7.1 Website Pages Structure:
```
audix.co.in/                    → Landing page (features, pricing, CTA)
audix.co.in/pricing             → Subscription plans comparison
audix.co.in/register            → New user registration
audix.co.in/login               → User login
audix.co.in/dashboard           → User dashboard (after login)
   └── Download apps, manage subscription, account settings
audix.co.in/download            → Public download page (needs login to get links)
audix.co.in/portal              → REMOVED (portal is now desktop app only)
   OR audix.co.in/portal        → Redirect to "Download Desktop App" page
audix.co.in/superadmin          → Super admin panel (only for you)
```

#### 7.2 Download Page:
```
After login, user sees:

┌────────────────────────────────────────────────┐
│  Welcome, Reliance Retail!                     │
│  Plan: Professional | Expires: Dec 2026        │
│                                                │
│  ┌──────────────────┐  ┌───────────────────┐   │
│  │  Scanner App     │  │  Desktop Portal   │   │
│  │  Version 2.1.0   │  │  Version 1.0.0    │   │
│  │                  │  │                   │   │
│  │  [Download APK]  │  │  [Download EXE]   │   │
│  │  Android 8+      │  │  Windows 10+      │   │
│  └──────────────────┘  └───────────────────┘   │
│                                                │
│  Setup Guide:                                  │
│  1. Download and install the app               │
│  2. Login with your credentials                │
│  3. Start scanning / managing                  │
└────────────────────────────────────────────────┘
```

#### 7.3 Download links point to GitHub Releases:
```python
@api_router.get("/download-links")
async def get_download_links(user = Depends(check_subscription)):
    """Only subscribed users can get download links"""
    return {
        "scanner_apk": "https://github.com/YOUR_REPO/releases/latest/download/Audix-Scanner.apk",
        "desktop_exe": "https://github.com/YOUR_REPO/releases/latest/download/Audix-Portal-Setup.exe",
        "scanner_version": "2.1.0",
        "desktop_version": "1.0.0"
    }
```

---

## 5. DATABASE SCHEMA CHANGES SUMMARY

### New Collections:
```
tenants                  → Company/organization info + subscription
tenant_users             → Users within each tenant
payments                 → Payment history (Razorpay transactions)
subscription_plans       → Plan definitions (basic, pro, enterprise)
app_versions             → Track latest app versions
```

### Modified Collections (add tenant_id):
```
clients                  + tenant_id
audit_sessions           + tenant_id
master_products          + tenant_id
expected_stock           + tenant_id
synced_locations         + tenant_id
sync_inbox               + tenant_id
sync_raw_logs            + tenant_id
devices                  + tenant_id
alerts                   + tenant_id
client_schemas           + tenant_id
client_stock             + tenant_id
conflict_locations       + tenant_id
reco_adjustments         + tenant_id
```

### Database Indexes (IMPORTANT for performance):
```python
# Create compound indexes for fast tenant-scoped queries
db.clients.create_index([("tenant_id", 1), ("id", 1)])
db.audit_sessions.create_index([("tenant_id", 1), ("client_id", 1)])
db.synced_locations.create_index([("tenant_id", 1), ("session_id", 1)])
db.sync_inbox.create_index([("tenant_id", 1), ("session_id", 1), ("status", 1)])
db.master_products.create_index([("tenant_id", 1), ("client_id", 1), ("barcode", 1)])
db.expected_stock.create_index([("tenant_id", 1), ("session_id", 1)])
db.devices.create_index([("tenant_id", 1), ("device_name", 1)])
```

---

## 6. API CHANGES SUMMARY

### New Endpoints:
```
POST /api/auth/register              → New tenant + user registration
POST /api/auth/login                 → JWT login (returns token)
POST /api/auth/refresh-token         → Refresh JWT token
GET  /api/auth/me                    → Get current user info

GET  /api/subscription/plans         → List available plans
POST /api/subscription/create        → Create Razorpay subscription
POST /api/subscription/webhook       → Razorpay payment webhook
GET  /api/subscription/status        → Check subscription status

GET  /api/app/latest-version         → Check latest app versions
GET  /api/download-links             → Get download URLs (auth required)

GET  /api/superadmin/dashboard       → Super admin overview
GET  /api/superadmin/tenants         → List all tenants
PUT  /api/superadmin/tenants/:id/... → Manage tenants
GET  /api/superadmin/revenue         → Revenue reports
```

### Modified Endpoints (ALL existing):
- Every endpoint gets `tenant_id` filter from JWT
- Every endpoint checks subscription status
- No endpoint returns data without tenant isolation

---

## 7. SECURITY & DATA ISOLATION

### Rules:
1. **Every DB query MUST include tenant_id** — no exceptions
2. **JWT token** contains tenant_id — cannot be modified by user
3. **API middleware** extracts tenant_id — individual endpoints don't handle it
4. **Scanner sync** also includes tenant_id from device's JWT
5. **Super admin** has separate auth — can access all tenants
6. **Rate limiting** per tenant — prevent abuse
7. **CORS** — allow only audix.co.in and desktop app origins

### Data Isolation Test:
```python
# NEVER do this:
await db.clients.find({})  # Returns ALL tenants' data!

# ALWAYS do this:
await db.clients.find({"tenant_id": current_user["tenant_id"]})
```

---

## 8. SCALING STRATEGY

### Phase 1 (1-50 tenants):
- Single server (current setup)
- MongoDB on same server
- Cost: ~₹2000-5000/month

### Phase 2 (50-500 tenants):
- Upgrade server (more RAM/CPU)
- MongoDB Atlas (managed, with backups)
- Redis for caching (session data, frequently accessed)
- CDN for static files (Cloudflare)
- Cost: ~₹5000-15000/month

### Phase 3 (500+ tenants):
- Multiple app servers behind load balancer
- MongoDB Atlas M10+ (dedicated cluster)
- Redis cluster
- Auto-scaling (AWS/GCP)
- Cost: Pay as you grow

### Performance Optimizations:
- Database indexes (listed above)
- API response caching (Redis)
- Desktop app local cache (reduces server load)
- Pagination on all list endpoints
- Lazy loading on frontend
- Compress API responses (gzip)

---

## 9. FILE STRUCTURE (FINAL)

```
audix-repo/
├── .github/
│   └── workflows/
│       ├── deploy-web.yml
│       ├── build-apk.yml
│       ├── build-desktop.yml
│       └── release.yml
│
├── backend/
│   ├── server.py                 # Main app (refactor into modules later)
│   ├── routes/
│   │   ├── auth.py               # Registration, login, JWT
│   │   ├── subscription.py       # Plans, payment, webhook
│   │   ├── superadmin.py         # Super admin panel APIs
│   │   ├── clients.py            # Client management
│   │   ├── sessions.py           # Audit session management
│   │   ├── sync.py               # Sync endpoints
│   │   ├── reports.py            # Report generation
│   │   └── devices.py            # Device management
│   ├── middleware/
│   │   ├── auth.py               # JWT verification + tenant extraction
│   │   └── subscription.py       # Subscription check middleware
│   ├── models/
│   │   └── schemas.py            # Pydantic models
│   ├── requirements.txt
│   └── .env
│
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── landing/          # Public landing page
│   │   │   ├── auth/             # Register, login
│   │   │   ├── subscription/     # Plans, payment
│   │   │   ├── download/         # App download page
│   │   │   ├── portal/           # Admin portal (existing)
│   │   │   ├── scanner/          # Scanner app (existing)
│   │   │   └── superadmin/       # Super admin panel
│   │   └── ...
│   ├── android/                  # Capacitor Android
│   ├── capacitor.config.json
│   ├── package.json
│   └── .env
│
├── electron/
│   ├── main.js                   # Electron main process
│   ├── preload.js                # Preload script
│   ├── assets/
│   │   ├── icon.ico              # Windows icon
│   │   ├── icon.png              # Linux/Mac icon
│   │   └── tray-icon.png         # System tray icon
│   └── package.json              # Electron-specific package
│
├── package.json                  # Root (Electron builder config)
└── README.md
```

---

## 10. IMPORTANT NOTES & CONSTRAINTS

### For the implementing agent:

1. **DO NOT break existing functionality** — all current features must keep working
2. **Migrate existing data** — current clients/sessions should get a default tenant_id
3. **JWT secret** should be in .env — never hardcode
4. **Razorpay keys** should be in .env — never hardcode
5. **SUPERADMIN credentials** should be in .env — separate from regular users
6. **GitHub secrets needed:**
   - `KEYSTORE_BASE64` — Android signing keystore (for signed APK)
   - `KEY_ALIAS` — Keystore alias
   - `KEYSTORE_PASSWORD` — Keystore password
   - `KEY_PASSWORD` — Key password
   - (GitHub's `GITHUB_TOKEN` is automatic — no setup needed)

7. **Remove the cross-repo push workflow** — scanner APK should build in the SAME repo
8. **Desktop app loads from website URL initially** — switch to local build + cache later
9. **Test data isolation thoroughly** — create 2 test tenants, verify no data leaks
10. **Mobile-only guard** on scanner routes should remain — desktop app shows portal only

### Implementation Priority:
```
HIGH (Do first):
  ✅ Phase 1: Multi-tenant (tenant_id everywhere)
  ✅ Phase 4: GitHub Actions (same repo builds)
  
MEDIUM (Do next):
  ✅ Phase 2: Subscription (Razorpay)
  ✅ Phase 3: Desktop app (Electron basic)
  ✅ Phase 7: Landing page + download

LOW (Do later):
  ✅ Phase 5: Auto-update
  ✅ Phase 6: Super admin panel
  ✅ Local cache (SQLite in Electron)
  ✅ Offline mode
```

---

## CREDENTIALS & KEYS NEEDED

| Key | Where to get | Used for |
|-----|-------------|----------|
| Razorpay API Key | razorpay.com dashboard | Payment processing |
| Razorpay Secret | razorpay.com dashboard | Payment verification |
| JWT Secret | Generate random 64-char string | Token signing |
| Android Keystore | Generate via keytool | APK signing |
| Superadmin Password | Set in .env | Owner access |

---

END OF PLAN
