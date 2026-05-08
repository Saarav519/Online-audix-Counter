"""Verify Reco column works in SINGLE-SESSION reports for Store-type clients
(Option B): Reco should be visible/populated in detailed, barcode-wise, and
article-wise single-session report endpoints when client_type == 'store'.

Also verify that for client_type == 'warehouse' the single-session reports
remain Reco-free (legacy behaviour preserved).
"""
import asyncio, sys, uuid, os
sys.path.insert(0, '/app/backend')
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "audix_db")

from audit_routes import (
    db,
    get_detailed_report,
    get_barcode_wise_report,
    get_article_wise_report,
    get_bin_wise_report,
    get_category_summary,
    save_reco_adjustment,
    edit_barcode,
    RecoAdjustmentCreate,
)


async def run_for_client_type(client_type: str):
    client_id = f"TEST_STORE_RECO_{client_type.upper()}"
    session_id = str(uuid.uuid4())
    OLD = "OLD_BC"; NEW = "NEW_BC"; LOC = "BIN-A1"

    for col in ["clients", "audit_sessions", "expected_stock", "synced_locations",
                "master_products", "barcode_edits", "reco_adjustments"]:
        await db[col].delete_many({"client_id": client_id})
    await db.audit_sessions.delete_many({"id": session_id})
    await db.synced_locations.delete_many({"session_id": session_id})
    await db.expected_stock.delete_many({"session_id": session_id})

    await db.clients.insert_one({"id": client_id, "code": client_id, "name": "T",
                                  "is_active": True, "client_type": client_type})
    await db.audit_sessions.insert_one({
        "id": session_id, "client_id": client_id, "name": "S1",
        "status": "active", "variance_mode": "barcode-wise",
        "created_at": "2025-01-01T00:00:00Z"
    })
    await db.master_products.insert_one({
        "client_id": client_id, "barcode": NEW, "description": "Y",
        "category": "C", "mrp": 100, "cost": 50,
        "article_code": "ART-Y", "article_name": "Y",
    })
    # Multi-location scan (recreates the bug scenario)
    await db.synced_locations.insert_many([
        {"session_id": session_id, "client_id": client_id, "location_name": LOC,
         "items": [{"barcode": OLD, "quantity": 5}], "total_quantity": 5,
         "is_empty": False, "synced_at": "2025-01-02"},
        {"session_id": session_id, "client_id": client_id, "location_name": "BIN-B2",
         "items": [{"barcode": OLD, "quantity": 3}], "total_quantity": 3,
         "is_empty": False, "synced_at": "2025-01-02"},
    ])

    # Edit OLD → NEW at BIN-A1
    await edit_barcode({"client_id": client_id, "report_type": "detailed",
                        "original_value": OLD, "new_value": NEW, "location": LOC})
    # Save Reco anchored to OLD (frontend convention)
    await save_reco_adjustment(RecoAdjustmentCreate(
        client_id=client_id, reco_type="detailed",
        location=LOC, barcode=OLD, reco_qty=100,
    ))

    print(f"\n========= client_type='{client_type}' =========")
    detailed = await get_detailed_report(session_id)
    print(f"Detailed totals reco={detailed['totals']['reco_qty']}")

    bw = await get_barcode_wise_report(session_id)
    print(f"Barcode-wise totals reco={bw['totals']['reco_qty']}")
    for r in bw["report"]:
        if r['reco_qty']:
            print(f"  bc={r['barcode']:14} reco={r['reco_qty']}")

    aw = await get_article_wise_report(session_id)
    print(f"Article-wise totals reco={aw['totals']['reco_qty']}")

    bin_w = await get_bin_wise_report(session_id)
    print(f"Bin-wise totals reco={bin_w['totals']['reco_qty']}")

    cat = await get_category_summary(session_id)
    print(f"Category-summary totals reco={cat['totals']['reco_qty']}")

    # Assertions
    if client_type == "store":
        assert detailed['totals']['reco_qty'] == 100, "Store detailed should have reco=100"
        assert bw['totals']['reco_qty'] == 100, "Store barcode-wise should have reco=100 (not 200)"
        assert bin_w['totals']['reco_qty'] == 100, "Store bin-wise should have reco=100"
        # Only the NEW (edited) barcode should carry the reco
        rows_with_reco = [r for r in bw["report"] if r["reco_qty"]]
        assert len(rows_with_reco) == 1 and rows_with_reco[0]["barcode"] == NEW, \
            "Reco should be on NEW barcode only"
        print("✅ Store-type SINGLE-SESSION reports show Reco correctly (no double-count)")
    else:  # warehouse
        assert detailed['totals']['reco_qty'] == 0, "Warehouse single-session should be Reco-free"
        assert bw['totals']['reco_qty'] == 0, "Warehouse single-session should be Reco-free"
        assert bin_w['totals']['reco_qty'] == 0, "Warehouse single-session should be Reco-free"
        print("✅ Warehouse-type SINGLE-SESSION reports remain Reco-free (legacy preserved)")

    # cleanup
    for col in ["clients", "audit_sessions", "expected_stock", "synced_locations",
                "master_products", "barcode_edits", "reco_adjustments"]:
        await db[col].delete_many({"client_id": client_id})
    await db.audit_sessions.delete_many({"id": session_id})
    await db.synced_locations.delete_many({"session_id": session_id})


async def main():
    await run_for_client_type("store")
    await run_for_client_type("warehouse")


if __name__ == "__main__":
    asyncio.run(main())
