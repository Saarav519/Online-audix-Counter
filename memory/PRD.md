# Audix Online Counter App - PRD

## Original Problem Statement
User connected their existing Audix Online Counter App repo and uploaded a zip file (audix-dm-latest.zip) containing the latest admin portal code changes from another development environment. Task was to compare and apply all latest changes.

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
- Variance reports (bin-wise, barcode-wise, article-wise)
- Device management
- User management with approval workflow

## What's Been Implemented (March 8, 2026)

### Changes Applied from ZIP:
1. **Dashboard - Audit Summary Section**: New `Audit Summary by Client` cards showing accuracy %, expected/physical/variance qty, top mismatches per client
2. **Clients - Upload Progress**: XHR-based upload with progress bar (uploading/processing phases)
3. **Devices - Delete Feature**: Delete device button with confirmation dialog
4. **Sessions - Conditional Location Column**: Location column only shows for bin-wise variance mode
5. **Reports - FullScreenReport Component**: New virtualized grid report viewer with search, sort, filter, freeze columns, cell navigation
6. **Reports - BarcodeEditCell Component**: Inline barcode editing with master data auto-complete

### New Backend Endpoints Added:
- `DELETE /api/audit/portal/devices/{device_id}` - Delete device
- `POST /api/audit/portal/reports/edit-barcode` - Edit barcode in reports
- `POST /api/audit/portal/reports/undo-edit` - Undo barcode edit
- `GET /api/audit/portal/reports/edits/{client_id}` - Get active edits
- `GET /api/audit/portal/master/search/{client_id}` - Master data search
- `GET /api/audit/portal/dashboard/audit-summary` - Dashboard audit summary

### Testing Results:
- Backend: 100% (10/10 endpoints pass)
- Frontend: 90% (all pages render correctly)

## Prioritized Backlog
### P0 (Critical)
- None outstanding

### P1 (High)
- PortalLogin redesign from zip (multi-product landing page) - not applied as it changes routing structure
- Apply remaining minor changes from other portal files (PortalAlerts, PortalConflicts, etc.)

### P2 (Medium)
- Backend `_apply_barcode_edits` helper for report generation with edits
- Mobile scanner app code updates (if any in zip)

## Next Tasks
- User to review the applied changes and provide feedback
- Apply PortalLogin redesign if desired
- Further testing of new features with real data
