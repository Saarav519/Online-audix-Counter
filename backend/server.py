from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import ValidationError
import os
import logging
import uuid
import json
import math
from pathlib import Path
from datetime import datetime, timezone
from typing import Any


class SafeJSONEncoder(json.JSONEncoder):
    """JSON encoder that handles NaN, Infinity, -Infinity and ObjectId safely"""
    def default(self, obj):
        # Handle ObjectId
        if hasattr(obj, '__str__') and type(obj).__name__ == 'ObjectId':
            return str(obj)
        return super().default(obj)

    def encode(self, o):
        sanitized = _deep_sanitize(o)
        return super().encode(sanitized)


def _deep_sanitize(obj):
    """Recursively sanitize any data structure to be JSON-safe"""
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return 0.0
        return obj
    elif isinstance(obj, dict):
        return {k: _deep_sanitize(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple)):
        return [_deep_sanitize(item) for item in obj]
    return obj


class SafeJSONResponse(JSONResponse):
    """JSONResponse that handles NaN/Infinity float values safely"""
    def render(self, content: Any) -> bytes:
        sanitized = _deep_sanitize(content)
        return json.dumps(
            sanitized,
            ensure_ascii=False,
            allow_nan=False,
            separators=(",", ":"),
        ).encode("utf-8")

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env', override=False)

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Create the main app with SafeJSONResponse (handles NaN/Infinity in ALL responses)
app = FastAPI(title="Audix Data Management API", default_response_class=SafeJSONResponse)


# Global exception handler for Pydantic validation errors (prevents 500 on old data)
@app.exception_handler(ValidationError)
async def validation_exception_handler(request: Request, exc: ValidationError):
    logger.warning(f"Pydantic validation error on {request.url.path}: {exc.error_count()} errors")
    return JSONResponse(status_code=422, content={"detail": "Data validation error", "errors": str(exc)})


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    import traceback
    tb = traceback.format_exc()
    logger.error(f"Unhandled error on {request.url.path}: {tb}")
    return JSONResponse(status_code=500, content={"detail": f"Internal server error: {type(exc).__name__}: {str(exc)[:500]}"})


# Root-level health check for Kubernetes (without /api prefix)
@app.get("/health")
@app.get("/healthz")
async def health_check():
    """Health check endpoint for Kubernetes deployment"""
    return {"status": "healthy", "service": "audix-backend"}


# Import and include Audit Management routes
from audit_routes import audit_api_router, audit_portal_router, audit_sync_router

# Include Audit Management routers
app.include_router(audit_api_router, prefix="/api", tags=["Audit - General"])
app.include_router(audit_portal_router, prefix="/api/audit/portal", tags=["Audit - Portal"])
app.include_router(audit_sync_router, prefix="/api/audit/sync", tags=["Audit - Sync"])


# Serve uploaded files
@app.get("/api/uploads/{file_path:path}")
async def serve_upload(file_path: str):
    full_path = f"/app/backend/uploads/{file_path}"
    if os.path.exists(full_path):
        ext = Path(full_path).suffix.lower()
        media_map = {
            ".html": "text/html", ".pdf": "application/pdf",
            ".csv": "text/csv", ".png": "image/png",
            ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        }
        mt = media_map.get(ext)
        inline_exts = {".html", ".pdf", ".png", ".jpg", ".jpeg"}
        disp = "inline" if ext in inline_exts else "attachment"
        if mt:
            return FileResponse(full_path, media_type=mt, content_disposition_type=disp)
        return FileResponse(full_path)
    return {"error": "File not found"}


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# GZip large responses (reduces 18k-row JSON from ~5MB to ~500KB)
app.add_middleware(GZipMiddleware, minimum_size=1000)


@app.on_event("startup")
async def startup():
    # Create uploads directory
    os.makedirs("/app/backend/uploads", exist_ok=True)
    logger.info("Server started - Audix Data Management API")
    # Ensure audit portal admin user exists (non-destructive, production-safe)
    admin_exists = await db.portal_users.find_one({"username": "admin"})
    if not admin_exists:
        from audit_routes import hash_password
        admin_user = {
            "id": str(uuid.uuid4()),
            "username": "admin",
            "password_hash": hash_password("admin123"),
            "role": "admin",
            "is_active": True,
            "is_approved": True,
            "last_login": None,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.portal_users.insert_one(admin_user)
        logger.info("Created audit portal admin user")
    # Create indexes for performance (non-destructive)
    await create_indexes()


async def create_indexes():
    """Create MongoDB indexes for faster queries on reports and sync."""
    try:
        await db.expected_stock.create_index("session_id")
        await db.expected_stock.create_index([("session_id", 1), ("barcode", 1)])
        await db.expected_stock.create_index([("session_id", 1), ("location", 1)])
        await db.synced_locations.create_index("session_id")
        await db.synced_locations.create_index([("session_id", 1), ("location_name", 1)])
        await db.synced_locations.create_index("batch_id")
        await db.sync_inbox.create_index("session_id")
        await db.sync_inbox.create_index([("session_id", 1), ("status", 1)])
        await db.sync_raw_logs.create_index("session_id")
        await db.sync_raw_logs.create_index("batch_id")
        await db.conflict_locations.create_index("session_id")
        await db.conflict_locations.create_index([("session_id", 1), ("status", 1)])
        await db.audit_sessions.create_index("id")
        await db.audit_sessions.create_index("client_id")
        await db.audit_sessions.create_index("status")
        await db.devices.create_index("id")
        await db.devices.create_index("device_name")
        await db.devices.create_index("is_active")
        await db.master_products.create_index("client_id")
        await db.master_products.create_index([("client_id", 1), ("barcode", 1)])
        await db.clients.create_index("is_active")
        await db.clients.create_index("id")
        await db.clients.create_index("code")
        await db.portal_users.create_index("username")
        await db.portal_users.create_index("id")
        await db.portal_users.create_index("is_approved")
        await db.synced_locations.create_index("is_empty")
        await db.synced_locations.create_index([("synced_at", -1)])
        await db.conflict_locations.create_index("status")
        await db.sync_raw_logs.create_index([("client_id", 1), ("synced_at", -1)])
        await db.barcode_edits.create_index([("client_id", 1), ("is_active", 1)])
        await db.location_master.create_index([("client_id", 1)])
        await db.location_master.create_index([("client_id", 1), ("location_code", 1)])
        await db.file_uploads.create_index("file_id", unique=True)
        logger.info("MongoDB indexes created successfully")
    except Exception as e:
        logger.warning(f"Index creation warning: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
