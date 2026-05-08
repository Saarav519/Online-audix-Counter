"""Step-by-step undo (Option A) — preserve pre-existing Reco when reverting an edit.

User scenario:
  1. Reco Qty = 100 saved on barcode B at LOC1 (B is its own valid barcode).
  2. User edits A → B at LOC1 (barcode A merged into B).
  3. User clicks Undo on the edit.

Expected after undo:
  • Edit is deactivated.
  • The pre-existing Reco=100 on B at LOC1 SURVIVES.
  • Any Reco anchored to original A during the edit's lifetime is purged.

We run the same scenario for client_type='warehouse', 'store', 'cycle_count'
to prove the single shared `_purge_recos_for_edit` helper fixes all three
modules consistently.
"""
import asyncio, sys, os, uuid, time
sys.path.insert(0, '/app/backend')
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "audix_db")

from audit_routes import (
    db, edit_barcode, undo_barcode_edit,
    save_reco_adjustment, RecoAdjustmentCreate,
)


async def run(client_type: str):
    client_id = f"TEST_UNDO_OPT_A_{client_type.upper()}"
    session_id = str(uuid.uuid4())
    A = "BC_A"; B = "BC_B"; LOC1 = "LOC-1"

    # Cleanup
    for col in ["clients", "audit_sessions", "expected_stock", "synced_locations",
                "master_products", "barcode_edits", "reco_adjustments"]:
        await db[col].delete_many({"client_id": client_id})
    await db.audit_sessions.delete_many({"id": session_id})
    await db.synced_locations.delete_many({"session_id": session_id})

    # Fixture
    await db.clients.insert_one({"id": client_id, "code": client_id, "name": "T",
                                  "is_active": True, "client_type": client_type})
    await db.audit_sessions.insert_one({"id": session_id, "client_id": client_id,
                                         "name": "S1", "status": "active",
                                         "variance_mode": "barcode-wise"})
    await db.master_products.insert_many([
        {"client_id": client_id, "barcode": A, "description": "A", "category": "C",
         "mrp": 100, "cost": 50, "article_code": "ART-A"},
        {"client_id": client_id, "barcode": B, "description": "B", "category": "C",
         "mrp": 100, "cost": 50, "article_code": "ART-B"},
    ])

    # ─── Step 1: Save Reco=100 on B (pre-existing, no edit yet) ───────────
    await save_reco_adjustment(RecoAdjustmentCreate(
        client_id=client_id, reco_type="detailed",
        location=LOC1, barcode=B, reco_qty=100,
    ))
    pre_edit_reco = await db.reco_adjustments.find_one(
        {"client_id": client_id, "location": LOC1, "barcode": B}, {"_id": 0})
    pre_edit_ts = pre_edit_reco["updated_at"]
    print(f"[{client_type}] t1 Pre-edit Reco saved: {B}@{LOC1} qty=100 ts={pre_edit_ts}")

    # Sleep so the edit's edited_at is strictly LATER than the pre-edit reco's updated_at
    time.sleep(0.05)

    # ─── Step 2: Edit A → B at LOC1 ───────────────────────────────────────
    edit_resp = await edit_barcode({
        "client_id": client_id, "report_type": "detailed",
        "original_value": A, "new_value": B, "location": LOC1,
    })
    edit_id = edit_resp["edit_id"]
    edit_doc = await db.barcode_edits.find_one({"id": edit_id}, {"_id": 0})
    print(f"[{client_type}] t2 Edit created: id={edit_id} edited_at={edit_doc.get('edited_at')}")

    time.sleep(0.05)
    # Optional: also save a Reco anchored to ORIGINAL A during the edit's
    # active life — this MUST be purged on undo (it belongs to the edit).
    await save_reco_adjustment(RecoAdjustmentCreate(
        client_id=client_id, reco_type="detailed",
        location=LOC1, barcode=A, reco_qty=50,
    ))
    print(f"[{client_type}] t3 During-edit Reco saved on ORIG A@{LOC1} qty=50")

    # ─── Step 3: Undo the edit ────────────────────────────────────────────
    undo_resp = await undo_barcode_edit({"edit_id": edit_id})
    print(f"[{client_type}] t4 Undo response: {undo_resp}")

    # ─── Verify ───────────────────────────────────────────────────────────
    surviving = await db.reco_adjustments.find(
        {"client_id": client_id}, {"_id": 0}).to_list(100)
    print(f"[{client_type}] t5 Surviving recos: {len(surviving)}")
    for r in surviving:
        print(f"    type={r['reco_type']} loc={r.get('location'):>6} bc={r.get('barcode'):>5} qty={r['reco_qty']} ts={r['updated_at']}")

    # Assertions
    pre_existing = [r for r in surviving if r["barcode"] == B and r["location"] == LOC1]
    during_edit = [r for r in surviving if r["barcode"] == A and r["location"] == LOC1]
    assert len(pre_existing) == 1 and pre_existing[0]["reco_qty"] == 100, \
        f"[{client_type}] BUG: pre-existing Reco=100 on B was purged on undo (Option A failed)"
    assert len(during_edit) == 0, \
        f"[{client_type}] BUG: during-edit Reco on A should have been purged"

    # Edit should be inactive
    edit_after = await db.barcode_edits.find_one({"id": edit_id}, {"_id": 0})
    assert edit_after["is_active"] is False, f"[{client_type}] Edit not deactivated"

    print(f"[{client_type}] ✅ PASS — Step-by-step undo preserved pre-existing Reco=100, removed during-edit Reco on A")

    # Cleanup
    for col in ["clients", "audit_sessions", "expected_stock", "synced_locations",
                "master_products", "barcode_edits", "reco_adjustments"]:
        await db[col].delete_many({"client_id": client_id})
    await db.audit_sessions.delete_many({"id": session_id})


async def main():
    for ct in ("warehouse", "store", "cycle_count"):
        await run(ct)
        print()


if __name__ == "__main__":
    asyncio.run(main())
