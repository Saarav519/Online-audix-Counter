"""
Cycle Count (rolling daily warehouse audit) routes for the AudiX portal.

Concept
=======
A *Cycle Count Project* spans many days. Each "day":
  • Morning stock upload (Excel/CSV) — that day's planned bins/qtys
  • Optional Pre-Audit picking upload — stock pulled BEFORE auditor counted
  • Optional Post-Audit picking upload — stock pulled AFTER auditor counted
  • Free-form scanning by the scanner app
  • Manual "Close Day" — freezes that day's variance and locks the bins

Variance math (the killer feature):
  expected      = morning_qty
  effective_cnt = scanned_qty + pre_audit_pick    → for variance
  ending_stock  = scanned_qty - post_audit_pick   → for shelf state
  variance      = effective_cnt - expected

Variance scope:
  Only bins that were actually scanned today appear in the day's variance.
  Unscanned-but-uploaded bins are silently ignored (next day's upload picks
  things up fresh).

Duplicate-bin detection:
  When viewing/closing a day, any bin that was already closed in an earlier
  day is flagged so the user can review/override.

Storage layout (collections):
  cycle_projects        {id, client_id, name, audit_session_id, status, created_at, completed_at, current_day}
  cycle_days            {id, project_id, day_no, date, status: open|closed, closed_at, stats}
  cycle_day_stock       {project_id, day_id, location, barcode, qty, ...}
  cycle_day_picks       {project_id, day_id, type: pre|post, location, barcode, qty}
  cycle_closed_bins     {project_id, day_id, day_no, location, closed_at} (for dup-detect)
"""

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv
import os
import io
import csv
import uuid
import logging

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
_client = AsyncIOMotorClient(mongo_url)
db = _client[os.environ['DB_NAME']]

cycle_router = APIRouter()
logger = logging.getLogger(__name__)


# ───────────── Models ─────────────
class CreateProject(BaseModel):
    client_id: str
    name: str


class CreateDay(BaseModel):
    project_id: str
    date: Optional[str] = None  # YYYY-MM-DD; defaults to today (UTC)


class CloseDayRequest(BaseModel):
    confirm: bool = True


# ───────────── Helpers ─────────────
def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_barcode(b: Any) -> str:
    if b is None:
        return ""
    s = str(b).strip()
    if s.endswith(".0"):
        s = s[:-2]
    return s


def _to_float(v: Any) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


async def _parse_upload_to_rows(file: UploadFile) -> List[Dict[str, Any]]:
    """Parse uploaded CSV or Excel into list[dict] with normalised lower-case keys.

    Smart column matching: handles `bin`/`location`/`bin_code`, `barcode`/`sku`,
    `qty`/`quantity`/`units`, etc.  Returns rows with canonical keys
    `location`, `barcode`, `qty`.
    """
    fname = (file.filename or "").lower()
    raw = await file.read()
    rows: List[Dict[str, Any]] = []

    if fname.endswith(('.xlsx', '.xls')):
        try:
            import openpyxl  # type: ignore
        except ImportError:
            raise HTTPException(500, "openpyxl not installed — pip install openpyxl")
        wb = openpyxl.load_workbook(io.BytesIO(raw), data_only=True, read_only=True)
        # Aggregate from every sheet
        for sheet in wb.worksheets:
            it = sheet.iter_rows(values_only=True)
            try:
                header = next(it)
            except StopIteration:
                continue
            if not header:
                continue
            cols = [str(c).strip().lower() if c is not None else "" for c in header]
            for r in it:
                row = {cols[i]: r[i] for i in range(min(len(cols), len(r))) if cols[i]}
                if any(v not in (None, "", 0) for v in row.values()):
                    rows.append(row)
    else:
        try:
            decoded = raw.decode('utf-8')
        except UnicodeDecodeError:
            decoded = raw.decode('latin-1')
        reader = csv.DictReader(io.StringIO(decoded))
        for r in reader:
            rows.append({(k or '').strip().lower(): v for k, v in r.items()})

    # Canonical key mapping
    LOC_KEYS = {"location", "bin", "bin_code", "loccode", "loc", "binname", "bin name", "location_code"}
    BC_KEYS = {"barcode", "sku", "item_code", "ean", "code", "barcode_no", "barcodeno"}
    QTY_KEYS = {"qty", "quantity", "units", "count", "scan_qty", "stock_qty", "qty_picked"}

    canon: List[Dict[str, Any]] = []
    for row in rows:
        loc = ""
        bc = ""
        qty = 0.0
        for k, v in row.items():
            kk = k.replace(" ", "").replace("_", "")
            if not loc and (k in LOC_KEYS or kk in LOC_KEYS or kk == "location"):
                loc = str(v).strip() if v is not None else ""
            if not bc and (k in BC_KEYS or kk in BC_KEYS or kk == "barcode"):
                bc = _normalize_barcode(v)
            if not qty and (k in QTY_KEYS or kk in QTY_KEYS or kk == "qty"):
                qty = _to_float(v)
        if bc and qty:
            canon.append({"location": loc, "barcode": bc, "qty": qty})
    return canon


async def _ensure_audit_session(project: Dict[str, Any]) -> str:
    """Create or return the audit_session that backs this cycle-count project so
    the existing scanner-sync infrastructure still works for free-form scans."""
    sid = project.get("audit_session_id")
    if sid:
        return sid
    sid = str(uuid.uuid4())
    await db.audit_sessions.insert_one({
        "id": sid,
        "client_id": project["client_id"],
        "name": project["name"],
        "variance_mode": "cycle-count",
        "status": "active",
        "start_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "created_at": _now_iso(),
        "is_cycle_count": True,
        "cycle_project_id": project["id"]
    })
    await db.cycle_projects.update_one(
        {"id": project["id"]},
        {"$set": {"audit_session_id": sid}}
    )
    return sid


async def _current_open_day(project_id: str) -> Optional[Dict[str, Any]]:
    return await db.cycle_days.find_one(
        {"project_id": project_id, "status": "open"}, {"_id": 0}
    )


async def _scanned_data_for_day(day: Dict[str, Any], session_id: str) -> Dict[str, Dict[str, float]]:
    """Return {location: {barcode: scanned_qty}} for scans synced on day.date."""
    out: Dict[str, Dict[str, float]] = {}
    date_str = day["date"]  # YYYY-MM-DD
    cur = db.synced_locations.find(
        {"session_id": session_id, "synced_at": {"$regex": f"^{date_str}"}},
        {"_id": 0, "location_name": 1, "items": 1}
    )
    async for s in cur:
        loc = s.get("location_name", "")
        bucket = out.setdefault(loc, {})
        for it in s.get("items", []):
            bc = _normalize_barcode(it.get("barcode"))
            if not bc:
                continue
            bucket[bc] = bucket.get(bc, 0) + _to_float(it.get("quantity"))
    return out


async def _compute_day_variance(project: Dict[str, Any], day: Dict[str, Any]) -> Dict[str, Any]:
    """Build the variance report for a given day with picking math applied."""
    project_id = project["id"]
    day_id = day["id"]
    session_id = await _ensure_audit_session(project)

    # Stock for the day
    stock_rows = await db.cycle_day_stock.find(
        {"project_id": project_id, "day_id": day_id}, {"_id": 0}
    ).to_list(200000)
    stock_map: Dict[str, Dict[str, float]] = {}
    for r in stock_rows:
        loc = r.get("location", "")
        bc = r.get("barcode", "")
        stock_map.setdefault(loc, {})[bc] = stock_map.get(loc, {}).get(bc, 0) + _to_float(r.get("qty"))

    # Pre + post picks for the day
    pre_map: Dict[str, Dict[str, float]] = {}
    post_map: Dict[str, Dict[str, float]] = {}
    pick_rows = await db.cycle_day_picks.find(
        {"project_id": project_id, "day_id": day_id}, {"_id": 0}
    ).to_list(200000)
    for p in pick_rows:
        loc = p.get("location", "")
        bc = p.get("barcode", "")
        target = pre_map if p.get("type") == "pre" else post_map
        target.setdefault(loc, {})[bc] = target.get(loc, {}).get(bc, 0) + _to_float(p.get("qty"))

    # Scans for the day
    scan_map = await _scanned_data_for_day(day, session_id)

    # Pre-fetch closed bins from earlier days for duplicate detection
    closed_bin_docs = await db.cycle_closed_bins.find(
        {"project_id": project_id, "day_id": {"$ne": day_id}}, {"_id": 0}
    ).to_list(50000)
    closed_lookup: Dict[str, List[Dict[str, Any]]] = {}
    for cb in closed_bin_docs:
        closed_lookup.setdefault(cb["location"], []).append(cb)

    # Build report — ONLY for bins actually scanned today
    report_rows: List[Dict[str, Any]] = []
    totals = {"expected": 0.0, "scanned": 0.0, "pre_pick": 0.0, "post_pick": 0.0,
              "effective": 0.0, "variance": 0.0, "ending": 0.0}

    for loc, scans in scan_map.items():
        loc_stock = stock_map.get(loc, {})
        loc_pre = pre_map.get(loc, {})
        loc_post = post_map.get(loc, {})
        all_bcs = set(scans.keys()) | set(loc_stock.keys()) | set(loc_pre.keys()) | set(loc_post.keys())
        # Only show barcodes scanned at this loc OR present in stock for it.
        # If neither, skip (e.g. picks-only with no scan and no stock — just data noise)
        for bc in sorted(all_bcs):
            scanned = scans.get(bc, 0)
            if scanned == 0 and bc not in loc_stock:
                continue
            expected = loc_stock.get(bc, 0)
            pre_pick = loc_pre.get(bc, 0)
            post_pick = loc_post.get(bc, 0)
            effective = scanned + pre_pick
            variance = effective - expected
            ending = scanned - post_pick

            classification = "planned" if bc in loc_stock else "extra"

            duplicate_warning = None
            for cb in closed_lookup.get(loc, []):
                duplicate_warning = {
                    "closed_on_day": cb.get("day_no"),
                    "closed_at": cb.get("closed_at"),
                    "closed_day_id": cb.get("day_id")
                }
                break

            reason = "match"
            if variance > 0:
                reason = "surplus"
            elif variance < 0:
                reason = "shortage"
            if pre_pick or post_pick:
                if variance == 0:
                    reason = "reconciled_via_picks"

            report_rows.append({
                "location": loc, "barcode": bc,
                "expected_qty": expected, "scanned_qty": scanned,
                "pre_pick_qty": pre_pick, "post_pick_qty": post_pick,
                "effective_qty": effective, "variance_qty": variance,
                "ending_stock": ending, "classification": classification,
                "reason": reason, "duplicate_warning": duplicate_warning,
            })
            totals["expected"] += expected
            totals["scanned"] += scanned
            totals["pre_pick"] += pre_pick
            totals["post_pick"] += post_pick
            totals["effective"] += effective
            totals["variance"] += variance
            totals["ending"] += ending

    # Counts for dashboard cards
    scanned_bins = set(scan_map.keys())
    planned_bins = set(stock_map.keys())
    bins_summary = {
        "stock_uploaded_bins": len(planned_bins),
        "scanned_bins": len(scanned_bins),
        "planned_scanned": len(scanned_bins & planned_bins),
        "extras_scanned": len(scanned_bins - planned_bins),
        "duplicate_bins": sum(1 for loc in scanned_bins if loc in closed_lookup),
    }

    return {
        "project_id": project_id, "day_id": day_id, "day_no": day.get("day_no"),
        "date": day.get("date"), "status": day.get("status"),
        "report": report_rows, "totals": totals, "bins_summary": bins_summary
    }


# ───────────── Endpoints ─────────────
@cycle_router.post("/projects")
async def create_project(req: CreateProject):
    pid = str(uuid.uuid4())
    project = {
        "id": pid, "client_id": req.client_id, "name": req.name,
        "status": "active", "current_day": 0,
        "audit_session_id": None, "created_at": _now_iso(),
    }
    await db.cycle_projects.insert_one(project)
    project.pop("_id", None)
    await _ensure_audit_session(project)
    return project


@cycle_router.get("/projects")
async def list_projects(client_id: Optional[str] = None):
    q = {"client_id": client_id} if client_id else {}
    items = await db.cycle_projects.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    # Decorate with day count + scanned bins
    for p in items:
        days_count = await db.cycle_days.count_documents({"project_id": p["id"]})
        closed_count = await db.cycle_days.count_documents({"project_id": p["id"], "status": "closed"})
        scanned_bins = await db.cycle_closed_bins.distinct("location", {"project_id": p["id"]})
        p["days_count"] = days_count
        p["closed_days_count"] = closed_count
        p["total_unique_bins_counted"] = len(scanned_bins)
    return {"projects": items, "count": len(items)}


@cycle_router.get("/projects/{pid}")
async def get_project(pid: str):
    p = await db.cycle_projects.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Project not found")
    days = await db.cycle_days.find({"project_id": pid}, {"_id": 0}).sort("day_no", 1).to_list(1000)
    return {"project": p, "days": days}


@cycle_router.delete("/projects/{pid}")
async def delete_project(pid: str):
    p = await db.cycle_projects.find_one({"id": pid})
    if not p:
        raise HTTPException(404, "Project not found")
    deleted: Dict[str, int] = {}
    deleted["cycle_day_stock"] = (await db.cycle_day_stock.delete_many({"project_id": pid})).deleted_count
    deleted["cycle_day_picks"] = (await db.cycle_day_picks.delete_many({"project_id": pid})).deleted_count
    deleted["cycle_closed_bins"] = (await db.cycle_closed_bins.delete_many({"project_id": pid})).deleted_count
    deleted["cycle_days"] = (await db.cycle_days.delete_many({"project_id": pid})).deleted_count
    sid = p.get("audit_session_id")
    if sid:
        deleted["synced_locations"] = (await db.synced_locations.delete_many({"session_id": sid})).deleted_count
        deleted["sync_inbox"] = (await db.sync_inbox.delete_many({"session_id": sid})).deleted_count
        deleted["sync_raw_logs"] = (await db.sync_raw_logs.delete_many({"session_id": sid})).deleted_count
        deleted["forward_batches"] = (await db.forward_batches.delete_many({"session_id": sid})).deleted_count
        deleted["audit_sessions"] = (await db.audit_sessions.delete_many({"id": sid})).deleted_count
    deleted["cycle_projects"] = (await db.cycle_projects.delete_many({"id": pid})).deleted_count
    return {"message": "Project and all data permanently deleted", "deleted": deleted}


@cycle_router.post("/projects/{pid}/complete")
async def complete_project(pid: str):
    res = await db.cycle_projects.update_one(
        {"id": pid}, {"$set": {"status": "completed", "completed_at": _now_iso()}}
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Project not found")
    return {"message": "Project marked complete"}


@cycle_router.post("/projects/{pid}/reopen")
async def reopen_project(pid: str):
    await db.cycle_projects.update_one(
        {"id": pid}, {"$set": {"status": "active"}, "$unset": {"completed_at": ""}}
    )
    return {"message": "Project reopened"}


@cycle_router.post("/days")
async def create_day(req: CreateDay):
    project = await db.cycle_projects.find_one({"id": req.project_id}, {"_id": 0})
    if not project:
        raise HTTPException(404, "Project not found")

    # Block creating a new day if one is already open
    open_day = await _current_open_day(req.project_id)
    if open_day:
        raise HTTPException(400, f"Day {open_day['day_no']} is still open — close it first")

    last = await db.cycle_days.find({"project_id": req.project_id}).sort("day_no", -1).limit(1).to_list(1)
    day_no = (last[0]["day_no"] + 1) if last else 1
    date_str = req.date or datetime.now(timezone.utc).strftime("%Y-%m-%d")

    did = str(uuid.uuid4())
    day = {
        "id": did, "project_id": req.project_id, "day_no": day_no, "date": date_str,
        "status": "open", "created_at": _now_iso(),
        "stats": {"stock_rows": 0, "pre_pick_rows": 0, "post_pick_rows": 0}
    }
    await db.cycle_days.insert_one(day)
    await db.cycle_projects.update_one({"id": req.project_id}, {"$set": {"current_day": day_no}})
    day.pop("_id", None)
    return day


@cycle_router.post("/days/{day_id}/upload-stock")
async def upload_stock(day_id: str, file: UploadFile = File(...), mode: str = Form("replace")):
    """Upload morning stock for the day. mode=replace (default) wipes prior stock for this day; mode=append adds on top."""
    day = await db.cycle_days.find_one({"id": day_id}, {"_id": 0})
    if not day:
        raise HTTPException(404, "Day not found")
    if day["status"] != "open":
        raise HTTPException(400, "Day is closed — re-open it before uploading new stock")

    rows = await _parse_upload_to_rows(file)
    if not rows:
        raise HTTPException(400, "No valid rows found in upload (need columns: location, barcode, qty)")

    if mode == "replace":
        await db.cycle_day_stock.delete_many({"project_id": day["project_id"], "day_id": day_id})

    docs = [{
        "project_id": day["project_id"], "day_id": day_id, "day_no": day["day_no"],
        "location": r["location"], "barcode": r["barcode"], "qty": r["qty"],
        "uploaded_at": _now_iso()
    } for r in rows]
    if docs:
        await db.cycle_day_stock.insert_many(docs)

    await db.cycle_days.update_one(
        {"id": day_id},
        {"$set": {"stats.stock_rows": len(rows), "stock_uploaded_at": _now_iso(),
                  "stock_filename": file.filename}}
    )
    unique_bins = len({r["location"] for r in rows})
    return {"message": "Stock uploaded", "rows": len(rows), "unique_bins": unique_bins, "filename": file.filename}


@cycle_router.post("/days/{day_id}/upload-picks")
async def upload_picks(day_id: str, file: UploadFile = File(...), pick_type: str = Form(...)):
    """Upload pre-audit OR post-audit picking. pick_type ∈ {pre, post}. mode is always replace for that type."""
    if pick_type not in ("pre", "post"):
        raise HTTPException(400, "pick_type must be 'pre' or 'post'")
    day = await db.cycle_days.find_one({"id": day_id}, {"_id": 0})
    if not day:
        raise HTTPException(404, "Day not found")
    if day["status"] != "open":
        raise HTTPException(400, "Day is closed — re-open before uploading picks")

    rows = await _parse_upload_to_rows(file)
    if not rows:
        raise HTTPException(400, "No valid rows in picking file (need: location, barcode, qty)")

    await db.cycle_day_picks.delete_many({
        "project_id": day["project_id"], "day_id": day_id, "type": pick_type
    })
    docs = [{
        "project_id": day["project_id"], "day_id": day_id, "day_no": day["day_no"],
        "type": pick_type,
        "location": r["location"], "barcode": r["barcode"], "qty": r["qty"],
        "uploaded_at": _now_iso(),
    } for r in rows]
    if docs:
        await db.cycle_day_picks.insert_many(docs)

    stat_key = "pre_pick_rows" if pick_type == "pre" else "post_pick_rows"
    await db.cycle_days.update_one(
        {"id": day_id},
        {"$set": {f"stats.{stat_key}": len(rows),
                  f"{pick_type}_pick_uploaded_at": _now_iso(),
                  f"{pick_type}_pick_filename": file.filename}}
    )
    return {"message": f"{pick_type}-audit picks uploaded", "rows": len(rows), "filename": file.filename}


@cycle_router.delete("/days/{day_id}/stock")
async def clear_stock(day_id: str):
    day = await db.cycle_days.find_one({"id": day_id})
    if not day:
        raise HTTPException(404, "Day not found")
    if day["status"] != "open":
        raise HTTPException(400, "Day is closed")
    r = await db.cycle_day_stock.delete_many({"day_id": day_id})
    await db.cycle_days.update_one({"id": day_id}, {"$set": {"stats.stock_rows": 0},
                                                     "$unset": {"stock_uploaded_at": "", "stock_filename": ""}})
    return {"message": "Day stock cleared", "removed": r.deleted_count}


@cycle_router.delete("/days/{day_id}/picks/{pick_type}")
async def clear_picks(day_id: str, pick_type: str):
    if pick_type not in ("pre", "post"):
        raise HTTPException(400, "pick_type must be 'pre' or 'post'")
    day = await db.cycle_days.find_one({"id": day_id})
    if not day:
        raise HTTPException(404, "Day not found")
    if day["status"] != "open":
        raise HTTPException(400, "Day is closed")
    r = await db.cycle_day_picks.delete_many({"day_id": day_id, "type": pick_type})
    stat_key = "pre_pick_rows" if pick_type == "pre" else "post_pick_rows"
    await db.cycle_days.update_one(
        {"id": day_id},
        {"$set": {f"stats.{stat_key}": 0},
         "$unset": {f"{pick_type}_pick_uploaded_at": "", f"{pick_type}_pick_filename": ""}}
    )
    return {"message": f"{pick_type}-pick data cleared", "removed": r.deleted_count}


@cycle_router.get("/days/{day_id}/variance")
async def day_variance(day_id: str):
    day = await db.cycle_days.find_one({"id": day_id}, {"_id": 0})
    if not day:
        raise HTTPException(404, "Day not found")
    project = await db.cycle_projects.find_one({"id": day["project_id"]}, {"_id": 0})
    if not project:
        raise HTTPException(404, "Project not found")
    return await _compute_day_variance(project, day)


@cycle_router.post("/days/{day_id}/close")
async def close_day(day_id: str, _: CloseDayRequest):
    day = await db.cycle_days.find_one({"id": day_id}, {"_id": 0})
    if not day:
        raise HTTPException(404, "Day not found")
    if day["status"] == "closed":
        raise HTTPException(400, "Day already closed")
    project = await db.cycle_projects.find_one({"id": day["project_id"]}, {"_id": 0})
    if not project:
        raise HTTPException(404, "Project not found")

    # Compute final variance and freeze it
    variance = await _compute_day_variance(project, day)
    closed_at = _now_iso()

    # Collect every bin that was scanned today; mark them as closed-in-this-day.
    scanned_bins = {row["location"] for row in variance["report"]}
    if scanned_bins:
        # Remove any prior duplicate registrations for these bins under this same day,
        # then insert fresh closed-in-day entries.
        await db.cycle_closed_bins.delete_many({
            "project_id": project["id"], "day_id": day_id,
            "location": {"$in": list(scanned_bins)}
        })
        await db.cycle_closed_bins.insert_many([{
            "id": str(uuid.uuid4()),
            "project_id": project["id"], "day_id": day_id, "day_no": day["day_no"],
            "location": loc, "closed_at": closed_at
        } for loc in scanned_bins])

    # Save the frozen report against the day
    await db.cycle_days.update_one(
        {"id": day_id},
        {"$set": {
            "status": "closed", "closed_at": closed_at,
            "frozen_report": variance,
            "stats.scanned_bins": len(scanned_bins),
            "stats.total_variance": variance["totals"]["variance"],
            "stats.duplicate_bins": variance["bins_summary"]["duplicate_bins"],
        }}
    )
    return {"message": f"Day {day['day_no']} closed", "scanned_bins": len(scanned_bins),
            "variance": variance["totals"], "duplicate_bins": variance["bins_summary"]["duplicate_bins"]}


@cycle_router.post("/days/{day_id}/reopen")
async def reopen_day(day_id: str):
    day = await db.cycle_days.find_one({"id": day_id})
    if not day:
        raise HTTPException(404, "Day not found")
    await db.cycle_closed_bins.delete_many({"day_id": day_id})
    await db.cycle_days.update_one(
        {"id": day_id},
        {"$set": {"status": "open"}, "$unset": {"closed_at": "", "frozen_report": ""}}
    )
    return {"message": f"Day {day['day_no']} reopened"}


@cycle_router.delete("/days/{day_id}")
async def delete_day(day_id: str):
    day = await db.cycle_days.find_one({"id": day_id})
    if not day:
        raise HTTPException(404, "Day not found")
    deleted: Dict[str, int] = {}
    deleted["cycle_day_stock"] = (await db.cycle_day_stock.delete_many({"day_id": day_id})).deleted_count
    deleted["cycle_day_picks"] = (await db.cycle_day_picks.delete_many({"day_id": day_id})).deleted_count
    deleted["cycle_closed_bins"] = (await db.cycle_closed_bins.delete_many({"day_id": day_id})).deleted_count
    deleted["cycle_days"] = (await db.cycle_days.delete_many({"id": day_id})).deleted_count
    return {"message": "Day deleted", "deleted": deleted}


@cycle_router.get("/projects/{pid}/consolidated")
async def consolidated_report(pid: str):
    """Live consolidated view across every day (open + closed). Re-aggregated on
    every request so any edit to underlying data flows through automatically."""
    project = await db.cycle_projects.find_one({"id": pid}, {"_id": 0})
    if not project:
        raise HTTPException(404, "Project not found")
    days = await db.cycle_days.find({"project_id": pid}, {"_id": 0}).sort("day_no", 1).to_list(1000)

    # Aggregate totals
    grand = {"expected": 0.0, "scanned": 0.0, "pre_pick": 0.0, "post_pick": 0.0,
             "effective": 0.0, "variance": 0.0, "ending": 0.0}
    bin_aggregate: Dict[str, Dict[str, Any]] = {}     # (location, barcode) → row aggregate
    day_summaries: List[Dict[str, Any]] = []
    extras_total = 0
    duplicates_total = 0
    all_scanned_bins: set = set()
    extras_scanned_bins: set = set()

    for d in days:
        v = await _compute_day_variance(project, d)
        for k in grand:
            grand[k] += v["totals"][k]
        extras_total += v["bins_summary"]["extras_scanned"]
        duplicates_total += v["bins_summary"]["duplicate_bins"]
        all_scanned_bins.update({r["location"] for r in v["report"]})
        extras_scanned_bins.update({r["location"] for r in v["report"] if r["classification"] == "extra"})
        day_summaries.append({
            "day_id": d["id"], "day_no": d["day_no"], "date": d["date"], "status": d["status"],
            "scanned_bins": v["bins_summary"]["scanned_bins"],
            "stock_uploaded_bins": v["bins_summary"]["stock_uploaded_bins"],
            "extras_scanned": v["bins_summary"]["extras_scanned"],
            "duplicate_bins": v["bins_summary"]["duplicate_bins"],
            "totals": v["totals"]
        })
        # Bin-wise rollup (keep the latest day's row per bin+barcode)
        for r in v["report"]:
            key = f"{r['location']}|{r['barcode']}"
            existing = bin_aggregate.get(key)
            row = {**r, "day_no": d["day_no"], "day_date": d["date"]}
            if existing:
                # If same bin counted twice across days → mark as recount and keep latest
                row["is_recount"] = True
                row["previous_day_no"] = existing.get("day_no")
            bin_aggregate[key] = row

    return {
        "project": project,
        "days": day_summaries,
        "totals": grand,
        "bins_summary": {
            "total_unique_bins_scanned": len(all_scanned_bins),
            "extras_bins": len(extras_scanned_bins),
            "duplicate_bin_events": duplicates_total,
        },
        "report": list(bin_aggregate.values())
    }


@cycle_router.get("/projects/{pid}/check-bin/{location}")
async def check_bin_status(pid: str, location: str):
    """Quick lookup — used by the variance UI / scanner to flag re-scans of bins
    that were already closed in earlier days."""
    closed = await db.cycle_closed_bins.find(
        {"project_id": pid, "location": location}, {"_id": 0}
    ).to_list(50)
    return {"location": location, "closed_in_days": closed, "is_duplicate": len(closed) > 0}
