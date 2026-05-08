"""Regression: barcode edit colliding with an EXISTING barcode at the same
bin must NOT double-count Reco/variance/final qty.

Scenario:
  Bin BIN-X already has barcode KNOWN (planned stock = 10, scanned = 10).
  Auditor scans 5 of WRONG (mistyped) at the same bin.
  Auditor edits WRONG → KNOWN at BIN-X.
  Auditor saves Reco = 100 on the edited row.

Expected after merge:
  Single row at (BIN-X, KNOWN) with stock=10, physical=15, reco=100, final=115.
  Total Reco impact = 100, NOT 200.
"""
import asyncio
import os
import uuid
from datetime import datetime, timezone

import httpx
from motor.motor_asyncio import AsyncIOMotorClient


async def warehouse_test():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    BACKEND = "http://localhost:8001"

    cid = f"test-coll-{uuid.uuid4().hex[:8]}"
    sid = f"test-sess-{uuid.uuid4().hex[:8]}"
    eid = str(uuid.uuid4())

    await db.audit_clients.insert_one({"id": cid, "name": "WH", "code": "WH",
        "client_type": "warehouse", "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()})
    await db.audit_sessions.insert_one({"id": sid, "client_id": cid,
        "session_name": "S", "status": "active", "variance_mode": "bin-wise",
        "created_at": datetime.now(timezone.utc).isoformat()})
    await db.expected_stock.insert_one(
        {"session_id": sid, "barcode": "KNOWN", "location": "BIN-X", "qty": 10,
         "description": "Item K", "category": "C", "mrp": 100, "cost": 50})
    await db.synced_locations.insert_one({"session_id": sid, "location_name": "BIN-X",
        "items": [
            {"barcode": "KNOWN", "quantity": 10, "product_name": "Item K"},
            {"barcode": "WRONG", "quantity": 5, "product_name": "Item K"},
        ], "total_quantity": 15, "is_empty": False,
        "synced_at": datetime.now(timezone.utc).isoformat()})
    await db.master_products.insert_one({"client_id": cid, "barcode": "KNOWN",
        "description": "Item K", "category": "C", "mrp": 100, "cost": 50,
        "article_code": "ART-K", "article_name": "K"})
    await db.barcode_edits.insert_one({"id": eid, "client_id": cid,
        "report_type": "detailed", "original_value": "WRONG", "new_value": "KNOWN",
        "location": "BIN-X",
        "master_info": {"description": "Item K", "category": "C",
                        "mrp": 100, "cost": 50, "article_code": "ART-K", "article_name": "K"},
        "edited_at": datetime.now(timezone.utc).isoformat(), "is_active": True})
    # Reco anchored to ORIGINAL (frontend convention)
    await db.reco_adjustments.insert_one({"client_id": cid, "reco_type": "detailed",
        "barcode": "WRONG", "location": "BIN-X", "reco_qty": 100,
        "updated_at": datetime.now(timezone.utc).isoformat()})

    async with httpx.AsyncClient(timeout=30) as h:
        # Consolidated detailed: must show ONE merged row at (BIN-X, KNOWN)
        r = await h.get(BACKEND + f"/api/audit/portal/reports/consolidated/{cid}/detailed")
        rows = [x for x in r.json().get("report", [])
                if x.get("location") == "BIN-X" and x.get("barcode") == "KNOWN"]
        assert len(rows) == 1, f"expected 1 merged row, got {len(rows)}: {rows}"
        row = rows[0]
        assert row["stock_qty"] == 10, f"stock={row['stock_qty']}"
        assert row["physical_qty"] == 15, f"physical={row['physical_qty']}"
        assert row["reco_qty"] == 100, f"reco={row['reco_qty']} (must be 100, NOT 200)"
        assert row["final_qty"] == 115, f"final={row['final_qty']}"
        assert row.get("is_edited"), "merged row must keep is_edited flag"
        print(f"  ✓ Warehouse Detailed merged: {row['stock_qty']}/{row['physical_qty']}/{row['reco_qty']}/{row['final_qty']}")

        # Barcode-wise: same totals, single row
        r = await h.get(BACKEND + f"/api/audit/portal/reports/consolidated/{cid}/barcode-wise")
        rows = [x for x in r.json().get("report", []) if x.get("barcode") == "KNOWN"]
        assert len(rows) == 1
        assert rows[0]["reco_qty"] == 100, f"barcode-wise reco={rows[0]['reco_qty']}"
        print(f"  ✓ Warehouse Barcode-wise reco={rows[0]['reco_qty']}")

    # Cleanup
    for col in ["audit_clients", "audit_sessions", "expected_stock", "synced_locations",
                 "master_products", "barcode_edits", "reco_adjustments"]:
        await db[col].delete_many({"$or": [{"id": cid}, {"id": sid}, {"client_id": cid},
                                            {"session_id": sid}]})
    print("OK — Warehouse collision-merge verified")


async def cycle_count_test():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

    # Use the in-process test of the merge helper directly (no live cycle
    # count session needed).
    from cycle_count_routes import (
        _apply_cc_barcode_edits_to_base, _merge_cc_base_collisions,
        _shape_report,
    )

    base_rows = [
        # Planned NBI039342 at CN-1-R1-B1
        {"location": "CN-1-R1-B1", "barcode": "NBI039342",
         "expected_qty": 10, "scanned_qty": 10, "effective_qty": 10,
         "variance_qty": 0, "classification": "match", "reason": "match",
         "description": "Item Y", "category": "CatY", "mrp": 50, "cost": 25,
         "article_code": "", "article_name": "",
         "pre_pick_qty": 0, "post_pick_qty": 0, "ending_stock": 10},
        # Extra-scan NBI029741 at CN-1-R1-B1 (auditor will edit it)
        {"location": "CN-1-R1-B1", "barcode": "NBI029741",
         "expected_qty": 0, "scanned_qty": 5, "effective_qty": 5,
         "variance_qty": 5, "classification": "extra", "reason": "surplus",
         "description": "", "category": "", "mrp": 0, "cost": 0,
         "article_code": "", "article_name": "",
         "pre_pick_qty": 0, "post_pick_qty": 0, "ending_stock": 5},
    ]
    edits = [{
        "id": "e1", "client_id": "x",
        "report_type": "detailed", "original_value": "NBI029741",
        "new_value": "NBI039342", "location": "CN-1-R1-B1",
        "master_info": {"description": "Item Y", "category": "CatY",
                         "mrp": 50, "cost": 25,
                         "article_code": "", "article_name": ""},
        "is_active": True,
    }]
    edited = _apply_cc_barcode_edits_to_base(base_rows, edits)
    assert "NBI039342" in edited
    base_rows = _merge_cc_base_collisions(base_rows)
    bin_x_rows = [r for r in base_rows
                   if r["location"] == "CN-1-R1-B1" and r["barcode"] == "NBI039342"]
    assert len(bin_x_rows) == 1, f"expected 1 merged row, got {len(bin_x_rows)}"
    m = bin_x_rows[0]
    assert m["expected_qty"] == 10, f"expected_qty={m['expected_qty']}"
    assert m["scanned_qty"] == 15, f"scanned_qty={m['scanned_qty']} (10 planned + 5 edited)"
    assert m["effective_qty"] == 15
    assert m["variance_qty"] == 5, f"variance={m['variance_qty']} (15-10=+5)"
    assert m["_is_edited"] is True
    assert m["_original_value"] == "NBI029741"
    print(f"  ✓ Cycle Count merge: stock={m['expected_qty']}, "
          f"physical={m['scanned_qty']}, variance=+{m['variance_qty']}, "
          f"_is_edited={m['_is_edited']}")

    # Detailed shape produces single row
    shaped = _shape_report("detailed", base_rows)
    detailed_rows = [r for r in shaped["report"]
                      if r["location"] == "CN-1-R1-B1" and r["barcode"] == "NBI039342"]
    assert len(detailed_rows) == 1, f"shaped detailed has {len(detailed_rows)} rows"
    print(f"  ✓ Cycle Count Detailed shape: 1 row only (no duplicate)")
    print("OK — Cycle Count collision-merge verified")


async def main():
    print("=== Warehouse ===")
    await warehouse_test()
    print("\n=== Cycle Count ===")
    await cycle_count_test()


if __name__ == "__main__":
    asyncio.run(main())
