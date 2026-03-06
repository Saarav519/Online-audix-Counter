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
- Bug 1: Location data vanishes from UI after submit - FIXED (composite loadKey)
- Bug 2: Data duplication across locations - FIXED (ownership tracking + synchronous save)
- Bug 3-5: Stale closure fixes in addTempItem, deleteTempItem, updateTempItemQuantity, clearTempItems - FIXED

## Performance & Scalability Fixes (Feb 2026)
- Mobile list virtualization - react-window v1.8.10 FixedSizeList (10,000+ items)
- IndexedDB migration - scannedItems from localStorage (5MB) to IndexedDB (100MB+)
- Smart save optimization - 500ms debounced IndexedDB save with change detection

## Feature: Delete Confirmation Popup (Feb 2026)
- Clicking trash icon on barcode shows confirmation dialog
- Message: "Hey, you want to delete this barcode (XXXX) or not?"
- "Yes, Delete" = permanently removes from IndexedDB
- "No" = closes popup, returns to same screen
- Works in both single SKU and normal mode
- data-testid: delete-confirm-btn, delete-cancel-btn

## Prioritized Backlog

### P0 (Critical) - ALL DONE
- [x] All 5 scanner bugs fixed
- [x] Mobile virtualization + IndexedDB migration + Smart save
- [x] Delete confirmation popup

### P1 (High)
- [ ] Multi-Tenant Architecture (tenant_id isolation)
- [ ] User registration/login system (JWT)
- [ ] Backend server.py refactoring (break into router files)

### P2 (Medium)
- [ ] Subscription system (Razorpay/Stripe)
- [ ] Desktop app (Electron.js) / APK build via GitHub Actions
- [ ] CI/CD automation (GitHub Actions)
- [ ] Frontend refactoring (ScanItems.jsx decomposition)

### P3 (Low)
- [ ] Super Admin Panel
- [ ] Download Hub / Landing page

## Key Files
- `backend/server.py` - Monolithic backend (4800+ lines)
- `frontend/src/pages/ScanItems.jsx` - Scanner component (~2570 lines)
- `frontend/src/context/AppContext.js` - State management (~1460 lines)
- `frontend/src/utils/indexedDB.js` - IndexedDB wrapper with ScannedItemsByLocationDB
- `/app/AUDIX_FULL_IMPLEMENTATION_GUIDE.md` - SaaS roadmap

## Credentials
- Scanner login: admin / admin123
- Scanner login 2: scanner1 / scan123
