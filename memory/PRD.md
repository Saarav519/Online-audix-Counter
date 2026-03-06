# Audix Counter Software - PRD

## Original Problem Statement
Online counter software for stock auditing. Full-stack app: React frontend + FastAPI backend + MongoDB.
Scanner app for mobile devices to scan locations and barcodes for inventory counting.

## Architecture
- **Frontend**: React.js with Context API (AppContext.js), IndexedDB for offline storage
- **Backend**: FastAPI (Python), monolithic server.py
- **Database**: MongoDB
- **Mobile-first**: MobileOnlyGuard enforces mobile-only access for scanner

## What's Been Implemented
- Initial environment setup (backend/.env, frontend/.env)
- Backend API routing fix (corrected /api/audit/portal/ prefixes)
- SaaS planning document created (/app/AUDIX_FULL_IMPLEMENTATION_GUIDE.md)

## Bug Fixes (Feb 2026)
### Bug 1: Location data vanishes from UI after submit - FIXED
- **Root cause**: Load effect used simple locationId guard, skipped submitted locations entirely
- **Fix**: Composite loadKey (locationId_isSubmitted) triggers reload on reopen. Items loaded for both submitted (read-only) and non-submitted locations.
- **Files**: ScanItems.jsx (load effect lines 375-446)

### Bug 2: Data duplication across locations - FIXED  
- **Root cause**: Flush-save cleanup effect fired on every state change with stale closure, writing old location's data to new location's localStorage key
- **Fix**: 
  1. tempItemsOwnerRef tracks data ownership
  2. Unmount-only flush with refs (no stale closure)
  3. Synchronous localStorage save+clear during location switch
  4. batchSaveScannedItems REPLACES instead of MERGE
- **Files**: ScanItems.jsx (save effects, handleLocationScan), AppContext.js (batchSaveScannedItems)

## Prioritized Backlog

### P0 (Critical) - DONE
- [x] Bug 1: Location data vanishing
- [x] Bug 2: Data duplication across locations

### P1 (High)
- [ ] Multi-Tenant Architecture (tenant_id isolation)
- [ ] User registration/login system (JWT)
- [ ] Backend server.py refactoring (break into router files)

### P2 (Medium) 
- [ ] Subscription system (Razorpay/Stripe)
- [ ] Desktop app (Electron.js)
- [ ] CI/CD automation (GitHub Actions)
- [ ] Frontend refactoring (ScanItems.jsx decomposition)
- [ ] AppContext.js decomposition into focused contexts

### P3 (Low)
- [ ] Super Admin Panel
- [ ] Download Hub / Landing page

## Key Files
- `backend/server.py` - Monolithic backend (4800+ lines, needs refactoring)
- `frontend/src/pages/ScanItems.jsx` - Scanner component (2500+ lines)
- `frontend/src/context/AppContext.js` - State management (1400+ lines)
- `frontend/src/utils/indexedDB.js` - Offline storage wrapper
- `/app/AUDIX_FULL_IMPLEMENTATION_GUIDE.md` - SaaS roadmap

## Credentials
- Scanner login: admin / admin123
- Scanner login 2: scanner1 / scan123
