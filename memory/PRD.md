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

## Backlog (deferred Phase 2+)
- P10 — Cycle Count PDF/Excel export per-day + final project report
- P11 — Re-audit comparison view (Day N vs Day M side-by-side)
- Smart Excel column auto-detection across vendor formats (basic detection in place)
- Project Dashboard with progress ring + heatmap + velocity chart
- "Bins to plan tomorrow" suggestion engine
- Master bin list (optional) for unmapped vs known-extra classification
- Negative variance alerts above threshold
- Auto-classify pre/post by timestamp (single file upload)

## Test Credentials
admin / admin123
