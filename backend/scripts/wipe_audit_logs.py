#!/usr/bin/env python3
"""One-time cleanup: wipe the movement log (`audit_logs`).

Why this exists: until the cascade fix, nothing ever deleted `audit_logs`, so
every entry ever written is still in the database — including entries for
clients and sessions that were deleted long ago. Client/session deletes now
purge their own log entries, but rows orphaned *before* that fix stay until
they are removed once, by hand. This script is that one-off.

DESTRUCTIVE AND IRREVERSIBLE. The movement log is an audit trail: this removes
it for every client, live ones included, not just the deleted ones.

Usage (dry run — counts only, deletes nothing):
    MONGO_URL=... DB_NAME=... python backend/scripts/wipe_audit_logs.py

Actually delete:
    MONGO_URL=... DB_NAME=... python backend/scripts/wipe_audit_logs.py --confirm

On Railway the database is on the private network, so run it inside the
project (e.g. `railway run python backend/scripts/wipe_audit_logs.py`) or with
a public TCP proxy URL.
"""
import argparse
import asyncio
import os
import sys


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
        total = await db.audit_logs.count_documents({})

        # How many are orphans, for context — a client_id no longer in `clients`.
        live_client_ids = set()
        async for c in db.clients.find({}, {"_id": 0, "id": 1}):
            cid = c.get("id")
            if cid:
                live_client_ids.add(cid)
        orphans = 0
        async for cid in db.audit_logs.aggregate([
            {"$group": {"_id": "$client_id", "n": {"$sum": 1}}}
        ]):
            if (cid.get("_id") or "") not in live_client_ids:
                orphans += cid.get("n", 0)

        print(f"database        : {db_name}")
        print(f"audit_logs rows : {total}")
        print(f"  of which orphaned (client no longer exists): {orphans}")
        print(f"  belonging to live clients                  : {total - orphans}")

        if not confirm:
            print("\nDry run — nothing deleted. Re-run with --confirm to wipe ALL rows above.")
            return 0

        deleted = (await db.audit_logs.delete_many({})).deleted_count
        print(f"\nDeleted {deleted} audit_logs rows. The movement log is now empty.")
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--confirm", action="store_true",
                    help="actually delete every audit_logs row (irreversible)")
    sys.exit(asyncio.run(main(ap.parse_args().confirm)))
