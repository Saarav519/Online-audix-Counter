# Audix Counter Software - PRD

## Original Problem Statement
Full-stack audit/inventory reconciliation platform with offline data collection on scanner devices, central web portal for admins, variance reporting (bin-wise, barcode-wise, article-wise), conflict resolution for duplicate scans, and reconciliation adjustments.

## Core Requirements
- Mobile-first scanner interface + desktop admin portal
- FastAPI backend + React frontend + MongoDB
- Offline-first data sync from scanner devices
- Variance reports: Bin-wise, Barcode-wise, Article-wise, Category Summary
- Conflict resolution for duplicate location scans
- Reconciliation (Reco) column for manual quantity adjustments — **ONLY in consolidated view**

## User Personas
- **Scanner Operators**: Use mobile devices to scan locations and items
- **Admin Users**: Use web portal for session management, reports, conflict resolution, reco adjustments

## Architecture
```
/app/
├── backend/server.py          # FastAPI (all routes + models)
├── frontend/src/
│   ├── pages/portal/
│   │   ├── PortalDashboard.jsx
│   │   ├── PortalReports.jsx   # All report tables + conditional Reco UI
│   │   ├── PortalSessions.jsx
│   │   ├── PortalConflicts.jsx
│   │   └── ...
│   ├── components/PortalSidebar.jsx
│   ├── contexts/AppContext.js
│   └── App.js
```

## Key DB Collections
- `synced_locations`: Scanned data from devices
- `expected_stock`: Master stock list per session
- `conflict_locations`: Duplicate scan conflicts
- `reco_adjustments`: Reconciliation adjustments (client-level)
  - Schema: {client_id, reco_type, barcode, location, article_code, reco_qty, updated_at}
- `users, clients, devices, audit_sessions`: App entities

## What's Been Implemented
1. Mark Empty feature (verified working)
2. Bin-wise report with Empty Bins, Pending, Completed statuses
3. Duplicate Scan Conflict Resolution (full workflow)
4. Imported Stock Viewer with all fields
5. **Reconciliation (Reco) Column — Consolidated View Only** (Feb 2026)
   - Backend: `reco_adjustments` collection at client-level, CRUD APIs
   - 5 consolidated endpoints use `_build_reco_maps(client_id)` for reco data
   - 5 individual session endpoints use `EMPTY_RECO_MAPS` (no reco applied)
   - Frontend: `isConsolidated` prop controls visibility of Reco/Final Qty columns
   - All 5 table components (BinWise, Detailed, BarcodeWise, ArticleWise, CategorySummary) conditionally render
   - Summary cards (Reco Adj, Final Qty) only in consolidated view
   - CSV export adapts columns based on consolidated vs individual view
   - Optimistic UI update for reco save (no page refresh)
   - **Tested: 100% backend (14/14) and 100% frontend (17/17) tests passing**

## Credentials
- Admin: username=admin, password=admin123

## Backlog
- No pending tasks identified
