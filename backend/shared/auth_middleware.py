"""
Auth middleware — shared across audit_routes.py + cycle_count_routes.py
for the admin / supervisor role system.

This codebase uses localStorage-based session attribution (no JWT). The
frontend stores the logged-in user in `auditPortalUser` / `portalUser`
and sends the identity on every state-changing call via:

    X-User-Id:   <portal_users.id>
    X-Username:  <portal_users.username>

These middleware helpers wrap that pattern so route handlers can simply
do:

    user = await get_current_user(request, db)   # → dict or HTTPException(401)
    require_admin(user)                          # → HTTPException(403) if not admin

Roles after the prompt-3 migration:
    • "admin"      — full access (incl. user approval / role changes /
                     toggle-active / delete)
    • "supervisor" — full data access, NO user-approval actions

Legacy roles ("viewer") are migrated to "supervisor" by
`migrate_legacy_roles()` at server startup.
"""
from __future__ import annotations

from typing import Any, Dict, Optional
from fastapi import HTTPException, Request

ADMIN_ROLE = "admin"
SUPERVISOR_ROLE = "supervisor"
VALID_ROLES = {ADMIN_ROLE, SUPERVISOR_ROLE}


def _read_identity(request: Optional[Request]) -> Dict[str, str]:
    """Extract X-User-Id / X-Username headers (best-effort, never raises)."""
    if request is None:
        return {"user_id": "", "username": ""}
    try:
        return {
            "user_id": request.headers.get("x-user-id", "") or "",
            "username": request.headers.get("x-username", "") or "",
        }
    except Exception:
        return {"user_id": "", "username": ""}


async def get_current_user(request: Request, db) -> Dict[str, Any]:
    """Resolve the currently-logged-in portal user from the request
    headers and load the full row from MongoDB.

    Raises HTTPException(401) when:
      • No X-User-Id header was sent
      • The id doesn't match any portal_users row
      • The user is disabled (is_active == False) — treat as logged-out
      • The user is unapproved (is_approved == False)
    """
    ident = _read_identity(request)
    uid = ident["user_id"]
    if not uid:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = await db.portal_users.find_one(
        {"id": uid}, {"_id": 0, "password_hash": 0}
    )
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Account disabled")
    if not user.get("is_approved", True):
        raise HTTPException(status_code=403, detail="Account pending approval")
    return user


def require_admin(user: Dict[str, Any]) -> None:
    """Raise HTTPException(403) if `user` is not an admin. Use as the
    last line of an endpoint after `get_current_user`."""
    if not user or user.get("role") != ADMIN_ROLE:
        raise HTTPException(
            status_code=403,
            detail="This action is restricted to admin users.",
        )


async def get_user_role(user_id: str, db) -> Optional[str]:
    """Quick role lookup — returns the role string or None if not found.
    Used by code paths that need a single piece of info without raising.
    """
    if not user_id:
        return None
    try:
        u = await db.portal_users.find_one(
            {"id": user_id}, {"_id": 0, "role": 1}
        )
        return (u or {}).get("role")
    except Exception:
        return None


async def migrate_legacy_roles(db) -> Dict[str, int]:
    """Idempotent migration:
      • Any row with no `role` field → "supervisor"
      • Any row with role == "viewer"  → "supervisor"
      • The seeded `admin` username remains role="admin" (untouched)
    Runs at server startup. Safe to call multiple times.
    """
    stats = {"viewer_to_supervisor": 0, "missing_to_supervisor": 0}
    try:
        r1 = await db.portal_users.update_many(
            {"role": "viewer"}, {"$set": {"role": SUPERVISOR_ROLE}}
        )
        stats["viewer_to_supervisor"] = r1.modified_count
        r2 = await db.portal_users.update_many(
            {"role": {"$exists": False}}, {"$set": {"role": SUPERVISOR_ROLE}}
        )
        stats["missing_to_supervisor"] = r2.modified_count
        # Ensure the seeded admin username is always role=admin (idempotent).
        await db.portal_users.update_one(
            {"username": "admin"}, {"$set": {"role": ADMIN_ROLE}}
        )
    except Exception:
        # Migration failures should never block server startup.
        pass
    return stats
