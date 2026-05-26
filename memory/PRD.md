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

## Prompt 1 — Movement / Audit Log (May 2026) ✅
Cross-module audit trail powering the new `/portal/movement` page.

**Shared helper** (`backend/shared/audit_log_helper.py`)
- `log_audit_entry()` — async, non-blocking (try/except, never raises)
- `search_audit_logs(filters)` — paginated (default 50, max 500), sort by timestamp_dt desc
- `fetch_recent_for_barcode(barcode, client_id, limit)` — powers "Last Edited" popup
- `export_audit_logs_excel(filters)` — 13-col xlsx via openpyxl, 50k-row cap
- `resolve_module_for_client(client_id)` — auto-detects warehouse vs cycle_count from client_type

**MongoDB collection** `audit_logs` (6 indexes on barcode+client_id+ts, session_id+ts, user_id+ts, client_id+ts, module+ts, ts; all desc on ts)
Fields: id, module ('warehouse'|'cycle_count'), action_type (edit/undo/reco_adjust/delete/assign/revoke), barcode, client_id, session_id, cycle_day, field_name, old_value, new_value, user_id, username, report_type, location, timestamp (ISO), timestamp_dt (BSON datetime).

**Hooks added (audit_routes.py)**
- `POST /reports/edit-barcode` — logs `edit` (or `undo` on same-value revert)
- `POST /reports/undo-edit` — logs `undo` w/ purged-reco metadata
- `POST /reco-adjustments` — logs `reco_adjust` w/ prev qty → new qty

**Hooks added (cycle_count_routes.py)** — all read X-User-Id / X-Username headers
- `POST /days/{id}/close` → assign / day_status open→closed
- `POST /days/{id}/reopen` → revoke / day_status closed→open
- `DELETE /days/{id}` → delete / day
- `POST /projects/{id}/complete` → assign / project_status active→completed
- `POST /projects/{id}/reopen` → revoke / project_status completed→active
- `DELETE /projects/{id}` → delete / project

**New endpoints (audit_portal_router)**
- `POST /api/audit/portal/audit-logs/search` (filters: module/client_id/session_id/user_id/barcode/cycle_day/action_type/start_date/end_date/limit/skip)
- `GET  /api/audit/portal/audit-logs/recent?barcode=…&client_id=…&limit=5`
- `POST /api/audit/portal/audit-logs/export` (xlsx StreamingResponse)

**Frontend** (`pages/portal/PortalMovement.jsx`)
- New route `/portal/movement`, "Movement Log" sidebar item (History icon)
- Collapsible filter card; Module/Client/Session(filtered)/CycleDay(visible when module=cycle_count)/Barcode/User/From/To
- Results table: Timestamp · Module badge · Action badge · User · Client · Session · Day · Barcode · Field · Old→New diff
- Pagination 50/page; Excel export streams xlsx with auto-named file
- BarcodeEditCell + saveRecoAdjustment + PortalCycleCount mutation calls all now carry user attribution (body fields or X-User-* headers)

**Bug fixed during this session**
- `_parse_date_ceil` was returning midnight for bare 'YYYY-MM-DD' inputs (since `fromisoformat` accepts them and `else` branch never triggered). Now rolls bare dates to 23:59:59.999 for inclusive end-of-day filtering.
- `BarcodeEditCell.jsx` had a conditional `if (readOnly) return ...` before hooks → moved after hooks (was blocking the dev build).

## Prompt 2 — "Last Edited" Popup Gate (May 2026) ✅
Edits in BOTH modules are now gated by a confirmation modal showing recent history.

**New shared files**
- `frontend/src/components/LastEditedPopup.jsx` — Radix Dialog that fetches `/audit-logs/recent`, silently calls `onProceed` if no history (or on API failure), otherwise renders compact history table (Time / User / Module / Field / Old → New) with most-recent LATEST badge, Proceed / Cancel buttons.
- `frontend/src/hooks/useLastEditPopup.js` — `openPopup(barcode, clientId, onProceedCb)` / `closePopup` / `popupProps`. Stores callback in ref, cleared BEFORE invocation to prevent double-fire.

**Integration sites**
- `BarcodeEditCell.jsx` — `startEdit` now wraps `_openEditor` in `lastEdit.openPopup(barcode, clientId, _openEditor)`. Popup rendered in both editing + display branches.
- `PortalReports.jsx` — `RecoInput` accepts new `clientId` + `recoBarcode` props; `openEditor` gated. All 3 callsites (detailed / barcode / article) pass props.
- `FullScreenReport.jsx` — `RecoCell` gated identically; callsite passes `clientId` from parent.

**Time formatting** — inline relative helper ("just now / 5 min ago / yesterday / Jan 12, 2026"). Avoids pulling `date-fns` for a single use.

## Prompt 3 — Admin / Supervisor Role System (May 2026) ✅
Two-role system: `admin` (full access incl. user approval) and `supervisor` (full data access, no user-management actions).

**New shared file**
- `backend/shared/auth_middleware.py` — `get_current_user(request, db)` reads `X-User-Id` header → loads `portal_users` row → raises 401/403 for missing/disabled/unapproved; `require_admin(user)` raises 403 if `role != "admin"`; `get_user_role(user_id, db)` quick lookup; `migrate_legacy_roles(db)` idempotent viewer→supervisor migration, always restores `username='admin'` → `role='admin'`.

**Backend changes**
- `audit_routes.py` — `PortalUser` model default `role="supervisor"` (was "viewer"); `/register` sets `role="supervisor"`; new `GET /api/audit/portal/me` returns current user (sans `password_hash`); `/users/{id}/approve|reject|toggle-active|role|DELETE` all gated with `get_current_user + require_admin`; `/role` accepts `admin`/`supervisor` (legacy `viewer` → `supervisor` alias); uses `matched_count` for idempotent role updates.
- `server.py` — startup calls `migrate_legacy_roles(db)` inside try/except (never blocks boot).

**Frontend changes**
- `pages/AuditApp.js` — extended `useAudit()` hook with `isAdmin`, `role`, `authHeaders()`, `refreshMe()` (calls `/me` on mount + after login). `AuditProvider` now mounted at App.js root.
- `pages/portal/PortalUsers.jsx` — uses `useAudit()` for `isAdmin` gating: supervisors see "Read-only" label in Actions column, no Approve/Reject/Disable/Enable/Delete buttons, no role-select dropdown; all fetches carry `authHeaders()`; ADMIN / SUPERVISOR badge next to every username.
- `pages/portal/PortalLayout.jsx` — pulls user from `useAudit()` context (live role updates); ADMIN / SUPERVISOR badge in sidebar bottom-left.

**Testing**
- 67/67 backend pytest cases passing (23 new prompt-3 + 17 prompt-2 + 27 prompt-1 regression)
- Test report: `/app/test_reports/iteration_role_system.json`

## Prompt 4 — Owner-Assignment Delegation (May 2026) ✅
Owners (`clients.created_by`) can delegate sessions OR specific report types to other portal users. Assignees can VIEW + edit RECO ONLY in the Detailed report. Owners retain full control.

**New shared file**
- `backend/shared/assignment_helper.py` — `create_assignment(db, data)` / `revoke_assignment(db, id, requester_user_id)` / `get_my_assignments(db, user_id)` / `get_assignments_by_me(db, user_id)` / `check_assignment_access(db, user_id, session_id, client_id, report_type, cycle_day)` returning `{has_access, can_edit_reco, can_edit_all, is_owner, assignment_id}` / `migrate_clients_created_by(db, fallback_user_id)`.

**New endpoints (audit_routes.py)**
- `POST /api/audit/portal/assignments` — body `{module, assigned_to, session_id, assignment_type, report_types, cycle_day, notes}`; owner-only; rejects self-assignment + unapproved/missing assignees
- `GET /api/audit/portal/assignments/my` — active assignments where I'm the assignee
- `GET /api/audit/portal/assignments/by-me` — all assignments I've created (active + revoked)
- `DELETE /api/audit/portal/assignments/{id}` — soft-revoke; only the original assigner can call
- `GET /api/audit/portal/assignments/users` — approved+active users except caller (dropdown source)
- `GET /api/audit/portal/assignments/check?session_id=…&report_type=…&cycle_day=…` — returns the ACL row

**DB changes**
- `clients` — new field `created_by` (portal_users.id). Migration backfills existing rows to default admin id. `POST /clients` now reads `X-User-Id` to stamp the creator.
- New collection `report_assignments` with 4 indexes (assigned_to+is_active, assigned_by+date desc, session_id+assigned_to+is_active, client_id).

**Edit-endpoint enforcement (security in backend)**
- `POST /reports/edit-barcode`, `POST /reports/undo-edit`, `POST /reco-adjustments` — actor is read STRICTLY from `X-User-Id` header (body `user_id` stays for audit-trail attribution only). Gate runs ONLY when the actor exists in `portal_users` — legacy/synthetic IDs bypass for backward compatibility.
- Reco gate: owner → reco everywhere. Assignee with detailed-report access → reco only in detailed (not barcode-wise / article-wise).
- Cycle-count day/project operations (`close`, `reopen`, `delete`, `complete`) gated to OWNER only via `_require_owner_for_session` helper.

**Frontend changes**
- New page `PortalAssignments.jsx` with 3 tabs (Assign / My Assignments cards / Assigned by Me table with revoke). Cascading wizard: Module → Client → Session → Scope (full/specific) → Report types → Cycle day → Assignees → Notes → Assign button.
- `PortalReports.jsx` — fetches `/assignments/check` per session+report_type; shows amber "Assigned access" banner when current user is a non-owner. Auto-forces `barcodeReadOnly=true` for assignees + restricts `isRecoEditable` to detailed-report-only when assignee.
- `PortalLayout.jsx` — new "Assignments" sidebar item between Movement Log and Sync Logs (UserCog icon, badge count of pending assignments to me).
- `App.js` — `/portal/assignments` route added.

**Testing**
- **103/103 backend pytest cases passing** (32 prompt-4 + 67 regression + 4 actor-resolution invariant). Test reports: `/app/test_reports/iteration_assignment_feature.json` + `/app/test_reports/iteration_assignment_feature_retest.json`.
- New test files: `/app/backend/tests/test_assignment_feature.py`, `/app/backend/tests/test_actor_resolution_invariant.py`.

**Bugs caught & fixed live (during testing iteration)**
- ObjectId leak in `POST /assignments` response — explicitly stripped `_id` after motor `insert_one`.
- Initial actor resolution used body `user_id` as fallback → broke 16 prompt-1/2/3 regression tests. Fixed by reading actor STRICTLY from `X-User-Id` header + gating enforcement on `portal_users.find_one()` so synthetic test IDs bypass cleanly.
- `check_assignment_access` was defaulting `can_edit_reco=True` when `report_type` was omitted — now `False` unless `report_type == "detailed"`.
Two-role system: `admin` (full access incl. user approval) and `supervisor` (full data access, no user-management actions).

**New shared file**
- `backend/shared/auth_middleware.py` — `get_current_user(request, db)` reads `X-User-Id` header → loads `portal_users` row → raises 401/403 for missing/disabled/unapproved; `require_admin(user)` raises 403 if `role != "admin"`; `get_user_role(user_id, db)` quick lookup; `migrate_legacy_roles(db)` idempotent viewer→supervisor migration, always restores `username='admin'` → `role='admin'`.

**Backend changes**
- `audit_routes.py` — `PortalUser` model default `role="supervisor"` (was "viewer"); `/register` sets `role="supervisor"`; new `GET /api/audit/portal/me` returns current user (sans `password_hash`); `/users/{id}/approve|reject|toggle-active|role|DELETE` all gated with `get_current_user + require_admin`; `/role` accepts `admin`/`supervisor` (legacy `viewer` → `supervisor` alias); uses `matched_count` for idempotent role updates.
- `server.py` — startup calls `migrate_legacy_roles(db)` inside try/except (never blocks boot).

**Frontend changes**
- `pages/AuditApp.js` — extended `useAudit()` hook with `isAdmin`, `role`, `authHeaders()`, `refreshMe()` (calls `/me` on mount + after login). `AuditProvider` now mounted at App.js root.
- `pages/portal/PortalUsers.jsx` — uses `useAudit()` for `isAdmin` gating: supervisors see "Read-only" label in Actions column, no Approve/Reject/Disable/Enable/Delete buttons, no role-select dropdown; all fetches carry `authHeaders()`; ADMIN / SUPERVISOR badge next to every username.
- `pages/portal/PortalLayout.jsx` — pulls user from `useAudit()` context (live role updates); ADMIN / SUPERVISOR badge in sidebar bottom-left.

**Testing**
- 67/67 backend pytest cases passing (23 new prompt-3 + 17 prompt-2 + 27 prompt-1 regression)
- Test report: `/app/test_reports/iteration_role_system.json`
- Test file: `/app/backend/tests/test_role_system.py` (8 classes)
- E2E verified: register → admin approves → supervisor login → supervisor blocked on approve/role/delete (403) → supervisor can read /users + /audit-logs/search (200) → admin promotes supervisor to admin → new admin can approve (no re-login needed) → legacy viewer→supervisor migration idempotent.
- Bug fixed in this round: `/users/{id}/role` was using `modified_count` → false 404 when re-applying same role. Now uses `matched_count` (idempotent, verified live).
