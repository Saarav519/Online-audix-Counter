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

### Stock Import Flow
```
WAREHOUSE clients:
  Admin uploads stock at CLIENT level → client_stock collection
  Session created → auto-snapshot client_stock → expected_stock (locked per session)
  Re-uploading stock only affects FUTURE sessions

STORE clients:
  Admin uploads stock inside EACH SESSION → expected_stock directly
  Each session has its own independent stock data
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
    - All report endpoints return `extra_columns` metadata
    - Report tables dynamically render extra columns
    - CSV export includes extra columns
13. **Phase 4: Warehouse/Store Client Type** (Feb 2026)
    - Client creation with Warehouse or Store type selector
    - Warehouse: Upload Stock at client level → `client_stock` collection
    - Warehouse: Auto-snapshot stock into session on creation → `expected_stock`
    - Warehouse: Session locked (snapshot), stock re-upload only affects future sessions
    - Store: Stock uploaded per-session (existing behavior unchanged)
    - Session page: Import Stock hidden for warehouse sessions
    - Session page: "Stock: Snapshot" badge for warehouse sessions
    - Session-level stock template now uses dynamic schema endpoint
    - Cascading delete includes `client_stock` and `client_schemas`
14. **Report Value Columns Fix** (Feb 28, 2026)
    - All report endpoints now return dual MRP and Cost based value columns
    - Fields: stock_value_mrp, stock_value_cost, physical_value_mrp, physical_value_cost, diff_value_mrp, diff_value_cost, final_value_mrp, final_value_cost
    - Updated all 4 frontend tables (Detailed, Barcode-wise, Article-wise, Category-wise)
    - CSV export includes all value columns for all report types
    - Category summary correctly filters by selected session
    - Consolidated bin-wise shows pending locations
    - Barcode normalization prevents scientific notation mismatches
15. **Schema Template Fix** (Feb 28, 2026)
    - Template download now only shows fields enabled in the client's schema
    - Default (no schema configured) shows only barcode field, forcing schema setup first
16. **Session Stock Refresh** (Feb 28, 2026)
    - "Refresh Stock" button on session cards for warehouse-type clients
    - Re-snapshots latest client_stock into session's expected_stock
    - Replaces old snapshot with fresh data
17. **Report Table Scroll Fix** (Feb 28, 2026)
    - All report tables now have max-h-[70vh] with sticky headers
    - Horizontal scrollbar visible within the table container without scrolling down
    - Headers stay visible while scrolling vertically through data
18. **Report UI Improvements** (Feb 28, 2026)
    - Removed Daily Progress section from reports
    - 7 Summary Cards: Stock Qty, Stock Value, Physical Qty, Physical Value, Diff Qty, Diff Value, Accuracy
    - Header alignment: whitespace-nowrap on all table headers
    - Consolidated Pending Locations endpoint: `/api/portal/reports/consolidated/{client_id}/pending-locations`
    - Consolidated Empty Bins endpoint: `/api/portal/reports/consolidated/{client_id}/empty-bins`

## Key Endpoints
- `POST /api/sync/` + chunked flow → sync to inbox
- `POST /api/portal/forward-to-variance` → inbox to variance
- `DELETE /api/portal/forward-batches/{batch_id}` → permanent delete from variance
- `POST /api/portal/rebuild-variance` → clean slate rebuild from raw logs
- `POST /api/portal/conflicts/{id}/approve/{entry_id}` → resolve + cleanup rejected
- `GET/POST /api/portal/clients/{client_id}/schema` → get/save client schema
- `GET /api/portal/clients/{client_id}/schema/template` → download schema-based CSV template
- `POST /api/portal/clients/{client_id}/import-stock` → warehouse-level stock upload
- `GET /api/portal/clients/{client_id}/stock` → get warehouse stock records
- `GET /api/portal/clients/{client_id}/stock/stats` → stock statistics
- `DELETE /api/portal/clients/{client_id}/stock` → clear warehouse stock

## Key DB Collections
- `client_master_schemas` → per-client field definitions
- `master_products` → includes `custom_fields` dict for extra schema fields
- `expected_stock` → includes `custom_fields` dict; for warehouse sessions created via auto-snapshot
- `client_stock` → warehouse-level stock (source for auto-snapshot into sessions)

## Credentials
- Admin: username=admin, password=admin123

## Upcoming/Backlog Tasks
- **P0 Refactoring**: Break `server.py` (4200+ lines) into smaller routers (routes/reports.py, routes/sync.py, routes/clients.py, routes/sessions.py, models.py, helpers.py)
- **P1 Reporting Enhancements**: Dashboard Summary Card, Variance Highlights (Top 10), Row Color-Coding (Red/Amber/Green), Advanced Filters (accuracy range, variance type)
- **P2 Charts & Graphs**: Category-wise accuracy pie chart, visual charts on reports page
