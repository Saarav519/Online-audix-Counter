"""Cycle Count counterpart of the reco-duplication bug.

Same scenario as the warehouse one: a barcode edit at one location
should NOT cause the Reco to be applied to the same original barcode
scanned at OTHER (un-edited) locations.
"""
import asyncio, sys, uuid, os
sys.path.insert(0, '/app/backend')
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "audix_db")

from cycle_count_routes import db, cycle_day_report
from audit_routes import edit_barcode, save_reco_adjustment, RecoAdjustmentCreate


async def main():
    client_id = "TEST_CC_RECO_DUP"
    project_id = str(uuid.uuid4())
    day_id = str(uuid.uuid4())
    audit_session_id = str(uuid.uuid4())
    OLD = "OLD_BC"; NEW = "NEW_BC"
    L1 = "BIN-A1"; L2 = "BIN-B2"

    # cleanup
    for col in ["clients", "audit_sessions", "synced_locations", "master_products",
                "barcode_edits", "reco_adjustments",
                "cycle_projects", "cycle_days", "cycle_day_stock", "cycle_day_picks",
                "cycle_closed_bins"]:
        await db[col].delete_many({"client_id": client_id})
        await db[col].delete_many({"project_id": project_id})
        await db[col].delete_many({"id": project_id})
        await db[col].delete_many({"id": day_id})
        await db[col].delete_many({"session_id": audit_session_id})

    # Setup
    await db.clients.insert_one({"id": client_id, "code": client_id, "name": "T",
                                 "is_active": True, "module": "cycle-count"})
    await db.audit_sessions.insert_one({"id": audit_session_id, "client_id": client_id,
                                         "name": "S1", "status": "active",
                                         "audit_type": "cycle-count"})
    await db.cycle_projects.insert_one({
        "id": project_id, "client_id": client_id, "name": "P1",
        "audit_session_id": audit_session_id, "status": "active",
        "current_day": 1, "created_at": "2025-01-01T00:00:00Z"
    })
    await db.cycle_days.insert_one({
        "id": day_id, "project_id": project_id, "day_no": 1,
        "date": "2025-01-02", "status": "open"
    })

    # Master only has NEW
    await db.master_products.insert_one({
        "client_id": client_id, "barcode": NEW, "description": "Y",
        "category": "C", "mrp": 100, "cost": 50, "article_code": "ART-Y"
    })

    # Day stock: NEW expected at L1 (10 qty)
    await db.cycle_day_stock.insert_one({
        "project_id": project_id, "day_id": day_id,
        "location": L1, "barcode": NEW, "qty": 10
    })

    # Scans: OLD at L1 (5) and OLD at L2 (3) — both extra scans
    await db.synced_locations.insert_many([
        {"session_id": audit_session_id, "client_id": client_id,
         "location_name": L1, "items": [{"barcode": OLD, "quantity": 5}],
         "total_quantity": 5, "is_empty": False, "synced_at": "2025-01-02"},
        {"session_id": audit_session_id, "client_id": client_id,
         "location_name": L2, "items": [{"barcode": OLD, "quantity": 3}],
         "total_quantity": 3, "is_empty": False, "synced_at": "2025-01-02"},
    ])

    # Step: edit OLD → NEW at L1 (detailed)
    await edit_barcode({
        "client_id": client_id, "report_type": "detailed",
        "original_value": OLD, "new_value": NEW, "location": L1,
    })

    # Step: save Reco = 100 (anchored to OLD)
    await save_reco_adjustment(RecoAdjustmentCreate(
        client_id=client_id, reco_type="detailed",
        location=L1, barcode=OLD, reco_qty=100,
    ))

    # Fetch reports
    detailed = await cycle_day_report(day_id, "detailed")
    print("=== CC DETAILED ===")
    for r in detailed["report"]:
        print(f"  loc={r.get('location'):12} bc={r.get('barcode'):10} stock={r.get('stock_qty', 0):>3} phys={r.get('physical_qty', 0):>3} reco={r.get('reco_qty', 0):>5} final={r.get('final_qty', 0):>5}")
    print(f"  totals reco={detailed['totals'].get('reco_qty')}")

    bw = await cycle_day_report(day_id, "barcode-wise")
    print("\n=== CC BARCODE-WISE ===")
    for r in bw["report"]:
        print(f"  bc={r.get('barcode'):10} stock={r.get('stock_qty', 0):>3} phys={r.get('physical_qty', 0):>3} reco={r.get('reco_qty', 0):>5} final={r.get('final_qty', 0):>5}")
    print(f"  totals reco={bw['totals'].get('reco_qty')}")

    rows_with_reco = [r for r in bw["report"] if _to_float(r.get("reco_qty")) != 0]
    print(f"\n>>> rows with reco: {len(rows_with_reco)}")
    print(f">>> total reco: {bw['totals'].get('reco_qty')}")
    if bw['totals'].get('reco_qty') != 100 or len(rows_with_reco) > 1:
        print("BUG: cycle count reco is double-counted")
    else:
        print("OK: cycle count reco is correct")

    # cleanup
    for col in ["clients", "audit_sessions", "synced_locations", "master_products",
                "barcode_edits", "reco_adjustments",
                "cycle_projects", "cycle_days", "cycle_day_stock", "cycle_day_picks",
                "cycle_closed_bins"]:
        await db[col].delete_many({"client_id": client_id})
        await db[col].delete_many({"project_id": project_id})
        await db[col].delete_many({"id": project_id})
        await db[col].delete_many({"id": day_id})
        await db[col].delete_many({"session_id": audit_session_id})


def _to_float(v):
    try: return float(v) if v not in (None, "") else 0.0
    except Exception: return 0.0


if __name__ == "__main__":
    asyncio.run(main())
