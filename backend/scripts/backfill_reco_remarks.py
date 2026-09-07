#!/usr/bin/env python3
"""One-time backfill: put old reco remarks back onto the recos themselves.

Why this exists: the reason typed in the reco popup used to be written only to
`audit_logs`. No report reads that collection, so the note never reached the
variance sheet. Reco saves now store it on the reco as `reco_remark`, but recos
saved BEFORE that change have no such field and show a blank column.

Nothing was lost — the note is still in the movement log — so this copies it
back onto each reco, once.

Which log entry wins: a reco may have been edited several times, and the sheet
must explain the value it shows NOW. So the entry whose `new_value` equals the
reco's current `reco_qty` is preferred; only if none matches does the most
recent entry carrying a reason get used, and that case is reported separately
so you can see how many were approximate.

Safe to re-run: recos that already carry a remark are skipped, never
overwritten — a note an auditor typed after the fix always wins over an old
log entry.

Usage (dry run — reports what it would do, writes nothing):
    MONGO_URL=... DB_NAME=... python backend/scripts/backfill_reco_remarks.py

Actually write:
    MONGO_URL=... DB_NAME=... python backend/scripts/backfill_reco_remarks.py --confirm

On Railway the database is on the private network, so run it inside the
project (e.g. `railway run python backend/scripts/backfill_reco_remarks.py`)
or with a public TCP proxy URL.

AFTER RUNNING: reports serve reco through a 2-minute in-memory cache, and this
script writes straight to the database, so it cannot clear that cache. The
remarks will not appear until the cache expires — wait ~2 minutes, or redeploy
the service to see them immediately. The write itself is already done.
"""
import argparse
import asyncio
import os
import sys


def _log_key(doc):
    """How a movement-log entry identifies the reco it describes.

    save_reco_adjustment logs `barcode` as `adj.barcode or adj.article_code`
    and `report_type` as the reco_type, so an article reco's code arrives in
    the barcode field. Matching mirrors that exactly.
    """
    return (
        doc.get("client_id") or "",
        doc.get("report_type") or "",
        doc.get("location") or "",
        doc.get("barcode") or "",
    )


def _reco_key(adj):
    return (
        adj.get("client_id") or "",
        adj.get("reco_type") or "",
        adj.get("location") or "",
        (adj.get("barcode") or adj.get("article_code") or ""),
    )


def _as_float(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


async def main(confirm: bool) -> int:
    try:
        mongo_url = os.environ["MONGO_URL"]
        db_name = os.environ["DB_NAME"]
    except KeyError as missing:
        print(f"error: {missing} is not set", file=sys.stderr)
        return 2

    from motor.motor_asyncio import AsyncIOMotorClient

    client = AsyncIOMotorClient(mongo_url)
    try:
        db = client[db_name]

        # Every reco-change entry that carries a reason, newest last so the
        # later ones overwrite earlier ones in the "latest" map.
        by_key_qty = {}   # (key, qty) -> reason   — explains an exact value
        by_key = {}       # key        -> reason   — the most recent reason
        log_rows = 0
        async for doc in db.audit_logs.find(
            {"action_type": "reco_adjust"},
            {"_id": 0, "client_id": 1, "report_type": 1, "location": 1,
             "barcode": 1, "new_value": 1, "reason": 1, "timestamp": 1},
        ).sort("timestamp", 1):
            reason = (doc.get("reason") or "").strip()
            if not reason:
                continue
            log_rows += 1
            key = _log_key(doc)
            by_key[key] = reason
            qty = _as_float(doc.get("new_value"))
            if qty is not None:
                by_key_qty[(key, qty)] = reason

        total = await db.reco_adjustments.count_documents({})
        already = exact = approx = unmatched = 0
        writes = []

        async for adj in db.reco_adjustments.find({}, {"_id": 0}):
            if (adj.get("reco_remark") or "").strip():
                already += 1
                continue
            key = _reco_key(adj)
            qty = _as_float(adj.get("reco_qty"))
            reason = by_key_qty.get((key, qty)) if qty is not None else None
            if reason:
                exact += 1
            else:
                reason = by_key.get(key)
                if reason:
                    approx += 1
                else:
                    unmatched += 1
                    continue
            writes.append((adj, reason))

        print(f"reco_adjustments rows        : {total}")
        print(f"  already have a remark      : {already}  (left untouched)")
        print(f"  matched the exact reco qty : {exact}")
        print(f"  matched only the latest note: {approx}  (reco was edited; note may describe an earlier value)")
        print(f"  no note in the movement log: {unmatched}  (will stay blank)")
        print(f"movement-log entries with a reason: {log_rows}")
        print()

        if not writes:
            print("nothing to backfill.")
            return 0

        if not confirm:
            print(f"DRY RUN — would write {len(writes)} remarks. Re-run with --confirm to apply.")
            for adj, reason in writes[:5]:
                print(f"  e.g. {_reco_key(adj)} -> {reason[:60]!r}")
            return 0

        written = 0
        for adj, reason in writes:
            key = {"client_id": adj.get("client_id"), "reco_type": adj.get("reco_type")}
            for f in ("barcode", "location", "article_code"):
                if f in adj:
                    key[f] = adj.get(f)
            res = await db.reco_adjustments.update_one(key, {"$set": {"reco_remark": reason}})
            written += res.modified_count
        print(f"wrote {written} remarks.")
        print()
        print("Reports cache reco for ~2 minutes, so give it a couple of minutes")
        print("(or redeploy) before checking the variance sheet.")
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--confirm", action="store_true",
                    help="actually write the remarks (default is a dry run)")
    sys.exit(asyncio.run(main(ap.parse_args().confirm)))
