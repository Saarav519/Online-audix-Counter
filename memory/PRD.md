# Audix Counter Software - PRD

## Original Problem Statement
Full-stack audit/inventory reconciliation platform with offline data collection on scanner devices, central web portal for admins, variance reporting (bin-wise, barcode-wise, article-wise), conflict resolution for duplicate scans, and reconciliation adjustments.

## Core Requirements
- Mobile-first scanner interface + desktop admin portal
- FastAPI backend + React frontend + MongoDB
- Offline-first data sync from scanner devices
- Variance reports: Bin-wise, Barcode-wise, Article-wise, Category Summary
- Conflict resolution for duplicate location scans
- Reconciliation (Reco) column — consolidated view only, primary report type per variance mode
- Chunked sync with progress bar — data safe until 100% finalized

## User Personas
- **Scanner Operators**: Use mobile devices to scan locations and items
- **Admin Users**: Use web portal for session management, reports, conflict resolution, reco adjustments

## Architecture
```
/app/
├── backend/server.py          # FastAPI (all routes + models)
├── frontend/src/
│   ├── pages/
│   │   ├── Settings.jsx        # Scanner sync with chunked upload + progress bar
│   │   └── portal/
│   │       ├── PortalReports.jsx   # All report tables + conditional Reco UI
│   │       └── ...
│   ├── components/
│   ├── context/AppContext.js
│   └── App.js
```

## Key DB Collections
- `synced_locations`: Live synced data from devices
- `sync_staging`: Temporary staging for chunked uploads (cleared after finalize)
- `sync_raw_logs`: Audit trail of all sync operations
- `expected_stock`: Master stock list per session
- `conflict_locations`: Duplicate scan conflicts
- `reco_adjustments`: Reconciliation adjustments (client-level)
- `users, clients, devices, audit_sessions`: App entities

## Reco Editability Rules (Consolidated View Only)

| Session Variance Mode | Detailed Table | Barcode-wise Table | Article-wise Table |
|---|---|---|---|
| **Bin-wise** | Reco editable | Reco hidden | N/A |
| **Barcode-wise** | N/A | Reco editable | N/A |
| **Article-wise** | N/A | N/A | Reco editable |

- Final Qty column shown in ALL consolidated views
- Individual session reports: No Reco or Final Qty

## Chunked Sync Flow
1. Scanner splits locations into chunks of 10
2. Each chunk → `POST /api/sync/chunk` → stored in `sync_staging`
3. After all chunks uploaded → `POST /api/sync/finalize` → validates all chunks → moves to live
4. Data cleared from scanner ONLY after finalize succeeds
5. On failure: staging cleaned up, scanner data untouched
6. Progress bar shows: phase, location count, percentage

## Key API Endpoints
- `POST /api/sync/` — original single-request sync (backward compatible)
- `POST /api/sync/chunk` — upload a chunk to staging
- `POST /api/sync/finalize` — validate & commit all chunks
- `DELETE /api/sync/staging/{batch_id}` — cancel/cleanup
- `GET /api/sync/config` — available clients/sessions
- `POST /api/portal/reco` — save reco adjustments
- `GET /api/portal/reports/{session_id}/{report_type}` — individual reports (no reco)
- `GET /api/portal/reports/consolidated/{client_id}/{report_type}` — consolidated reports (with reco)

## Credentials
- Admin: username=admin, password=admin123

## Backlog
- No pending tasks identified
