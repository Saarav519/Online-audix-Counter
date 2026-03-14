# Audix Online Counter - PRD

## Original Problem Statement
User requested two specific changes to their scanner app:
1. **Sync**: Only selected location reports should sync, not all data
2. **Reports**: Location names should display up to 25 characters clearly (was truncating at ~20)

## Architecture
- **Backend**: FastAPI + MongoDB
- **Frontend**: React + Tailwind CSS + shadcn/ui
- **Portal**: Admin dashboard for managing audits
- **Scanner**: Mobile PWA for barcode scanning

## Core Features (Existing)
- Multi-client audit management
- Audit sessions with variance tracking
- Barcode scanning with device sync
- Reports with XLSX export
- User management with approval workflow

## What's Been Implemented (March 2026)

### 1. Selective Location Sync (CORRECTED)
- **Files**: `/app/frontend/src/context/AppContext.js`, `/app/frontend/src/pages/Settings.jsx`, `/app/frontend/src/pages/Reports.jsx`
- Added `reportSelectedLocations` and `setReportSelectedLocations` to AppContext (shared state)
- Reports page now uses context state for selection instead of local state
- Settings page reads Reports selection via context
- `getSelectedLocationsForSync()` function filters locations based on Reports selection
- Sync button shows count: "Sync Now (X locations)" where X = Reports selection
- Only locations selected in Reports page are synced

### 2. Location Name Display Enhancement  
- **File**: `/app/frontend/src/pages/Reports.jsx`
- Changed font from `text-sm` to `text-xs` for location names
- Optimized row layout: reduced gaps, smaller status icons (w-6 h-6)
- Compact Qty column (w-[30px]) and 3-dot menu (h-6 w-6)
- Result: 26 characters now visible (was ~20 before)

## Prioritized Backlog
- P0: None (core changes complete)
- P1: Sync confirmation message showing which locations were synced
- P2: Mobile responsive testing on different screen sizes

## Next Tasks
- User testing and feedback
