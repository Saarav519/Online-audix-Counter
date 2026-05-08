"""Warehouse-module parity test for the recent Cycle Count fixes.

Verifies in WAREHOUSE that:

  1. Editable barcode undo/revert deactivates the edit.
  2. Reco Qty cascade-resets when the edit is undone.
  3. Reco saved against an edited row propagates correctly across
     consolidated barcode-wise / article-wise / category-summary
     (the new ``_mirror_reco_to_remapped`` helper).
  4. Consolidated detailed view stays in sync with reco anchored to
     the original barcode.
  5. Excel export formula is unchanged for warehouse rows
     (``physical + reco`` — no pre/post pick).
"""
import asyncio
import os
import uuid
from datetime import datetime, timezone

import httpx
from motor.motor_asyncio import AsyncIOMotorClient


async def main():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    BACKEND = "http://localhost:8001"

    client_id = f"test-wh-{uuid.uuid4().hex[:8]}"
    sid = f"test-sess-{uuid.uuid4().hex[:8]}"
    edit_id = str(uuid.uuid4())

    async def cleanup():
        await db.audit_clients.delete_many({"id": client_id})
        await db.audit_sessions.delete_many({"id": sid})
        await db.expected_stock.delete_many({"session_id": sid})
        await db.synced_locations.delete_many({"session_id": sid})
        await db.master_products.delete_many({"client_id": client_id})
        await db.barcode_edits.delete_many({"client_id": client_id})
        await db.reco_adjustments.delete_many({"client_id": client_id})

    # 1. Seed warehouse client + session + expected stock + scans
    await db.audit_clients.insert_one({
        "id": client_id, "name": "WHTest", "code": "WH",
        "client_type": "warehouse", "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await db.audit_sessions.insert_one({
        "id": sid, "client_id": client_id, "session_name": "S1",
        "status": "active", "variance_mode": "bin-wise",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    # Expected: NEWBC has 10 in stock at BIN-A (this is the master/planned)
    # OLDBC has 0 expected — it'll be the "extra-scanned" item the auditor
    # eventually edits to NEWBC.
    await db.expected_stock.insert_many([
        {"session_id": sid, "barcode": "NEWBC", "location": "BIN-A", "qty": 10,
         "description": "Item A", "category": "CatA", "mrp": 100, "cost": 50},
    ])
    # Scanned: BIN-A had 5x OLDBC (the extra scan) and 10x NEWBC (planned)
    await db.synced_locations.insert_one({
        "session_id": sid, "location_name": "BIN-A",
        "items": [
            {"barcode": "OLDBC", "quantity": 5, "product_name": "Item A"},
            {"barcode": "NEWBC", "quantity": 10, "product_name": "Item A"},
        ],
        "total_quantity": 15, "is_empty": False,
        "synced_at": datetime.now(timezone.utc).isoformat(),
    })
    # Master products
    await db.master_products.insert_many([
        {"client_id": client_id, "barcode": "NEWBC", "description": "Item A",
         "category": "CatA", "mrp": 100, "cost": 50,
         "article_code": "ART-A", "article_name": "ItemA"},
        {"client_id": client_id, "barcode": "OLDBC", "description": "Old",
         "category": "CatOld", "mrp": 0, "cost": 0,
         "article_code": "ART-OLD", "article_name": "ItemOld"},
    ])
    # Edit OLDBC → NEWBC at BIN-A (active)
    await db.barcode_edits.insert_one({
        "id": edit_id, "client_id": client_id,
        "report_type": "detailed", "original_value": "OLDBC", "new_value": "NEWBC",
        "location": "BIN-A",
        "master_info": {"description": "Item A", "category": "CatA",
                        "mrp": 100, "cost": 50,
                        "article_code": "ART-A", "article_name": "ItemA"},
        "edited_at": datetime.now(timezone.utc).isoformat(), "is_active": True,
    })
    # Reco anchored to ORIGINAL (matches the new frontend convention)
    await db.reco_adjustments.insert_one({
        "client_id": client_id, "reco_type": "detailed",
        "barcode": "OLDBC", "location": "BIN-A", "reco_qty": 7,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })

    async with httpx.AsyncClient(timeout=30) as h:
        # 3+4. Reco propagation across all consolidated reports
        for url, key, target in [
            (f"/api/audit/portal/reports/consolidated/{client_id}/detailed",       "barcode",  "NEWBC"),
            (f"/api/audit/portal/reports/consolidated/{client_id}/barcode-wise",   "barcode",  "NEWBC"),
            (f"/api/audit/portal/reports/consolidated/{client_id}/article-wise",   "article_code", "ART-A"),
            (f"/api/audit/portal/reports/consolidated/{client_id}/category-summary","category", "CatA"),
        ]:
            r = await h.get(BACKEND + url)
            data = r.json()
            rows = [x for x in data.get("report", []) if x.get(key) == target]
            assert rows, f"no row at {url} for {key}={target}"
            # Sum across rows (detailed may have 2 rows under same barcode:
            # the planned one + the edited extra-scan one)
            reco = sum(x.get("reco_qty", 0) for x in rows)
            assert reco == 7, f"{url} expected total reco=7, got {reco} ({len(rows)} rows)"
            print(f"  ✓ {url.split('/')[-1]:20s} → total reco={reco} across {len(rows)} row(s)")

        # 1+2. Undo cascade
        r = await h.post(BACKEND + "/api/audit/portal/reports/undo-edit",
                          json={"edit_id": edit_id})
        body = r.json()
        assert body.get("success") is True
        assert body.get("reco_adjustments_removed", 0) == 1, body
        print(f"\n  ✓ undo cascade response: {body}")

        # 5. Excel formula consistency — single-session reports don't carry
        # _is_cycle_count flag, so the frontend formula stays warehouse style.
        # Verify the backend payload doesn't include the flag.
        r = await h.get(BACKEND + f"/api/audit/portal/reports/consolidated/{client_id}/detailed")
        rows = r.json().get("report", [])
        assert all(not x.get("_is_cycle_count") for x in rows), \
            "warehouse rows must NOT be tagged _is_cycle_count"
        print(f"  ✓ warehouse rows not tagged as cycle-count → Excel keeps physical+reco formula")

    # Verify cascade actually removed the reco
    leftover = await db.reco_adjustments.count_documents({"client_id": client_id})
    edit_after = await db.barcode_edits.find_one({"id": edit_id})
    assert leftover == 0, f"reco should be deleted on undo, found {leftover}"
    assert edit_after["is_active"] is False
    print("  ✓ DB state: edit deactivated, reco purged")

    print("\nOK — Warehouse parity verified: undo cascade + reco propagation + formula consistency")


async def _runner():
    """Wraps `main` so cleanup runs even when assertions fail mid-run.
    Otherwise an interrupted run would orphan a session in the DB and crash
    the live PortalSessions screen on null/blank `name` (see fix in
    `pages/portal/PortalSessions.jsx`).
    """
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    try:
        await main()
    finally:
        # Best-effort sweep of any leftover test data this file may have
        # inserted with the `test-wh-` / `test-sess-` prefixes.
        for col in ["audit_clients", "audit_sessions", "expected_stock",
                    "synced_locations", "master_products", "barcode_edits",
                    "reco_adjustments"]:
            await db[col].delete_many({"$or": [
                {"id": {"$regex": "^test-wh-"}},
                {"id": {"$regex": "^test-sess-"}},
                {"client_id": {"$regex": "^test-wh-"}},
                {"session_id": {"$regex": "^test-sess-"}},
            ]})


if __name__ == "__main__":
    asyncio.run(_runner())
