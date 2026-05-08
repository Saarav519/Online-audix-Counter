# AudiX — Online Audit Data Management

## Overview
Full-stack stock-audit platform for warehouse cycle counting and one-time stock audits.
Frontend: React (CRA + Tailwind + shadcn/ui) · Backend: FastAPI · DB: MongoDB.

## Modules (live)
- Clients & Schema management (article_code optional)
- Audit Sessions (variance modes: bin-wise / barcode-wise / legacy article-wise)
- Devices & Master Data
- **Reports** — Detailed, Bin-wise, Barcode-wise, Article-wise (gated by schema), Category-wise, Empty Bins, Pending Locations
- Sync Logs / Conflicts / Users
- **Cycle Count Projects** (NEW) — rolling daily warehouse audits with picking reconciliation

## Key Recent Fixes
- Article-wise: now appears under barcode-wise in reports only when schema has article_code
- Barcode-wise & Category-wise: location-aware barcode-edit remap (no duplicate rows, correct rollups)
- Frontend report cache invalidation across sibling reports after edit
- Per-session barcode-wise: no longer empty for barcode-wise sessions (location filter scoped to bin-wise only)
- delete_session: full cascade (sync_inbox, sync_raw_logs, conflict_locations, forward_batches, devices, alerts)
- search-synced-location: scoped by session_id / client_id, auto-prunes orphan entries
- Startup task `purge_orphan_session_data()` for legacy orphan cleanup
- PDF generator: bin-wise variance fixed (reads `difference_qty`), column-aware alignment, numeric right-align, wrapped text

## NEW: Cycle Count Module (Phase 1 — MVP shipped)
- New routes: `/api/audit/portal/cycle-count/*` (cycle_count_routes.py)
- Collections: `cycle_projects`, `cycle_days`, `cycle_day_stock`, `cycle_day_picks`, `cycle_closed_bins`
- Project lifecycle: create → days (open/close/reopen) → complete/reopen project → delete (full cascade)
- Daily 3-file Excel/CSV upload: Morning Stock + Pre-Audit Picks + Post-Audit Picks
- Picking math: effective = scanned + pre_pick; variance = effective - expected; ending = scanned - post_pick
- Variance scoping: ONLY scanned bins appear (no carry-forward; next day's upload picks fresh)
- Cross-day duplicate-bin detection: each row carries closed_in_day warning
- Live consolidated report: aggregates totals, day-wise summaries, bin-wise rows with recount flag
- Frontend: `/portal/cycle-count` (list view + detail view + day tabs + 3-card upload + variance table + consolidated)

## NEW: Cycle Count as Client Type (Phase 2 — Feb 2026)
- `client_type='cycle_count'` is now a 3rd client type alongside warehouse/store
- Sessions endpoint auto-includes cycle-count audit_sessions for cycle_count clients (scanner can sync against them transparently)
- PortalSessions: New Session dialog filters out cycle_count clients; cycle-count sessions surface with fuchsia "Cycle Count" badge + "Manage" link to /portal/cycle-count
- PortalCycleCount: clients filtered to only `client_type==cycle_count`
- Reports cascading navigation for cycle_count clients: Client → Project → Day (Day 1/Day 2/.../Full Consolidated) → Report Type
  - Day-specific Report Types: Bin-wise, Detailed, Barcode-wise, Category-wise
  - Full Consolidated additionally: Pending Locations + Empty Bins
- All variance tables (BinWise/Detailed/BarcodeWise/CategorySummary) show **Pre-Audit Picks** + **Post-Audit Picks** columns when data is from cycle count (fuchsia-tinted columns)
- Consolidated semantics: ONLY locked days contribute, latest locked day's row wins per (bin, barcode), cumulative for unique bins. Open days excluded.
- Backend test coverage: /app/backend/tests/test_cycle_count_flow.py — 15/15 passing

## Backlog (deferred Phase 2+)
- P10 — Cycle Count PDF/Excel export per-day + final project report
- P11 — Re-audit comparison view (Day N vs Day M side-by-side)
- Smart Excel column auto-detection across vendor formats (basic detection in place)
- Project Dashboard with progress ring + heatmap + velocity chart
- "Bins to plan tomorrow" suggestion engine
- Master bin list (optional) for unmapped vs known-extra classification
- Negative variance alerts above threshold
- Auto-classify pre/post by timestamp (single file upload)

## Hardening Pass — May 2026 (Performance + Security)
**Fix #4 — reco_adjustments indexes added** (`server.py::create_indexes`)
- `(client_id, updated_at desc)` for get_cached_reco / report loads
- `(client_id, reco_type)` for _build_reco_maps
- `(client_id, reco_type, location, barcode, article_code)` UNIQUE — guards upsert natural key

**Fix #5 — Time-window indexes added**
- `barcode_edits (client_id, is_active, report_type)` — kills RAM-side report_type filter
- `reco_adjustments (client_id, reco_type, barcode, updated_at)` — Option-A undo stays <50ms at 1L+ recos

**Fix #6 — Cascade delete for client-level audit state** (`audit_routes.py::delete_session` + new `DELETE /clients/{id}/audit-state`)
- Last-session-of-client delete now cascades to `barcode_edits` + `reco_adjustments` (prevents phantom edits/recos surviving re-import)
- Mid-session delete still preserves edits/recos (auditor's working state)
- New explicit `DELETE /api/audit/portal/clients/{client_id}/audit-state` endpoint for "Reset all corrections" UX (TODO: surface on Client Settings page)

**Fix #7 — Brute-force protection on auth** (`server.py` + `audit_routes.py`)
- slowapi per-IP rate limit: `/login` = 5/15min, `/reset-password` = 3/hour (honors X-Forwarded-For)
- MongoDB-backed account lockout: 10 failures on same username in 30 min → 429 with descriptive message
- Failed attempts logged to `failed_login_attempts` (TTL: auto-purge after 24h via `ts_dt` index)
- Successful login + password reset both clear the user's failed-attempt history
- Indexes: `(username, ts desc)`, `(ip, ts desc)`, TTL on `ts_dt`
- New deps: `slowapi==0.1.9`, `limits==5.8.0`

## Test Credentials
admin / admin123
