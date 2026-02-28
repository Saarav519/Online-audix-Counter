# Audix Counter Software - PRD

## Original Problem Statement
Full-stack audit/inventory reconciliation platform with offline data collection on scanner devices, central web portal for admins, variance reporting, conflict resolution, and reconciliation adjustments.

## Core Architecture
```
/app/
├── backend/server.py
├── frontend/src/pages/
│   ├── Settings.jsx            # Scanner sync (chunked + progress bar)
│   └── portal/
│       ├── PortalReports.jsx   # Variance reports + conditional Reco
│       ├── PortalSyncLogs.jsx  # Sync Inbox + Scanner Logs + Batches
│       ├── PortalConflicts.jsx # Conflict resolution
│       └── ...
```

## Data Flow
```
Scanner syncs → sync_inbox (staging)
Admin reviews scanner dashboard → "Forward All to Variance"
Conflict detection at forward → synced_locations + conflict_locations
```

## What's Been Implemented
1. Mark Empty feature
2. Bin-wise report with Empty Bins, Pending, Completed
3. Duplicate Scan Conflict Resolution
4. Imported Stock Viewer
5. **Reco Column — Consolidated View Only, mode-aware** (Feb 2026)
6. **Chunked Sync with Progress Bar** (Feb 2026)
7. **Sync Inbox + Forward to Variance** (Feb 2026)
8. **Scanner-Grouped Sync Logs** (Feb 2026)
   - Raw Logs tab groups by scanner (device_name)
   - Each scanner expandable → individual sync entries with date/time/counts
   - Per-sync Export button (CSV download)
   - Session name resolved for each sync entry
   - Fallback to client→date grouping when no client selected

## Credentials
- Admin: username=admin, password=admin123

## Upcoming Tasks
### Phase 3: Dynamic Master Schema
- Field selection screen before upload (standard + custom fields)
- Template generation based on selected fields
- Extra columns reflected in variance reports
- Schema per-client, shared between master and stock uploads
- Custom fields per-client only

## Backlog
- No other pending items
