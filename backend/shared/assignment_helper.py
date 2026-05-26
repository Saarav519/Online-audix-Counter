"""
Assignment helper — owners (`clients.created_by`) can delegate viewing
and limited editing (RECO in detailed report only) of their sessions to
other portal users.

Permission model (security enforced at this layer):

    • OWNER  — `clients.created_by == user_id`
        → full access: view all reports, edit barcode/article/reco,
          close days, delete projects, etc. Can ALSO assign + revoke.

    • ASSIGNEE (assignment row exists in `report_assignments`)
        → view: ALL session reports if `assignment_type='full_session'`,
                or only the listed report_types otherwise.
        → edit: RECO column in the DETAILED report only.
                Barcode / article edits + day operations are blocked.
        → CANNOT re-assign (assignment list filtered by `assigned_by`,
                so assignees never appear as candidate assigners).

    • Anyone else → 403.

Cycle-count specifics:
    • Assignments map to the cycle project's `audit_session_id`.
    • Optional `cycle_day` (day_no) narrows the assignment to a single
      day. When set, edits/recos on other days of the same project
      remain blocked.

All functions are async and DB-aware. They NEVER raise on logging
failures — only on legitimate permission errors. Callers that want
binary access checks should wrap with `try / HTTPException(403)`.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


# Valid assignment types
FULL_SESSION = "full_session"
SPECIFIC_REPORTS = "specific_reports"
VALID_TYPES = {FULL_SESSION, SPECIFIC_REPORTS}

# Valid report-type keys (matches what FE sends + backend report endpoints expect)
VALID_REPORT_TYPES = {
    "detailed", "bin_wise", "bin-wise",
    "barcode_wise", "barcode-wise",
    "article_wise", "article-wise",
    "variance", "category", "summary",
}

VALID_MODULES = {"warehouse", "cycle_count"}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_report_type(rt: str) -> str:
    """Normalize report-type strings — collapse '-' / '_' variants."""
    if not rt:
        return ""
    return rt.replace("_", "-").lower()


async def _resolve_client_id_from_session(db, session_id: str) -> Optional[str]:
    """Find the owning client_id for either a warehouse audit_session
    or a cycle_count project (cycle_projects.audit_session_id)."""
    if not session_id:
        return None
    # Try warehouse audit_session first.
    sess = await db.audit_sessions.find_one(
        {"id": session_id}, {"_id": 0, "client_id": 1}
    )
    if sess and sess.get("client_id"):
        return sess["client_id"]
    # Cycle-count fallback.
    proj = await db.cycle_projects.find_one(
        {"audit_session_id": session_id}, {"_id": 0, "client_id": 1}
    )
    if proj and proj.get("client_id"):
        return proj["client_id"]
    return None


async def _is_owner(db, user_id: str, client_id: str) -> bool:
    """True iff `user_id` is the client's `created_by`."""
    if not user_id or not client_id:
        return False
    c = await db.clients.find_one({"id": client_id}, {"_id": 0, "created_by": 1})
    if not c:
        return False
    return (c.get("created_by") or "") == user_id


# ─────────────────────────────────────────────────────── CRUD


async def create_assignment(db, data: Dict[str, Any]) -> Dict[str, Any]:
    """Persist a new `report_assignments` row. Caller MUST have already
    validated that the requester is the owner of the session's client
    (the route handler does that — this helper just writes).

    Returns the inserted document (sans `_id`).
    """
    module = data.get("module") or "warehouse"
    if module not in VALID_MODULES:
        raise ValueError(f"Invalid module: {module}")
    assignment_type = data.get("assignment_type") or FULL_SESSION
    if assignment_type not in VALID_TYPES:
        raise ValueError(f"Invalid assignment_type: {assignment_type}")
    session_id = data.get("session_id")
    if not session_id:
        raise ValueError("session_id is required")
    assigned_to = data.get("assigned_to")
    if not assigned_to:
        raise ValueError("assigned_to is required")
    assigned_by = data.get("assigned_by") or ""

    report_types: List[str] = []
    if assignment_type == SPECIFIC_REPORTS:
        report_types = [
            _normalize_report_type(rt)
            for rt in (data.get("report_types") or [])
            if rt
        ]
        if not report_types:
            raise ValueError("report_types must be non-empty for specific_reports")

    now = datetime.now(timezone.utc)
    doc = {
        "id": str(uuid.uuid4()),
        "module": module,
        "assigned_to": assigned_to,
        "assigned_by": assigned_by,
        "assigned_at": now.isoformat(),
        "assigned_at_dt": now,
        "session_id": session_id,
        "client_id": data.get("client_id") or "",
        "assignment_type": assignment_type,
        "report_types": report_types,
        "cycle_day": data.get("cycle_day"),  # int | None
        "notes": (data.get("notes") or "").strip(),
        "is_active": True,
    }
    await db.report_assignments.insert_one(doc)
    # Strip MongoDB-injected `_id` AND internal datetime field from response.
    out = {k: v for k, v in doc.items() if k not in ("_id", "assigned_at_dt")}
    return out


async def revoke_assignment(db, assignment_id: str, requester_user_id: str) -> Dict[str, Any]:
    """Soft-revoke (is_active=False) so audit history is preserved.
    Only the original `assigned_by` user may revoke.
    Raises ValueError on validation; the route turns these into HTTP errors.
    """
    if not assignment_id:
        raise ValueError("assignment_id is required")
    row = await db.report_assignments.find_one(
        {"id": assignment_id}, {"_id": 0}
    )
    if not row:
        raise ValueError("not_found")
    if not row.get("is_active", True):
        # Already revoked — idempotent.
        return {"message": "Already revoked", "id": assignment_id}
    if (row.get("assigned_by") or "") != (requester_user_id or ""):
        raise ValueError("forbidden")
    await db.report_assignments.update_one(
        {"id": assignment_id},
        {"$set": {"is_active": False, "revoked_at": _now_iso()}},
    )
    return {"message": "Assignment revoked", "id": assignment_id}


# ─────────────────────────────────────────────────────── Listing


async def get_my_assignments(db, user_id: str) -> List[Dict[str, Any]]:
    """All ACTIVE assignments where this user is the assignee."""
    if not user_id:
        return []
    cursor = db.report_assignments.find(
        {"assigned_to": user_id, "is_active": True},
        {"_id": 0, "assigned_at_dt": 0},
    ).sort("assigned_at_dt", -1)
    return await cursor.to_list(1000)


async def get_assignments_by_me(db, user_id: str) -> List[Dict[str, Any]]:
    """All assignments (active + revoked) that this user has made. Used
    by the 'Assigned by me' tab so owners can see who has what + revoke.
    """
    if not user_id:
        return []
    cursor = db.report_assignments.find(
        {"assigned_by": user_id},
        {"_id": 0, "assigned_at_dt": 0},
    ).sort("assigned_at_dt", -1)
    return await cursor.to_list(2000)


# ─────────────────────────────────────────────────────── Access check


async def check_assignment_access(
    db, *, user_id: str, session_id: Optional[str] = None,
    client_id: Optional[str] = None,
    report_type: Optional[str] = None,
    cycle_day: Optional[int] = None,
) -> Dict[str, Any]:
    """The single source of truth for "can this user view / edit this
    report?".

    Returns a dict:
      {
        "has_access": bool,          # may VIEW the report?
        "can_edit_reco": bool,       # may EDIT reco_qty in this report?
        "can_edit_all": bool,        # may edit barcode/article/days?
        "is_owner": bool,            # owner of the client?
        "assignment_id": str | None, # the matching assignment row, if any
      }

    Edit rules (per spec):
      • Owner → can_edit_all=True (everything)
      • Assignee → can_edit_reco only on detailed report (not bin-wise,
                                       not barcode-wise, not article-wise)
                   can_edit_all=False
    """
    out = {
        "has_access": False, "can_edit_reco": False, "can_edit_all": False,
        "is_owner": False, "assignment_id": None,
    }
    if not user_id:
        return out

    # Resolve client_id from session if not supplied
    if not client_id and session_id:
        client_id = await _resolve_client_id_from_session(db, session_id)

    if client_id and await _is_owner(db, user_id, client_id):
        out.update({
            "has_access": True, "can_edit_reco": True,
            "can_edit_all": True, "is_owner": True,
        })
        return out

    # Not owner — look up an active assignment.
    q: Dict[str, Any] = {"assigned_to": user_id, "is_active": True}
    if session_id:
        q["session_id"] = session_id
    # Match the *most specific* assignment first (cycle_day if given).
    cursor = db.report_assignments.find(q, {"_id": 0}).sort("assigned_at_dt", -1)
    rows = await cursor.to_list(50)
    if not rows:
        return out

    rt_norm = _normalize_report_type(report_type or "")

    for row in rows:
        # Cycle-day scoping: if assignment has a cycle_day, the caller
        # must match it (or omit cycle_day for VIEW-level checks like
        # listing).
        a_day = row.get("cycle_day")
        if a_day is not None and cycle_day is not None and int(a_day) != int(cycle_day):
            continue

        atype = row.get("assignment_type") or FULL_SESSION
        if atype == FULL_SESSION:
            out["has_access"] = True
        elif atype == SPECIFIC_REPORTS:
            rts = [_normalize_report_type(r) for r in (row.get("report_types") or [])]
            # If caller didn't pass a report_type, treat as a VIEW-level
            # check (the user has access to *some* report → return True).
            if not rt_norm:
                out["has_access"] = bool(rts)
            else:
                out["has_access"] = rt_norm in rts
        if out["has_access"]:
            out["assignment_id"] = row["id"]
            # Reco-edit gate: ONLY in detailed report. Callers that omit
            # report_type get can_edit_reco=False (must be explicit).
            out["can_edit_reco"] = (rt_norm == "detailed")
            # Assignees can NEVER edit barcode/article/days.
            out["can_edit_all"] = False
            return out

    return out


# ─────────────────────────────────────────────────────── Migration


async def migrate_clients_created_by(db, fallback_user_id: str) -> int:
    """Set `created_by` on any client that doesn't have one. Idempotent.
    Used during server startup so existing clients get attributed to the
    default admin user before the assignment feature gates on it.
    """
    if not fallback_user_id:
        return 0
    try:
        r = await db.clients.update_many(
            {"$or": [{"created_by": {"$exists": False}}, {"created_by": ""}]},
            {"$set": {"created_by": fallback_user_id}},
        )
        return r.modified_count
    except Exception as e:
        logger.warning(f"clients.created_by migration skipped: {e}")
        return 0
