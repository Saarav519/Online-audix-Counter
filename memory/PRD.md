# Audix Counter Software - PRD

## Original Problem Statement
Full-stack audit/inventory reconciliation platform with offline data collection on scanner devices, central web portal for admins, variance reporting, conflict resolution, and reconciliation adjustments.

## Data Flow
```
Scanner syncs → sync_inbox (staging)
Admin reviews → "Forward All to Variance"
Conflict detection → synced_locations + conflict_locations
Admin resolves conflict → approved to variance, rejected removed from raw data

If variance data is wrong:
  → Delete Batch (permanently removes from variance)
  → Rebuild Variance (clean slate from raw sync logs — raw is source of truth)
```

## What's Been Implemented
1. Mark Empty feature
2. Bin-wise report with statuses
3. Conflict Resolution (approved → variance, rejected → removed from raw)
4. Imported Stock Viewer
5. Reco Column — Consolidated View Only, mode-aware
6. Chunked Sync with Progress Bar
7. Sync Inbox + Forward to Variance
8. Scanner-Grouped Sync Logs + Export All
9. Delete Batch — permanently removes batch + data from variance
10. Rebuild Variance — clean slate rebuild from raw sync logs (source of truth)
11. Pending forward banner on all tabs
12. **Phase 3: Dynamic Master/Stock Schema** (Feb 2026)
    - Per-client schema configuration (standard + custom fields)
    - Schema Builder UI with toggle fields, add/remove custom fields
    - Dynamic CSV template download (master & stock)
    - Master/stock import stores extra fields in `custom_fields` dict
    - All report endpoints (consolidated + individual) return `extra_columns` metadata
    - Report tables (detailed, barcode-wise, article-wise) dynamically render extra columns
    - CSV export includes extra columns
    - Master Products View shows extra columns with purple styling

## Key Endpoints
- `POST /api/sync/` + chunked flow → sync to inbox
- `POST /api/portal/forward-to-variance` → inbox to variance
- `DELETE /api/portal/forward-batches/{batch_id}` → permanent delete from variance
- `POST /api/portal/rebuild-variance` → clean slate rebuild from raw logs
- `POST /api/portal/conflicts/{id}/approve/{entry_id}` → resolve + cleanup rejected
- `GET/POST /api/portal/clients/{client_id}/schema` → get/save client schema
- `GET /api/portal/clients/{client_id}/schema/template` → download schema-based CSV template
- `GET /api/portal/clients/{client_id}/master-products` → returns extra_columns metadata

## Key DB Collections
- `client_master_schemas` → per-client field definitions
- `master_products` → now includes `custom_fields` dict for extra schema fields
- `expected_stock` → now includes `custom_fields` dict for extra schema fields

## Credentials
- Admin: username=admin, password=admin123

## Upcoming/Backlog Tasks
- **Refactoring**: Break `server.py` (3900+ lines) into smaller routers (reports.py, sync.py, admin.py)
- User-requested enhancements TBD
