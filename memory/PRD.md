# Audix Stock Management - Product Requirements Document

## Original Problem Statement
Build a web clone of the "Stock Count: Stock Take Opname" mobile app named "Audix Stock Management" with the following core requirements:

### Branding
- Use "Audix" branding with provided logo
- Eye-friendly color scheme

### Core Functionality
1. **Barcode Deletion**: Deleting a barcode affects only the specific location
2. **Submit & Lock**: Locations can be submitted and locked, requiring manual authorization to reopen
3. **SKU Scanning Modes**: Toggle between "Single SKU" and "Multiple SKU" modes
4. **Product Master Control**: Option to allow scanning of only master products or non-master products
5. **Audio Feedback**: Different sounds for valid and invalid barcode scans

### Location Management
1. **Pre-Assigned Mode**: Users scan from pre-imported location list (CSV import)
2. **Dynamic Mode**: New location codes auto-create locations
3. **Mode Separation**: Locations in one mode are not visible in the other

### Data Management
1. **Master Data Overwrite**: New file replaces old data
2. **User Import**: Import user credentials along with master data

### Security & Access
1. **Settings Authentication**: Require credentials to access/save settings
2. **Daily Credential Changes**: Option for daily ID/password changes

---

## What's Been Implemented

### Frontend (React + Tailwind + shadcn/ui)
- Multi-page application with routing
- Login, Dashboard, Locations, Scan Items, Master Data, Reports, Settings pages
- Custom Audix branding and color scheme
- React Context for state management
- Mock data layer for all business logic

### Features Completed
| Feature | Status | Date |
|---------|--------|------|
| Login & Authentication | Done | - |
| Dashboard Overview | Done | - |
| Location Management | Done | - |
| Scan Items Page | Done | - |
| Master Data Page | Done | - |
| Reports Page | Done | - |
| Settings Page with Auth | Done | - |
| Dynamic Location Mode | Done | - |
| Pre-Assigned Location Mode | Done | - |
| Single SKU / Manual Qty Modes | Done | - |
| Location CSV Import | Done | - |
| Master Data Replacement | Done | - |
| User Import | Done | - |
| Settings Persistence (localStorage) | Done | Jan 2026 |
| Pre-Assigned: Scan Items Sidebar Hidden | Done | Jan 2026 |
| Pre-Assigned: Post-Submit Navigation | Done | Jan 2026 |
| Pre-Assigned: Direct /scan Redirect | Done | Jan 2026 |
| Reports: Master Data Columns (SKU, Category, Price) | Done | Jan 2026 |
| Auth Sync: Main Login & Settings | Done | Jan 2026 |
| Separate Authorization Users | Done | Jan 2026 |
| Android Scanner Compatibility | Done | Jan 2026 |
| Dashboard: Remove Recent Locations | Done | Jan 2026 |
| Scanner Device Layout (Large Buttons) | Done | Jan 2026 |

---

## Bug Fixes (January 2026)

### Fix #9: Logo Position and Accidental Click Prevention
**Problem**: Logo image in the header was causing accidental clicks when trying to tap navigation buttons on scanner devices.

**Solution**: 
1. Replaced logo image with text "AUDIX" in scanner mode
2. Added `pointer-events: none` and `select-none` to make logo non-interactive
3. Reduced header height from h-14 to h-12 for more content space
4. Reduced navigation button height from h-20 to h-16 for better fit

**Files Changed**: 
- `/app/frontend/src/components/Layout.jsx`
- `/app/frontend/src/pages/Dashboard.jsx`

### Fix #10: Android 7.0+ (Nougat) Compatibility
**Problem**: App needed to run on CipherLab RS31 scanner with Android 7.0.

**Solution**:
1. Updated `browserslist` in package.json to include Android >= 7 and Chrome >= 60
2. Added CipherLab-specific model identifiers (RS31, RS30, RS50, RS51, CP, RK, 9700, 8000, 8200) to device detection
3. Added extensive CSS vendor prefixes for -webkit compatibility
4. Added proper viewport meta tags for mobile web app capability
5. Added touch-action manipulation to prevent 300ms tap delay
6. Added specific styles for small screens (≤480px width)

**Files Changed**: 
- `/app/frontend/package.json`
- `/app/frontend/public/index.html`
- `/app/frontend/src/hooks/useDeviceDetection.js`
- `/app/frontend/src/App.css`

### Fix #1: Post-Submission Navigation Issue
**Problem**: In Pre-Assigned mode, after submitting a location, the system stayed on the Scan Items page instead of navigating to the next location.

**Solution**: Modified `ScanItems.jsx` - After submission in Pre-Assigned mode, the system now navigates back to the Locations page where users can see the list and open the next pending location.

**Files Changed**: `/app/frontend/src/pages/ScanItems.jsx`

### Fix #2: Scan Item Visibility Requirement
**Problem**: In Pre-Assigned mode, the Scan Items option was available as a separate menu item, allowing misuse.

**Solution**: 
1. Hidden "Scan Items" from sidebar navigation in Pre-Assigned mode
2. Added redirect from `/scan` to `/locations` when accessed directly without a location parameter
3. Scan Items is now only accessible by opening a location from the Locations page

**Files Changed**: 
- `/app/frontend/src/components/Layout.jsx`
- `/app/frontend/src/pages/ScanItems.jsx`
- `/app/frontend/src/context/AppContext.js`

### Fix #3: Master Data Columns in Report Export
**Problem**: Reports export was missing master data columns (SKU, Category, Price).

**Solution**: Added SKU, Category, and Price columns to both the Reports table display and CSV export.

**Files Changed**: `/app/frontend/src/pages/Reports.jsx`

### Fix #4: Main Screen & Settings Authentication Sync
**Problem**: User wanted main login and settings to use the same credentials, with changes applying to both.

**Solution**: 
1. Login uses only mock users (not imported users)
2. Settings uses same credentials as main login
3. Change Credentials in Settings updates credentials for both screens
4. Added `updateUserCredentials()` function to persist changes

**Files Changed**: 
- `/app/frontend/src/context/AppContext.js`
- `/app/frontend/src/pages/Settings.jsx`

### Fix #5: Separate Authorization Users
**Problem**: User Import was being used for login, but should only be for authorization actions.

**Solution**:
1. Renamed "Import Users" to "Import Authorization Users"
2. Authorization users can ONLY be used for: location deletion, reopening locked locations
3. Authorization users CANNOT login or access settings
4. Clear UI messaging about the separation

**Files Changed**: 
- `/app/frontend/src/context/AppContext.js` (added `verifyAuthorizationCredentials()`, `importAuthorizationUsers()`)
- `/app/frontend/src/pages/MasterData.jsx`
- `/app/frontend/src/pages/Locations.jsx`

### Fix #6: Android Scanner Compatibility
**Problem**: App needed to work on Android 7 (Nougat) to latest, with hardware scanner key support.

**Solution**:
1. Created `useDeviceDetection` hook to detect Android devices and screen sizes
2. Created `useHardwareScanner` hook to capture hardware scanner key events
3. Added touch-friendly CSS styles in App.css
4. Compatible with enterprise scanners (Zebra, Honeywell, Datalogic, etc.)

**Files Changed**: 
- `/app/frontend/src/hooks/useDeviceDetection.js` (new file)
- `/app/frontend/src/App.css`
- `/app/frontend/src/pages/ScanItems.jsx`

### Fix #7: Dashboard - Remove Recent Locations
**Problem**: User wanted to remove the "Recent Locations" column from Dashboard.

**Solution**: Removed the Recent Locations section entirely, replaced with Quick Actions grid.

**Files Changed**: `/app/frontend/src/pages/Dashboard.jsx`

### Fix #8: Scanner Device Layout (Large Buttons)
**Problem**: On scanner devices, navigation should be large, visible buttons - not hidden in a menu.

**Solution**:
1. Created scanner mode UI that activates on small screens (≤800px width or ≤600px height)
2. Dashboard shows "Quick Navigation" with 6 large buttons (80px height) in 2-column grid
3. Added fixed bottom navigation bar with 5 items
4. All touch targets are minimum 44px for easy one-handed operation
5. Login page has larger inputs (56px height) on scanner devices

**Files Changed**: 
- `/app/frontend/src/components/Layout.jsx`
- `/app/frontend/src/pages/Dashboard.jsx`
- `/app/frontend/src/pages/Login.jsx`

---

## Architecture

### Tech Stack
- **Frontend**: React, React Router, Tailwind CSS, shadcn/ui
- **State Management**: React Context API + localStorage
- **Backend**: FastAPI (planned)
- **Database**: MongoDB (planned)

### File Structure
```
/app
├── backend/
│   ├── .env
│   ├── requirements.txt
│   └── server.py
└── frontend/
    └── src/
        ├── components/
        │   ├── Layout.jsx
        │   └── ui/
        ├── context/
        │   └── AppContext.js
        ├── data/
        │   └── mockData.js
        ├── pages/
        │   ├── Dashboard.jsx
        │   ├── Locations.jsx
        │   ├── Login.jsx
        │   ├── MasterData.jsx
        │   ├── Reports.jsx
        │   ├── ScanItems.jsx
        │   └── Settings.jsx
        └── App.js
```

---

## Prioritized Backlog

### P0 - Critical (Current)
- [x] Pre-Assigned Mode Navigation Fix
- [x] Scan Items Visibility Control

### P1 - Backend Integration (Next)
- [ ] Create API contracts document
- [ ] Implement FastAPI backend
- [ ] Create MongoDB models (Users, Products, Locations, Scanned Items)
- [ ] Replace mock data with API calls
- [ ] Implement file upload endpoints

### P2 - Enhancements
- [ ] Distinct audio feedback sounds
- [ ] Daily credential change feature
- [ ] Export reports functionality

---

## Test Credentials
- **Admin**: admin / admin123
- **Scanner**: scanner1 / scan123

---

## Known Limitations
- **Data**: All data is currently mocked client-side (localStorage)
- **Backend**: Not yet implemented - no persistent storage
