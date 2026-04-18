# Audix Data Management - PRD

## Original Problem Statement
User (AudiX Solutions & Co. - Chartered Accountants) runs 3 products live:
1. Audix Data Management (stock audit portal + scanner app) ← THIS PROJECT
2. Staff Attendance & Payroll (separate deployment)
3. Audix R&M (separate deployment)

User goal: Make the portal look IMPRESSIVE to clients. Must be fast, premium, polished.
Scanner app should NOT be modified. Light theme (not dark).

## Architecture
- Backend: FastAPI + MongoDB (server.py wrapper + audit_routes.py module)
- Frontend: React + Capacitor + Tailwind + shadcn/ui + recharts + cmdk
- Scanner (mobile-only): `/scan`, `/master-data`, `/reports`, `/settings`, `/login`
- Portal (admin): `/portal`, `/portal/dashboard`, `/portal/clients`, `/portal/sessions`,
  `/portal/devices`, `/portal/reports`, `/portal/sync-logs`, `/portal/conflicts`, `/portal/users`

## Default Admin Credentials
- Username: `admin`  |  Password: `admin123` (auto-seeded)

## Implementation Timeline

### Phase 3: Power Features (Apr 18, 2026) ✅
**Session Progress Tracker (Option B):**
- New backend endpoint `GET /api/audit/portal/sessions/{id}/progress`
  — returns scanned_locations, total_expected_locations, progress_percent,
  total_items, total_quantity, active_devices (last 10 min), last_sync_at
- `SessionProgressBar.jsx` (auto-refresh 20s) — gradient progress bar + live pills
- Integrated into every session card on PortalSessions page

**PDF Branded Reports (Option A):**
- Installed `jspdf` + `jspdf-autotable`
- `utils/pdfGenerator.js` — branded generator (emerald header band, AudiX monogram,
  meta box, KPI summary, paginated autotable, confidential footer)
- "Export PDF" button next to "Export Excel" on Reports page

**Keyboard Shortcuts (Option E):**
- `KeyboardShortcuts.jsx` — `?` opens modal, `g+letter` navigates
  (g+d/c/s/v/r/l/x/u), Esc closes, skips while typing in inputs

### Phase 1: GitHub Final branch sync (Apr 18, 2026) ✅
- Refactored backend to `server.py + audit_routes.py` structure
- Added `SafeJSONResponse` + global exception handlers + 35+ MongoDB indexes
- Pulled 6 new endpoints (Location Master + reco-diagnostic + compare-totals)
- Copied all 12 portal pages from GitHub Final branch
- Created `AuditApp.js` shim for `useAudit` context
- Installed `@tanstack/react-virtual`

### Phase 2: Premium Light UI Makeover (Apr 18, 2026) ✅
**New reusable components in `/app/frontend/src/components/portal/`:**
- `CountUp.jsx` — animated number counter (easeOut)
- `PageHeader.jsx` — unified header with breadcrumbs + title + accent + live pill + actions
- `StatCard.jsx` — animated KPI card (hover lift, gradient accent, trend arrow, icon ring)
- `EmptyState.jsx` — gorgeous branded empty states (icon halo, gradient bg, tip pill, action)
- `Skeleton.jsx` — shimmer skeletons (Skeleton, SkeletonCard, SkeletonTable, SkeletonChart)
- `NotificationBell.jsx` — polling bell with unread badge + dropdown + mark-all-read
- `GlobalSearch.jsx` — Cmd+K / Ctrl+K global modal (clients, sessions, quick nav, actions)

**Sidebar/Layout (PortalLayout.jsx) upgrade:**
- Collapsible sidebar (persisted in localStorage)
- Badges on nav items (auto-poll conflicts + pending users count)
- Active-nav gradient accent bar with icon coloring
- Sticky topbar with Cmd+K search trigger + notification bell
- Mobile responsive drawer with hamburger menu

**Dashboard complete redesign (PortalDashboard.jsx):**
- 6 animated KPI cards (Clients, Active Sessions, Devices, Empty Bins, Conflicts, Users)
- Accuracy donut chart (Overall Audit Progress) with inner percentage
- 7-day Scan Activity area chart (emerald gradient)
- Smart Insights panel (auto-generated from live data — conflicts, pending users, top variance)
- Live Device Status panel with animated pulse indicators (Live / Active / Recent / Stale)
- Recent Syncs timeline with icons
- Audit Summary cards (per-client) with accuracy %, gradient progress bar, mismatches expand

**All portal pages unified:**
- Applied `PageHeader` (breadcrumb + title + subtitle + accent + actions) to Clients, Sessions,
  Devices, Reports, Sync Logs, Conflicts, Users, Dashboard.
- Applied `EmptyState` with illustrations + tips to Clients, Sessions, Devices empty views.
- Applied skeleton loaders to Clients, Sessions, Dashboard (replaces plain spinners).

**Login Landing cleanup:**
- Hidden Staff Attendance + Audix R&M tabs (those backends are on separate deployments)
- Only Audix Data Management product shown — cleaner focus for clients.

**Tailwind animations added:**
- `shimmer`, `fade-in`, `fade-in-up`, `scale-in` keyframes for micro-interactions

## Next Tasks
- User to review & provide next batch of changes.

## Future/Backlog
- PDF branded report export (cover + summary + tables).
- Real-time WebSocket push for instant device sync notifications (currently 30s poll).
- Keyboard shortcuts help modal (`?` key) with full shortcut list.
- Session progress bars on Sessions page (locations scanned / total).
- Dark mode toggle (optional).
