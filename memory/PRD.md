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

---

## Bug Fixes (January 2026)

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
