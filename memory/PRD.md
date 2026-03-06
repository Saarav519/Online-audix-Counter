# Audix Counter Software - PRD

## Original Problem Statement
Online counter software for stock auditing. Full-stack app: React frontend + FastAPI backend + MongoDB.
Scanner app for mobile devices to scan locations and barcodes for inventory counting.

## Architecture
- **Frontend**: React.js with Context API (AppContext.js), IndexedDB for offline storage
- **Backend**: FastAPI (Python), monolithic server.py
- **Database**: MongoDB
- **Mobile-first**: MobileOnlyGuard enforces mobile-only access for scanner

## Bug Fixes (Feb 2026)

### Bug 1: Location data vanishes from UI after submit - FIXED
- **Root cause**: Load effect used simple locationId guard, skipped submitted locations
- **Fix**: Composite loadKey (locationId_isSubmitted), loads items for both submitted (read-only) and non-submitted locations

### Bug 2: Data duplication across locations - FIXED
- **Root cause**: Flush-save cleanup with stale closure wrote old location data to new location's key
- **Fix**: tempItemsOwnerRef ownership tracking, unmount-only flush with refs, synchronous save+clear on switch, batchSaveScannedItems REPLACES instead of MERGE

### Bug 3-5: Stale closure fixes - FIXED
- addTempItem, deleteTempItem, updateTempItemQuantity, clearTempItems all used stale `selectedLocationId` from closure
- **Fix**: All now use `selectedLocationIdRef.current` (always current value)

## Performance & Scalability Fixes (Feb 2026)

### Fix 1: Mobile List Virtualization - DONE
- Replaced .map() rendering with react-window FixedSizeList for mobile scanned items list
- Only visible items rendered (68px per row, overscanCount=3)
- Supports 10,000+ items without slowdown
- Library: react-window v1.8.10

### Fix 2: localStorage 5MB Quota Protection - DONE
- Added `safeLocalStorageSave` with QuotaExceededError handling
- User gets alert warning when storage is almost full
- Auto-cleanup of temp items to free space + retry
- Applied to debounced save, batchSaveScannedItems

### Fix 3: Smart Save Optimization - DONE
- Increased debounce from 300ms to 500ms for localStorage writes
- Reduces JSON.stringify frequency during fast scanning

## Prioritized Backlog

### P0 (Critical) - ALL DONE
- [x] Bug 1: Location data vanishing
- [x] Bug 2: Data duplication across locations
- [x] Bug 3-5: Stale closure fixes
- [x] Mobile virtualization
- [x] localStorage quota protection
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
- [ ] Migrate scannedItems from localStorage to IndexedDB (full fix for storage limit)

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
