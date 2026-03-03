# Audix Counter Software - PRD

## Original Problem Statement
Full-stack audit/inventory reconciliation platform. User wants to convert into SaaS product with multi-tenant architecture, subscription model, desktop app (Electron), and single-repo CI/CD for APK + EXE builds.

## Current Session Work (Mar 3, 2026)
- Fixed backend route prefix (`/api/portal` → `/api/audit/portal`)
- Created comprehensive SaaS implementation guide: `/app/AUDIX_FULL_IMPLEMENTATION_GUIDE.md`
- Guide covers 7 phases: Multi-Tenant, Subscription, Desktop App, GitHub Actions, Auto-Update, Super Admin, Landing Page
- Guide is ready to share with Account B agent for implementation

## Key Decisions Made
- Hybrid architecture (server + local cache in desktop app)
- Razorpay for payments
- Electron for desktop app
- Single repo GitHub Actions for all builds (no cross-repo push)
- JWT auth replacing HTTP Basic
- 14-day free trial for new users
- tenant_id based data isolation

## Credentials
- Admin: username=admin, password=admin123
- Superadmin: to be configured in .env

## Files Created
- `/app/AUDIX_FULL_IMPLEMENTATION_GUIDE.md` — Complete guide for Account B agent
- `/app/AUDIX_SAAS_IMPLEMENTATION_PLAN.md` — Earlier summary plan (superseded by full guide)
