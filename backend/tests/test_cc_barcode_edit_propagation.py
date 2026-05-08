"""
Verifies the Cycle Count barcode-edit + reco-propagation fix:

  1.  Edit an extra-scanned barcode in a Day-wise context.
  2.  Confirm the new barcode appears in barcode-wise + category-summary
      reports for that day, and the row is moved into the new category.
  3.  Save a Reco adjustment and confirm Reco Qty rolls up into
      category-summary (previously it was hard-coded to 0).
"""
import asyncio
import os
import uuid
from datetime import datetime, timezone

import pytest
from motor.motor_asyncio import AsyncIOMotorClient

from cycle_count_routes import (  # noqa: E402
    _apply_cc_barcode_edits_to_base,
    _apply_cc_reco,
    _mark_edits_on_shaped,
    _shape_report,
)

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


@pytest.mark.asyncio
async def test_barcode_edit_propagates_through_shape_and_reco():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    client_id = f"test-cc-{uuid.uuid4().hex[:8]}"

    # Seed an active barcode edit: NBI034731 → NBI048434, new category "Beverages"
    edit_id = str(uuid.uuid4())
    await db.barcode_edits.insert_one({
        "id": edit_id,
        "client_id": client_id,
        "report_type": "detailed",
        "original_value": "NBI034731",
        "new_value": "NBI048434",
        "location": "LOC-A",
        "master_info": {
            "description": "Mango Juice 1L",
            "category": "Beverages",
            "article_code": "ART-MJ",
            "article_name": "Mango Juice",
            "mrp": 120.0,
            "cost": 80.0,
        },
        "edited_at": datetime.now(timezone.utc).isoformat(),
        "is_active": True,
    })
    # Seed a reco adjustment by barcode for the new value
    await db.reco_adjustments.insert_one({
        "client_id": client_id,
        "reco_type": "barcode",
        "barcode": "NBI048434",
        "reco_qty": 100,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })

    # Synthesised base rows mirroring what `_compute_day_variance` produces
    base_rows = [
        {  # extra-scanned: stock 0, scanned 5 — eligible for edit
            "location": "LOC-A", "barcode": "NBI034731",
            "expected_qty": 0, "scanned_qty": 5, "effective_qty": 5,
            "variance_qty": 5, "classification": "extra", "reason": "surplus",
            "description": "Old desc", "category": "Snacks",
            "mrp": 0, "cost": 0, "article_code": "", "article_name": "",
            "pre_pick_qty": 0, "post_pick_qty": 0, "ending_stock": 5,
        },
        {  # planned, untouched
            "location": "LOC-A", "barcode": "OTHER",
            "expected_qty": 10, "scanned_qty": 10, "effective_qty": 10,
            "variance_qty": 0, "classification": "planned", "reason": "match",
            "description": "Other", "category": "Misc",
            "mrp": 50, "cost": 30, "article_code": "", "article_name": "",
            "pre_pick_qty": 0, "post_pick_qty": 0, "ending_stock": 10,
        },
    ]

    edits = await db.barcode_edits.find(
        {"client_id": client_id, "report_type": {"$in": ["detailed", "barcode-wise"]}, "is_active": True},
        {"_id": 0},
    ).to_list(50)
    edited_new = _apply_cc_barcode_edits_to_base(base_rows, edits)
    assert "NBI048434" in edited_new
    # Base row mutated
    edited_row = next(r for r in base_rows if r["barcode"] == "NBI048434")
    assert edited_row["category"] == "Beverages"
    assert edited_row["mrp"] == 120.0

    # ---- Detailed: edited row carries is_edited + remark ----
    shaped_d = _shape_report("detailed", base_rows)
    _mark_edits_on_shaped(shaped_d, "detailed", base_rows, edited_new)
    d_row = next(r for r in shaped_d["report"] if r["barcode"] == "NBI048434")
    assert d_row.get("is_edited") is True
    assert d_row.get("_original_value") == "NBI034731"
    assert "Barcode Edited" in d_row.get("remark", "")

    # ---- Barcode-wise: edited barcode bucketed under NEW value ----
    shaped_bw = _shape_report("barcode-wise", base_rows)
    bw_row = next((r for r in shaped_bw["report"] if r["barcode"] == "NBI048434"), None)
    assert bw_row is not None, "edited barcode must surface in barcode-wise"
    assert bw_row["category"] == "Beverages"
    # Reco roll-up
    shaped_bw["report"], shaped_bw["totals"] = await _apply_cc_reco(
        shaped_bw["report"], shaped_bw["totals"], client_id, "barcode-wise", base_rows=base_rows
    )
    bw_row = next(r for r in shaped_bw["report"] if r["barcode"] == "NBI048434")
    assert bw_row["reco_qty"] == 100

    # ---- Category-summary: edited row moves into NEW category bucket ----
    shaped_cs = _shape_report("category-summary", base_rows)
    cats = {r["category"] for r in shaped_cs["report"]}
    assert "Beverages" in cats, "new category must appear after edit"
    assert "Snacks" not in cats, "old category must be gone (only edited extra row was in Snacks)"
    # Reco roll-up by category
    shaped_cs["report"], shaped_cs["totals"] = await _apply_cc_reco(
        shaped_cs["report"], shaped_cs["totals"], client_id, "category-summary", base_rows=base_rows
    )
    bev = next(r for r in shaped_cs["report"] if r["category"] == "Beverages")
    assert bev["reco_qty"] == 100, "Reco Qty must roll up into category-summary"
    assert bev["final_qty"] == bev["physical_qty"] + 100

    # Cleanup
    await db.barcode_edits.delete_many({"client_id": client_id})
    await db.reco_adjustments.delete_many({"client_id": client_id})
    client.close()


if __name__ == "__main__":
    asyncio.run(test_barcode_edit_propagates_through_shape_and_reco())
    print("OK — barcode edit propagation + reco rollup verified")
