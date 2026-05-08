"""Reproduction test for the reco duplication bug after barcode edit.

Scenario:
1. Create warehouse client + session
2. Master has barcode NEW only (not OLD).
3. Scanner scans barcode OLD at location L1 (extra scan).
4. User edits OLD → NEW (detailed scope, location L1).
5. User adds Reco Qty = 100 on the NEW row in Detailed Report.
6. Verify barcode-wise consolidated report does NOT show OLD with reco=100.
"""
import asyncio, sys, uuid, os
sys.path.insert(0, '/app/backend')
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "audix_db")

from audit_routes import (
    db,
    get_consolidated_barcode_wise,
    get_consolidated_detailed,
    save_reco_adjustment,
    edit_barcode,
)


async def main():
    client_id = "TEST_BUG_RECO_DUP"
    session_id = str(uuid.uuid4())
    OLD = "OLD_BARCODE_X"
    NEW = "NEW_BARCODE_Y"
    LOC = "BIN-A1"

    # Cleanup
    for col in ["clients", "audit_sessions", "expected_stock", "synced_locations",
                "master_products", "barcode_edits", "reco_adjustments"]:
        await db[col].delete_many({"client_id": client_id})
    await db.audit_sessions.delete_many({"id": session_id})
    await db.synced_locations.delete_many({"session_id": session_id})
    await db.expected_stock.delete_many({"session_id": session_id})

    # Setup client + session
    await db.clients.insert_one({
        "id": client_id, "code": client_id, "name": "Test", "is_active": True,
        "module": "warehouse", "audit_type": "warehouse",
        "created_at": "2025-01-01T00:00:00Z"
    })
    await db.audit_sessions.insert_one({
        "id": session_id, "client_id": client_id, "name": "S1",
        "status": "active", "audit_type": "warehouse",
        "created_at": "2025-01-01T00:00:00Z"
    })

    # Master only has NEW barcode
    await db.master_products.insert_one({
        "client_id": client_id, "barcode": NEW, "description": "Item Y",
        "category": "Cat1", "mrp": 100, "cost": 50,
        "article_code": "ART-Y", "article_name": "Y"
    })

    # Case A: scan only at edited location (simple case)
    await db.synced_locations.insert_one({
        "session_id": session_id, "client_id": client_id,
        "location_name": LOC,
        "items": [{"barcode": OLD, "quantity": 5}],
        "total_quantity": 5,
        "is_empty": False,
        "synced_at": "2025-01-02T00:00:00Z",
    })

    # Step 1: Edit OLD → NEW (detailed scope)
    edit_resp = await edit_barcode({
        "client_id": client_id, "report_type": "detailed",
        "original_value": OLD, "new_value": NEW,
        "location": LOC,
    })
    print("Edit response:", edit_resp)

    # Step 2: Add Reco Qty = 100 (frontend would save with original_value as barcode key)
    from audit_routes import RecoAdjustmentCreate
    adj = RecoAdjustmentCreate(
        client_id=client_id, reco_type="detailed",
        location=LOC, barcode=OLD,  # frontend uses _original_value
        reco_qty=100,
    )
    await save_reco_adjustment(adj)

    # Step 3: Fetch reports
    detailed = await get_consolidated_detailed(client_id)
    print("\n=== DETAILED REPORT ===")
    for r in detailed["report"]:
        print(f"  loc={r['location']!r:14} bc={r['barcode']!r:18} stock={r['stock_qty']:>3} phys={r['physical_qty']:>3} reco={r['reco_qty']:>3} final={r['final_qty']:>3}  edited={r.get('is_edited', False)}")
    print(f"  TOTALS: reco_qty={detailed['totals']['reco_qty']}")

    barcode_wise = await get_consolidated_barcode_wise(client_id)
    print("\n=== BARCODE-WISE REPORT ===")
    for r in barcode_wise["report"]:
        print(f"  bc={r['barcode']!r:18} stock={r['stock_qty']:>3} phys={r['physical_qty']:>3} reco={r['reco_qty']:>3} final={r['final_qty']:>3}  edited={r.get('is_edited', False)}")
    print(f"  TOTALS: reco_qty={barcode_wise['totals']['reco_qty']}")

    # Assertion: only ONE row in barcode-wise should have reco=100, total=100
    rows_with_reco = [r for r in barcode_wise["report"] if r["reco_qty"] != 0]
    print(f"\n>>> Rows with reco_qty != 0 in barcode-wise: {len(rows_with_reco)}")
    print(f">>> Sum reco across rows: {sum(r['reco_qty'] for r in rows_with_reco)}")
    print(f">>> Total reco_qty in totals: {barcode_wise['totals']['reco_qty']}")

    if barcode_wise["totals"]["reco_qty"] != 100:
        print("BUG REPRODUCED: barcode-wise totals reco != 100")
    if len(rows_with_reco) > 1:
        print("BUG REPRODUCED: multiple rows have reco")

    # Cleanup
    for col in ["clients", "audit_sessions", "expected_stock", "synced_locations",
                "master_products", "barcode_edits", "reco_adjustments"]:
        await db[col].delete_many({"client_id": client_id})
    await db.audit_sessions.delete_many({"id": session_id})
    await db.synced_locations.delete_many({"session_id": session_id})


if __name__ == "__main__":
    asyncio.run(main())
