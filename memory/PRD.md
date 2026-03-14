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

### 1. Selective Location Sync
- **File**: `/app/frontend/src/pages/Settings.jsx`
- Added `showSyncSelectionModal` state and `selectedSyncLocations` state
- Created `getSyncableLocations()` function to get locations with data
- Modified `handleManualSync()` to show location selection modal first
- Added `handleSyncSelectionConfirm()` for proceeding with selected locations
- Updated `performSync()` to accept `selectedLocationIds` parameter
- Added comprehensive location selection modal with:
  - Select All / Deselect All functionality
  - Location list with checkboxes
  - Item count and quantity display
  - Continue button shows selected count

### 2. Location Name Display Enhancement  
- **File**: `/app/frontend/src/pages/Reports.jsx`
- Changed font from `text-sm` to `text-xs` for location names
- Optimized row layout: reduced gaps, smaller status icons
- Compact Qty column and 3-dot menu
- Result: 26 characters now visible (was ~20 before)

## Prioritized Backlog
- P0: None (core changes complete)
- P1: Add location selection count in Settings sync summary
- P2: Add toast notification after successful selective sync

## Next Tasks
- User testing and feedback
- Mobile responsive testing on different screen sizes
