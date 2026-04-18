# Audix Data Management - PRD

## Original Problem Statement
User (AudiX Solutions & Co. - Chartered Accountants) runs 3 products live:
1. Audix Data Management (stock audit portal + scanner app) ← THIS PROJECT
2. Staff Attendance & Payroll (separate)
3. Audix R&M (separate)

Initial task: Match portal code with GitHub `Audix-Attendance-Finalize` (branch `Final`)
— it contains the updated Audit Data Management code user had been iterating on.
Goal: Make the preview "look impressive to clients" and faster/better.

## Architecture
- Backend: FastAPI + MongoDB (server.py wrapper + audit_routes.py module)
- Frontend: React + Capacitor (Android) + Tailwind + shadcn/ui
- Scanner (mobile-only): `/scan`, `/master-data`, `/reports`, `/settings`, `/login`
- Portal (admin): `/portal`, `/portal/dashboard`, `/portal/clients`, `/portal/sessions`,
  `/portal/devices`, `/portal/reports`, `/portal/sync-logs`, `/portal/conflicts`, `/portal/users`

## Default Admin Credentials
- Username: `admin`  |  Password: `admin123` (auto-seeded on startup)

## What's Been Implemented

### Portal Sync with GitHub Final branch (Apr 2026) ✅
Backend:
- Refactored into `server.py` (wrapper) + `audit_routes.py` (all endpoints, 5836 lines)
- Added `SafeJSONResponse` — handles NaN/Infinity in ALL responses (prevents 500 on dirty data)
- Added global ValidationError + Exception handlers
- Added 6 new endpoints:
  - `GET/POST/DELETE /api/audit/portal/clients/{id}/location-master[+/stats]`
  - `POST /api/audit/portal/clients/{id}/import-location-master`
  - `GET /api/audit/portal/reports/consolidated/{id}/compare-totals`
  - `GET /api/audit/portal/reports/consolidated/{id}/reco-diagnostic`
- GZip middleware, startup index creation (35+ indexes), health endpoints

Frontend portal pages (all 12 copied from GitHub Final branch):
- `PortalLogin.jsx` — 218 → 622 lines: dark-themed 3-product marketing landing with tabs
  (Audit active; Staff/R&M tabs shown but backends not present in this deployment)
- `PortalClients.jsx` — 1368 → 1579 lines: Location Master UI added
- `PortalReports.jsx` — 2529 → 2627 lines: compare-totals + reco-diagnostic views
- `PortalLayout.jsx`, all others synced to GitHub Final.
- Created `/app/frontend/src/pages/AuditApp.js` — minimal `useAudit()` context shim
- Added `@tanstack/react-virtual` dependency
- Route convention kept as `/portal/*` (mapped from REF's `/audit/*`)

Scanner app files left untouched (current has newer code than GitHub Final).

## Next Tasks (user queue)
- User will provide "new changes" now that portal is synced with GitHub.
