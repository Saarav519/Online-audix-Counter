# Audix Online Counter - PRD

## Original Problem Statement
User reported that in the Audix scanner mobile app, during scanning the master data (products/locations) disappears from the app. They have to re-import master data but scanned data remains safe.

## Architecture
- **Backend**: FastAPI + MongoDB
- **Frontend**: React + Tailwind CSS + shadcn/ui + Capacitor (Android)
- **Portal**: Admin dashboard for managing audits
- **Scanner**: Mobile PWA for barcode scanning
- **Storage**: IndexedDB for master data and scanned items (100MB+ support)

## Core Features (Existing)
- Multi-client audit management
- Audit sessions with variance tracking
- Barcode scanning with device sync
- Reports with XLSX export
- User management with approval workflow
- Master data import (products, locations, users)
- Dynamic and Pre-assigned location scanning modes

## What's Been Implemented

### Bug Fix: Master Data Disappearing During Scanning (Jan 2026)
**Root Causes Identified:**
1. No `navigator.storage.persist()` - Mobile browser could evict IndexedDB data under memory pressure
2. Auto-save used destructive `importAll()` (clear + insert) - If interrupted, data was lost
3. Stale IndexedDB connection not handled - After browser closes connection, operations fail silently
4. No data loss detection - When IndexedDB was cleared, mock data silently replaced real data
5. No metadata tracking - App couldn't distinguish fresh install vs data loss

**Files Modified:**
- `/app/frontend/src/utils/indexedDB.js` - Persistent storage, connection health, safe save, metadata tracking
- `/app/frontend/src/context/AppContext.js` - Safe auto-save, data loss detection, improved loading
- `/app/frontend/src/components/Layout.jsx` - Data loss warning banner

**Fixes Applied:**
1. Added `navigator.storage.persist()` to prevent browser from evicting IndexedDB
2. Added `safeSave()` method (upsert without clearing) for auto-save operations
3. Added stale connection detection with automatic reconnection and retry
4. Added `onclose` and `onversionchange` handlers for IndexedDB connection
5. Added metadata tracking in localStorage to detect if user had imported data
6. Added data loss warning banner showing "Master Data Lost - please re-import"
7. Added safety check: don't auto-save empty data (prevents overwriting with nothing)
8. Added localStorage backup fallback when IndexedDB save fails

### Previous Changes (March 2026)
- Selective location sync (only selected locations sync)
- Location name display enhancement (26 chars visible)

## Prioritized Backlog
- P0: None (core fix complete)
- P1: Auto-backup master data to localStorage for smaller datasets (<5MB)
- P2: Add explicit "Export master data backup" button in Settings
- P2: Add periodic IndexedDB health check during scanning sessions

## Next Tasks
- User testing on actual mobile scanner device to verify fix
- Monitor if data loss issue recurs
