# Audix Counter Software - PRD

## Original Problem Statement
Full-stack audit/inventory reconciliation platform with offline data collection on scanner devices, central web portal for admins, variance reporting, conflict resolution, and reconciliation adjustments.

## Core Architecture
```
/app/
├── backend/server.py          # FastAPI (all routes + models)
├── frontend/src/
│   ├── pages/
│   │   ├── Settings.jsx        # Scanner sync with chunked upload + progress bar
│   │   └── portal/
│   │       ├── PortalReports.jsx   # Variance reports + conditional Reco UI
│   │       ├── PortalSyncLogs.jsx  # Sync Inbox + Forward to Variance + Batch history
│   │       ├── PortalConflicts.jsx # Conflict resolution
│   │       └── ...
│   ├── context/AppContext.js
│   └── App.js
```

## Key DB Collections
- `sync_inbox`: Staging area for synced data (pending forward)
- `synced_locations`: Live variance data (only after admin forwards)
- `forward_batches`: Batch records of each forward operation
- `sync_staging`: Temporary staging for chunked uploads
- `sync_raw_logs`: Audit trail of all sync operations
- `expected_stock`: Master stock list per session
- `conflict_locations`: Duplicate scan conflicts
- `reco_adjustments`: Reconciliation adjustments (client-level)

## Data Flow
```
Scanner syncs → sync_inbox (staging)
                    ↓
Admin reviews: "28/30 scanners synced"
                    ↓
Admin clicks "Forward All to Variance"
                    ↓
Conflict detection runs → synced_locations (variance) + conflict_locations
                    ↓
Second sync from scanners → new entries in sync_inbox (previous variance untouched)
```

## Reco Editability Rules (Consolidated View Only)
| Session Variance Mode | Detailed | Barcode-wise | Article-wise |
|---|---|---|---|
| **Bin-wise** | Reco editable | Reco hidden | N/A |
| **Barcode-wise** | N/A | Reco editable | N/A |
| **Article-wise** | N/A | N/A | Reco editable |

## What's Been Implemented
1. Mark Empty feature
2. Bin-wise report with Empty Bins, Pending, Completed statuses
3. Duplicate Scan Conflict Resolution
4. Imported Stock Viewer
5. **Reco Column — Consolidated View Only, mode-aware** (Feb 2026)
6. **Chunked Sync with Progress Bar** (Feb 2026)
7. **Sync Inbox + Forward to Variance** (Feb 2026)
   - Sync data lands in inbox (not variance) — no race conditions
   - Admin reviews scanner count, forwards when ready
   - Conflict detection at forward time (not sync time)
   - Forward batch tracking with full metadata
   - Previously forwarded data pulled into conflicts when duplicates found

## Credentials
- Admin: username=admin, password=admin123

## Upcoming Tasks (User Requested)
### Phase 2: Sync Logs Redesign
- Scanner grouping in raw logs (individual sync entries per scanner)
- Per-sync export option

### Phase 3: Dynamic Master Schema
- Field selection screen before upload (standard + custom fields)
- Template generation based on selected fields
- Extra columns reflected in variance reports
- Schema per-client, shared between master and stock uploads
- Custom fields per-client only

## Backlog
- No other pending items
