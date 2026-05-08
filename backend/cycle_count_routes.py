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
  Day-level variance includes every bin that has uploaded stock, picks, or
  scans (mirrors warehouse consolidated semantics so an unscanned bin with
  uploaded stock still surfaces as "Pending — not yet counted").
  Project consolidated rolls up across all days (open + closed).

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
    DESC_KEYS = {"description", "desc", "product_name", "productname", "name", "item_name", "itemname"}
    CAT_KEYS = {"category", "cat", "category_name", "categoryname"}
    MRP_KEYS = {"mrp", "price", "selling_price", "sellingprice"}
    COST_KEYS = {"cost", "cost_price", "costprice", "purchase_price"}
    ACODE_KEYS = {"article_code", "articlecode", "article", "art_code", "artcode"}
    ANAME_KEYS = {"article_name", "articlename"}

    def _match(k_norm, keys_set):
        return k_norm in keys_set

    canon: List[Dict[str, Any]] = []
    for row in rows:
        loc = ""; bc = ""; qty = 0.0
        desc = ""; cat = ""; mrp = 0.0; cost = 0.0; acode = ""; aname = ""
        for k, v in row.items():
            kk = k.replace(" ", "").replace("_", "")
            if not loc and (k in LOC_KEYS or _match(kk, LOC_KEYS)):
                loc = str(v).strip() if v is not None else ""
            elif not bc and (k in BC_KEYS or _match(kk, BC_KEYS)):
                bc = _normalize_barcode(v)
            elif not qty and (k in QTY_KEYS or _match(kk, QTY_KEYS)):
                qty = _to_float(v)
            elif not desc and (k in DESC_KEYS or _match(kk, DESC_KEYS)):
                desc = str(v).strip() if v is not None else ""
            elif not cat and (k in CAT_KEYS or _match(kk, CAT_KEYS)):
                cat = str(v).strip() if v is not None else ""
            elif not mrp and (k in MRP_KEYS or _match(kk, MRP_KEYS)):
                mrp = _to_float(v)
            elif not cost and (k in COST_KEYS or _match(kk, COST_KEYS)):
                cost = _to_float(v)
            elif not acode and (k in ACODE_KEYS or _match(kk, ACODE_KEYS)):
                acode = str(v).strip() if v is not None else ""
            elif not aname and (k in ANAME_KEYS or _match(kk, ANAME_KEYS)):
                aname = str(v).strip() if v is not None else ""
        if bc and qty:
            canon.append({
                "location": loc, "barcode": bc, "qty": qty,
                "description": desc, "category": cat, "mrp": mrp, "cost": cost,
                "article_code": acode, "article_name": aname,
            })
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
    """Build the variance report for a given day with picking math applied.

    Mirrors the warehouse consolidated semantics: every bin that has *any* of
    {uploaded stock, pre/post pick, scan} for the day appears in the report.
    Unscanned-but-stocked bins surface as ``classification: planned`` with
    ``scanned_qty = 0`` (so the Reports UI can flag them as "Pending").
    """
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

    # Build report for bins that have stock, picks, OR scans (warehouse-consolidated parity)
    report_rows: List[Dict[str, Any]] = []
    totals = {"expected": 0.0, "scanned": 0.0, "pre_pick": 0.0, "post_pick": 0.0,
              "effective": 0.0, "variance": 0.0, "ending": 0.0}

    all_locations = set(scan_map.keys()) | set(stock_map.keys()) | set(pre_map.keys()) | set(post_map.keys())
    for loc in all_locations:
        scans = scan_map.get(loc, {})
        loc_stock = stock_map.get(loc, {})
        loc_pre = pre_map.get(loc, {})
        loc_post = post_map.get(loc, {})
        all_bcs = set(scans.keys()) | set(loc_stock.keys()) | set(loc_pre.keys()) | set(loc_post.keys())
        # Show every barcode tied to this location (scanned, stocked, or picked).
        # We no longer skip unscanned-but-stocked rows so the Reports UI can
        # render the pre-audit baseline immediately after upload.
        for bc in sorted(all_bcs):
            scanned = scans.get(bc, 0)
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
        "description": r.get("description", ""), "category": r.get("category", ""),
        "mrp": r.get("mrp", 0), "cost": r.get("cost", 0),
        "article_code": r.get("article_code", ""), "article_name": r.get("article_name", ""),
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



# ═══════════════════════════════════════════════════════════════════════════
# Reports-page integration:
# Endpoints below shape cycle-count data into the SAME response format as the
# regular reports endpoints (`/reports/{sid}/{report_type}`) so the existing
# Reports UI renders cycle-count days and projects side-by-side with normal
# audit sessions.  Field-name mapping:
#     expected_qty   → stock_qty
#     scanned_qty    → physical_qty
#     variance_qty   → diff_qty / difference_qty
#     effective_qty  → final_qty   (no reco for cycle-count yet)
# Plus extra picking-aware columns added to every row:
#     pre_pick_qty, post_pick_qty, ending_stock, classification, _is_cycle_count
# ═══════════════════════════════════════════════════════════════════════════

async def _load_master_for_client(client_id: str) -> Dict[str, Dict[str, Any]]:
    """Mini master loader — picks description / category / mrp / cost from
    master_products so cycle-count reports can show product names and roll up
    by category exactly like regular reports do."""
    out: Dict[str, Dict[str, Any]] = {}
    cur = db.master_products.find({"client_id": client_id}, {"_id": 0})
    async for p in cur:
        bc = _normalize_barcode(p.get("barcode"))
        if not bc:
            continue
        out[bc] = {
            "description": p.get("description") or p.get("product_name", ""),
            "category": p.get("category") or p.get("category_name", ""),
            "mrp": _to_float(p.get("mrp")),
            "cost": _to_float(p.get("cost")),
            "article_code": p.get("article_code", ""),
            "article_name": p.get("article_name", ""),
        }
    return out


def _enrich_with_master(rows: List[Dict[str, Any]], master: Dict[str, Dict[str, Any]],
                        loc_stock_meta: Dict[str, Dict[str, Dict[str, Any]]]) -> None:
    """Attach description/category/mrp/cost/article info to each cycle-count row.
    Prefers the per-day uploaded stock metadata (if present) and falls back to
    the client-level master_products record."""
    for r in rows:
        bc = r.get("barcode", "")
        loc = r.get("location", "")
        meta = (loc_stock_meta.get(loc, {}) or {}).get(bc) or master.get(bc) or {}
        r.setdefault("description", meta.get("description", ""))
        r.setdefault("category", meta.get("category", "") or "Unmapped")
        r.setdefault("mrp", _to_float(meta.get("mrp")))
        r.setdefault("cost", _to_float(meta.get("cost")))
        r.setdefault("article_code", meta.get("article_code", ""))
        r.setdefault("article_name", meta.get("article_name", ""))


async def _stock_meta_map(project_id: str, day_id: Optional[str] = None) -> Dict[str, Dict[str, Dict[str, Any]]]:
    """{location: {barcode: {description, category, mrp, cost, article_code, article_name}}}
    Built from the day's uploaded stock rows (so that any rich columns the user
    included in their stock Excel are honoured in reports)."""
    q: Dict[str, Any] = {"project_id": project_id}
    if day_id:
        q["day_id"] = day_id
    out: Dict[str, Dict[str, Dict[str, Any]]] = {}
    async for s in db.cycle_day_stock.find(q, {"_id": 0}):
        loc = s.get("location", "")
        bc = s.get("barcode", "")
        bucket = out.setdefault(loc, {})
        if bc not in bucket:
            bucket[bc] = {
                "description": s.get("description", ""),
                "category": s.get("category", ""),
                "mrp": _to_float(s.get("mrp")),
                "cost": _to_float(s.get("cost")),
                "article_code": s.get("article_code", ""),
                "article_name": s.get("article_name", ""),
            }
    return out


def _calc_values(qty: float, mrp: float, cost: float) -> Dict[str, float]:
    """Match warehouse `calc_values` semantics — keeps Cycle Count value math
    in lock-step with Warehouse / Store reports."""
    return {
        "mrp": round(qty * mrp, 2) if mrp else 0.0,
        "cost": round(qty * cost, 2) if cost else 0.0,
    }


def _calc_accuracy(stock_qty: float, final_qty: float) -> float:
    if stock_qty <= 0:
        return 0.0
    return min(100.0, (min(stock_qty, final_qty) / stock_qty) * 100.0)


async def _build_cc_reco_maps(client_id: str,
                              edits: Optional[List[Dict[str, Any]]] = None
                              ) -> Dict[str, Dict[str, float]]:
    """Mirror of warehouse `_build_reco_maps` — Reco adjustments live at the
    client level, so the same `reco_adjustments` collection feeds Cycle Count
    consolidated reports.

    BUG-FIX: ``barcode_map`` is built REMAP-AWARE. When a Reco was saved at
    `(loc, ORIG)` (frontend anchors Reco to the ORIGINAL barcode after a
    barcode edit) and `(loc, ORIG)` was remapped to `NEW` by an active edit,
    we attribute the Reco to `NEW` in ``barcode_map`` — not `ORIG`. This
    prevents the Barcode Variance report from double-counting the Reco when
    the same `ORIG` was also scanned at OTHER (un-edited) locations.
    """
    adjs = await db.reco_adjustments.find({"client_id": client_id}, {"_id": 0}).to_list(100000)
    detailed_map: Dict[str, float] = {}
    barcode_map: Dict[str, float] = {}
    article_map: Dict[str, float] = {}

    # Build remap tables from active barcode edits
    loc_remap: Dict[tuple, str] = {}
    global_remap: Dict[str, str] = {}
    for e in (edits or []):
        orig = e.get("original_value"); new_v = e.get("new_value")
        if not orig or not new_v or not e.get("is_active", True):
            continue
        if e.get("report_type") == "detailed" and e.get("location"):
            loc_remap[(e["location"], orig)] = new_v
        elif e.get("report_type") in ("detailed", "barcode-wise"):
            global_remap[orig] = new_v

    for a in adjs:
        rt = a.get("reco_type", "")
        qty = _to_float(a.get("reco_qty"))
        if rt == "detailed":
            loc = a.get("location", "") or ""
            bc = a.get("barcode", "") or ""
            key = f"{loc}|{bc}"
            detailed_map[key] = detailed_map.get(key, 0) + qty
            # Attribute to post-edit barcode in the aggregated map so the
            # edited row receives the Reco — and un-edited rows for the
            # same ORIGINAL barcode at OTHER locations don't pick it up.
            target = loc_remap.get((loc, bc)) or global_remap.get(bc) or bc
            barcode_map[target] = barcode_map.get(target, 0) + qty
        elif rt == "barcode":
            bc = a.get("barcode", "") or ""
            target = global_remap.get(bc) or bc
            barcode_map[target] = barcode_map.get(target, 0) + qty
        elif rt == "article":
            ac = a.get("article_code", "") or ""
            article_map[ac] = article_map.get(ac, 0) + qty
    return {"detailed": detailed_map, "barcode": barcode_map, "article": article_map}


async def _apply_cc_reco(report: List[Dict[str, Any]], totals: Dict[str, Any],
                         client_id: str, report_type: str,
                         base_rows: Optional[List[Dict[str, Any]]] = None) -> tuple:
    """Apply saved Reco adjustments to cycle-count consolidated rows + totals.

    Mirrors warehouse semantics:
      • final_qty   = physical_qty + pre_pick_qty (effective) + reco_qty
      • final_value = final_qty * (mrp/cost)
      • diff_qty    = final_qty - stock_qty
      • diff_value  = final_value - stock_value
      • accuracy    = min(stock, final)/stock * 100  (capped at 100)

    Bin-wise + category-summary roll the per-(loc,barcode) reco up via the
    detailed map; barcode-wise uses the barcode map directly.
    Category-summary builds a barcode→category index from `base_rows`
    (post-edit) so reco moves into the correct edited category.
    """
    reco_maps = await _build_cc_reco_maps(
        client_id,
        edits=await _load_active_barcode_edits(client_id),
    )
    if not (reco_maps["detailed"] or reco_maps["barcode"] or reco_maps["article"]):
        return report, totals

    # Build barcode→category index (post-edit) for category-summary roll-up.
    # Mirrors warehouse `get_category_summary` which buckets reco by category
    # via a barcode→category lookup so Reco shows up in the right bucket.
    # Index by BOTH the current barcode AND the original (pre-edit) barcode
    # so reco saved against either value (frontend now saves with original
    # to keep reco resilient to undo) lands in the correct category.
    # IMPORTANT: edited rows take precedence — the auditor's intent when
    # editing a barcode is that the reco should follow the NEW category.
    bc_to_cat: Dict[str, str] = {}
    if report_type == "category-summary" and base_rows:
        # Pass 1: edited rows define authoritative category for both
        # original and new barcode (auditor's edit reflects intent).
        for r in base_rows:
            if not r.get("_is_edited"):
                continue
            cat = r.get("category") or "Unmapped"
            bc_now = r.get("barcode") or ""
            bc_orig = r.get("_original_value") or ""
            if bc_now:
                bc_to_cat[bc_now] = cat
            if bc_orig:
                bc_to_cat[bc_orig] = cat
        # Pass 2: non-edited rows only fill gaps (don't overwrite edits)
        for r in base_rows:
            if r.get("_is_edited"):
                continue
            cat = r.get("category") or "Unmapped"
            bc_now = r.get("barcode") or ""
            if bc_now and bc_now not in bc_to_cat:
                bc_to_cat[bc_now] = cat
    reco_by_category: Dict[str, float] = {}
    if report_type == "category-summary":
        for bc, q in reco_maps["barcode"].items():
            cat = bc_to_cat.get(bc, "Unmapped")
            reco_by_category[cat] = reco_by_category.get(cat, 0) + q

    # Reset reco-affected totals — we'll recompute from scratch
    reco_total_keys = ["reco_qty", "final_qty", "diff_qty", "difference_qty",
                        "final_value_mrp", "final_value_cost",
                        "diff_value_mrp", "diff_value_cost"]
    for k in reco_total_keys:
        totals[k] = 0.0

    for row in report:
        loc = row.get("location", "")
        bc = row.get("barcode", "")
        is_edited = bool(row.get("_is_edited") or row.get("is_edited"))
        # Reco anchored to the ORIGINAL barcode for edited rows (frontend
        # convention since the original-anchor fix). Non-edited rows look up
        # strictly by their own barcode — NO fallback — so an edit that
        # collides with an existing barcode at the same bin doesn't apply
        # the same Reco to both rows. (Merge-on-collision in
        # `_merge_cc_base_collisions` normally prevents duplicates outright;
        # the strict lookup is a defence-in-depth safety net.)
        orig_bc = row.get("_original_value") or bc

        if report_type == "detailed":
            if is_edited:
                # Try original first, fall back to current barcode for
                # backward-compat with pre-anchoring legacy reco rows.
                reco_qty = (
                    reco_maps["detailed"].get(f"{loc}|{orig_bc}", 0)
                    or reco_maps["detailed"].get(f"{loc}|{bc}", 0)
                )
            else:
                reco_qty = reco_maps["detailed"].get(f"{loc}|{bc}", 0)
        elif report_type == "barcode-wise":
            if is_edited:
                reco_qty = reco_maps["barcode"].get(orig_bc, 0) or reco_maps["barcode"].get(bc, 0)
            else:
                reco_qty = reco_maps["barcode"].get(bc, 0)
        elif report_type == "bin-wise":
            # Sum reco across all barcodes at this location
            reco_qty = sum(v for k, v in reco_maps["detailed"].items() if k.startswith(f"{loc}|"))
        elif report_type == "category-summary":
            reco_qty = reco_by_category.get(row.get("category", "") or "Unmapped", 0)
        else:
            reco_qty = 0

        row["reco_qty"] = reco_qty
        # effective_qty already reflects physical + pre-pick. Add reco on top.
        physical_qty = _to_float(row.get("physical_qty"))
        effective = _to_float(row.get("effective_qty", physical_qty))
        final_qty = effective + reco_qty
        row["final_qty"] = final_qty
        row["diff_qty"] = final_qty - _to_float(row.get("stock_qty"))
        row["difference_qty"] = row["diff_qty"]

        mrp = _to_float(row.get("mrp"))
        cost = _to_float(row.get("cost"))
        # Bin-wise / category-summary rows don't carry mrp/cost; leave value
        # columns alone if we can't recompute them per-row.
        if mrp or cost:
            fv = _calc_values(final_qty, mrp, cost)
            row["final_value_mrp"] = fv["mrp"]
            row["final_value_cost"] = fv["cost"]
            row["diff_value_mrp"] = round(fv["mrp"] - _to_float(row.get("stock_value_mrp")), 2)
            row["diff_value_cost"] = round(fv["cost"] - _to_float(row.get("stock_value_cost")), 2)
        else:
            # Aggregate rows: derive value totals proportionally from existing values
            # final_value = stock_value + (final - stock) * avg_unit_value
            row["final_value_mrp"] = round(_to_float(row.get("final_value_mrp")) + reco_qty * _avg_unit_value(row, "mrp"), 2)
            row["final_value_cost"] = round(_to_float(row.get("final_value_cost")) + reco_qty * _avg_unit_value(row, "cost"), 2)
            row["diff_value_mrp"] = round(_to_float(row.get("final_value_mrp")) - _to_float(row.get("stock_value_mrp")), 2)
            row["diff_value_cost"] = round(_to_float(row.get("final_value_cost")) - _to_float(row.get("stock_value_cost")), 2)

        row["accuracy_pct"] = _calc_accuracy(_to_float(row.get("stock_qty")), final_qty)

        # Roll into totals
        totals["reco_qty"] += reco_qty
        totals["final_qty"] += final_qty
        totals["diff_qty"] += row["diff_qty"]
        totals["difference_qty"] += row["diff_qty"]
        totals["final_value_mrp"] += _to_float(row.get("final_value_mrp"))
        totals["final_value_cost"] += _to_float(row.get("final_value_cost"))
        totals["diff_value_mrp"] += _to_float(row.get("diff_value_mrp"))
        totals["diff_value_cost"] += _to_float(row.get("diff_value_cost"))

    # Round value totals
    for k in reco_total_keys:
        if "value" in k:
            totals[k] = round(totals[k], 2)
    totals["accuracy_pct"] = _calc_accuracy(
        _to_float(totals.get("stock_qty")), _to_float(totals.get("final_qty"))
    )
    return report, totals


def _avg_unit_value(row: Dict[str, Any], kind: str) -> float:
    """For aggregate rows (bin/category) compute avg unit MRP or Cost from
    existing stock_value / stock_qty, falling back to physical_value/qty."""
    qty = _to_float(row.get("stock_qty")) or _to_float(row.get("physical_qty"))
    if qty <= 0:
        return 0.0
    if kind == "mrp":
        val = _to_float(row.get("stock_value_mrp")) or _to_float(row.get("physical_value_mrp"))
    else:
        val = _to_float(row.get("stock_value_cost")) or _to_float(row.get("physical_value_cost"))
    return val / qty if qty else 0.0


async def _load_active_barcode_edits(client_id: str) -> List[Dict[str, Any]]:
    """Pull every active barcode edit for this client (shared with warehouse).
    Cycle Count uses these at the BASE-row level so edits propagate to every
    shaped report (detailed / barcode-wise / category-summary)."""
    return await db.barcode_edits.find(
        {"client_id": client_id, "report_type": {"$in": ["detailed", "barcode-wise"]}, "is_active": True},
        {"_id": 0}
    ).to_list(5000)


def _apply_cc_barcode_edits_to_base(base_rows: List[Dict[str, Any]],
                                     edits: List[Dict[str, Any]]) -> set:
    """Mutate per-(loc, barcode) cycle-count rows IN-PLACE: rename barcode +
    pull description/category/mrp/cost from the edit's saved master_info.

    Operating at the base level (BEFORE `_shape_report`) is what guarantees
    that a barcode edit propagates correctly into every aggregated view —
    barcode-wise re-buckets under the new barcode, and category-summary
    re-buckets under the (possibly different) new category. This mirrors the
    warehouse approach (`audit_routes.get_category_summary` line ~4601 where
    scanner barcodes are remapped before bucketing into categories).

    Only "extra-scanned" rows (expected_qty == 0) are eligible — same rule as
    warehouse `_apply_barcode_edits`. Detailed-scoped edits additionally
    require the location to match.

    Returns a set of NEW barcode values (post-edit) so the shape stage can
    flag matching shaped rows as `is_edited` for the UI's pencil/undo affordances.
    """
    edited_new_barcodes: set = set()
    if not edits:
        return edited_new_barcodes
    for edit in edits:
        orig = edit.get("original_value")
        new_v = edit.get("new_value")
        if not orig or not new_v:
            continue
        edit_loc = edit.get("location") or ""
        edit_source = edit.get("report_type")
        mi = edit.get("master_info", {}) or {}
        new_mrp = _to_float(mi.get("mrp", 0))
        new_cost = _to_float(mi.get("cost", 0))
        for r in base_rows:
            if r.get("barcode") != orig:
                continue
            if _to_float(r.get("expected_qty")) != 0:
                continue
            # Detailed-scoped edits are location-specific; barcode-wise edits are global
            if edit_source == "detailed" and edit_loc and r.get("location") != edit_loc:
                continue
            r["barcode"] = new_v
            r["description"] = mi.get("description", "") or r.get("description", "")
            r["category"] = mi.get("category", "") or r.get("category", "") or "Unmapped"
            r["article_code"] = mi.get("article_code", "") or r.get("article_code", "")
            r["article_name"] = mi.get("article_name", "") or r.get("article_name", "")
            r["mrp"] = new_mrp
            r["cost"] = new_cost
            r["_edit_id"] = edit["id"]
            r["_original_value"] = orig
            r["_is_edited"] = True
            edited_new_barcodes.add(new_v)
    return edited_new_barcodes


def _merge_cc_base_collisions(base_rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Collapse duplicate `(location, barcode)` rows that arise when a
    barcode edit renames an extra-scan into a barcode that already exists at
    the same bin (e.g. correcting a mis-scan into its real counterpart).

    Both rows describe the same physical item, so we consolidate them:
      • sum scanned_qty / pre_pick_qty / post_pick_qty / ending_stock
      • take expected_qty from the planned row (the edited row had 0)
      • recompute effective_qty + variance_qty + classification
      • preserve _is_edited / _original_value / _edit_id so Reco still
        anchors to the original barcode

    Without this merge, the detailed report would show two rows for the same
    (loc, barcode) and Reco/variance/final qty would double-count.
    """
    by_key: Dict[tuple, Dict[str, Any]] = {}
    merged: List[Dict[str, Any]] = []
    for r in base_rows:
        key = (r.get("location", "") or "", r.get("barcode", "") or "")
        target = by_key.get(key)
        if target is None:
            by_key[key] = r
            merged.append(r)
            continue
        # Collision — fold r into target. Sum picking-aware quantities.
        for fld in ("scanned_qty", "pre_pick_qty", "post_pick_qty",
                    "ending_stock", "expected_qty"):
            target[fld] = _to_float(target.get(fld, 0)) + _to_float(r.get(fld, 0))
        target["effective_qty"] = (
            _to_float(target.get("scanned_qty", 0))
            + _to_float(target.get("pre_pick_qty", 0))
        )
        target["variance_qty"] = (
            _to_float(target["effective_qty"])
            - _to_float(target.get("expected_qty", 0))
        )
        v = target["variance_qty"]
        if abs(v) < 1e-9:
            target["classification"] = "match"; target["reason"] = "match"
        elif v > 0:
            target["classification"] = "extra"; target["reason"] = "surplus"
        else:
            target["classification"] = "shortage"; target["reason"] = "shortage"
        # Either row carrying edit metadata wins — keeps Reco anchor + UI flags
        if r.get("_is_edited") and not target.get("_is_edited"):
            target["_is_edited"] = True
            target["_edit_id"] = r.get("_edit_id")
            target["_original_value"] = r.get("_original_value")
        # Master-info fields: prefer non-empty values
        for fld in ("description", "category", "article_code", "article_name"):
            if not target.get(fld) and r.get(fld):
                target[fld] = r[fld]
        if not _to_float(target.get("mrp", 0)) and _to_float(r.get("mrp", 0)):
            target["mrp"] = _to_float(r["mrp"])
        if not _to_float(target.get("cost", 0)) and _to_float(r.get("cost", 0)):
            target["cost"] = _to_float(r["cost"])
    return merged


def _mark_edits_on_shaped(shaped: Dict[str, Any], report_type: str,
                          base_rows: List[Dict[str, Any]],
                          edited_new_barcodes: set) -> None:
    """After `_shape_report`, flag the matching shaped rows as `is_edited`
    so the UI shows the pencil/undo indicators. Only meaningful for
    detailed and barcode-wise (the only views where the user can edit)."""
    if report_type not in ("detailed", "barcode-wise"):
        return
    if not edited_new_barcodes:
        return
    # Build lookup: new_barcode -> {edit_id, original_value, location?}
    edit_lookup: Dict[Any, Dict[str, Any]] = {}
    for r in base_rows:
        if r.get("_is_edited") and r.get("barcode") in edited_new_barcodes:
            key = (r.get("location"), r.get("barcode")) if report_type == "detailed" else r.get("barcode")
            edit_lookup[key] = {
                "edit_id": r.get("_edit_id"),
                "original_value": r.get("_original_value"),
            }
    for row in shaped.get("report", []):
        if report_type == "detailed":
            key = (row.get("location"), row.get("barcode"))
        else:
            key = row.get("barcode")
        info = edit_lookup.get(key)
        if not info:
            continue
        row["is_edited"] = True
        row["is_editable"] = True
        row["_edit_id"] = info["edit_id"]
        row["_original_value"] = info["original_value"]
        row["remark"] = f"Barcode Edited (was: {info['original_value']})"


def _shape_report(report_type: str, base_rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Re-shape cycle-count base rows (per-(loc, barcode)) into the format the
    Reports UI expects for each report_type. Adds full MRP/Cost value columns
    + per-row & subtotal aggregation so Cycle Count reports match the
    Warehouse calculation contract exactly."""

    # Common per-row mapper
    def detailed_row(r: Dict[str, Any]) -> Dict[str, Any]:
        # Build a friendly remark string used by the existing Reports UI icons.
        reason_map = {
            "match": "Exact Match", "surplus": "Surplus", "shortage": "Shortage",
            "reconciled_via_picks": "Reconciled (Picks)",
        }
        remark_bits = []
        cls = r.get("classification", "planned")
        if cls == "extra":
            remark_bits.append("Extra Bin")
        remark_bits.append(reason_map.get(r.get("reason"), "Match"))
        if r.get("duplicate_warning"):
            remark_bits.append(f"Duplicate (D{r['duplicate_warning'].get('closed_on_day')})")
        mrp = _to_float(r.get("mrp"))
        cost = _to_float(r.get("cost"))
        stock_qty = _to_float(r.get("expected_qty"))
        physical_qty = _to_float(r.get("scanned_qty"))
        final_qty = _to_float(r.get("effective_qty"))
        diff_qty = _to_float(r.get("variance_qty"))
        sv = _calc_values(stock_qty, mrp, cost)
        pv = _calc_values(physical_qty, mrp, cost)
        fv = _calc_values(final_qty, mrp, cost)
        dv_mrp = round(fv["mrp"] - sv["mrp"], 2)
        dv_cost = round(fv["cost"] - sv["cost"], 2)
        return {
            "location": r["location"], "barcode": r["barcode"],
            "description": r.get("description", ""), "category": r.get("category", "Unmapped"),
            "mrp": mrp, "cost": cost,
            "article_code": r.get("article_code", ""), "article_name": r.get("article_name", ""),
            "stock_qty": stock_qty,
            "stock_value_mrp": sv["mrp"], "stock_value_cost": sv["cost"],
            "physical_qty": physical_qty,
            "physical_value_mrp": pv["mrp"], "physical_value_cost": pv["cost"],
            "reco_qty": 0,
            "final_qty": final_qty,
            "final_value_mrp": fv["mrp"], "final_value_cost": fv["cost"],
            "diff_qty": diff_qty,
            "difference_qty": diff_qty,
            "diff_value_mrp": dv_mrp, "diff_value_cost": dv_cost,
            "accuracy_pct": _calc_accuracy(stock_qty, final_qty),
            "remark": " · ".join(remark_bits),
            # cycle-count specific
            "pre_pick_qty": _to_float(r.get("pre_pick_qty", 0)),
            "post_pick_qty": _to_float(r.get("post_pick_qty", 0)),
            "effective_qty": final_qty,
            "ending_stock": _to_float(r.get("ending_stock", 0)),
            "classification": r.get("classification", "planned"),
            "duplicate_warning": r.get("duplicate_warning"),
            "_is_cycle_count": True,
        }

    def _accumulate_qty_and_values(row: Dict[str, Any], r: Dict[str, Any]) -> None:
        """Add a base row's qty + value contribution onto an aggregate row."""
        mrp = _to_float(r.get("mrp"))
        cost = _to_float(r.get("cost"))
        stock_qty = _to_float(r.get("expected_qty"))
        physical_qty = _to_float(r.get("scanned_qty"))
        final_qty = _to_float(r.get("effective_qty"))
        diff_qty = _to_float(r.get("variance_qty"))
        sv = _calc_values(stock_qty, mrp, cost)
        pv = _calc_values(physical_qty, mrp, cost)
        fv = _calc_values(final_qty, mrp, cost)

        row["stock_qty"] += stock_qty
        row["physical_qty"] += physical_qty
        row["pre_pick_qty"] += _to_float(r.get("pre_pick_qty", 0))
        row["post_pick_qty"] += _to_float(r.get("post_pick_qty", 0))
        row["final_qty"] += final_qty
        row["effective_qty"] += final_qty
        row["ending_stock"] += _to_float(r.get("ending_stock", 0))
        row["diff_qty"] += diff_qty
        row["difference_qty"] += diff_qty
        # Value columns (MRP + Cost)
        row["stock_value_mrp"] += sv["mrp"]
        row["stock_value_cost"] += sv["cost"]
        row["physical_value_mrp"] += pv["mrp"]
        row["physical_value_cost"] += pv["cost"]
        row["final_value_mrp"] += fv["mrp"]
        row["final_value_cost"] += fv["cost"]
        row["diff_value_mrp"] = round(row["final_value_mrp"] - row["stock_value_mrp"], 2)
        row["diff_value_cost"] = round(row["final_value_cost"] - row["stock_value_cost"], 2)

    def _agg_row_template(extra_fields: Dict[str, Any]) -> Dict[str, Any]:
        return {
            **extra_fields,
            "stock_qty": 0.0, "physical_qty": 0.0, "reco_qty": 0.0,
            "final_qty": 0.0, "diff_qty": 0.0, "difference_qty": 0.0,
            "pre_pick_qty": 0.0, "post_pick_qty": 0.0,
            "effective_qty": 0.0, "ending_stock": 0.0,
            # value columns
            "stock_value_mrp": 0.0, "stock_value_cost": 0.0,
            "physical_value_mrp": 0.0, "physical_value_cost": 0.0,
            "final_value_mrp": 0.0, "final_value_cost": 0.0,
            "diff_value_mrp": 0.0, "diff_value_cost": 0.0,
            "_is_cycle_count": True,
        }

    if report_type == "detailed":
        rows = [detailed_row(r) for r in base_rows]
    elif report_type == "bin-wise":
        # Group by location
        agg: Dict[str, Dict[str, Any]] = {}
        for r in base_rows:
            loc = r["location"]
            row = agg.setdefault(loc, _agg_row_template({"location": loc, "barcode_count": 0}))
            _accumulate_qty_and_values(row, r)
            row["barcode_count"] += 1
        # Compute accuracy per row
        for row in agg.values():
            row["accuracy_pct"] = _calc_accuracy(row["stock_qty"], row["final_qty"])
        rows = list(agg.values())
    elif report_type == "barcode-wise":
        # Group by barcode (across locations)
        agg = {}
        for r in base_rows:
            bc = r["barcode"]
            row = agg.setdefault(bc, _agg_row_template({
                "barcode": bc, "description": r.get("description", ""),
                "category": r.get("category", "Unmapped"),
                "mrp": _to_float(r.get("mrp")), "cost": _to_float(r.get("cost")),
                "article_code": r.get("article_code", ""), "article_name": r.get("article_name", ""),
            }))
            _accumulate_qty_and_values(row, r)
        for row in agg.values():
            row["accuracy_pct"] = _calc_accuracy(row["stock_qty"], row["final_qty"])
        rows = list(agg.values())
    elif report_type == "category-summary":
        agg = {}
        for r in base_rows:
            cat = r.get("category", "") or "Unmapped"
            row = agg.setdefault(cat, _agg_row_template({"category": cat, "item_count": 0}))
            _accumulate_qty_and_values(row, r)
            row["item_count"] += 1
        for row in agg.values():
            row["accuracy_pct"] = _calc_accuracy(row["stock_qty"], row["final_qty"])
        rows = list(agg.values())
    else:
        rows = [detailed_row(r) for r in base_rows]

    # Totals (subtotals row used by Normal View, Full View, Excel & PDF exports)
    totals_keys = [
        "stock_qty", "physical_qty", "reco_qty", "final_qty",
        "diff_qty", "difference_qty",
        "pre_pick_qty", "post_pick_qty", "effective_qty", "ending_stock",
        "stock_value_mrp", "stock_value_cost",
        "physical_value_mrp", "physical_value_cost",
        "final_value_mrp", "final_value_cost",
        "diff_value_mrp", "diff_value_cost",
    ]
    totals = {k: 0.0 for k in totals_keys}
    for r in rows:
        for k in totals_keys:
            totals[k] += _to_float(r.get(k, 0))
    # Round value totals to 2dp for clean display
    for k in totals_keys:
        if "value" in k:
            totals[k] = round(totals[k], 2)
    totals["accuracy_pct"] = _calc_accuracy(totals["stock_qty"], totals["final_qty"])

    # Mark rows editable when barcode/article wasn't in uploaded stock but was
    # scanned (mirrors warehouse `is_editable` rule). Bin-wise + category-summary
    # don't expose barcode edits, so we skip those report types.
    if report_type in ("detailed", "barcode-wise"):
        for row in rows:
            row["is_editable"] = (
                _to_float(row.get("stock_qty")) == 0 and _to_float(row.get("physical_qty")) > 0
            )

    return {"report": rows, "totals": totals}


@cycle_router.get("/days/{day_id}/report/{report_type}")
async def cycle_day_report(day_id: str, report_type: str):
    """Reports-UI compatible variance report for a single cycle-count day."""
    day = await db.cycle_days.find_one({"id": day_id}, {"_id": 0})
    if not day:
        raise HTTPException(404, "Day not found")
    project = await db.cycle_projects.find_one({"id": day["project_id"]}, {"_id": 0})
    if not project:
        raise HTTPException(404, "Project not found")
    base = await _compute_day_variance(project, day)
    master = await _load_master_for_client(project["client_id"])
    stock_meta = await _stock_meta_map(project["id"], day_id)
    _enrich_with_master(base["report"], master, stock_meta)
    # Apply barcode/article edits at the BASE-row level so the rename + new
    # description/category/mrp/cost flow into every shaped report (detailed,
    # barcode-wise, category-summary, bin-wise) consistently. Mirrors the
    # warehouse approach where scanner barcodes are remapped before bucketing.
    edits = await _load_active_barcode_edits(project["client_id"])
    edited_new_barcodes = _apply_cc_barcode_edits_to_base(base["report"], edits)
    # Merge any (loc, barcode) collisions caused by editing into a barcode
    # that already exists at the same bin — prevents duplicate rows and
    # double Reco/variance application.
    base["report"] = _merge_cc_base_collisions(base["report"])
    shaped = _shape_report(report_type, base["report"])
    # Mark shaped detailed/barcode-wise rows as edited for the UI's
    # pencil/undo affordances and the "Barcode Edited (was: …)" remark.
    _mark_edits_on_shaped(shaped, report_type, base["report"], edited_new_barcodes)
    # Apply Reco adjustments here too — Cycle Count Reco is editable only in
    # Day-wise Detailed Report but the resulting Reco/Final Qty must be
    # visible (read-only) across every cycle-count report. Pulling the same
    # `reco_adjustments` collection guarantees real-time propagation.
    shaped["report"], shaped["totals"] = await _apply_cc_reco(
        shaped["report"], shaped["totals"], project["client_id"], report_type,
        base_rows=base["report"],
    )
    shaped["session_info"] = {
        "id": f"cc_day_{day_id}", "name": f"{project['name']} · Day {day['day_no']}",
        "client_id": project["client_id"], "variance_mode": "cycle-count-day",
        "is_cycle_count": True, "day_no": day["day_no"], "day_date": day["date"], "status": day["status"],
    }
    shaped["bins_summary"] = base.get("bins_summary", {})
    return shaped


@cycle_router.get("/projects/{pid}/report/{report_type}")
async def cycle_project_report(pid: str, report_type: str):
    """Reports-UI compatible consolidated variance report.

    Consolidation rules (per user spec):
      • All days (open + closed) contribute to the consolidated view — same as
        the warehouse consolidated flow where in-progress sessions still
        contribute to client-level totals.
      • For each (location, barcode) the LATEST day's row wins (overwrite —
        not sum). That way the consolidated view always reflects the most
        recent count for any bin.
      • Bins/barcodes only counted on earlier days remain in the report
        (cumulative across days).

    Special report_types only available in consolidated view:
      • pending-locations → bins that had stock uploaded across all days but
        were NEVER scanned in any day.
      • empty-bins        → bins scanned in any day where the latest counted
        qty rolls up to zero.
    """
    project = await db.cycle_projects.find_one({"id": pid}, {"_id": 0})
    if not project:
        raise HTTPException(404, "Project not found")
    # Every day (open + closed) feeds the consolidated view — matches the
    # warehouse consolidated flow where in-progress sessions still contribute.
    days = await db.cycle_days.find({"project_id": pid}, {"_id": 0}).sort("day_no", 1).to_list(1000)
    master = await _load_master_for_client(project["client_id"])
    stock_meta = await _stock_meta_map(project["id"])

    # Latest-locked-day wins per (loc, barcode)
    bin_agg: Dict[str, Dict[str, Any]] = {}
    expected_bins_all_days: set = set()
    scanned_bins_all_days: set = set()
    # Source the truly-scanned bins from synced_locations directly so that
    # the pending-locations roll-up stays accurate even though the per-day
    # variance now also surfaces unscanned-but-stocked bins.
    session_id = project.get("audit_session_id")
    if session_id:
        async for s in db.synced_locations.find(
            {"session_id": session_id}, {"_id": 0, "location_name": 1}
        ):
            loc = s.get("location_name")
            if loc:
                scanned_bins_all_days.add(loc)
    for d in days:
        v = await _compute_day_variance(project, d)
        for r in v["report"]:
            key = f"{r['location']}|{r['barcode']}"
            row = dict(r)
            row["day_no"] = d["day_no"]
            row["day_date"] = d["date"]
            if key in bin_agg:
                row["is_recount"] = True
                row["previous_day_no"] = bin_agg[key].get("day_no")
            bin_agg[key] = row  # latest day overwrites
        # Track expected bins (any day, regardless of status)
        stock_rows = await db.cycle_day_stock.find(
            {"project_id": pid, "day_id": d["id"]}, {"_id": 0, "location": 1}
        ).to_list(100000)
        expected_bins_all_days.update(s["location"] for s in stock_rows if s.get("location"))

    # Special report types — pending and empty-bins
    if report_type == "pending-locations":
        # Source pending bins from the client's Location Master (warehouse parity).
        # Any bin in the master that has NOT been scanned in this project yet
        # is "pending". Bins with stock uploaded but not yet on the master
        # still surface as pending so day-1 uploads aren't lost.
        loc_master_cur = db.location_master.find(
            {"client_id": project["client_id"]}, {"_id": 0, "location_code": 1, "zone": 1, "floor": 1, "location_type": 1}
        )
        master_locs: Dict[str, Dict[str, Any]] = {}
        async for lm in loc_master_cur:
            code = (lm.get("location_code") or "").strip()
            if code:
                master_locs[code] = lm
        # Union with stock-uploaded bins (so freshly-uploaded bins not yet in
        # the master file still show as pending instead of disappearing).
        for bin_loc in expected_bins_all_days:
            if bin_loc and bin_loc not in master_locs:
                master_locs[bin_loc] = {"location_code": bin_loc}

        # Build synced map (mirrors warehouse pending-locations response shape)
        synced_map: Dict[str, Dict[str, Any]] = {}
        if session_id:
            async for s in db.synced_locations.find(
                {"session_id": session_id}, {"_id": 0}
            ):
                name = s.get("location_name", "")
                if not name:
                    continue
                # Last-write-wins per location (latest sync overwrites)
                synced_map[name] = {
                    "location_name": name,
                    "total_items": s.get("total_items", 0),
                    "total_quantity": s.get("total_quantity", 0),
                    "is_empty": s.get("is_empty", False),
                    "empty_remarks": s.get("empty_remarks", ""),
                    "device_name": s.get("device_name", ""),
                    "synced_at": s.get("synced_at", ""),
                    "sync_date": s.get("sync_date", ""),
                    "status": "empty" if s.get("is_empty", False) else "completed",
                }

        all_locs = sorted(set(master_locs.keys()) | set(synced_map.keys()))
        completed: List[Dict[str, Any]] = []
        empty_bins: List[Dict[str, Any]] = []
        pending: List[Dict[str, Any]] = []
        for loc_name in all_locs:
            in_expected = loc_name in master_locs
            if loc_name in synced_map:
                info = synced_map[loc_name]
                if info["is_empty"]:
                    empty_bins.append({"location_name": loc_name, "status": "empty",
                                        "in_expected": in_expected, **info})
                else:
                    completed.append({"location_name": loc_name, "status": "completed",
                                      "in_expected": in_expected, **info})
            elif in_expected:
                pending.append({"location_name": loc_name, "status": "pending",
                                "in_expected": True, "total_items": 0, "total_quantity": 0,
                                "is_empty": False, "empty_remarks": "", "device_name": "",
                                "synced_at": "", "sync_date": ""})

        total_expected = len(master_locs)
        synced_in_expected = len(set(synced_map.keys()) & set(master_locs.keys()))
        completion_pct = round((synced_in_expected / total_expected * 100), 1) if total_expected > 0 else 0
        return {
            "session_id": f"cc_proj_{pid}",
            "session_name": f"{project['name']} · Consolidated",
            "summary": {
                "total_expected": total_expected,
                "total_completed": len(completed),
                "total_empty": len(empty_bins),
                "total_pending": len(pending),
                "total_synced": synced_in_expected,
                "completion_pct": completion_pct,
            },
            "completed": completed,
            "empty_bins": empty_bins,
            "pending": pending,
            "session_info": {
                "id": f"cc_proj_{pid}", "name": f"{project['name']} · Consolidated",
                "client_id": project["client_id"], "variance_mode": "cycle-count-consolidated",
                "is_cycle_count": True, "status": project.get("status", "active"),
            },
        }

    if report_type == "empty-bins":
        # Bins scanned in any locked day where latest-locked rolls up final_qty == 0
        per_bin_final: Dict[str, float] = {}
        per_bin_expected: Dict[str, float] = {}
        for r in bin_agg.values():
            per_bin_final[r["location"]] = per_bin_final.get(r["location"], 0) + _to_float(r.get("effective_qty", 0))
            per_bin_expected[r["location"]] = per_bin_expected.get(r["location"], 0) + _to_float(r.get("expected_qty", 0))
        rows = [
            {
                "location": loc,
                "expected_qty": per_bin_expected.get(loc, 0),
                "stock_qty": per_bin_expected.get(loc, 0),
                "physical_qty": 0,
                "final_qty": 0,
                "diff_qty": -per_bin_expected.get(loc, 0),
                "difference_qty": -per_bin_expected.get(loc, 0),
                "status": "empty_bin",
                "is_empty": True,
                "_is_cycle_count": True,
            }
            for loc, final in per_bin_final.items() if final == 0
        ]
        return {
            "report": rows,
            "totals": {
                "stock_qty": sum(r["stock_qty"] for r in rows),
                "physical_qty": 0, "final_qty": 0,
                "difference_qty": sum(r["difference_qty"] for r in rows),
            },
            "summary": {"total_empty_bins": len(rows)},
            "session_info": {
                "id": f"cc_proj_{pid}", "name": f"{project['name']} · Consolidated",
                "client_id": project["client_id"], "variance_mode": "cycle-count-consolidated",
                "is_cycle_count": True, "status": project.get("status", "active"),
            },
        }

    base_rows = list(bin_agg.values())
    _enrich_with_master(base_rows, master, stock_meta)
    # Apply barcode/article edits at the BASE-row level (warehouse parity)
    edits = await _load_active_barcode_edits(project["client_id"])
    edited_new_barcodes = _apply_cc_barcode_edits_to_base(base_rows, edits)
    # Merge collisions before shaping (warehouse parity) — see helper docstring
    base_rows = _merge_cc_base_collisions(base_rows)
    shaped = _shape_report(report_type, base_rows)
    _mark_edits_on_shaped(shaped, report_type, base_rows, edited_new_barcodes)
    # Apply Reco adjustments → fills in `reco_qty` & `final_qty` columns + value math
    shaped["report"], shaped["totals"] = await _apply_cc_reco(
        shaped["report"], shaped["totals"], project["client_id"], report_type,
        base_rows=base_rows,
    )
    shaped["session_info"] = {
        "id": f"cc_proj_{pid}", "name": f"{project['name']} · Consolidated",
        "client_id": project["client_id"], "variance_mode": "cycle-count-consolidated",
        "is_cycle_count": True, "status": project.get("status", "active"),
        "locked_days_count": len(days),
    }
    return shaped
