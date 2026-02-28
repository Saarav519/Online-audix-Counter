# Audix Counter Software - PRD

## Original Problem Statement
Full-stack audit/inventory reconciliation platform with offline data collection on scanner devices, central web portal for admins, variance reporting, conflict resolution, and reconciliation adjustments.

## Data Flow
```
Scanner syncs → sync_inbox (staging)
Admin reviews → "Forward All to Variance"
Conflict detection → synced_locations (variance) + conflict_locations
Admin resolves conflict → approved to variance, rejected removed from raw data
Admin finds issue → "Rollback Batch" → data back to inbox → re-forward
```

## What's Been Implemented
1. Mark Empty feature
2. Bin-wise report with Empty Bins, Pending, Completed
3. Duplicate Scan Conflict Resolution
4. Imported Stock Viewer
5. Reco Column — Consolidated View Only, mode-aware
6. Chunked Sync with Progress Bar
7. Sync Inbox + Forward to Variance (no race conditions)
8. Scanner-Grouped Sync Logs + Export All
9. **Conflict cleanup**: Approved → variance, rejected → removed from sync_inbox + sync_raw_logs
10. **Rollback Batch**: Delete batch → removes from variance → data back to inbox → re-forward
11. **Pending banner**: Amber banner on all tabs when inbox has pending data

## Key Endpoints
- `POST /api/sync/` & `POST /api/sync/chunk` + `finalize` → sync to inbox
- `POST /api/portal/forward-to-variance` → inbox to variance with conflict detection
- `DELETE /api/portal/forward-batches/{batch_id}` → rollback batch
- `POST /api/portal/conflicts/{id}/approve/{entry_id}` → resolve conflict + cleanup rejected
- `GET /api/portal/sync-logs/by-scanner` → scanner-grouped logs
- `GET /api/portal/sync-logs/export` → export all session logs CSV

## Credentials
- Admin: username=admin, password=admin123

## Upcoming Tasks
### Phase 3: Dynamic Master Schema
- Field selection screen before upload (standard + custom fields)
- Template generation based on selected fields
- Extra columns reflected in variance reports
- Schema per-client, shared between master and stock uploads
- Custom fields per-client only
