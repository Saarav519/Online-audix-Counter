# Audix Counter Software - PRD

## Original Problem Statement
Online counter software for stock auditing. Full-stack app: React frontend + FastAPI backend + MongoDB.
Scanner app for mobile devices to scan locations and barcodes for inventory counting.

## Architecture
- **Frontend**: React.js with Context API (AppContext.js), IndexedDB for offline storage
- **Backend**: FastAPI (Python), monolithic server.py
- **Database**: MongoDB (backend), IndexedDB (frontend offline)
- **Mobile-first**: MobileOnlyGuard enforces mobile-only access for scanner

## Bug Fixes (Feb 2026)

### Bug 1: Location data vanishes from UI after submit - FIXED
- **Root cause**: Load effect skipped submitted locations
- **Fix**: Composite loadKey (locationId_isSubmitted), loads items for both submitted (read-only) and non-submitted

### Bug 2: Data duplication across locations - FIXED
- **Root cause**: Flush-save cleanup with stale closure wrote old location data to new location's key
- **Fix**: tempItemsOwnerRef ownership tracking, unmount-only flush with refs, synchronous save+clear on switch, batchSaveScannedItems REPLACES instead of MERGE

### Bug 3-5: Stale closure fixes - FIXED
- addTempItem, deleteTempItem, updateTempItemQuantity, clearTempItems all used stale selectedLocationId
- **Fix**: All now use selectedLocationIdRef.current

## Performance & Scalability Fixes (Feb 2026)

### Mobile List Virtualization - DONE
- react-window v1.8.10 FixedSizeList for mobile scanned items list
- Only visible items rendered (68px/row, overscanCount=3)
- Supports 10,000+ items without slowdown

### IndexedDB Migration (scannedItems) - DONE
- Migrated scannedItems from localStorage (5MB limit) to IndexedDB (100MB+)
- New store: scannedItemsByLocation (DB_VERSION=3)
- Auto-migration: localStorage data → IndexedDB on first load → localStorage removed
- Fallback: If IndexedDB fails, falls back to localStorage
- All CRUD operations (save, batch save, delete, orphan cleanup) use IndexedDB
- ScannedItemsByLocationDB API in indexedDB.js

### Smart Save Optimization - DONE
- Debounced IndexedDB save (500ms) with change detection (JSON.stringify compare)
- Skip save on initial render (scannedItemsInitializedRef)

## Prioritized Backlog

### P0 (Critical) - ALL DONE
- [x] Bug 1-5: All scanner bugs fixed
- [x] Mobile virtualization
- [x] IndexedDB migration
- [x] Smart save optimization

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
- `backend/server.py` - Monolithic backend (4800+ lines)
- `frontend/src/pages/ScanItems.jsx` - Scanner component (2500+ lines)
- `frontend/src/context/AppContext.js` - State management (1450+ lines)
- `frontend/src/utils/indexedDB.js` - IndexedDB wrapper with ScannedItemsByLocationDB
- `/app/AUDIX_FULL_IMPLEMENTATION_GUIDE.md` - SaaS roadmap

## Credentials
- Scanner login: admin / admin123
- Scanner login 2: scanner1 / scan123
