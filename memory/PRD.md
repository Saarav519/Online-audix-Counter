# Audix Counter Software - PRD

## Original Problem Statement
Full-stack audit/inventory reconciliation platform with offline data collection on scanner devices, central web portal for admins, variance reporting, conflict resolution, and reconciliation adjustments. User wants to convert this into a SaaS product with desktop app, subscription model, and multi-tenant architecture.

## Architecture
- Backend: FastAPI + MongoDB (Motor async driver)
- Frontend: React.js + Tailwind CSS
- Scanner App: Capacitor (Android APK)
- Desktop App: Planned (Electron)
- Deployment: Emergent Platform (Account B = Live, Account A = Testing)

## User Personas
1. **Audix Owner (Super Admin):** Manages all tenants, subscriptions, revenue tracking
2. **Tenant Admin:** Company admin who manages clients, sessions, devices, reports
3. **Tenant Viewer:** Read-only access to reports
4. **Scanner Operator:** Uses mobile app to scan barcodes and sync data

## Core Requirements (Static)
- Multi-tenant data isolation (tenant_id on all collections)
- Subscription-based access (Razorpay)
- Desktop app (Electron .exe) + Scanner app (Capacitor .apk)
- Single repo GitHub Actions for all builds
- Auto-update system for desktop and scanner apps
- Super admin panel for owner

## What's Been Implemented (Existing)
1. Mark Empty feature
2. Bin-wise report with statuses
3. Conflict Resolution (approved → variance, rejected → removed from raw)
4. Imported Stock Viewer
5. Reco Column — Consolidated View Only, mode-aware
6. Chunked Sync with Progress Bar
7. Sync Inbox + Forward to Variance
8. Scanner-Grouped Sync Logs + Export All
9. Delete Batch — permanently removes batch + data from variance
10. Rebuild Variance — clean slate rebuild from raw sync logs
11. Dynamic Master/Stock Schema
12. Warehouse/Store Client Type
13. Report Value Columns, Schema Templates, Session Stock Refresh
14. Report UI Improvements

### Session Changes (Mar 3, 2026)
- Fixed backend route prefix (`/api/portal` → `/api/audit/portal`) to match frontend
- Created complete SaaS implementation plan at `/app/AUDIX_SAAS_IMPLEMENTATION_PLAN.md`

## Credentials
- Admin: username=admin, password=admin123

## Prioritized Backlog

### P0 - Critical (Do First)
- Multi-Tenant Architecture (tenant_id everywhere)
- GitHub Actions CI/CD (same repo builds for APK + EXE)

### P1 - High Priority
- Subscription System (Razorpay integration)
- Desktop App (Electron basic)
- Landing Page + Download Page

### P2 - Medium Priority
- Auto-Update System (desktop + scanner)
- Super Admin Panel
- Local Cache (SQLite in Electron)

### P3 - Low Priority / Future
- Offline mode for desktop
- Charts & graphs on reports
- Server scaling (load balancer, Redis cache)
- Free trial period implementation

## Key Endpoints
- `POST /api/audit/portal/login` → Portal login
- `POST /api/audit/sync/` → Scanner data sync
- `GET /api/audit/portal/clients` → Client management
- All endpoints documented in AUDIX_SAAS_IMPLEMENTATION_PLAN.md

## Key DB Collections
- `clients`, `audit_sessions`, `synced_locations`, `sync_inbox`, `master_products`, `expected_stock`, `client_stock`, `client_schemas`, `conflict_locations`, `reco_adjustments`, `devices`, `alerts`, `portal_users`, `sync_raw_logs`

## Next Tasks
1. Share AUDIX_SAAS_IMPLEMENTATION_PLAN.md with Account B agent
2. Start Phase 1 (Multi-Tenant) implementation on Account B
3. Set up GitHub Actions for same-repo builds
4. Remove cross-repo push workflow
