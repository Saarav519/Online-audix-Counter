"""Reproduce duplicate barcode merge issue in Store Wise SINGLE-SESSION reports.

Scenario:
1. Store client + session (variance_mode = barcode-wise)
2. Master has both A and B as valid barcodes
3. Scanner physical scans:
   - A at LOC1 (qty 5) — extra scan, mistype
   - B at LOC1 (qty 10)
4. User edits A → B at LOC1 (correcting the mistype)
5. Verify:
   - Detailed: ONE row at (LOC1, B) with combined physical = 15
   - Barcode-wise: ONE row for B with physical = 15
   - Reco Qty added on the merged row applies once.
"""
import asyncio, sys, uuid, os
sys.path.insert(0, '/app/backend')
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "audix_db")

from audit_routes import (
    db, get_detailed_report, get_barcode_wise_report,
    edit_barcode, save_reco_adjustment, RecoAdjustmentCreate,
)


async def main():
    client_id = "TEST_STORE_MERGE"
    session_id = str(uuid.uuid4())
    A = "BC_A"; B = "BC_B"; LOC1 = "LOC-1"

    for col in ["clients", "audit_sessions", "expected_stock", "synced_locations",
                "master_products", "barcode_edits", "reco_adjustments"]:
        await db[col].delete_many({"client_id": client_id})
    await db.audit_sessions.delete_many({"id": session_id})
    await db.synced_locations.delete_many({"session_id": session_id})

    await db.clients.insert_one({"id": client_id, "code": client_id, "name": "T",
                                  "is_active": True, "client_type": "store"})
    await db.audit_sessions.insert_one({
        "id": session_id, "client_id": client_id, "name": "S1",
        "status": "active", "variance_mode": "bin-wise",
        "created_at": "2025-01-01"
    })

    # Master has both A (with stock=0 → so edit can apply) and B
    await db.master_products.insert_many([
        {"client_id": client_id, "barcode": A, "description": "A", "category": "C",
         "mrp": 100, "cost": 50, "article_code": "ART-A"},
        {"client_id": client_id, "barcode": B, "description": "B", "category": "C",
         "mrp": 100, "cost": 50, "article_code": "ART-B"},
    ])

    # Expected stock has B at LOC1 with qty 20
    await db.expected_stock.insert_one({
        "session_id": session_id, "location": LOC1, "barcode": B,
        "qty": 20, "description": "B", "category": "C", "mrp": 100, "cost": 50,
    })

    # Scans: A (mistyped) qty 5 + B qty 10 at LOC1
    await db.synced_locations.insert_one({
        "session_id": session_id, "client_id": client_id,
        "location_name": LOC1,
        "items": [{"barcode": A, "quantity": 5}, {"barcode": B, "quantity": 10}],
        "total_quantity": 15, "is_empty": False, "synced_at": "2025-01-02",
    })

    # Edit A → B globally via barcode-wise (no location → global remap)
    edit_resp = await edit_barcode({
        "client_id": client_id, "report_type": "barcode-wise",
        "original_value": A, "new_value": B, "location": "",
    })
    print("Edit:", edit_resp.get("success"), edit_resp.get("edit_id"))

    # Add Reco 100 anchored to original A globally (barcode-wise reco type)
    await save_reco_adjustment(RecoAdjustmentCreate(
        client_id=client_id, reco_type="barcode",
        location="", barcode=A, reco_qty=100,
    ))

    print("\n=== STORE SINGLE-SESSION DETAILED ===")
    detailed = await get_detailed_report(session_id)
    for r in detailed["report"]:
        print(f"  loc={r['location']:8} bc={r['barcode']:6} stock={r['stock_qty']:>3} phys={r['physical_qty']:>4} reco={r['reco_qty']:>5} final={r['final_qty']:>5} edited={r.get('is_edited', False)}")
    print(f"  totals: phys={detailed['totals']['physical_qty']} reco={detailed['totals']['reco_qty']} final={detailed['totals']['final_qty']}")

    print("\n=== STORE SINGLE-SESSION BARCODE-WISE ===")
    bw = await get_barcode_wise_report(session_id)
    for r in bw["report"]:
        print(f"  bc={r['barcode']:6} stock={r['stock_qty']:>3} phys={r['physical_qty']:>4} reco={r['reco_qty']:>5} final={r['final_qty']:>5} edited={r.get('is_edited', False)}")
    print(f"  totals: phys={bw['totals']['physical_qty']} reco={bw['totals']['reco_qty']} final={bw['totals']['final_qty']}")

    # Expected: one row at (LOC1, B) with phys=15, reco=100, final=115
    detailed_b_rows = [r for r in detailed["report"] if r["barcode"] == B]
    bw_b_rows = [r for r in bw["report"] if r["barcode"] == B]
    print()
    print(f">>> Detailed rows for B: {len(detailed_b_rows)} (expect 1)")
    if detailed_b_rows:
        r = detailed_b_rows[0]
        print(f">>> Detailed B: phys={r['physical_qty']} (expect 15), reco={r['reco_qty']} (expect 100), final={r['final_qty']} (expect 115)")
    print(f">>> Barcode-wise rows for B: {len(bw_b_rows)} (expect 1)")
    if bw_b_rows:
        r = bw_b_rows[0]
        print(f">>> Barcode-wise B: phys={r['physical_qty']} (expect 15), reco={r['reco_qty']} (expect 100), final={r['final_qty']} (expect 115)")

    detailed_a_rows = [r for r in detailed["report"] if r["barcode"] == A]
    bw_a_rows = [r for r in bw["report"] if r["barcode"] == A]
    if detailed_a_rows or bw_a_rows:
        print(f"!!! BUG: A still appears in reports — Detailed:{len(detailed_a_rows)} Barcode-wise:{len(bw_a_rows)}")
    else:
        print(">>> No stray A rows ✓")

    # cleanup
    for col in ["clients", "audit_sessions", "expected_stock", "synced_locations",
                "master_products", "barcode_edits", "reco_adjustments"]:
        await db[col].delete_many({"client_id": client_id})
    await db.audit_sessions.delete_many({"id": session_id})
    await db.synced_locations.delete_many({"session_id": session_id})


if __name__ == "__main__":
    asyncio.run(main())
