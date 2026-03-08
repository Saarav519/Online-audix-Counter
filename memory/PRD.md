# Audix Online Counter App - PRD

## Original Problem Statement
User connected their existing Audix Online Counter App repo and uploaded a zip file (audix-dm-latest.zip) containing the latest admin portal code changes. Task was to compare and apply all latest changes. Subsequently, user requested building a desktop app with Electron + SQLite for offline capability.

## Architecture
- **Backend**: FastAPI + MongoDB (Python)
- **Frontend**: React + Tailwind CSS + shadcn/ui
- **Database**: MongoDB (audix_db)
- **Auth**: Portal login with username/password (admin/admin123)

## User Personas
1. **Admin** - Portal access, manages clients, sessions, devices, reports
2. **Scanner Operator** - Mobile scanner app, scans barcodes, syncs data

## Core Requirements
- Multi-client audit management
- Audit sessions with expected vs physical stock
- Barcode scanning and sync
- Variance reports (bin-wise, barcode-wise, article-wise, detailed, category-summary)
- Schema-based column visibility in all views and reports
- Device management
- User management with approval workflow

## What's Been Implemented

### March 8, 2026 - Session 1: Initial Changes from ZIP
1. Dashboard - Audit Summary Section
2. Clients - Upload Progress (XHR-based)
3. Devices - Delete Feature
4. Sessions - Conditional Location Column
5. Reports - FullScreenReport Component
6. Reports - BarcodeEditCell Component
7. 6 new backend endpoints

### March 8, 2026 - Session 2: Bug Fixes (3 bugs)
1. **Master CSV Upload Fix** - Multi-encoding fallback (utf-8/utf-8-sig/latin-1/cp1252) for non-UTF-8 CSV files
2. **Barcode Edit Fix** - Pencil icon now pre-populates input with current barcode value for editing
3. **Report Export Fix** - Changed from plain CSV to XLSX with Excel formulas (Difference, Accuracy, SUM totals)
4. **safe_float helper** - Handles comma-separated numbers (e.g., '1,109') in CSV imports

### March 8, 2026 - Session 2: Schema Issues (2 bugs)
1. **Stock View Schema-Aware** - Stock view dialog now fetches and respects schema. Shows/hides columns (MRP, Cost, Article Code, Article Name) based on which fields are enabled in schema.
2. **Reports Schema Columns** - Backend report endpoints (detailed, barcode-wise, consolidated) now include `article_code` and `article_name` in response data. Frontend report column config shows these columns when schema has them enabled.

### Backend Endpoints:
- `DELETE /api/audit/portal/devices/{device_id}`
- `POST /api/audit/portal/reports/edit-barcode`
- `POST /api/audit/portal/reports/undo-edit`
- `GET /api/audit/portal/reports/edits/{client_id}`
- `GET /api/audit/portal/master/search/{client_id}`
- `GET /api/audit/portal/dashboard/audit-summary`

## Prioritized Backlog

### P0 (Critical) - Desktop App
- Phase 1: Electron Setup (main.js, preload.js, electron-builder)
- Phase 2: SQLite Local Cache
- Phase 3: Background Sync + Offline Mode
- Phase 4: System Tray + Auto-Update
- Phase 5: GitHub Actions for .exe build

### P1 (High)
- Missing MongoDB indexes (clients.id/code, portal_users.username/id, barcode_edits, reco_adjustments)
- Backend API caching (TTL-based for repeated queries)

### P2 (Medium)
- Frontend response caching
- Increase FastAPI workers from 1 to 4
- SaaS features from AUDIX_SAAS_IMPLEMENTATION_PLAN.md

## Next Tasks
- User to review schema-based column fixes
- Proceed with Desktop App (Electron) build when ready
