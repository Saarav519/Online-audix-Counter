from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import hashlib
import csv
import io
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app
app = FastAPI(title="Audix Stock Management API")

# Create routers
api_router = APIRouter(prefix="/api")
portal_router = APIRouter(prefix="/api/portal")
sync_router = APIRouter(prefix="/api/sync")

security = HTTPBasic()

# ==================== MODELS ====================

# Portal User Model
class PortalUser(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    username: str
    password_hash: str
    role: str = "viewer"  # admin, viewer
    is_active: bool = True
    is_approved: bool = False  # New users need admin approval
    last_login: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class PortalUserCreate(BaseModel):
    username: str
    password: str
    role: str = "viewer"

class PortalUserLogin(BaseModel):
    username: str
    password: str

# Client Model
class Client(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    code: str  # Short code for client
    client_type: str = "store"  # "warehouse" or "store"
    address: Optional[str] = None
    contact_person: Optional[str] = None
    contact_phone: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_active: bool = True
    master_imported: bool = False
    master_product_count: int = 0
    stock_imported: bool = False
    stock_record_count: int = 0

class ClientCreate(BaseModel):
    name: str
    code: str
    client_type: str = "store"
    address: Optional[str] = None
    contact_person: Optional[str] = None
    contact_phone: Optional[str] = None

# Audit Session Model
class AuditSession(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_id: str
    name: str  # e.g., "July 2026 Stock Count"
    variance_mode: str = "bin-wise"  # bin-wise, barcode-wise, article-wise
    start_date: datetime
    end_date: Optional[datetime] = None
    status: str = "active"  # active, completed, archived
    expected_stock_imported: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class AuditSessionCreate(BaseModel):
    client_id: str
    name: str
    variance_mode: str = "bin-wise"  # bin-wise, barcode-wise, article-wise
    start_date: datetime
    end_date: Optional[datetime] = None

# Expected Stock Model (imported by admin)
class ExpectedStock(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str
    location: str = ""
    barcode: str
    description: str = ""
    category: str = ""
    article_code: str = ""
    article_name: str = ""
    mrp: float = 0
    cost: float = 0
    qty: float = 0
    imported_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Master Product Model (imported at client level - product catalog)
class MasterProduct(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_id: str
    barcode: str
    description: str = ""
    category: str = ""
    article_code: str = ""
    article_name: str = ""
    mrp: float = 0
    cost: float = 0
    imported_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Device Model
class Device(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    device_name: str
    client_id: Optional[str] = None
    session_id: Optional[str] = None
    last_sync_at: Optional[datetime] = None
    sync_password_hash: str = ""
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class DeviceRegister(BaseModel):
    device_name: str
    sync_password: str

class DeviceUpdate(BaseModel):
    client_id: Optional[str] = None
    session_id: Optional[str] = None

# Synced Data Models
class SyncedItem(BaseModel):
    barcode: str
    product_name: Optional[str] = None
    price: Optional[float] = None
    quantity: float
    scanned_at: str

class SyncedLocation(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str
    device_id: str
    device_name: str
    location_id: str
    location_name: str
    items: List[SyncedItem]
    total_items: int
    total_quantity: float
    is_empty: bool = False
    empty_remarks: str = ""
    synced_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    sync_date: str  # Date string for grouping (YYYY-MM-DD)

class SyncRequest(BaseModel):
    device_name: str
    sync_password: str
    client_id: str
    session_id: str
    locations: List[Dict[str, Any]]
    clear_after_sync: bool = False

class SyncChunkRequest(BaseModel):
    batch_id: str
    device_name: str
    sync_password: str
    client_id: str
    session_id: str
    chunk_index: int
    total_chunks: int
    locations: List[Dict[str, Any]]

class SyncFinalizeRequest(BaseModel):
    batch_id: str
    device_name: str
    sync_password: str
    client_id: str
    session_id: str
    total_locations: int

# Alert Model
class Alert(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_id: str
    session_id: str
    alert_type: str  # variance_high, sync_issue, device_inactive
    message: str
    severity: str = "warning"  # info, warning, critical
    is_read: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Settings Model
class PortalSettings(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = "portal_settings"
    variance_threshold_percent: float = 5.0
    device_inactive_hours: int = 2
    auto_generate_alerts: bool = True

# Status Check (existing)
class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StatusCheckCreate(BaseModel):
    client_name: str

# Reconciliation Adjustment Model
class RecoAdjustmentCreate(BaseModel):
    client_id: str
    reco_type: str  # "detailed" (loc+barcode), "barcode", "article"
    barcode: str = ""
    location: str = ""
    article_code: str = ""
    reco_qty: float

# ==================== HELPER FUNCTIONS ====================

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def verify_password(password: str, password_hash: str) -> bool:
    return hash_password(password) == password_hash

async def get_current_portal_user(credentials: HTTPBasicCredentials = Depends(security)):
    user = await db.portal_users.find_one({"username": credentials.username}, {"_id": 0})
    if not user or not verify_password(credentials.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return user

# ==================== EXISTING API ROUTES ====================

@api_router.get("/")
async def root():
    return {"message": "Hello World"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.model_dump()
    status_obj = StatusCheck(**status_dict)
    doc = status_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    await db.status_checks.insert_one(doc)
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    for check in status_checks:
        if isinstance(check['timestamp'], str):
            check['timestamp'] = datetime.fromisoformat(check['timestamp'])
    return status_checks

# ==================== PORTAL AUTH ROUTES ====================

@portal_router.post("/register")
async def register_portal_user(user: PortalUserCreate):
    # Check if user exists
    existing = await db.portal_users.find_one({"username": user.username})
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    portal_user = PortalUser(
        username=user.username,
        password_hash=hash_password(user.password),
        role="viewer",  # All new registrations are viewers by default
        is_active=True,
        is_approved=False  # Needs admin approval
    )
    doc = portal_user.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.portal_users.insert_one(doc)
    
    return {"message": "Registration successful! Your account is pending admin approval.", "user_id": portal_user.id}

@portal_router.post("/login")
async def login_portal_user(credentials: PortalUserLogin):
    user = await db.portal_users.find_one({"username": credentials.username}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if not verify_password(credentials.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Check if user is active
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Your account has been disabled. Contact admin.")
    
    # Check if user is approved
    if not user.get("is_approved", True):
        raise HTTPException(status_code=403, detail="Your account is pending admin approval.")
    
    # Update last_login
    now = datetime.now(timezone.utc).isoformat()
    await db.portal_users.update_one(
        {"id": user["id"]},
        {"$set": {"last_login": now}}
    )
    
    return {
        "message": "Login successful",
        "user": {
            "id": user["id"],
            "username": user["username"],
            "role": user["role"]
        }
    }

# ==================== PASSWORD RESET ====================

class PasswordResetRequest(BaseModel):
    username: str
    new_password: str

@portal_router.post("/reset-password")
async def reset_password(request: PasswordResetRequest):
    """Public endpoint - reset password by username"""
    user = await db.portal_users.find_one({"username": request.username}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Username not found")
    
    if len(request.new_password) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters")
    
    await db.portal_users.update_one(
        {"username": request.username},
        {"$set": {"password_hash": hash_password(request.new_password)}}
    )
    
    return {"message": "Password reset successful. You can now login with your new password."}

# ==================== USER MANAGEMENT ROUTES ====================

@portal_router.get("/users")
async def get_portal_users():
    """List all registered portal users (admin only)"""
    users = await db.portal_users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return users

@portal_router.put("/users/{user_id}/approve")
async def approve_user(user_id: str):
    """Approve a pending user"""
    result = await db.portal_users.update_one(
        {"id": user_id},
        {"$set": {"is_approved": True}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User approved successfully"}

@portal_router.put("/users/{user_id}/reject")
async def reject_user(user_id: str):
    """Reject/unapprove a user"""
    result = await db.portal_users.update_one(
        {"id": user_id},
        {"$set": {"is_approved": False}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User rejected"}

@portal_router.put("/users/{user_id}/toggle-active")
async def toggle_user_active(user_id: str):
    """Enable/disable a user"""
    user = await db.portal_users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    new_status = not user.get("is_active", True)
    await db.portal_users.update_one(
        {"id": user_id},
        {"$set": {"is_active": new_status}}
    )
    return {"message": f"User {'enabled' if new_status else 'disabled'}", "is_active": new_status}

@portal_router.put("/users/{user_id}/role")
async def change_user_role(user_id: str, role_data: dict):
    """Change user role (admin/viewer)"""
    role = role_data.get("role", "viewer")
    if role not in ["admin", "viewer"]:
        raise HTTPException(status_code=400, detail="Role must be 'admin' or 'viewer'")
    
    result = await db.portal_users.update_one(
        {"id": user_id},
        {"$set": {"role": role}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": f"User role changed to {role}"}

@portal_router.delete("/users/{user_id}")
async def delete_portal_user(user_id: str):
    """Delete a portal user"""
    user = await db.portal_users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.get("username") == "admin":
        raise HTTPException(status_code=400, detail="Cannot delete the default admin user")
    
    await db.portal_users.delete_one({"id": user_id})
    return {"message": "User deleted successfully"}

# ==================== CLIENT SCHEMA ROUTES ====================

STANDARD_MASTER_FIELDS = [
    {"name": "barcode", "label": "Barcode", "type": "text", "required": True, "is_standard": True},
    {"name": "description", "label": "Description", "type": "text", "required": False, "is_standard": True},
    {"name": "category", "label": "Category", "type": "text", "required": False, "is_standard": True},
    {"name": "mrp", "label": "MRP", "type": "number", "required": False, "is_standard": True},
    {"name": "cost", "label": "Cost", "type": "number", "required": False, "is_standard": True},
    {"name": "article_code", "label": "Article Code", "type": "text", "required": False, "is_standard": True},
    {"name": "article_name", "label": "Article Name", "type": "text", "required": False, "is_standard": True},
]

COMMON_OPTIONAL_FIELDS = [
    {"name": "colour", "label": "Colour", "type": "text", "required": False, "is_standard": True},
    {"name": "size", "label": "Size", "type": "text", "required": False, "is_standard": True},
    {"name": "department", "label": "Department", "type": "text", "required": False, "is_standard": True},
    {"name": "brand", "label": "Brand", "type": "text", "required": False, "is_standard": True},
    {"name": "season", "label": "Season", "type": "text", "required": False, "is_standard": True},
    {"name": "hsn_code", "label": "HSN Code", "type": "text", "required": False, "is_standard": True},
]

STANDARD_MASTER_FIELD_NAMES = {"barcode", "description", "category", "mrp", "cost", "article_code", "article_name"}

class SchemaField(BaseModel):
    name: str
    label: str
    type: str = "text"
    required: bool = False
    is_standard: bool = True
    enabled: bool = True

class ClientSchemaRequest(BaseModel):
    fields: List[Dict[str, Any]]

@portal_router.get("/clients/{client_id}/schema")
async def get_client_schema(client_id: str):
    """Get the master/stock schema for a client. Returns default if none set."""
    schema = await db.client_schemas.find_one({"client_id": client_id}, {"_id": 0})
    if schema:
        return schema
    # Return default schema
    default_fields = [{"enabled": True, **f} for f in STANDARD_MASTER_FIELDS]
    for f in COMMON_OPTIONAL_FIELDS:
        default_fields.append({"enabled": False, **f})
    return {
        "client_id": client_id,
        "fields": default_fields,
        "is_default": True
    }

@portal_router.post("/clients/{client_id}/schema")
async def save_client_schema(client_id: str, req: ClientSchemaRequest):
    """Save the master/stock schema for a client."""
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    doc = {
        "client_id": client_id,
        "fields": req.fields,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "is_default": False
    }
    await db.client_schemas.update_one(
        {"client_id": client_id}, {"$set": doc}, upsert=True
    )
    return {"message": "Schema saved", "field_count": len(req.fields)}

@portal_router.get("/clients/{client_id}/schema/template")
async def download_schema_template(client_id: str, template_type: str = "master"):
    """Download a CSV template based on the client's schema."""
    schema = await db.client_schemas.find_one({"client_id": client_id}, {"_id": 0})
    if not schema:
        # Use default
        enabled_fields = [f["name"] for f in STANDARD_MASTER_FIELDS]
    else:
        enabled_fields = [f["name"] for f in schema["fields"] if f.get("enabled", True)]

    headers = [f.replace("_", " ").title() for f in enabled_fields]
    if template_type == "stock":
        # Stock template adds Location (for bin-wise) and Qty
        if "location" not in enabled_fields:
            headers = ["Location"] + headers
        headers.append("Qty")

    csv_content = ",".join(headers) + "\n"
    filename = f"template_{template_type}_{client_id[:8]}.csv"

    return StreamingResponse(
        iter([csv_content]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

# ==================== CLIENT ROUTES ====================

@portal_router.get("/clients")
async def get_clients():
    clients = await db.clients.find({}, {"_id": 0}).to_list(1000)
    return clients

@portal_router.post("/clients")
async def create_client(client: ClientCreate):
    # Check if code exists
    existing = await db.clients.find_one({"code": client.code})
    if existing:
        raise HTTPException(status_code=400, detail="Client code already exists")
    
    new_client = Client(**client.model_dump())
    doc = new_client.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.clients.insert_one(doc)
    
    # Return the client data without MongoDB's _id field
    return {"message": "Client created", "client": new_client.model_dump()}

@portal_router.get("/clients/{client_id}")
async def get_client(client_id: str):
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return client

@portal_router.put("/clients/{client_id}")
async def update_client(client_id: str, client: ClientCreate):
    result = await db.clients.update_one(
        {"id": client_id},
        {"$set": client.model_dump()}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Client not found")
    return {"message": "Client updated"}

@portal_router.delete("/clients/{client_id}")
async def delete_client(client_id: str):
    """Delete client and ALL related data (cascading delete)"""
    result = await db.clients.delete_one({"id": client_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Get all session IDs for this client (needed for session-level data cleanup)
    sessions = await db.audit_sessions.find({"client_id": client_id}, {"id": 1, "_id": 0}).to_list(100000)
    session_ids = [s["id"] for s in sessions]
    
    # Cascading delete — remove ALL related data
    deleted_summary = {}
    
    # 1. Master products
    r = await db.master_products.delete_many({"client_id": client_id})
    deleted_summary["master_products"] = r.deleted_count
    
    # 2. Expected stock for all sessions of this client
    if session_ids:
        r = await db.expected_stock.delete_many({"session_id": {"$in": session_ids}})
        deleted_summary["expected_stock"] = r.deleted_count
    
    # 3. Synced locations for all sessions of this client
    if session_ids:
        r = await db.synced_locations.delete_many({"session_id": {"$in": session_ids}})
        deleted_summary["synced_locations"] = r.deleted_count
    
    # 4. Sync raw logs for this client
    r = await db.sync_raw_logs.delete_many({"client_id": client_id})
    deleted_summary["sync_raw_logs"] = r.deleted_count
    
    # 5. Audit sessions for this client
    r = await db.audit_sessions.delete_many({"client_id": client_id})
    deleted_summary["audit_sessions"] = r.deleted_count
    
    # 6. Alerts for this client
    r = await db.alerts.delete_many({"client_id": client_id})
    deleted_summary["alerts"] = r.deleted_count
    
    return {
        "message": "Client and all related data deleted",
        "deleted": deleted_summary
    }

# ==================== MASTER PRODUCT ROUTES (Client-Level) ====================

@portal_router.post("/clients/{client_id}/import-master")
async def import_master_products(client_id: str, file: UploadFile = File(...)):
    """Import product master catalog CSV at client level. Replaces existing master on re-upload.
    Supports dynamic schema: extra fields defined in client schema are stored in custom_fields."""
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Get client schema for dynamic fields
    schema = await db.client_schemas.find_one({"client_id": client_id}, {"_id": 0})
    extra_field_names = []
    if schema:
        for f in schema.get("fields", []):
            if f.get("enabled", True) and f["name"] not in STANDARD_MASTER_FIELD_NAMES:
                extra_field_names.append(f["name"])
    
    content = await file.read()
    decoded = content.decode('utf-8')
    reader = csv.DictReader(io.StringIO(decoded))
    
    await db.master_products.delete_many({"client_id": client_id})
    
    records = []
    for row in reader:
        norm_row = {k.strip().lower().replace(' ', '_'): v.strip() for k, v in row.items()}
        
        barcode = norm_row.get('barcode', '')
        if not barcode:
            continue
        
        master = MasterProduct(
            client_id=client_id,
            barcode=barcode,
            description=norm_row.get('description', norm_row.get('product_name', '')),
            category=norm_row.get('category', ''),
            article_code=norm_row.get('article_code', ''),
            article_name=norm_row.get('article_name', ''),
            mrp=float(norm_row.get('mrp', 0) or 0),
            cost=float(norm_row.get('cost', 0) or 0),
        )
        doc = master.model_dump()
        doc['imported_at'] = doc['imported_at'].isoformat()
        
        # Extract extra/custom fields from schema
        custom_fields = {}
        for fn in extra_field_names:
            val = norm_row.get(fn, '')
            if val:
                custom_fields[fn] = val
        if custom_fields:
            doc['custom_fields'] = custom_fields
        
        records.append(doc)
    
    if records:
        await db.master_products.insert_many(records)
    
    await db.clients.update_one(
        {"id": client_id},
        {"$set": {"master_imported": True, "master_product_count": len(records)}}
    )
    
    return {
        "message": f"Imported {len(records)} master products",
        "product_count": len(records),
        "extra_fields": len(extra_field_names)
    }

@portal_router.get("/clients/{client_id}/master-products")
async def get_master_products(client_id: str, limit: int = 1000, skip: int = 0):
    """Get master products for a client with pagination"""
    total = await db.master_products.count_documents({"client_id": client_id})
    records = await db.master_products.find(
        {"client_id": client_id}, {"_id": 0}
    ).skip(skip).limit(limit).to_list(limit)
    extra_columns = await _get_extra_columns_for_client(client_id)
    
    return {
        "products": records,
        "total": total,
        "limit": limit,
        "skip": skip,
        "extra_columns": extra_columns
    }

@portal_router.get("/clients/{client_id}/master-products/stats")
async def get_master_product_stats(client_id: str):
    """Get master product statistics for a client"""
    total = await db.master_products.count_documents({"client_id": client_id})
    
    # Get unique categories
    categories = await db.master_products.distinct("category", {"client_id": client_id})
    categories = [c for c in categories if c]  # Remove empty
    
    # Get unique article codes
    article_codes = await db.master_products.distinct("article_code", {"client_id": client_id})
    article_codes = [a for a in article_codes if a]  # Remove empty
    
    return {
        "total_products": total,
        "unique_categories": len(categories),
        "categories": categories,
        "unique_articles": len(article_codes),
        "article_codes_count": len(article_codes)
    }

@portal_router.delete("/clients/{client_id}/master-products")
async def clear_master_products(client_id: str):
    """Clear all master products for a client"""
    result = await db.master_products.delete_many({"client_id": client_id})
    
    # Update client flag
    await db.clients.update_one(
        {"id": client_id},
        {"$set": {"master_imported": False, "master_product_count": 0}}
    )
    
    return {
        "message": f"Cleared {result.deleted_count} master products",
        "deleted_count": result.deleted_count
    }

# ==================== CLIENT-LEVEL STOCK (WAREHOUSE) ROUTES ====================

@portal_router.post("/clients/{client_id}/import-stock")
async def import_client_stock(client_id: str, file: UploadFile = File(...)):
    """Import stock at client level (for warehouse clients). Replaces existing stock on re-upload."""
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Get client schema for dynamic fields
    schema = await db.client_schemas.find_one({"client_id": client_id}, {"_id": 0})
    extra_field_names = []
    if schema:
        for f in schema.get("fields", []):
            if f.get("enabled", True) and f["name"] not in STANDARD_MASTER_FIELD_NAMES and f["name"] not in ("location", "qty"):
                extra_field_names.append(f["name"])
    
    content = await file.read()
    decoded = content.decode('utf-8')
    reader = csv.DictReader(io.StringIO(decoded))
    
    await db.client_stock.delete_many({"client_id": client_id})
    
    records = []
    for row in reader:
        norm_row = {k.strip().lower().replace(' ', '_'): v.strip() for k, v in row.items()}
        
        barcode = norm_row.get('barcode', '')
        if not barcode:
            continue
        
        record = {
            "client_id": client_id,
            "location": norm_row.get('location', ''),
            "barcode": barcode,
            "description": norm_row.get('description', ''),
            "category": norm_row.get('category', ''),
            "article_code": norm_row.get('article_code', ''),
            "article_name": norm_row.get('article_name', ''),
            "mrp": float(norm_row.get('mrp', 0) or 0),
            "cost": float(norm_row.get('cost', 0) or 0),
            "qty": float(norm_row.get('qty', 0) or 0),
            "imported_at": datetime.now(timezone.utc).isoformat()
        }
        
        custom_fields = {}
        for fn in extra_field_names:
            val = norm_row.get(fn, '')
            if val:
                custom_fields[fn] = val
        if custom_fields:
            record['custom_fields'] = custom_fields
        
        records.append(record)
    
    if records:
        await db.client_stock.insert_many(records)
    
    await db.clients.update_one(
        {"id": client_id},
        {"$set": {"stock_imported": True, "stock_record_count": len(records)}}
    )
    
    return {
        "message": f"Imported {len(records)} stock records",
        "record_count": len(records),
        "extra_fields": len(extra_field_names)
    }

@portal_router.get("/clients/{client_id}/stock")
async def get_client_stock(client_id: str, limit: int = 1000, skip: int = 0):
    """Get client-level stock with pagination"""
    total = await db.client_stock.count_documents({"client_id": client_id})
    records = await db.client_stock.find(
        {"client_id": client_id}, {"_id": 0}
    ).skip(skip).limit(limit).to_list(limit)
    extra_columns = await _get_extra_columns_for_client(client_id)
    
    return {
        "records": records,
        "total": total,
        "limit": limit,
        "skip": skip,
        "extra_columns": extra_columns
    }

@portal_router.get("/clients/{client_id}/stock/stats")
async def get_client_stock_stats(client_id: str):
    """Get client-level stock statistics"""
    total = await db.client_stock.count_documents({"client_id": client_id})
    locations = await db.client_stock.distinct("location", {"client_id": client_id})
    return {
        "total_records": total,
        "unique_locations": len([l for l in locations if l]),
        "locations": [l for l in sorted(locations) if l][:20]
    }

@portal_router.delete("/clients/{client_id}/stock")
async def clear_client_stock(client_id: str):
    """Clear all client-level stock"""
    result = await db.client_stock.delete_many({"client_id": client_id})
    await db.clients.update_one(
        {"id": client_id},
        {"$set": {"stock_imported": False, "stock_record_count": 0}}
    )
    return {
        "message": f"Cleared {result.deleted_count} stock records",
        "deleted_count": result.deleted_count
    }

# ==================== AUDIT SESSION ROUTES ====================

@portal_router.get("/sessions")
async def get_sessions(client_id: Optional[str] = None):
    query = {}
    if client_id:
        query["client_id"] = client_id
    sessions = await db.audit_sessions.find(query, {"_id": 0}).to_list(1000)
    return sessions

@portal_router.post("/sessions")
async def create_session(session: AuditSessionCreate):
    # Verify client exists
    client = await db.clients.find_one({"id": session.client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    new_session = AuditSession(**session.model_dump())
    doc = new_session.model_dump()
    doc['start_date'] = doc['start_date'].isoformat()
    if doc['end_date']:
        doc['end_date'] = doc['end_date'].isoformat()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.audit_sessions.insert_one(doc)
    
    return {"message": "Session created", "session": new_session.model_dump()}

@portal_router.get("/sessions/{session_id}")
async def get_session(session_id: str):
    session = await db.audit_sessions.find_one({"id": session_id}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session

@portal_router.put("/sessions/{session_id}/status")
async def update_session_status(session_id: str, status: str):
    if status not in ["active", "completed", "archived"]:
        raise HTTPException(status_code=400, detail="Invalid status")
    
    result = await db.audit_sessions.update_one(
        {"id": session_id},
        {"$set": {"status": status}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"message": f"Session status updated to {status}"}

@portal_router.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    # Delete all related data first
    await db.expected_stock.delete_many({"session_id": session_id})
    await db.synced_locations.delete_many({"session_id": session_id})
    await db.alerts.delete_many({"session_id": session_id})
    
    # Delete the session
    result = await db.audit_sessions.delete_one({"id": session_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"message": "Session and all related data deleted"}

@portal_router.post("/sessions/{session_id}/import-expected")
async def import_expected_stock(session_id: str, file: UploadFile = File(...)):
    session = await db.audit_sessions.find_one({"id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    variance_mode = session.get("variance_mode", "bin-wise")
    client_id = session.get("client_id", "")
    
    # Get client schema for dynamic fields
    schema = await db.client_schemas.find_one({"client_id": client_id}, {"_id": 0})
    extra_field_names = []
    if schema:
        for f in schema.get("fields", []):
            if f.get("enabled", True) and f["name"] not in STANDARD_MASTER_FIELD_NAMES and f["name"] not in ("location", "qty"):
                extra_field_names.append(f["name"])
    
    content = await file.read()
    decoded = content.decode('utf-8')
    reader = csv.DictReader(io.StringIO(decoded))
    
    await db.expected_stock.delete_many({"session_id": session_id})
    
    records = []
    for row in reader:
        norm_row = {k.strip().lower().replace(' ', '_'): v.strip() for k, v in row.items()}
        
        expected = ExpectedStock(
            session_id=session_id,
            location=norm_row.get('location', ''),
            barcode=norm_row.get('barcode', ''),
            description=norm_row.get('description', ''),
            category=norm_row.get('category', ''),
            article_code=norm_row.get('article_code', ''),
            article_name=norm_row.get('article_name', ''),
            mrp=float(norm_row.get('mrp', 0) or 0),
            cost=float(norm_row.get('cost', 0) or 0),
            qty=float(norm_row.get('qty', 0) or 0)
        )
        doc = expected.model_dump()
        doc['imported_at'] = doc['imported_at'].isoformat()
        
        # Extract extra/custom fields from schema
        custom_fields = {}
        for fn in extra_field_names:
            val = norm_row.get(fn, '')
            if val:
                custom_fields[fn] = val
        if custom_fields:
            doc['custom_fields'] = custom_fields
        
        records.append(doc)
    
    if records:
        await db.expected_stock.insert_many(records)
    
    await db.audit_sessions.update_one(
        {"id": session_id},
        {"$set": {"expected_stock_imported": True}}
    )
    
    return {
        "message": f"Imported {len(records)} expected stock records",
        "variance_mode": variance_mode,
        "record_count": len(records)
    }

@portal_router.get("/sessions/{session_id}/expected-stock")
async def get_expected_stock(session_id: str):
    records = await db.expected_stock.find({"session_id": session_id}, {"_id": 0}).to_list(100000)
    return records

# ==================== DEVICE ROUTES ====================

@portal_router.get("/devices")
async def get_devices():
    devices = await db.devices.find({}, {"_id": 0, "sync_password_hash": 0}).to_list(1000)
    return devices

@portal_router.post("/devices/register")
async def register_device(device: DeviceRegister):
    # Check if device exists
    existing = await db.devices.find_one({"device_name": device.device_name})
    if existing:
        # Update password
        await db.devices.update_one(
            {"device_name": device.device_name},
            {"$set": {"sync_password_hash": hash_password(device.sync_password)}}
        )
        return {"message": "Device updated", "device_id": existing["id"]}
    
    new_device = Device(
        device_name=device.device_name,
        sync_password_hash=hash_password(device.sync_password)
    )
    doc = new_device.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    if doc['last_sync_at']:
        doc['last_sync_at'] = doc['last_sync_at'].isoformat()
    await db.devices.insert_one(doc)
    
    return {"message": "Device registered", "device_id": new_device.id}

@portal_router.put("/devices/{device_id}")
async def update_device(device_id: str, update: DeviceUpdate):
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No update data provided")
    
    result = await db.devices.update_one(
        {"id": device_id},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Device not found")
    return {"message": "Device updated"}

# ==================== SYNC ROUTES ====================

@sync_router.post("/")
async def sync_data(sync_request: SyncRequest):
    # Verify device and password
    device, session = await _verify_sync_device(
        sync_request.device_name, sync_request.sync_password,
        sync_request.client_id, sync_request.session_id
    )
    
    sync_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    sync_timestamp = datetime.now(timezone.utc).isoformat()
    
    # Store raw sync log (append-only audit trail)
    sync_log_id = str(uuid.uuid4())
    raw_log = {
        "id": sync_log_id,
        "device_name": sync_request.device_name,
        "client_id": sync_request.client_id or session.get("client_id", ""),
        "session_id": sync_request.session_id,
        "sync_date": sync_date,
        "synced_at": sync_timestamp,
        "raw_payload": {
            "locations": sync_request.locations,
            "device_name": sync_request.device_name,
            "session_id": sync_request.session_id,
            "client_id": sync_request.client_id
        },
        "location_count": len(sync_request.locations),
        "total_items": sum(len(loc.get("items", [])) for loc in sync_request.locations),
        "total_quantity": sum(
            sum(item.get("quantity", 0) for item in loc.get("items", []))
            for loc in sync_request.locations
        ),
        "action": "sync"
    }
    await db.sync_raw_logs.insert_one(raw_log)
    
    # Store locations in sync_inbox (NOT in variance yet)
    synced_count = await _store_locations_to_inbox(
        sync_request.locations, device, sync_request.session_id,
        sync_request.client_id or session.get("client_id", ""),
        sync_request.device_name, sync_log_id, sync_date, sync_timestamp
    )
    
    # Update device last sync
    await db.devices.update_one(
        {"device_name": sync_request.device_name},
        {"$set": {
            "last_sync_at": datetime.now(timezone.utc).isoformat(),
            "client_id": sync_request.client_id,
            "session_id": sync_request.session_id
        }}
    )
    
    return {
        "message": "Sync successful",
        "locations_synced": synced_count,
        "sync_date": sync_date
    }

# ==================== CHUNKED SYNC ENDPOINTS ====================

async def _store_locations_to_inbox(locations, device, session_id, client_id, device_name, sync_log_id, sync_date, sync_timestamp):
    """Store locations in sync_inbox (staging area). Data does NOT go to variance until admin forwards it."""
    count = 0
    for loc_data in locations:
        location_id = loc_data.get("id", str(uuid.uuid4()))
        location_name = loc_data.get("name", "Unknown")
        items = loc_data.get("items", [])
        loc_is_empty = loc_data.get("is_empty", False)
        loc_empty_remarks = loc_data.get("empty_remarks", "")

        synced_items = []
        total_qty = 0
        for item in items:
            synced_items.append(SyncedItem(
                barcode=item.get("barcode", ""),
                product_name=item.get("productName", item.get("product_name", "")),
                price=item.get("price"),
                quantity=item.get("quantity", 0),
                scanned_at=item.get("scannedAt", item.get("scanned_at", ""))
            ).model_dump())
            total_qty += item.get("quantity", 0)

        if loc_is_empty or (len(items) == 0 and loc_is_empty):
            loc_is_empty = True
            if not loc_empty_remarks:
                loc_empty_remarks = "Location found empty during physical count"

        inbox_doc = {
            "id": str(uuid.uuid4()),
            "sync_log_id": sync_log_id,
            "session_id": session_id,
            "client_id": client_id,
            "device_name": device_name,
            "device_id": device["id"] if isinstance(device, dict) else device.id,
            "location_id": location_id,
            "location_name": location_name,
            "items": synced_items,
            "total_items": len(synced_items),
            "total_quantity": total_qty,
            "is_empty": loc_is_empty,
            "empty_remarks": loc_empty_remarks,
            "synced_at": sync_timestamp,
            "sync_date": sync_date,
            "status": "pending",
            "forward_batch_id": None
        }
        await db.sync_inbox.insert_one(inbox_doc)
        count += 1
    return count

async def _verify_sync_device(device_name: str, sync_password: str, client_id: str, session_id: str):
    """Shared device/session verification for sync endpoints."""
    device = await db.devices.find_one({"device_name": device_name})
    if not device:
        device_obj = Device(
            device_name=device_name,
            sync_password_hash=hash_password(sync_password),
            client_id=client_id,
            session_id=session_id
        )
        doc = device_obj.model_dump()
        doc['created_at'] = doc['created_at'].isoformat()
        if doc['last_sync_at']:
            doc['last_sync_at'] = doc['last_sync_at'].isoformat()
        await db.devices.insert_one(doc)
        device = doc
    else:
        if not verify_password(sync_password, device.get("sync_password_hash", "")):
            raise HTTPException(status_code=401, detail="Invalid sync password")
    session = await db.audit_sessions.find_one({"id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return device, session

@sync_router.post("/chunk")
async def sync_chunk(req: SyncChunkRequest):
    """Receive a chunk of locations and store in staging. Nothing goes live until finalize."""
    await _verify_sync_device(req.device_name, req.sync_password, req.client_id, req.session_id)

    await db.sync_staging.insert_one({
        "batch_id": req.batch_id,
        "device_name": req.device_name,
        "client_id": req.client_id,
        "session_id": req.session_id,
        "chunk_index": req.chunk_index,
        "total_chunks": req.total_chunks,
        "locations": req.locations,
        "created_at": datetime.now(timezone.utc).isoformat()
    })

    return {
        "message": "Chunk received",
        "batch_id": req.batch_id,
        "chunk_index": req.chunk_index,
        "total_chunks": req.total_chunks
    }

@sync_router.post("/finalize")
async def sync_finalize(req: SyncFinalizeRequest):
    """After all chunks uploaded, finalize: move staging → live synced_locations with conflict detection."""
    device, session = await _verify_sync_device(req.device_name, req.sync_password, req.client_id, req.session_id)

    # Gather all staged chunks for this batch
    chunks = await db.sync_staging.find(
        {"batch_id": req.batch_id}, {"_id": 0}
    ).sort("chunk_index", 1).to_list(10000)

    if not chunks:
        raise HTTPException(status_code=404, detail="No staged data found for this batch")

    received_indices = {c["chunk_index"] for c in chunks}
    expected_indices = set(range(chunks[0]["total_chunks"]))
    if received_indices != expected_indices:
        missing = sorted(expected_indices - received_indices)
        raise HTTPException(status_code=400, detail=f"Missing chunks: {missing}")

    # Combine all locations from chunks
    all_locations = []
    for c in chunks:
        all_locations.extend(c.get("locations", []))

    if len(all_locations) != req.total_locations:
        raise HTTPException(status_code=400, detail=f"Location count mismatch: expected {req.total_locations}, got {len(all_locations)}")

    # Store locations in sync_inbox (NOT in variance yet)
    sync_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    sync_timestamp = datetime.now(timezone.utc).isoformat()

    sync_log_id = str(uuid.uuid4())
    raw_log = {
        "id": sync_log_id,
        "device_name": req.device_name,
        "client_id": req.client_id or session.get("client_id", ""),
        "session_id": req.session_id,
        "sync_date": sync_date,
        "synced_at": sync_timestamp,
        "raw_payload": {
            "locations": all_locations,
            "device_name": req.device_name,
            "session_id": req.session_id,
            "client_id": req.client_id,
            "batch_id": req.batch_id
        },
        "location_count": len(all_locations),
        "total_items": sum(len(loc.get("items", [])) for loc in all_locations),
        "total_quantity": sum(
            sum(item.get("quantity", 0) for item in loc.get("items", []))
            for loc in all_locations
        ),
        "action": "chunked_sync"
    }
    await db.sync_raw_logs.insert_one(raw_log)

    synced_count = await _store_locations_to_inbox(
        all_locations, device, req.session_id,
        req.client_id or session.get("client_id", ""),
        req.device_name, sync_log_id, sync_date, sync_timestamp
    )

    # Update device last sync
    await db.devices.update_one(
        {"device_name": req.device_name},
        {"$set": {
            "last_sync_at": datetime.now(timezone.utc).isoformat(),
            "client_id": req.client_id,
            "session_id": req.session_id
        }}
    )

    # Clean up chunked staging data
    await db.sync_staging.delete_many({"batch_id": req.batch_id})

    return {
        "message": "Sync finalized successfully",
        "locations_synced": synced_count,
        "sync_date": sync_date,
        "batch_id": req.batch_id
    }

@sync_router.delete("/staging/{batch_id}")
async def cancel_sync_staging(batch_id: str):
    """Cancel a chunked sync — remove all staged data for a batch."""
    result = await db.sync_staging.delete_many({"batch_id": batch_id})
    return {"message": "Staging data cleared", "deleted_chunks": result.deleted_count}

# ==================== SYNC INBOX & FORWARD TO VARIANCE ====================

@portal_router.get("/sync-inbox/summary")
async def get_sync_inbox_summary(session_id: str):
    """Get summary of pending inbox items grouped by scanner for a session."""
    pipeline = [
        {"$match": {"session_id": session_id, "status": "pending"}},
        {"$group": {
            "_id": "$device_name",
            "sync_count": {"$sum": 1},
            "total_locations": {"$sum": 1},
            "total_items": {"$sum": "$total_items"},
            "total_quantity": {"$sum": "$total_quantity"},
            "last_synced_at": {"$max": "$synced_at"},
            "sync_dates": {"$addToSet": "$sync_date"}
        }},
        {"$sort": {"_id": 1}}
    ]
    scanner_groups = await db.sync_inbox.aggregate(pipeline).to_list(1000)

    total_pending = await db.sync_inbox.count_documents({"session_id": session_id, "status": "pending"})
    unique_scanners = len(scanner_groups)

    scanners = []
    for sg in scanner_groups:
        scanners.append({
            "device_name": sg["_id"],
            "location_count": sg["total_locations"],
            "total_items": sg["total_items"],
            "total_quantity": sg["total_quantity"],
            "last_synced_at": sg["last_synced_at"],
            "sync_dates": sg["sync_dates"]
        })

    return {
        "session_id": session_id,
        "total_pending": total_pending,
        "scanner_count": unique_scanners,
        "scanners": scanners
    }

@portal_router.get("/sync-inbox")
async def get_sync_inbox(session_id: str, device_name: str = None):
    """Get pending inbox items, optionally filtered by device."""
    query = {"session_id": session_id, "status": "pending"}
    if device_name:
        query["device_name"] = device_name
    items = await db.sync_inbox.find(query, {"_id": 0}).sort("synced_at", -1).to_list(10000)
    return items

class ForwardRequest(BaseModel):
    session_id: str
    client_id: str
    forwarded_by: str = "admin"

@portal_router.post("/forward-to-variance")
async def forward_to_variance(req: ForwardRequest):
    """Forward all pending inbox items to variance (synced_locations) with conflict detection."""
    pending = await db.sync_inbox.find(
        {"session_id": req.session_id, "status": "pending"}, {"_id": 0}
    ).to_list(100000)

    if not pending:
        raise HTTPException(status_code=400, detail="No pending data to forward")

    timestamp = datetime.now(timezone.utc).isoformat()
    batch_id = str(uuid.uuid4())
    sync_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # Group inbox items by location_name
    location_groups = {}
    for item in pending:
        loc = item["location_name"]
        if loc not in location_groups:
            location_groups[loc] = []
        location_groups[loc].append(item)

    # For each location group, deduplicate per device (keep latest per device)
    locations_forwarded = 0
    conflicts_created = 0

    for location_name, entries in location_groups.items():
        # Deduplicate: for each device, keep only the latest entry
        by_device = {}
        for e in entries:
            dn = e["device_name"]
            if dn not in by_device or e["synced_at"] > by_device[dn]["synced_at"]:
                by_device[dn] = e
        unique_entries = list(by_device.values())

        # Check for existing conflict for this location
        existing_conflict = await db.conflict_locations.find_one({
            "session_id": req.session_id,
            "location_name": location_name,
            "status": "pending"
        })

        # Check for existing forwarded data in variance
        existing_synced = await db.synced_locations.find_one({
            "session_id": req.session_id,
            "location_name": location_name
        })

        def _make_conflict_entry(e):
            return {
                "entry_id": str(uuid.uuid4()),
                "device_name": e.get("device_name", "Unknown"),
                "device_id": e.get("device_id", ""),
                "location_id": e.get("location_id", ""),
                "synced_at": e.get("synced_at", timestamp),
                "items": e.get("items", []),
                "total_items": e.get("total_items", 0),
                "total_quantity": e.get("total_quantity", 0),
                "is_empty": e.get("is_empty", False),
                "empty_remarks": e.get("empty_remarks", ""),
                "status": "pending"
            }

        # Case 1: Multiple devices scanned this location in this batch → conflict among them
        if len(unique_entries) > 1:
            conflict_entries = [_make_conflict_entry(e) for e in unique_entries]

            if existing_conflict:
                # Add all as new entries to existing conflict
                await db.conflict_locations.update_one(
                    {"id": existing_conflict["id"]},
                    {"$push": {"entries": {"$each": conflict_entries}}, "$set": {"updated_at": timestamp}}
                )
            else:
                # Also pull existing variance data into this conflict if any
                if existing_synced:
                    conflict_entries.insert(0, _make_conflict_entry(existing_synced))
                    await db.synced_locations.delete_many({
                        "session_id": req.session_id,
                        "location_name": location_name
                    })
                conflict_doc = {
                    "id": str(uuid.uuid4()),
                    "session_id": req.session_id,
                    "client_id": req.client_id,
                    "location_name": location_name,
                    "status": "pending",
                    "entries": conflict_entries,
                    "created_at": timestamp,
                    "updated_at": timestamp,
                    "resolved_at": None,
                    "resolved_by": None
                }
                await db.conflict_locations.insert_one(conflict_doc)
            conflicts_created += 1
            locations_forwarded += len(unique_entries)
            continue

        # Single entry for this location
        entry = unique_entries[0]

        # Case 2: Existing conflict → add this entry
        if existing_conflict:
            await db.conflict_locations.update_one(
                {"id": existing_conflict["id"]},
                {"$push": {"entries": _make_conflict_entry(entry)}, "$set": {"updated_at": timestamp}}
            )
            locations_forwarded += 1
            continue

        # Case 3: Existing in variance from different device → create conflict, pull from variance
        if existing_synced and existing_synced.get("device_name") != entry["device_name"]:
            first_entry = _make_conflict_entry(existing_synced)
            new_entry = _make_conflict_entry(entry)
            conflict_doc = {
                "id": str(uuid.uuid4()),
                "session_id": req.session_id,
                "client_id": req.client_id,
                "location_name": location_name,
                "status": "pending",
                "entries": [first_entry, new_entry],
                "created_at": timestamp,
                "updated_at": timestamp,
                "resolved_at": None,
                "resolved_by": None
            }
            await db.conflict_locations.insert_one(conflict_doc)
            await db.synced_locations.delete_many({
                "session_id": req.session_id,
                "location_name": location_name
            })
            conflicts_created += 1
            locations_forwarded += 1
            continue

        # Case 4: Same device re-forward or first time → insert/replace in variance
        await db.synced_locations.delete_many({
            "session_id": req.session_id,
            "location_name": location_name
        })
        synced_loc = SyncedLocation(
            session_id=req.session_id,
            device_id=entry.get("device_id", ""),
            device_name=entry["device_name"],
            location_id=entry.get("location_id", ""),
            location_name=location_name,
            items=entry.get("items", []),
            total_items=entry.get("total_items", 0),
            total_quantity=entry.get("total_quantity", 0),
            is_empty=entry.get("is_empty", False),
            empty_remarks=entry.get("empty_remarks", ""),
            sync_date=entry.get("sync_date", sync_date)
        )
        doc = synced_loc.model_dump()
        doc['synced_at'] = doc['synced_at'].isoformat()
        await db.synced_locations.insert_one(doc)
        locations_forwarded += 1

    # Mark all pending inbox items as forwarded
    inbox_ids = [item["id"] for item in pending]
    await db.sync_inbox.update_many(
        {"id": {"$in": inbox_ids}},
        {"$set": {"status": "forwarded", "forward_batch_id": batch_id}}
    )

    # Create batch record
    all_scanners = list(set(item["device_name"] for item in pending))
    batch_doc = {
        "id": batch_id,
        "session_id": req.session_id,
        "client_id": req.client_id,
        "forwarded_by": req.forwarded_by,
        "forwarded_at": timestamp,
        "location_count": locations_forwarded,
        "item_count": sum(item.get("total_items", 0) for item in pending),
        "quantity_count": sum(item.get("total_quantity", 0) for item in pending),
        "scanner_count": len(all_scanners),
        "scanners": all_scanners,
        "conflicts_created": conflicts_created,
        "inbox_entries_processed": len(pending)
    }
    await db.forward_batches.insert_one(batch_doc)

    # Generate alerts for high variance
    await check_and_generate_alerts(req.session_id, req.client_id)

    return {
        "message": "Data forwarded to variance",
        "batch_id": batch_id,
        "locations_forwarded": locations_forwarded,
        "conflicts_created": conflicts_created,
        "scanners_processed": len(all_scanners)
    }

@portal_router.get("/forward-batches")
async def get_forward_batches(session_id: str = None, client_id: str = None):
    """Get forward batch history."""
    query = {}
    if session_id:
        query["session_id"] = session_id
    if client_id:
        query["client_id"] = client_id
    batches = await db.forward_batches.find(query, {"_id": 0}).sort("forwarded_at", -1).to_list(100)
    return batches

@portal_router.delete("/forward-batches/{batch_id}")
async def delete_forward_batch(batch_id: str):
    """Permanently delete a batch and remove its data from variance. No rollback — batch is gone."""
    batch = await db.forward_batches.find_one({"id": batch_id})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    session_id = batch["session_id"]

    # Find all inbox entries that were part of this batch to know which locations to remove
    inbox_entries = await db.sync_inbox.find(
        {"forward_batch_id": batch_id}, {"_id": 0}
    ).to_list(100000)

    # Remove forwarded locations from synced_locations (variance)
    location_names = list(set(e["location_name"] for e in inbox_entries))
    removed_count = 0
    if location_names:
        result = await db.synced_locations.delete_many({
            "session_id": session_id,
            "location_name": {"$in": location_names}
        })
        removed_count = result.deleted_count

    # Also remove any conflicts created by this batch's forward
    batch_time = batch.get("forwarded_at", "")
    if batch_time and location_names:
        await db.conflict_locations.delete_many({
            "session_id": session_id,
            "location_name": {"$in": location_names},
            "created_at": {"$gte": batch_time}
        })

    # Delete the batch record
    await db.forward_batches.delete_one({"id": batch_id})

    return {
        "message": f"Batch deleted. {removed_count} locations removed from variance.",
        "locations_removed": removed_count
    }

class RebuildVarianceRequest(BaseModel):
    session_id: str
    client_id: str
    rebuilt_by: str = "admin"

@portal_router.post("/rebuild-variance")
async def rebuild_variance_from_raw(req: RebuildVarianceRequest):
    """Clean slate rebuild: clear all variance data for this session, then re-process from raw sync logs."""
    # Step 1: Clear all existing variance data for this session
    del_synced = await db.synced_locations.delete_many({"session_id": req.session_id})
    del_conflicts = await db.conflict_locations.delete_many({"session_id": req.session_id})

    # Step 2: Read all raw sync logs for this session
    raw_logs = await db.sync_raw_logs.find(
        {"session_id": req.session_id}, {"_id": 0}
    ).sort("synced_at", 1).to_list(100000)

    if not raw_logs:
        return {
            "message": "No raw data found for this session. Variance cleared.",
            "cleared_locations": del_synced.deleted_count,
            "cleared_conflicts": del_conflicts.deleted_count,
            "rebuilt_locations": 0,
            "conflicts_created": 0
        }

    # Step 3: Extract all locations from raw logs, grouped by location_name
    # Each location keeps track of which device synced it and when
    location_entries = {}  # location_name -> list of {device_name, data, synced_at}
    for log in raw_logs:
        device_name = log.get("device_name", "Unknown")
        synced_at = log.get("synced_at", "")
        sync_date = log.get("sync_date", "")
        device_id = ""
        # Try to get device_id
        device = await db.devices.find_one({"device_name": device_name})
        if device:
            device_id = device.get("id", "")

        payload = log.get("raw_payload", {})
        for loc_data in payload.get("locations", []):
            location_name = loc_data.get("name", "Unknown")
            items = loc_data.get("items", [])
            loc_is_empty = loc_data.get("is_empty", False)
            loc_empty_remarks = loc_data.get("empty_remarks", "")

            synced_items = []
            total_qty = 0
            for item in items:
                synced_items.append(SyncedItem(
                    barcode=item.get("barcode", ""),
                    product_name=item.get("productName", item.get("product_name", "")),
                    price=item.get("price"),
                    quantity=item.get("quantity", 0),
                    scanned_at=item.get("scannedAt", item.get("scanned_at", ""))
                ).model_dump())
                total_qty += item.get("quantity", 0)

            if loc_is_empty or (len(items) == 0 and loc_is_empty):
                loc_is_empty = True
                if not loc_empty_remarks:
                    loc_empty_remarks = "Location found empty during physical count"

            entry = {
                "device_name": device_name,
                "device_id": device_id,
                "location_id": loc_data.get("id", str(uuid.uuid4())),
                "location_name": location_name,
                "items": synced_items,
                "total_items": len(synced_items),
                "total_quantity": total_qty,
                "is_empty": loc_is_empty,
                "empty_remarks": loc_empty_remarks,
                "synced_at": synced_at,
                "sync_date": sync_date
            }

            if location_name not in location_entries:
                location_entries[location_name] = []
            location_entries[location_name].append(entry)

    # Step 4: Process each location — same logic as forward
    timestamp = datetime.now(timezone.utc).isoformat()
    locations_rebuilt = 0
    conflicts_created = 0

    for location_name, entries in location_entries.items():
        # Deduplicate per device: keep latest entry per device
        by_device = {}
        for e in entries:
            dn = e["device_name"]
            if dn not in by_device or e["synced_at"] > by_device[dn]["synced_at"]:
                by_device[dn] = e
        unique_entries = list(by_device.values())

        if len(unique_entries) > 1:
            # Multiple devices → conflict
            conflict_entries = []
            for e in unique_entries:
                conflict_entries.append({
                    "entry_id": str(uuid.uuid4()),
                    "device_name": e["device_name"],
                    "device_id": e["device_id"],
                    "location_id": e["location_id"],
                    "synced_at": e["synced_at"],
                    "items": e["items"],
                    "total_items": e["total_items"],
                    "total_quantity": e["total_quantity"],
                    "is_empty": e["is_empty"],
                    "empty_remarks": e["empty_remarks"],
                    "status": "pending"
                })
            conflict_doc = {
                "id": str(uuid.uuid4()),
                "session_id": req.session_id,
                "client_id": req.client_id,
                "location_name": location_name,
                "status": "pending",
                "entries": conflict_entries,
                "created_at": timestamp,
                "updated_at": timestamp,
                "resolved_at": None,
                "resolved_by": None
            }
            await db.conflict_locations.insert_one(conflict_doc)
            conflicts_created += 1
        else:
            # Single device → straight to variance
            entry = unique_entries[0]
            synced_loc = SyncedLocation(
                session_id=req.session_id,
                device_id=entry["device_id"],
                device_name=entry["device_name"],
                location_id=entry["location_id"],
                location_name=location_name,
                items=entry["items"],
                total_items=entry["total_items"],
                total_quantity=entry["total_quantity"],
                is_empty=entry["is_empty"],
                empty_remarks=entry["empty_remarks"],
                sync_date=entry.get("sync_date", timestamp[:10])
            )
            doc = synced_loc.model_dump()
            doc['synced_at'] = doc['synced_at'].isoformat()
            await db.synced_locations.insert_one(doc)
            locations_rebuilt += 1

    # Generate alerts
    await check_and_generate_alerts(req.session_id, req.client_id)

    return {
        "message": f"Variance rebuilt from raw data. {locations_rebuilt} locations in variance, {conflicts_created} conflicts detected.",
        "cleared_locations": del_synced.deleted_count,
        "cleared_conflicts": del_conflicts.deleted_count,
        "rebuilt_locations": locations_rebuilt,
        "conflicts_created": conflicts_created,
        "raw_logs_processed": len(raw_logs)
    }

@sync_router.get("/config")
async def get_sync_config():
    """Get available clients and sessions for device configuration"""
    clients = await db.clients.find({"is_active": True}, {"_id": 0}).to_list(100)
    sessions = await db.audit_sessions.find({"status": "active"}, {"_id": 0}).to_list(100)
    
    return {
        "clients": clients,
        "sessions": sessions
    }

# ==================== SYNC RAW LOGS ROUTES ====================

@portal_router.get("/sync-logs")
async def get_sync_logs(client_id: str = None, session_id: str = None, date: str = None, limit: int = 500):
    """Get raw sync logs, optionally filtered by client, session, and/or date.
    Returns logs grouped by client and date for the frontend."""
    query = {}
    if client_id:
        query["client_id"] = client_id
    if session_id:
        query["session_id"] = session_id
    if date:
        query["sync_date"] = date
    
    logs = await db.sync_raw_logs.find(query, {"_id": 0}).sort("synced_at", -1).to_list(limit)
    return logs

@portal_router.get("/sync-logs/grouped")
async def get_sync_logs_grouped(client_id: str = None, limit: int = 500):
    """Get sync logs grouped by client_id and sync_date for the admin portal view.
    Does NOT include raw_payload to keep response lightweight for large datasets."""
    query = {}
    if client_id:
        query["client_id"] = client_id
    
    # Exclude raw_payload from the response to avoid sending large data to frontend
    logs = await db.sync_raw_logs.find(query, {"_id": 0, "raw_payload": 0}).sort("synced_at", -1).to_list(limit)
    
    # Also fetch client names for display
    all_client_ids = list(set(log.get("client_id", "") for log in logs if log.get("client_id")))
    clients_list = await db.clients.find({"id": {"$in": all_client_ids}}, {"_id": 0, "id": 1, "name": 1, "code": 1}).to_list(1000)
    client_map = {c["id"]: c for c in clients_list}
    
    # Group: client_id → sync_date → [logs]
    grouped = {}
    for log in logs:
        cid = log.get("client_id", "unknown")
        sd = log.get("sync_date", "unknown")
        
        if cid not in grouped:
            client_info = client_map.get(cid, {})
            grouped[cid] = {
                "client_id": cid,
                "client_name": client_info.get("name", "Unknown Client"),
                "client_code": client_info.get("code", ""),
                "dates": {}
            }
        
        if sd not in grouped[cid]["dates"]:
            grouped[cid]["dates"][sd] = {
                "date": sd,
                "logs": [],
                "total_locations": 0,
                "total_items": 0,
                "total_quantity": 0,
                "sync_count": 0
            }
        
        day_group = grouped[cid]["dates"][sd]
        day_group["logs"].append(log)
        day_group["total_locations"] += log.get("location_count", 0)
        day_group["total_items"] += log.get("total_items", 0)
        day_group["total_quantity"] += log.get("total_quantity", 0)
        day_group["sync_count"] += 1
    
    # Convert to sorted list
    result = []
    for cid in sorted(grouped.keys()):
        client_group = grouped[cid]
        dates_list = []
        for sd in sorted(client_group["dates"].keys(), reverse=True):
            dates_list.append(client_group["dates"][sd])
        client_group["dates"] = dates_list
        result.append(client_group)
    
    return result

@portal_router.get("/sync-logs/by-scanner")
async def get_sync_logs_by_scanner(client_id: str = None, session_id: str = None, limit: int = 2000):
    """Get sync logs grouped by scanner (device_name). Each scanner shows individual sync entries."""
    query = {}
    if client_id:
        query["client_id"] = client_id
    if session_id:
        query["session_id"] = session_id

    logs = await db.sync_raw_logs.find(query, {"_id": 0, "raw_payload": 0}).sort("synced_at", -1).to_list(limit)

    # Fetch session names for display
    all_session_ids = list(set(log.get("session_id", "") for log in logs if log.get("session_id")))
    sessions_list = await db.audit_sessions.find({"id": {"$in": all_session_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(1000)
    session_map = {s["id"]: s.get("name", "") for s in sessions_list}

    # Group by device_name
    by_scanner = {}
    for log in logs:
        dn = log.get("device_name", "Unknown")
        if dn not in by_scanner:
            by_scanner[dn] = {
                "device_name": dn,
                "sync_count": 0,
                "total_locations": 0,
                "total_items": 0,
                "total_quantity": 0,
                "last_synced_at": None,
                "sync_dates": set(),
                "syncs": []
            }
        group = by_scanner[dn]
        group["sync_count"] += 1
        group["total_locations"] += log.get("location_count", 0)
        group["total_items"] += log.get("total_items", 0)
        group["total_quantity"] += log.get("total_quantity", 0)
        if not group["last_synced_at"] or log.get("synced_at", "") > group["last_synced_at"]:
            group["last_synced_at"] = log.get("synced_at")
        group["sync_dates"].add(log.get("sync_date", ""))
        group["syncs"].append({
            "id": log.get("id", ""),
            "sync_date": log.get("sync_date", ""),
            "synced_at": log.get("synced_at", ""),
            "location_count": log.get("location_count", 0),
            "total_items": log.get("total_items", 0),
            "total_quantity": log.get("total_quantity", 0),
            "session_id": log.get("session_id", ""),
            "session_name": session_map.get(log.get("session_id", ""), ""),
            "action": log.get("action", "sync")
        })

    result = []
    for dn in sorted(by_scanner.keys()):
        group = by_scanner[dn]
        group["sync_dates"] = sorted(group["sync_dates"], reverse=True)
        result.append(group)

    return result

@portal_router.get("/sync-logs/export")
async def export_sync_logs(client_id: str, date: str = None, session_id: str = None):
    """Export sync logs as CSV. Filter by client + optional date or session."""
    query = {"client_id": client_id}
    if date:
        query["sync_date"] = date
    if session_id:
        query["session_id"] = session_id
    logs = await db.sync_raw_logs.find(query, {"_id": 0}).sort("synced_at", 1).to_list(100000)
    
    if not logs:
        raise HTTPException(status_code=404, detail="No logs found")
    
    # Get client name
    client = await db.clients.find_one({"id": client_id}, {"_id": 0, "name": 1, "code": 1})
    client_name = client.get("name", "Unknown") if client else "Unknown"
    
    # Build CSV
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Log ID", "Device", "Session ID", "Sync Date", "Sync Time", "Location", "Barcode", "Product Name", "Quantity", "Scanned At"])
    
    for log in logs:
        for loc in (log.get("raw_payload", {}).get("locations", [])):
            loc_name = loc.get("name", loc.get("location_name", "Unknown"))
            for item in loc.get("items", []):
                writer.writerow([
                    log.get("id", ""),
                    log.get("device_name", ""),
                    log.get("session_id", ""),
                    log.get("sync_date", ""),
                    log.get("synced_at", ""),
                    loc_name,
                    item.get("barcode", ""),
                    item.get("product_name", item.get("productName", "")),
                    item.get("quantity", 0),
                    item.get("scanned_at", item.get("scannedAt", ""))
                ])
    
    csv_content = output.getvalue()
    
    suffix = "_" + date if date else "_session" if session_id else "_all"
    
    return StreamingResponse(
        iter([csv_content]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=sync_logs_{client_name}{suffix}.csv"}
    )

@portal_router.get("/sync-logs/{log_id}")
async def get_sync_log_detail(log_id: str):
    """Get detailed raw sync log by ID"""
    log = await db.sync_raw_logs.find_one({"id": log_id}, {"_id": 0})
    if not log:
        raise HTTPException(status_code=404, detail="Sync log not found")
    return log

@portal_router.get("/sync-logs/{log_id}/export")
async def export_single_sync_log(log_id: str):
    """Export a single sync log as CSV"""
    log = await db.sync_raw_logs.find_one({"id": log_id}, {"_id": 0})
    if not log:
        raise HTTPException(status_code=404, detail="Sync log not found")
    
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Log ID", "Device", "Session ID", "Sync Time", "Location", "Barcode", "Product Name", "Quantity", "Scanned At"])
    
    for loc in (log.get("raw_payload", {}).get("locations", [])):
        loc_name = loc.get("name", loc.get("location_name", "Unknown"))
        for item in loc.get("items", []):
            writer.writerow([
                log.get("id", ""),
                log.get("device_name", ""),
                log.get("session_id", ""),
                log.get("synced_at", ""),
                loc_name,
                item.get("barcode", ""),
                item.get("product_name", item.get("productName", "")),
                item.get("quantity", 0),
                item.get("scanned_at", item.get("scannedAt", ""))
            ])
    
    csv_content = output.getvalue()
    device = log.get("device_name", "unknown")
    date = log.get("sync_date", "unknown")
    
    return StreamingResponse(
        iter([csv_content]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=sync_{device}_{date}_{log_id[:8]}.csv"}
    )

# ==================== REPORTS HELPER FUNCTIONS ====================

async def get_master_for_session(session_id: str) -> dict:
    """Load master products indexed by barcode for the session's client"""
    session = await db.audit_sessions.find_one({"id": session_id}, {"_id": 0})
    if not session:
        return {}
    client_id = session.get("client_id", "")
    if not client_id:
        return {}
    master_products = await db.master_products.find({"client_id": client_id}, {"_id": 0}).to_list(500000)
    master_by_barcode = {}
    for m in master_products:
        master_by_barcode[m["barcode"]] = m
    return master_by_barcode

def calc_accuracy(expected_qty: float, physical_qty: float) -> float:
    """Calculate percentage accuracy"""
    if expected_qty == 0 and physical_qty == 0:
        return 100.0
    if expected_qty == 0:
        return 0.0
    accuracy = (min(physical_qty, expected_qty) / expected_qty) * 100
    return round(min(accuracy, 100.0), 1)

def generate_remark(expected_qty: float, physical_qty: float, accuracy: float, in_master: bool = True, scanned: bool = True, in_product_master: bool = True, in_expected_stock: bool = True) -> str:
    """Generate professional remark based on variance.
    
    Flow: Scanned barcodes checked against stock first, then master, then unknown.
    - in_expected_stock: barcode exists in expected stock (quantities file)
    - in_product_master: barcode exists in master product catalog
    - scanned: barcode was physically scanned
    """
    # Case: Not in stock AND not in master → completely unknown item
    if not in_expected_stock and not in_product_master and scanned:
        return "Not in Master — Unknown item found during physical count"
    
    # Case: In master but NOT in stock → product exists in catalog but no expected qty
    if in_product_master and not in_expected_stock and scanned:
        return "In Master, Not in Stock — Product exists in catalog but had no expected stock"
    
    # Case: In stock but NOT scanned
    if not scanned and in_expected_stock:
        return "Not Scanned — Item has expected stock but was not counted"
    
    # Case: Not in stock, not scanned (shouldn't appear but handle gracefully)
    if not scanned:
        return "Not Scanned — Item exists in master but was not counted"
    diff = physical_qty - expected_qty
    if diff == 0:
        return "Exact Match — Physical count matches expected stock"
    if accuracy >= 98:
        return "Within Tolerance — Minor variance, negligible impact"
    if accuracy >= 90:
        if diff > 0:
            return f"Slight Surplus — {abs(diff):.0f} units over expected ({accuracy}% accuracy)"
        else:
            return f"Slight Shortage — {abs(diff):.0f} units under expected ({accuracy}% accuracy)"
    if accuracy >= 75:
        if diff > 0:
            return f"Surplus Detected — {abs(diff):.0f} units excess ({accuracy}% accuracy)"
        else:
            return f"Shortage Detected — {abs(diff):.0f} units deficit ({accuracy}% accuracy)"
    if diff > 0:
        return f"High Surplus — {abs(diff):.0f} units excess, requires investigation ({accuracy}% accuracy)"
    else:
        return f"Critical Shortage — {abs(diff):.0f} units deficit, immediate attention needed ({accuracy}% accuracy)"

# ==================== RECONCILIATION (RECO) ENDPOINTS ====================

async def _build_reco_maps(client_id: str):
    """Build lookup maps for reco adjustments for a client (used in consolidated reports).
    Returns: { "detailed": {loc|barcode: reco_qty}, "barcode": {barcode: reco_qty}, "article": {article_code: reco_qty} }
    """
    adjs = await db.reco_adjustments.find({"client_id": client_id}, {"_id": 0}).to_list(100000)
    detailed_map = {}
    barcode_map = {}
    article_map = {}
    for a in adjs:
        rt = a.get("reco_type", "")
        if rt == "detailed":
            key = f"{a.get('location', '')}|{a.get('barcode', '')}"
            detailed_map[key] = a["reco_qty"]
            bc = a.get("barcode", "")
            barcode_map[bc] = barcode_map.get(bc, 0) + a["reco_qty"]
        elif rt == "barcode":
            barcode_map[a.get("barcode", "")] = a["reco_qty"]
        elif rt == "article":
            article_map[a.get("article_code", "")] = a["reco_qty"]
    return {"detailed": detailed_map, "barcode": barcode_map, "article": article_map}

EMPTY_RECO_MAPS = {"detailed": {}, "barcode": {}, "article": {}}

@portal_router.post("/reco-adjustments")
async def save_reco_adjustment(adj: RecoAdjustmentCreate):
    """Save or update a reconciliation adjustment (client-level for consolidated reports)."""
    filter_key = {"client_id": adj.client_id, "reco_type": adj.reco_type}
    if adj.reco_type == "detailed":
        filter_key["barcode"] = adj.barcode
        filter_key["location"] = adj.location
    elif adj.reco_type == "barcode":
        filter_key["barcode"] = adj.barcode
    elif adj.reco_type == "article":
        filter_key["article_code"] = adj.article_code
    if adj.reco_qty == 0:
        await db.reco_adjustments.delete_one(filter_key)
        return {"status": "deleted"}
    doc = {**filter_key, "reco_qty": adj.reco_qty, "updated_at": datetime.now(timezone.utc).isoformat()}
    await db.reco_adjustments.update_one(filter_key, {"$set": doc}, upsert=True)
    return {"status": "saved", "reco_qty": adj.reco_qty}

@portal_router.get("/reco-adjustments/{client_id}")
async def get_reco_adjustments(client_id: str):
    """Get all reco adjustments for a client."""
    adjs = await db.reco_adjustments.find({"client_id": client_id}, {"_id": 0}).to_list(100000)
    return adjs

@portal_router.delete("/reco-adjustments/{client_id}")
async def clear_reco_adjustments(client_id: str):
    """Clear all reco adjustments for a client."""
    result = await db.reco_adjustments.delete_many({"client_id": client_id})
    return {"deleted": result.deleted_count}

# ==================== REPORTS ROUTES ====================

# ==================== CONSOLIDATED REPORT (all sessions for a client) ====================

async def _get_all_session_ids_for_client(client_id: str):
    """Get all session IDs for a client"""
    sessions = await db.audit_sessions.find({"client_id": client_id}, {"id": 1, "_id": 0}).to_list(1000)
    return [s["id"] for s in sessions]

async def _load_master_for_client(client_id: str):
    """Load master products indexed by barcode for a client"""
    master_products = await db.master_products.find({"client_id": client_id}, {"_id": 0}).to_list(500000)
    master_by_barcode = {}
    for m in master_products:
        master_by_barcode[m["barcode"]] = m
    return master_by_barcode

async def _get_extra_columns_for_client(client_id: str):
    """Get the list of extra (non-standard) enabled columns for a client's schema."""
    schema = await db.client_schemas.find_one({"client_id": client_id}, {"_id": 0})
    if not schema:
        return []
    extra = []
    for f in schema.get("fields", []):
        if f.get("enabled", True) and f["name"] not in STANDARD_MASTER_FIELD_NAMES:
            extra.append({"name": f["name"], "label": f.get("label", f["name"]), "type": f.get("type", "text")})
    return extra

def _merge_custom_fields(row: dict, master: dict, extra_columns: list) -> dict:
    """Merge custom_fields from master into a report row based on extra_columns."""
    cf = master.get("custom_fields", {})
    for col in extra_columns:
        row[col["name"]] = cf.get(col["name"], "")
    return row

@portal_router.get("/reports/consolidated/{client_id}/bin-wise")
async def get_consolidated_bin_wise(client_id: str):
    """Consolidated bin-wise report across all sessions for a client."""
    session_ids = await _get_all_session_ids_for_client(client_id)
    if not session_ids:
        return {"report": [], "totals": {"stock_qty": 0, "physical_qty": 0, "reco_qty": 0, "final_qty": 0, "difference_qty": 0, "accuracy_pct": 100.0}, "summary": {"total_locations": 0, "completed": 0, "empty_bins": 0, "pending": 0}}
    
    reco_maps = await _build_reco_maps(client_id)
    expected_by_location = {}
    physical_by_location = {}
    empty_bin_map = {}
    
    for sid in session_ids:
        expected = await db.expected_stock.find({"session_id": sid}, {"_id": 0}).to_list(100000)
        for e in expected:
            loc = e.get("location", "Unknown")
            expected_by_location[loc] = expected_by_location.get(loc, 0) + e.get("qty", 0)
        synced = await db.synced_locations.find({"session_id": sid}, {"_id": 0}).to_list(100000)
        for s in synced:
            loc = s["location_name"]
            physical_by_location[loc] = physical_by_location.get(loc, 0) + s["total_quantity"]
            if s.get("is_empty", False):
                empty_bin_map[loc] = {
                    "is_empty": True,
                    "empty_remarks": s.get("empty_remarks", ""),
                    "device_name": s.get("device_name", ""),
                    "synced_at": s.get("synced_at", "")
                }
    
    all_locations = set(expected_by_location.keys()) | set(physical_by_location.keys())
    
    # Build reco by location from detailed-level adjustments
    location_reco = {}
    for key, reco in reco_maps["detailed"].items():
        loc = key.split("|")[0]
        location_reco[loc] = location_reco.get(loc, 0) + reco
    
    report = []
    total_stock = total_physical = total_reco = total_final = total_diff = 0
    count_completed = count_empty = count_pending = 0
    
    for loc in sorted(all_locations):
        stock_qty = expected_by_location.get(loc, 0)
        physical_qty = physical_by_location.get(loc, 0)
        reco_qty = location_reco.get(loc, 0)
        final_qty = physical_qty + reco_qty
        diff_qty = final_qty - stock_qty
        accuracy = calc_accuracy(stock_qty, final_qty)
        in_expected = loc in expected_by_location
        scanned = loc in physical_by_location
        is_empty_bin = loc in empty_bin_map
        
        if is_empty_bin:
            status = "empty_bin"
            count_empty += 1
            empty_info = empty_bin_map[loc]
            empty_note = empty_info.get("empty_remarks", "").strip()
            if empty_note:
                remark = empty_note if empty_note.lower().startswith("empty bin") else f"Empty Bin — {empty_note}"
            else:
                remark = "Empty Bin — Location verified empty during physical count"
        elif not scanned and in_expected:
            status = "pending"
            count_pending += 1
            remark = "Pending — Location not yet counted during physical audit"
            accuracy = 0.0
        else:
            status = "completed"
            count_completed += 1
            remark = generate_remark(stock_qty, final_qty, accuracy, in_expected, scanned)
        
        total_stock += stock_qty
        total_physical += physical_qty
        total_reco += reco_qty
        total_final += final_qty
        total_diff += diff_qty
        report.append({
            "location": loc, "stock_qty": stock_qty, "physical_qty": physical_qty,
            "reco_qty": reco_qty, "final_qty": final_qty,
            "difference_qty": diff_qty, "accuracy_pct": accuracy, "remark": remark,
            "status": status, "is_empty": is_empty_bin,
            "empty_remarks": empty_bin_map.get(loc, {}).get("empty_remarks", "") if is_empty_bin else ""
        })
    
    total_accuracy = calc_accuracy(total_stock, total_final)
    return {
        "report": report,
        "totals": {"stock_qty": total_stock, "physical_qty": total_physical, "reco_qty": total_reco, "final_qty": total_final, "difference_qty": total_diff, "accuracy_pct": total_accuracy},
        "summary": {"total_locations": len(report), "completed": count_completed, "empty_bins": count_empty, "pending": count_pending}
    }

@portal_router.get("/reports/consolidated/{client_id}/detailed")
async def get_consolidated_detailed(client_id: str):
    """Consolidated detailed item-wise report across all sessions for a client"""
    session_ids = await _get_all_session_ids_for_client(client_id)
    master_by_barcode = await _load_master_for_client(client_id)
    reco_maps = await _build_reco_maps(client_id)
    extra_columns = await _get_extra_columns_for_client(client_id)
    
    expected_map = {}
    physical_map = {}
    
    for sid in session_ids:
        expected = await db.expected_stock.find({"session_id": sid}, {"_id": 0}).to_list(100000)
        for e in expected:
            key = f"{e.get('location', '')}|{e['barcode']}"
            if key not in expected_map:
                expected_map[key] = {"qty": 0, "location": e.get("location", ""), "barcode": e["barcode"], "description": e.get("description", ""), "category": e.get("category", ""), "mrp": e.get("mrp", 0), "cost": e.get("cost", 0)}
            expected_map[key]["qty"] += e.get("qty", 0)
        synced = await db.synced_locations.find({"session_id": sid}, {"_id": 0}).to_list(100000)
        for s in synced:
            loc = s["location_name"]
            for item in s.get("items", []):
                key = f"{loc}|{item['barcode']}"
                if key not in physical_map:
                    physical_map[key] = {"qty": 0, "location": loc, "barcode": item["barcode"]}
                physical_map[key]["qty"] += item.get("quantity", 0)
    
    all_keys = set(expected_map.keys()) | set(physical_map.keys())
    report = []
    totals = {"stock_qty": 0, "stock_value": 0, "physical_qty": 0, "physical_value": 0, "reco_qty": 0, "final_qty": 0, "final_value": 0, "diff_qty": 0, "diff_value": 0}
    
    for key in sorted(all_keys):
        exp = expected_map.get(key, {})
        phy = physical_map.get(key, {})
        barcode = exp.get("barcode", "") or phy.get("barcode", "")
        location = exp.get("location", "") or phy.get("location", "")
        master = master_by_barcode.get(barcode, {})
        description = master.get("description", "") or exp.get("description", "")
        category = master.get("category", "") or exp.get("category", "")
        mrp = master.get("mrp", 0) or exp.get("mrp", 0) or 0
        cost = master.get("cost", 0) or exp.get("cost", 0) or 0
        
        stock_qty = exp.get("qty", 0)
        physical_qty = phy.get("qty", 0)
        reco_qty = reco_maps["detailed"].get(key, 0)
        final_qty = physical_qty + reco_qty
        diff_qty = final_qty - stock_qty
        stock_value = stock_qty * cost
        physical_value = physical_qty * cost
        final_value = final_qty * cost
        diff_value = final_value - stock_value
        accuracy = calc_accuracy(stock_qty, final_qty)
        in_master = barcode in master_by_barcode
        in_expected = key in expected_map
        scanned = key in physical_map
        remark = generate_remark(stock_qty, final_qty, accuracy, True, scanned, in_master, in_expected)
        
        for k, v in [("stock_qty", stock_qty), ("stock_value", stock_value), ("physical_qty", physical_qty), ("physical_value", physical_value), ("reco_qty", reco_qty), ("final_qty", final_qty), ("final_value", final_value), ("diff_qty", diff_qty), ("diff_value", diff_value)]:
            totals[k] += v
        
        row = {
            "location": location, "barcode": barcode, "description": description, "category": category,
            "mrp": mrp, "cost": cost, "stock_qty": stock_qty, "stock_value": round(stock_value, 2),
            "physical_qty": physical_qty, "physical_value": round(physical_value, 2),
            "reco_qty": reco_qty, "final_qty": final_qty, "final_value": round(final_value, 2),
            "diff_qty": diff_qty, "diff_value": round(diff_value, 2), "accuracy_pct": accuracy, "remark": remark
        }
        if extra_columns:
            _merge_custom_fields(row, master_by_barcode.get(barcode, {}), extra_columns)
        report.append(row)
    
    totals["accuracy_pct"] = calc_accuracy(totals["stock_qty"], totals["final_qty"])
    return {"report": report, "totals": {k: round(v, 2) if 'value' in k else v for k, v in totals.items()}, "extra_columns": extra_columns}

@portal_router.get("/reports/consolidated/{client_id}/barcode-wise")
async def get_consolidated_barcode_wise(client_id: str):
    """Consolidated barcode-wise report across all sessions for a client"""
    session_ids = await _get_all_session_ids_for_client(client_id)
    master_by_barcode = await _load_master_for_client(client_id)
    reco_maps = await _build_reco_maps(client_id)
    extra_columns = await _get_extra_columns_for_client(client_id)
    
    expected_by_barcode = {}
    physical_by_barcode = {}
    
    for sid in session_ids:
        expected = await db.expected_stock.find({"session_id": sid}, {"_id": 0}).to_list(100000)
        for e in expected:
            bc = e["barcode"]
            if bc not in expected_by_barcode:
                expected_by_barcode[bc] = {"qty": 0, "description": e.get("description", ""), "category": e.get("category", ""), "mrp": e.get("mrp", 0), "cost": e.get("cost", 0)}
            expected_by_barcode[bc]["qty"] += e.get("qty", 0)
        synced = await db.synced_locations.find({"session_id": sid}, {"_id": 0}).to_list(100000)
        for s in synced:
            for item in s.get("items", []):
                bc = item["barcode"]
                physical_by_barcode[bc] = physical_by_barcode.get(bc, 0) + item.get("quantity", 0)
    
    all_barcodes = set(expected_by_barcode.keys()) | set(physical_by_barcode.keys())
    report = []
    totals = {"stock_qty": 0, "stock_value": 0, "physical_qty": 0, "physical_value": 0, "reco_qty": 0, "final_qty": 0, "final_value": 0, "diff_qty": 0, "diff_value": 0}
    
    for bc in sorted(all_barcodes):
        exp = expected_by_barcode.get(bc, {})
        master = master_by_barcode.get(bc, {})
        description = master.get("description", "") or exp.get("description", "")
        category = master.get("category", "") or exp.get("category", "")
        mrp = master.get("mrp", 0) or exp.get("mrp", 0) or 0
        cost = master.get("cost", 0) or exp.get("cost", 0) or 0
        
        stock_qty = exp.get("qty", 0) if exp else 0
        physical_qty = physical_by_barcode.get(bc, 0)
        reco_qty = reco_maps["barcode"].get(bc, 0)
        final_qty = physical_qty + reco_qty
        diff_qty = final_qty - stock_qty
        stock_value = stock_qty * cost
        physical_value = physical_qty * cost
        final_value = final_qty * cost
        diff_value = final_value - stock_value
        accuracy = calc_accuracy(stock_qty, final_qty)
        in_master = bc in master_by_barcode
        in_expected = bc in expected_by_barcode
        scanned = bc in physical_by_barcode
        remark = generate_remark(stock_qty, final_qty, accuracy, True, scanned, in_master, in_expected)
        
        for k, v in [("stock_qty", stock_qty), ("stock_value", stock_value), ("physical_qty", physical_qty), ("physical_value", physical_value), ("reco_qty", reco_qty), ("final_qty", final_qty), ("final_value", final_value), ("diff_qty", diff_qty), ("diff_value", diff_value)]:
            totals[k] += v
        
        row = {
            "barcode": bc, "description": description, "category": category, "mrp": mrp, "cost": cost,
            "stock_qty": stock_qty, "stock_value": round(stock_value, 2),
            "physical_qty": physical_qty, "physical_value": round(physical_value, 2),
            "reco_qty": reco_qty, "final_qty": final_qty, "final_value": round(final_value, 2),
            "diff_qty": diff_qty, "diff_value": round(diff_value, 2), "accuracy_pct": accuracy, "remark": remark
        }
        if extra_columns:
            _merge_custom_fields(row, master_by_barcode.get(bc, {}), extra_columns)
        report.append(row)
    
    totals["accuracy_pct"] = calc_accuracy(totals["stock_qty"], totals["final_qty"])
    return {"report": report, "totals": {k: round(v, 2) if 'value' in k else v for k, v in totals.items()}, "extra_columns": extra_columns}

@portal_router.get("/reports/consolidated/{client_id}/article-wise")
async def get_consolidated_article_wise(client_id: str):
    """Consolidated article-wise report across all sessions for a client"""
    session_ids = await _get_all_session_ids_for_client(client_id)
    master_by_barcode = await _load_master_for_client(client_id)
    reco_maps = await _build_reco_maps(client_id)
    extra_columns = await _get_extra_columns_for_client(client_id)
    
    expected_by_barcode = {}
    physical_by_barcode = {}
    
    for sid in session_ids:
        expected = await db.expected_stock.find({"session_id": sid}, {"_id": 0}).to_list(100000)
        for e in expected:
            bc = e["barcode"]
            if bc not in expected_by_barcode:
                expected_by_barcode[bc] = {"qty": 0, "category": e.get("category", ""), "article_code": e.get("article_code", ""), "article_name": e.get("article_name", "")}
            expected_by_barcode[bc]["qty"] += e.get("qty", 0)
        synced = await db.synced_locations.find({"session_id": sid}, {"_id": 0}).to_list(100000)
        for s in synced:
            for item in s.get("items", []):
                bc = item["barcode"]
                physical_by_barcode[bc] = physical_by_barcode.get(bc, 0) + item.get("quantity", 0)
    
    all_barcodes = set(expected_by_barcode.keys()) | set(physical_by_barcode.keys())
    article_groups = {}
    for bc in all_barcodes:
        master = master_by_barcode.get(bc, {})
        exp = expected_by_barcode.get(bc, {})
        article_code = master.get("article_code", "") or exp.get("article_code", "") or "UNMAPPED"
        if article_code not in article_groups:
            article_groups[article_code] = {"article_name": master.get("article_name", "") or exp.get("article_name", ""), "category": master.get("category", "") or exp.get("category", "Unmapped" if article_code == "UNMAPPED" else ""), "barcodes": [], "stock_qty": 0, "physical_qty": 0, "mrp": master.get("mrp", 0) or 0, "cost": master.get("cost", 0) or 0}
        article_groups[article_code]["barcodes"].append(bc)
        article_groups[article_code]["stock_qty"] += expected_by_barcode.get(bc, {}).get("qty", 0)
        article_groups[article_code]["physical_qty"] += physical_by_barcode.get(bc, 0)
    
    report = []
    totals = {"stock_qty": 0, "stock_value": 0, "physical_qty": 0, "physical_value": 0, "reco_qty": 0, "final_qty": 0, "final_value": 0, "diff_qty": 0, "diff_value": 0}
    
    for code in sorted(article_groups.keys()):
        g = article_groups[code]
        cost = g["cost"]
        reco_qty = reco_maps["article"].get(code, 0)
        final_qty = g["physical_qty"] + reco_qty
        diff_qty = final_qty - g["stock_qty"]
        stock_value = g["stock_qty"] * cost
        physical_value = g["physical_qty"] * cost
        final_value = final_qty * cost
        diff_value = final_value - stock_value
        accuracy = calc_accuracy(g["stock_qty"], final_qty)
        remark = generate_remark(g["stock_qty"], final_qty, accuracy, code != "UNMAPPED", g["physical_qty"] > 0, code != "UNMAPPED", g["stock_qty"] > 0)
        
        for k, v in [("stock_qty", g["stock_qty"]), ("stock_value", stock_value), ("physical_qty", g["physical_qty"]), ("physical_value", physical_value), ("reco_qty", reco_qty), ("final_qty", final_qty), ("final_value", final_value), ("diff_qty", diff_qty), ("diff_value", diff_value)]:
            totals[k] += v
        
        row = {
            "article_code": code, "article_name": g["article_name"], "category": g["category"],
            "barcodes": sorted(g["barcodes"]), "barcode_count": len(g["barcodes"]),
            "mrp": g["mrp"], "cost": cost,
            "stock_qty": g["stock_qty"], "stock_value": round(stock_value, 2),
            "physical_qty": g["physical_qty"], "physical_value": round(physical_value, 2),
            "reco_qty": reco_qty, "final_qty": final_qty, "final_value": round(final_value, 2),
            "diff_qty": diff_qty, "diff_value": round(diff_value, 2), "accuracy_pct": accuracy, "remark": remark
        }
        # For article-wise, pull custom fields from the first barcode's master data
        if extra_columns and g["barcodes"]:
            first_bc = sorted(g["barcodes"])[0]
            _merge_custom_fields(row, master_by_barcode.get(first_bc, {}), extra_columns)
        report.append(row)
    
    totals["accuracy_pct"] = calc_accuracy(totals["stock_qty"], totals["final_qty"])
    return {"report": report, "totals": {k: round(v, 2) if 'value' in k else v for k, v in totals.items()}, "extra_columns": extra_columns}

@portal_router.get("/reports/consolidated/{client_id}/category-summary")
async def get_consolidated_category_summary(client_id: str):
    """Consolidated category summary across all sessions for a client"""
    session_ids = await _get_all_session_ids_for_client(client_id)
    master_by_barcode = await _load_master_for_client(client_id)
    reco_maps = await _build_reco_maps(client_id)
    
    expected_by_barcode = {}
    physical_by_barcode = {}
    
    for sid in session_ids:
        expected = await db.expected_stock.find({"session_id": sid}, {"_id": 0}).to_list(100000)
        for e in expected:
            bc = e["barcode"]
            if bc not in expected_by_barcode:
                expected_by_barcode[bc] = {"qty": 0, "category": e.get("category", ""), "cost": e.get("cost", 0)}
            expected_by_barcode[bc]["qty"] += e.get("qty", 0)
        synced = await db.synced_locations.find({"session_id": sid}, {"_id": 0}).to_list(100000)
        for s in synced:
            for item in s.get("items", []):
                bc = item["barcode"]
                physical_by_barcode[bc] = physical_by_barcode.get(bc, 0) + item.get("quantity", 0)
    
    all_barcodes = set(expected_by_barcode.keys()) | set(physical_by_barcode.keys())
    barcode_reco = reco_maps["barcode"]
    
    cat_groups = {}
    for bc in all_barcodes:
        master = master_by_barcode.get(bc, {})
        exp = expected_by_barcode.get(bc, {})
        category = master.get("category", "") or exp.get("category", "") or "Unmapped"
        if category not in cat_groups:
            cat_groups[category] = {"item_count": 0, "stock_qty": 0, "physical_qty": 0, "reco_qty": 0, "stock_value": 0, "physical_value": 0}
        cost = master.get("cost", 0) or exp.get("cost", 0) or 0
        stock_qty = expected_by_barcode.get(bc, {}).get("qty", 0)
        physical_qty = physical_by_barcode.get(bc, 0)
        reco_qty = barcode_reco.get(bc, 0)
        cat_groups[category]["item_count"] += 1
        cat_groups[category]["stock_qty"] += stock_qty
        cat_groups[category]["physical_qty"] += physical_qty
        cat_groups[category]["reco_qty"] += reco_qty
        cat_groups[category]["stock_value"] += stock_qty * cost
        cat_groups[category]["physical_value"] += physical_qty * cost
    
    report = []
    totals = {"item_count": 0, "stock_qty": 0, "stock_value": 0, "physical_qty": 0, "physical_value": 0, "reco_qty": 0, "final_qty": 0, "final_value": 0, "diff_qty": 0, "diff_value": 0}
    
    for cat in sorted(cat_groups.keys()):
        g = cat_groups[cat]
        final_qty = g["physical_qty"] + g["reco_qty"]
        avg_cost = g["physical_value"] / g["physical_qty"] if g["physical_qty"] > 0 else (g["stock_value"] / g["stock_qty"] if g["stock_qty"] > 0 else 0)
        final_value = g["physical_value"] + g["reco_qty"] * avg_cost
        diff_qty = final_qty - g["stock_qty"]
        diff_value = final_value - g["stock_value"]
        accuracy = calc_accuracy(g["stock_qty"], final_qty)
        remark = generate_remark(g["stock_qty"], final_qty, accuracy)
        
        for k, v in [("item_count", g["item_count"]), ("stock_qty", g["stock_qty"]), ("stock_value", g["stock_value"]), ("physical_qty", g["physical_qty"]), ("physical_value", g["physical_value"]), ("reco_qty", g["reco_qty"]), ("final_qty", final_qty), ("final_value", final_value), ("diff_qty", diff_qty), ("diff_value", diff_value)]:
            totals[k] += v
        
        report.append({
            "category": cat, "item_count": g["item_count"],
            "stock_qty": g["stock_qty"], "stock_value": round(g["stock_value"], 2),
            "physical_qty": g["physical_qty"], "physical_value": round(g["physical_value"], 2),
            "reco_qty": g["reco_qty"], "final_qty": final_qty, "final_value": round(final_value, 2),
            "diff_qty": diff_qty, "diff_value": round(diff_value, 2), "accuracy_pct": accuracy, "remark": remark
        })
    
    totals["accuracy_pct"] = calc_accuracy(totals["stock_qty"], totals["final_qty"])
    return {"report": report, "totals": {k: round(v, 2) if 'value' in k else v for k, v in totals.items()}}

# ==================== INDIVIDUAL SESSION REPORTS ====================

@portal_router.get("/reports/{session_id}/bin-wise")
async def get_bin_wise_report(session_id: str):
    """Bin-wise summary report with reco integration."""
    expected = await db.expected_stock.find({"session_id": session_id}, {"_id": 0}).to_list(100000)
    expected_by_location = {}
    for e in expected:
        loc = e.get("location", "Unknown")
        expected_by_location[loc] = expected_by_location.get(loc, 0) + e.get("qty", 0)
    
    synced = await db.synced_locations.find({"session_id": session_id}, {"_id": 0}).to_list(100000)
    physical_by_location = {}
    empty_bin_map = {}
    for s in synced:
        loc = s["location_name"]
        physical_by_location[loc] = physical_by_location.get(loc, 0) + s["total_quantity"]
        if s.get("is_empty", False):
            empty_bin_map[loc] = {"is_empty": True, "empty_remarks": s.get("empty_remarks", ""), "device_name": s.get("device_name", ""), "synced_at": s.get("synced_at", "")}
    
    conflict_locs = await db.conflict_locations.find({"session_id": session_id, "status": "pending"}, {"_id": 0}).to_list(10000)
    conflict_map = {}
    for c in conflict_locs:
        conflict_map[c["location_name"]] = {"conflict_id": c["id"], "entry_count": len(c.get("entries", [])), "devices": [e.get("device_name", "Unknown") for e in c.get("entries", [])]}
    
    # Build reco aggregated by location from detailed-level adjustments
    reco_maps = EMPTY_RECO_MAPS
    location_reco = {}
    for key, reco in reco_maps["detailed"].items():
        loc = key.split("|")[0]
        location_reco[loc] = location_reco.get(loc, 0) + reco
    
    all_locations = set(expected_by_location.keys()) | set(physical_by_location.keys()) | set(conflict_map.keys())
    
    report = []
    total_stock = total_physical = total_reco = total_final = total_diff = 0
    count_completed = count_empty = count_pending = count_conflict = 0
    
    for loc in sorted(all_locations):
        stock_qty = expected_by_location.get(loc, 0)
        physical_qty = physical_by_location.get(loc, 0)
        reco_qty = location_reco.get(loc, 0)
        final_qty = physical_qty + reco_qty
        diff_qty = final_qty - stock_qty
        accuracy = calc_accuracy(stock_qty, final_qty)
        in_expected = loc in expected_by_location
        scanned = loc in physical_by_location
        is_empty_bin = loc in empty_bin_map
        is_conflict = loc in conflict_map
        
        if is_conflict:
            status = "conflict"
            count_conflict += 1
            cinfo = conflict_map[loc]
            devices_str = ", ".join(cinfo["devices"])
            remark = f"Conflict — Duplicate scan from {cinfo['entry_count']} devices ({devices_str}). Pending admin review."
            report.append({"location": loc, "stock_qty": stock_qty, "physical_qty": 0, "reco_qty": 0, "final_qty": 0, "difference_qty": 0 - stock_qty, "accuracy_pct": 0.0, "remark": remark, "status": status, "is_empty": False, "empty_remarks": "", "conflict_id": cinfo["conflict_id"]})
            continue
        elif is_empty_bin:
            status = "empty_bin"
            count_empty += 1
            empty_info = empty_bin_map[loc]
            empty_note = empty_info.get("empty_remarks", "").strip()
            remark = f"Empty Bin — {empty_note}" if empty_note and not empty_note.lower().startswith("empty bin") else (empty_note if empty_note else "Empty Bin — Location verified empty during physical count")
        elif not scanned and in_expected:
            status = "pending"
            count_pending += 1
            remark = "Pending — Location not yet counted during physical audit"
            accuracy = 0.0
        else:
            status = "completed"
            count_completed += 1
            remark = generate_remark(stock_qty, final_qty, accuracy, in_expected, scanned)
        
        total_stock += stock_qty
        total_physical += physical_qty
        total_reco += reco_qty
        total_final += final_qty
        total_diff += diff_qty
        
        report.append({"location": loc, "stock_qty": stock_qty, "physical_qty": physical_qty, "reco_qty": reco_qty, "final_qty": final_qty, "difference_qty": diff_qty, "accuracy_pct": accuracy, "remark": remark, "status": status, "is_empty": is_empty_bin, "empty_remarks": empty_bin_map.get(loc, {}).get("empty_remarks", "") if is_empty_bin else ""})
    
    total_accuracy = calc_accuracy(total_stock, total_final)
    return {
        "report": report,
        "totals": {"stock_qty": total_stock, "physical_qty": total_physical, "reco_qty": total_reco, "final_qty": total_final, "difference_qty": total_diff, "accuracy_pct": total_accuracy},
        "summary": {"total_locations": len(report), "completed": count_completed, "empty_bins": count_empty, "pending": count_pending, "conflicts": count_conflict}
    }

@portal_router.get("/reports/{session_id}/detailed")
async def get_detailed_report(session_id: str):
    """Detailed item-wise report with values, accuracy%, remarks. Uses master products for product info."""
    master_by_barcode = await get_master_for_session(session_id)
    reco_maps = EMPTY_RECO_MAPS
    
    # Get extra columns for this session's client
    session = await db.audit_sessions.find_one({"id": session_id}, {"_id": 0})
    extra_columns = await _get_extra_columns_for_client(session.get("client_id", "")) if session else []
    
    expected = await db.expected_stock.find({"session_id": session_id}, {"_id": 0}).to_list(100000)
    expected_map = {}
    for e in expected:
        key = f"{e.get('location', '')}|{e['barcode']}"
        expected_map[key] = e
    
    synced = await db.synced_locations.find({"session_id": session_id}, {"_id": 0}).to_list(100000)
    physical_map = {}
    for s in synced:
        loc = s["location_name"]
        for item in s["items"]:
            key = f"{loc}|{item['barcode']}"
            if key not in physical_map:
                physical_map[key] = {"location": loc, "barcode": item["barcode"], "product_name": item.get("product_name", ""), "quantity": 0}
            physical_map[key]["quantity"] += item["quantity"]
    
    all_keys = set(expected_map.keys()) | set(physical_map.keys())
    
    report = []
    totals = {"stock_qty": 0, "stock_value": 0, "physical_qty": 0, "physical_value": 0, "reco_qty": 0, "final_qty": 0, "final_value": 0, "diff_qty": 0, "diff_value": 0}
    
    for key in sorted(all_keys):
        exp = expected_map.get(key, {})
        phy = physical_map.get(key, {})
        location = exp.get("location") or phy.get("location", "")
        barcode = exp.get("barcode") or phy.get("barcode", "")
        master_info = master_by_barcode.get(barcode, {})
        description = exp.get("description") or master_info.get("description") or phy.get("product_name", "")
        category = exp.get("category") or master_info.get("category", "")
        mrp = exp.get("mrp") or master_info.get("mrp", 0)
        cost = exp.get("cost") or master_info.get("cost", 0)
        
        stock_qty = exp.get("qty", 0)
        physical_qty = phy.get("quantity", 0)
        reco_qty = reco_maps["detailed"].get(key, 0)
        final_qty = physical_qty + reco_qty
        diff_qty = final_qty - stock_qty
        stock_value = stock_qty * cost
        physical_value = physical_qty * cost
        final_value = final_qty * cost
        diff_value = final_value - stock_value
        
        accuracy = calc_accuracy(stock_qty, final_qty)
        in_expected = key in expected_map
        in_prod_master = barcode in master_by_barcode
        scanned = key in physical_map
        remark = generate_remark(stock_qty, final_qty, accuracy, in_master=in_expected, scanned=scanned, in_product_master=in_prod_master, in_expected_stock=in_expected)
        
        totals["stock_qty"] += stock_qty
        totals["stock_value"] += stock_value
        totals["physical_qty"] += physical_qty
        totals["physical_value"] += physical_value
        totals["reco_qty"] += reco_qty
        totals["final_qty"] += final_qty
        totals["final_value"] += final_value
        totals["diff_qty"] += diff_qty
        totals["diff_value"] += diff_value
        
        row = {
            "location": location, "barcode": barcode, "description": description, "category": category,
            "mrp": mrp, "cost": cost, "stock_qty": stock_qty, "stock_value": stock_value,
            "physical_qty": physical_qty, "physical_value": physical_value,
            "reco_qty": reco_qty, "final_qty": final_qty, "final_value": final_value,
            "diff_qty": diff_qty, "diff_value": diff_value, "accuracy_pct": accuracy, "remark": remark,
            "in_master": barcode in master_by_barcode, "in_expected_stock": key in expected_map
        }
        if extra_columns:
            _merge_custom_fields(row, master_by_barcode.get(barcode, {}), extra_columns)
        report.append(row)
    
    totals["accuracy_pct"] = calc_accuracy(totals["stock_qty"], totals["final_qty"])
    return {"report": report, "totals": totals, "extra_columns": extra_columns}


@portal_router.get("/reports/{session_id}/barcode-wise")
async def get_barcode_wise_report(session_id: str):
    """Barcode-wise variance: Pivots by barcode across all locations, uses master for product info"""
    master_by_barcode = await get_master_for_session(session_id)
    reco_maps = EMPTY_RECO_MAPS
    
    session = await db.audit_sessions.find_one({"id": session_id}, {"_id": 0})
    extra_columns = await _get_extra_columns_for_client(session.get("client_id", "")) if session else []
    
    expected = await db.expected_stock.find({"session_id": session_id}, {"_id": 0}).to_list(100000)
    expected_by_barcode = {}
    for e in expected:
        bc = e["barcode"]
        if bc not in expected_by_barcode:
            expected_by_barcode[bc] = {"qty": 0, "description": e.get("description", ""), "category": e.get("category", ""), "mrp": e.get("mrp", 0), "cost": e.get("cost", 0)}
        expected_by_barcode[bc]["qty"] += e.get("qty", 0)
    
    synced = await db.synced_locations.find({"session_id": session_id}, {"_id": 0}).to_list(100000)
    physical_by_barcode = {}
    for s in synced:
        for item in s["items"]:
            bc = item["barcode"]
            if bc not in physical_by_barcode:
                physical_by_barcode[bc] = {"barcode": bc, "product_name": item.get("product_name", ""), "quantity": 0}
            physical_by_barcode[bc]["quantity"] += item["quantity"]
    
    all_barcodes = set(expected_by_barcode.keys()) | set(physical_by_barcode.keys())
    
    report = []
    totals = {"stock_qty": 0, "stock_value": 0, "physical_qty": 0, "physical_value": 0, "reco_qty": 0, "final_qty": 0, "final_value": 0, "diff_qty": 0, "diff_value": 0}
    
    for bc in sorted(all_barcodes):
        exp = expected_by_barcode.get(bc, {})
        phy = physical_by_barcode.get(bc, {})
        master_info = master_by_barcode.get(bc, {})
        description = exp.get("description") or master_info.get("description") or phy.get("product_name", "")
        category = exp.get("category") or master_info.get("category", "")
        mrp = exp.get("mrp") or master_info.get("mrp", 0)
        cost = exp.get("cost") or master_info.get("cost", 0)
        
        stock_qty = exp.get("qty", 0)
        physical_qty = phy.get("quantity", 0)
        reco_qty = reco_maps["barcode"].get(bc, 0)
        final_qty = physical_qty + reco_qty
        diff_qty = final_qty - stock_qty
        stock_value = stock_qty * cost
        physical_value = physical_qty * cost
        final_value = final_qty * cost
        diff_value = final_value - stock_value
        
        accuracy = calc_accuracy(stock_qty, final_qty)
        in_expected = bc in expected_by_barcode
        in_prod_master = bc in master_by_barcode
        scanned = bc in physical_by_barcode
        remark = generate_remark(stock_qty, final_qty, accuracy, in_master=in_expected, scanned=scanned, in_product_master=in_prod_master, in_expected_stock=in_expected)
        
        totals["stock_qty"] += stock_qty
        totals["stock_value"] += stock_value
        totals["physical_qty"] += physical_qty
        totals["physical_value"] += physical_value
        totals["reco_qty"] += reco_qty
        totals["final_qty"] += final_qty
        totals["final_value"] += final_value
        totals["diff_qty"] += diff_qty
        totals["diff_value"] += diff_value
        
        row = {
            "barcode": bc, "description": description, "category": category, "mrp": mrp, "cost": cost,
            "stock_qty": stock_qty, "stock_value": stock_value,
            "physical_qty": physical_qty, "physical_value": physical_value,
            "reco_qty": reco_qty, "final_qty": final_qty, "final_value": final_value,
            "diff_qty": diff_qty, "diff_value": diff_value, "accuracy_pct": accuracy, "remark": remark,
            "in_master": bc in master_by_barcode, "in_expected_stock": bc in expected_by_barcode
        }
        if extra_columns:
            _merge_custom_fields(row, master_by_barcode.get(bc, {}), extra_columns)
        report.append(row)
    
    totals["accuracy_pct"] = calc_accuracy(totals["stock_qty"], totals["final_qty"])
    return {"report": report, "totals": totals, "extra_columns": extra_columns}


@portal_router.get("/reports/{session_id}/article-wise")
async def get_article_wise_report(session_id: str):
    """Article-wise variance: Groups barcodes by article_code from master, calculates variance at article level"""
    master_by_barcode = await get_master_for_session(session_id)
    reco_maps = EMPTY_RECO_MAPS
    
    session_info = await db.audit_sessions.find_one({"id": session_id}, {"_id": 0})
    extra_columns = await _get_extra_columns_for_client(session_info.get("client_id", "")) if session_info else []
    
    expected = await db.expected_stock.find({"session_id": session_id}, {"_id": 0}).to_list(100000)
    barcode_to_article = {}
    expected_by_article = {}
    
    for bc, m in master_by_barcode.items():
        article_code = m.get("article_code", "") or bc
        barcode_to_article[bc] = article_code
    
    for e in expected:
        bc = e["barcode"]
        article_code = e.get("article_code", "") or barcode_to_article.get(bc, "") or bc
        barcode_to_article[bc] = article_code
        master_info = master_by_barcode.get(bc, {})
        article_name = e.get("article_name", "") or e.get("description", "") or master_info.get("article_name") or master_info.get("description", "")
        category = e.get("category", "") or master_info.get("category", "")
        cost = e.get("cost", 0) or master_info.get("cost", 0)
        mrp = e.get("mrp", 0) or master_info.get("mrp", 0)
        if article_code not in expected_by_article:
            expected_by_article[article_code] = {"article_code": article_code, "article_name": article_name, "category": category, "barcodes": set(), "mrp": mrp, "cost": cost, "qty": 0}
        expected_by_article[article_code]["barcodes"].add(bc)
        expected_by_article[article_code]["qty"] += e.get("qty", 0)
    
    synced = await db.synced_locations.find({"session_id": session_id}, {"_id": 0}).to_list(100000)
    physical_by_article = {}
    unmapped_barcodes = {}
    
    for s in synced:
        for item in s["items"]:
            bc = item["barcode"]
            article_code = barcode_to_article.get(bc, None)
            if article_code is None:
                in_prod_master = bc in master_by_barcode
                if in_prod_master:
                    master_info = master_by_barcode[bc]
                    article_code = master_info.get("article_code", "") or bc
                    barcode_to_article[bc] = article_code
                    if article_code not in expected_by_article:
                        expected_by_article[article_code] = {"article_code": article_code, "article_name": master_info.get("article_name", master_info.get("description", "")), "category": master_info.get("category", ""), "barcodes": set(), "mrp": master_info.get("mrp", 0), "cost": master_info.get("cost", 0), "qty": 0}
                    expected_by_article[article_code]["barcodes"].add(bc)
                    physical_by_article[article_code] = physical_by_article.get(article_code, 0) + item["quantity"]
                else:
                    if bc not in unmapped_barcodes:
                        unmapped_barcodes[bc] = {"barcode": bc, "product_name": item.get("product_name", ""), "quantity": 0}
                    unmapped_barcodes[bc]["quantity"] += item["quantity"]
            else:
                physical_by_article[article_code] = physical_by_article.get(article_code, 0) + item["quantity"]
    
    report = []
    totals = {"stock_qty": 0, "stock_value": 0, "physical_qty": 0, "physical_value": 0, "reco_qty": 0, "final_qty": 0, "final_value": 0, "diff_qty": 0, "diff_value": 0}
    
    all_article_codes = set(expected_by_article.keys()) | set(physical_by_article.keys())
    
    for ac in sorted(all_article_codes):
        exp = expected_by_article.get(ac, {})
        article_code = ac
        article_name = exp.get("article_name", "")
        category = exp.get("category", "")
        barcodes = list(exp.get("barcodes", set()))
        mrp = exp.get("mrp", 0)
        cost = exp.get("cost", 0)
        
        stock_qty = exp.get("qty", 0)
        physical_qty = physical_by_article.get(ac, 0)
        reco_qty = reco_maps["article"].get(ac, 0)
        final_qty = physical_qty + reco_qty
        diff_qty = final_qty - stock_qty
        stock_value = stock_qty * cost
        physical_value = physical_qty * cost
        final_value = final_qty * cost
        diff_value = final_value - stock_value
        
        accuracy = calc_accuracy(stock_qty, final_qty)
        in_master = ac in expected_by_article
        scanned = ac in physical_by_article
        remark = generate_remark(stock_qty, final_qty, accuracy, in_master, scanned)
        
        totals["stock_qty"] += stock_qty
        totals["stock_value"] += stock_value
        totals["physical_qty"] += physical_qty
        totals["physical_value"] += physical_value
        totals["reco_qty"] += reco_qty
        totals["final_qty"] += final_qty
        totals["final_value"] += final_value
        totals["diff_qty"] += diff_qty
        totals["diff_value"] += diff_value
        
        row = {
            "article_code": article_code, "article_name": article_name, "category": category,
            "barcodes": barcodes, "barcode_count": len(barcodes), "mrp": mrp, "cost": cost,
            "stock_qty": stock_qty, "stock_value": stock_value,
            "physical_qty": physical_qty, "physical_value": physical_value,
            "reco_qty": reco_qty, "final_qty": final_qty, "final_value": final_value,
            "diff_qty": diff_qty, "diff_value": diff_value, "accuracy_pct": accuracy, "remark": remark
        }
        if extra_columns and barcodes:
            _merge_custom_fields(row, master_by_barcode.get(barcodes[0], {}), extra_columns)
        report.append(row)
    
    for bc, data in sorted(unmapped_barcodes.items()):
        physical_qty = data["quantity"]
        accuracy = 0.0
        remark = generate_remark(0, physical_qty, accuracy, in_master=False, scanned=True)
        totals["physical_qty"] += physical_qty
        totals["final_qty"] += physical_qty
        totals["diff_qty"] += physical_qty
        report.append({
            "article_code": "UNMAPPED", "article_name": f"Not in Master ({bc})", "category": "Unmapped",
            "barcodes": [bc], "barcode_count": 1, "mrp": 0, "cost": 0,
            "stock_qty": 0, "stock_value": 0, "physical_qty": physical_qty, "physical_value": 0,
            "reco_qty": 0, "final_qty": physical_qty, "final_value": 0,
            "diff_qty": physical_qty, "diff_value": 0, "accuracy_pct": accuracy, "remark": remark
        })
    
    totals["accuracy_pct"] = calc_accuracy(totals["stock_qty"], totals["final_qty"])
    return {"report": report, "totals": totals, "extra_columns": extra_columns}


@portal_router.get("/reports/{session_id}/category-summary")
async def get_category_summary(session_id: str):
    """Category-wise summary: Groups all data by category. Uses master products for category info."""
    master_by_barcode = await get_master_for_session(session_id)
    reco_maps = EMPTY_RECO_MAPS
    
    expected = await db.expected_stock.find({"session_id": session_id}, {"_id": 0}).to_list(100000)
    barcode_info = {}
    expected_by_category = {}
    for e in expected:
        bc = e["barcode"]
        master_info = master_by_barcode.get(bc, {})
        cat = e.get("category", "") or master_info.get("category", "") or "Uncategorized"
        cost = e.get("cost", 0) or master_info.get("cost", 0)
        barcode_info[bc] = {"category": cat, "cost": cost}
        if cat not in expected_by_category:
            expected_by_category[cat] = {"qty": 0, "value": 0, "item_count": 0}
        expected_by_category[cat]["qty"] += e.get("qty", 0)
        expected_by_category[cat]["value"] += e.get("qty", 0) * cost
        expected_by_category[cat]["item_count"] += 1
    
    synced = await db.synced_locations.find({"session_id": session_id}, {"_id": 0}).to_list(100000)
    physical_by_barcode = {}
    for s in synced:
        for item in s["items"]:
            bc = item["barcode"]
            if bc not in barcode_info:
                master_info = master_by_barcode.get(bc, {})
                barcode_info[bc] = {"category": master_info.get("category", "") or "Unmapped", "cost": master_info.get("cost", 0)}
            physical_by_barcode[bc] = physical_by_barcode.get(bc, 0) + item["quantity"]
    
    # Apply reco at barcode level, then aggregate by category
    barcode_reco = reco_maps["barcode"]
    article_reco = reco_maps["article"]
    
    # Build final_qty per barcode
    all_barcodes = set(barcode_info.keys()) | set(physical_by_barcode.keys()) | set(barcode_reco.keys())
    
    physical_by_category = {}
    reco_by_category = {}
    
    for bc in all_barcodes:
        info = barcode_info.get(bc, {"category": "Unmapped", "cost": 0})
        cat = info["category"]
        cost = info["cost"]
        phy = physical_by_barcode.get(bc, 0)
        reco = barcode_reco.get(bc, 0)
        if cat not in physical_by_category:
            physical_by_category[cat] = {"qty": 0, "value": 0}
        if cat not in reco_by_category:
            reco_by_category[cat] = 0
        physical_by_category[cat]["qty"] += phy
        physical_by_category[cat]["value"] += phy * cost
        reco_by_category[cat] += reco
    
    # Handle article-level reco for article-wise sessions
    if article_reco:
        session = await db.audit_sessions.find_one({"id": session_id}, {"_id": 0})
        if session and session.get("variance_mode") == "article-wise":
            article_to_category = {}
            for bc, info in barcode_info.items():
                ac = master_by_barcode.get(bc, {}).get("article_code", "")
                if ac:
                    article_to_category[ac] = info["category"]
            for ac, reco in article_reco.items():
                cat = article_to_category.get(ac, "Unmapped")
                if cat not in reco_by_category:
                    reco_by_category[cat] = 0
                reco_by_category[cat] += reco
    
    all_categories = set(expected_by_category.keys()) | set(physical_by_category.keys())
    
    report = []
    totals = {"stock_qty": 0, "stock_value": 0, "physical_qty": 0, "physical_value": 0, "reco_qty": 0, "final_qty": 0, "final_value": 0, "diff_qty": 0, "diff_value": 0, "item_count": 0}
    
    for cat in sorted(all_categories):
        exp = expected_by_category.get(cat, {"qty": 0, "value": 0, "item_count": 0})
        phy = physical_by_category.get(cat, {"qty": 0, "value": 0})
        reco = reco_by_category.get(cat, 0)
        
        stock_qty = exp["qty"]
        stock_value = exp["value"]
        physical_qty = phy["qty"]
        physical_value = phy["value"]
        reco_qty = reco
        final_qty = physical_qty + reco_qty
        # Approximate final_value: scale physical_value proportionally
        final_value = physical_value + (reco_qty * (physical_value / physical_qty if physical_qty > 0 else (stock_value / stock_qty if stock_qty > 0 else 0)))
        diff_qty = final_qty - stock_qty
        diff_value = final_value - stock_value
        item_count = exp["item_count"]
        
        accuracy = calc_accuracy(stock_qty, final_qty)
        in_master = cat in expected_by_category
        scanned = cat in physical_by_category
        remark = generate_remark(stock_qty, final_qty, accuracy, in_master, scanned)
        
        for k, v in [("stock_qty", stock_qty), ("stock_value", stock_value), ("physical_qty", physical_qty), ("physical_value", physical_value), ("reco_qty", reco_qty), ("final_qty", final_qty), ("final_value", final_value), ("diff_qty", diff_qty), ("diff_value", diff_value), ("item_count", item_count)]:
            totals[k] += v
        
        report.append({
            "category": cat, "item_count": item_count,
            "stock_qty": stock_qty, "stock_value": round(stock_value, 2),
            "physical_qty": physical_qty, "physical_value": round(physical_value, 2),
            "reco_qty": reco_qty, "final_qty": final_qty, "final_value": round(final_value, 2),
            "diff_qty": diff_qty, "diff_value": round(diff_value, 2), "accuracy_pct": accuracy, "remark": remark
        })
    
    totals["accuracy_pct"] = calc_accuracy(totals["stock_qty"], totals["final_qty"])
    totals["stock_value"] = round(totals["stock_value"], 2)
    totals["physical_value"] = round(totals["physical_value"], 2)
    totals["final_value"] = round(totals["final_value"], 2)
    totals["diff_value"] = round(totals["diff_value"], 2)
    
    return {"report": report, "totals": totals}

@portal_router.get("/reports/{session_id}/daily-progress")
async def get_daily_progress(session_id: str):
    """Daily progress report"""
    synced = await db.synced_locations.find({"session_id": session_id}, {"_id": 0}).to_list(100000)
    
    daily_data = {}
    for s in synced:
        date = s["sync_date"]
        if date not in daily_data:
            daily_data[date] = {
                "date": date,
                "locations": 0,
                "items": 0,
                "quantity": 0,
                "devices": set()
            }
        daily_data[date]["locations"] += 1
        daily_data[date]["items"] += s["total_items"]
        daily_data[date]["quantity"] += s["total_quantity"]
        daily_data[date]["devices"].add(s["device_name"])
    
    # Convert sets to lists
    report = []
    for date in sorted(daily_data.keys()):
        data = daily_data[date]
        report.append({
            "date": data["date"],
            "locations": data["locations"],
            "items": data["items"],
            "quantity": data["quantity"],
            "devices": list(data["devices"])
        })
    
    return report

# ==================== EMPTY BINS & PENDING LOCATIONS ROUTES ====================

@portal_router.get("/reports/{session_id}/empty-bins")
async def get_empty_bins(session_id: str):
    """Get all empty bins for a session"""
    session = await db.audit_sessions.find_one({"id": session_id}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    empty_locations = await db.synced_locations.find(
        {"session_id": session_id, "is_empty": True},
        {"_id": 0}
    ).sort("synced_at", -1).to_list(100000)
    
    total_empty = len(empty_locations)
    
    # Group by date
    by_date = {}
    for loc in empty_locations:
        d = loc.get("sync_date", "unknown")
        if d not in by_date:
            by_date[d] = []
        by_date[d].append({
            "location_id": loc.get("location_id", ""),
            "location_name": loc.get("location_name", ""),
            "device_name": loc.get("device_name", ""),
            "empty_remarks": loc.get("empty_remarks", ""),
            "synced_at": loc.get("synced_at", ""),
            "sync_date": d
        })
    
    dates = []
    for d in sorted(by_date.keys(), reverse=True):
        dates.append({
            "date": d,
            "count": len(by_date[d]),
            "locations": by_date[d]
        })
    
    return {
        "session_id": session_id,
        "session_name": session.get("name", ""),
        "total_empty_bins": total_empty,
        "by_date": dates,
        "all_empty_locations": empty_locations
    }

@portal_router.get("/reports/{session_id}/pending-locations")
async def get_pending_locations(session_id: str):
    """Get pending (not yet scanned) locations for a session.
    Compares expected stock locations with synced locations to find remaining work."""
    session = await db.audit_sessions.find_one({"id": session_id}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Get all expected locations from expected_stock
    expected = await db.expected_stock.find({"session_id": session_id}, {"_id": 0}).to_list(100000)
    expected_locations = set()
    for rec in expected:
        loc = rec.get("location", "").strip()
        if loc:
            expected_locations.add(loc)
    
    # Get all synced locations
    synced = await db.synced_locations.find({"session_id": session_id}, {"_id": 0}).to_list(100000)
    synced_location_names = set()
    synced_map = {}
    for s in synced:
        name = s.get("location_name", "")
        synced_location_names.add(name)
        synced_map[name] = {
            "location_name": name,
            "total_items": s.get("total_items", 0),
            "total_quantity": s.get("total_quantity", 0),
            "is_empty": s.get("is_empty", False),
            "empty_remarks": s.get("empty_remarks", ""),
            "device_name": s.get("device_name", ""),
            "synced_at": s.get("synced_at", ""),
            "sync_date": s.get("sync_date", ""),
            "status": "empty" if s.get("is_empty", False) else "completed"
        }
    
    # Build location status list
    all_locations = sorted(expected_locations | synced_location_names)
    
    completed = []
    empty_bins = []
    pending = []
    
    for loc_name in all_locations:
        if loc_name in synced_map:
            info = synced_map[loc_name]
            if info["is_empty"]:
                empty_bins.append({
                    "location_name": loc_name,
                    "status": "empty",
                    "in_expected": loc_name in expected_locations,
                    **info
                })
            else:
                completed.append({
                    "location_name": loc_name,
                    "status": "completed",
                    "in_expected": loc_name in expected_locations,
                    **info
                })
        else:
            # Location is in expected but not synced = pending
            pending.append({
                "location_name": loc_name,
                "status": "pending",
                "in_expected": True,
                "total_items": 0,
                "total_quantity": 0,
                "is_empty": False,
                "empty_remarks": "",
                "device_name": "",
                "synced_at": "",
                "sync_date": ""
            })
    
    total_expected = len(expected_locations)
    total_synced = len(synced_location_names & expected_locations)  # Only count expected that are synced
    total_completed = len(completed)
    total_empty = len(empty_bins)
    total_pending = len(pending)
    completion_pct = round((total_synced / total_expected * 100), 1) if total_expected > 0 else 0
    
    # Group pending by day (using session start date + sequence)
    return {
        "session_id": session_id,
        "session_name": session.get("name", ""),
        "summary": {
            "total_expected": total_expected,
            "total_completed": total_completed,
            "total_empty": total_empty,
            "total_pending": total_pending,
            "total_synced": total_synced + total_empty,
            "completion_pct": completion_pct
        },
        "completed": completed,
        "empty_bins": empty_bins,
        "pending": pending
    }

@portal_router.get("/empty-bins/summary")
async def get_empty_bins_summary(client_id: Optional[str] = None, date: Optional[str] = None):
    """Consolidated empty bins summary across sessions - filterable by client and date"""
    query = {"is_empty": True}
    if date:
        query["sync_date"] = date
    
    # If client_id, find all sessions for this client first
    session_ids = None
    if client_id:
        sessions = await db.audit_sessions.find({"client_id": client_id}, {"id": 1, "_id": 0}).to_list(1000)
        session_ids = [s["id"] for s in sessions]
        query["session_id"] = {"$in": session_ids}
    
    empty_locations = await db.synced_locations.find(query, {"_id": 0}).sort("synced_at", -1).to_list(100000)
    
    # Enrich with client and session info
    # Cache client and session names
    client_cache = {}
    session_cache = {}
    
    enriched = []
    by_client = {}
    by_date = {}
    
    for loc in empty_locations:
        sid = loc.get("session_id", "")
        
        # Get session info
        if sid not in session_cache:
            sess = await db.audit_sessions.find_one({"id": sid}, {"_id": 0})
            session_cache[sid] = sess or {}
        sess = session_cache[sid]
        cid = sess.get("client_id", "")
        
        # Get client info
        if cid and cid not in client_cache:
            cl = await db.clients.find_one({"id": cid}, {"_id": 0})
            client_cache[cid] = cl or {}
        cl = client_cache.get(cid, {})
        
        entry = {
            "location_name": loc.get("location_name", ""),
            "location_id": loc.get("location_id", ""),
            "empty_remarks": loc.get("empty_remarks", ""),
            "device_name": loc.get("device_name", ""),
            "sync_date": loc.get("sync_date", ""),
            "synced_at": loc.get("synced_at", ""),
            "session_id": sid,
            "session_name": sess.get("name", ""),
            "client_id": cid,
            "client_name": cl.get("name", ""),
            "client_code": cl.get("code", "")
        }
        enriched.append(entry)
        
        # Group by client
        if cid not in by_client:
            by_client[cid] = {"client_name": cl.get("name", "Unknown"), "client_code": cl.get("code", ""), "count": 0, "locations": []}
        by_client[cid]["count"] += 1
        by_client[cid]["locations"].append(entry)
        
        # Group by date
        d = loc.get("sync_date", "unknown")
        if d not in by_date:
            by_date[d] = {"date": d, "count": 0, "locations": []}
        by_date[d]["count"] += 1
        by_date[d]["locations"].append(entry)
    
    return {
        "total_empty_bins": len(enriched),
        "filter": {"client_id": client_id, "date": date},
        "by_client": list(by_client.values()),
        "by_date": [by_date[d] for d in sorted(by_date.keys(), reverse=True)],
        "all_empty_bins": enriched
    }

# ==================== DASHBOARD ROUTES ====================

@portal_router.get("/dashboard")
async def get_dashboard():
    """Live dashboard data"""
    # Get counts
    clients_count = await db.clients.count_documents({"is_active": True})
    active_sessions = await db.audit_sessions.count_documents({"status": "active"})
    total_devices = await db.devices.count_documents({"is_active": True})
    
    # Get registered users count
    total_users = await db.portal_users.count_documents({})
    pending_users = await db.portal_users.count_documents({"is_approved": False})
    
    # Get empty bins count
    empty_bins_count = await db.synced_locations.count_documents({"is_empty": True})
    
    # Get pending conflicts count
    pending_conflicts = await db.conflict_locations.count_documents({"status": "pending"})
    
    # Get recent syncs
    recent_syncs = await db.synced_locations.find(
        {}, {"_id": 0}
    ).sort("synced_at", -1).limit(10).to_list(10)
    
    # Get device status
    devices = await db.devices.find({"is_active": True}, {"_id": 0, "sync_password_hash": 0}).to_list(100)
    
    return {
        "stats": {
            "clients": clients_count,
            "active_sessions": active_sessions,
            "devices": total_devices,
            "total_users": total_users,
            "pending_users": pending_users,
            "empty_bins": empty_bins_count,
            "pending_conflicts": pending_conflicts
        },
        "recent_syncs": recent_syncs,
        "devices": devices
    }

@portal_router.get("/dashboard/live/{session_id}")
async def get_live_session_data(session_id: str):
    """Real-time data for a specific session"""
    # Get session info
    session = await db.audit_sessions.find_one({"id": session_id}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Get expected totals
    expected_pipeline = [
        {"$match": {"session_id": session_id}},
        {"$group": {"_id": None, "total_qty": {"$sum": "$qty"}, "count": {"$sum": 1}}}
    ]
    expected_result = await db.expected_stock.aggregate(expected_pipeline).to_list(1)
    expected_total = expected_result[0] if expected_result else {"total_qty": 0, "count": 0}
    
    # Get synced totals
    synced_pipeline = [
        {"$match": {"session_id": session_id}},
        {"$group": {
            "_id": None,
            "total_qty": {"$sum": "$total_quantity"},
            "total_items": {"$sum": "$total_items"},
            "locations": {"$sum": 1}
        }}
    ]
    synced_result = await db.synced_locations.aggregate(synced_pipeline).to_list(1)
    synced_total = synced_result[0] if synced_result else {"total_qty": 0, "total_items": 0, "locations": 0}
    
    # Get device activity for this session
    devices = await db.devices.find(
        {"session_id": session_id, "is_active": True},
        {"_id": 0, "sync_password_hash": 0}
    ).to_list(100)
    
    return {
        "session": session,
        "expected": {
            "total_qty": expected_total.get("total_qty", 0),
            "total_items": expected_total.get("count", 0)
        },
        "synced": {
            "total_qty": synced_total.get("total_qty", 0),
            "total_items": synced_total.get("total_items", 0),
            "locations": synced_total.get("locations", 0)
        },
        "devices": devices
    }

# ==================== ALERTS ROUTES ====================

async def check_and_generate_alerts(session_id: str, client_id: str):
    """Check for variance issues and generate alerts"""
    settings = await db.portal_settings.find_one({"id": "portal_settings"})
    if not settings:
        settings = {"variance_threshold_percent": 5.0}
    
    threshold = settings.get("variance_threshold_percent", 5.0)
    
    # Get detailed report
    expected = await db.expected_stock.find({"session_id": session_id}, {"_id": 0}).to_list(100000)
    synced = await db.synced_locations.find({"session_id": session_id}, {"_id": 0}).to_list(100000)
    
    # Build physical map
    physical_map = {}
    for s in synced:
        for item in s["items"]:
            key = f"{s['location_name']}|{item['barcode']}"
            if key not in physical_map:
                physical_map[key] = 0
            physical_map[key] += item["quantity"]
    
    # Check for high variance
    high_variance_items = []
    for exp in expected:
        key = f"{exp['location']}|{exp['barcode']}"
        physical_qty = physical_map.get(key, 0)
        stock_qty = exp["qty"]
        
        if stock_qty > 0:
            variance_percent = abs((physical_qty - stock_qty) / stock_qty) * 100
            if variance_percent > threshold:
                high_variance_items.append({
                    "location": exp["location"],
                    "barcode": exp["barcode"],
                    "variance_percent": variance_percent
                })
    
    # Create alert if high variance items found
    if high_variance_items:
        alert = Alert(
            client_id=client_id,
            session_id=session_id,
            alert_type="variance_high",
            message=f"High variance detected on {len(high_variance_items)} items (>{threshold}%)",
            severity="warning"
        )
        doc = alert.model_dump()
        doc['created_at'] = doc['created_at'].isoformat()
        await db.alerts.insert_one(doc)

@portal_router.get("/alerts")
async def get_alerts(client_id: Optional[str] = None, session_id: Optional[str] = None, unread_only: bool = False):
    query = {}
    if client_id:
        query["client_id"] = client_id
    if session_id:
        query["session_id"] = session_id
    if unread_only:
        query["is_read"] = False
    
    alerts = await db.alerts.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return alerts

@portal_router.put("/alerts/{alert_id}/read")
async def mark_alert_read(alert_id: str):
    result = await db.alerts.update_one(
        {"id": alert_id},
        {"$set": {"is_read": True}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"message": "Alert marked as read"}

@portal_router.put("/alerts/mark-all-read")
async def mark_all_alerts_read():
    await db.alerts.update_many({"is_read": False}, {"$set": {"is_read": True}})
    return {"message": "All alerts marked as read"}

# ==================== CONFLICT RESOLUTION ROUTES ====================

@portal_router.get("/conflicts")
async def get_conflicts(client_id: str = None, session_id: str = None, status: str = None):
    """Get all conflicts, filterable by client, session, and status"""
    query = {}
    if client_id:
        query["client_id"] = client_id
    if session_id:
        query["session_id"] = session_id
    if status:
        query["status"] = status
    
    conflicts = await db.conflict_locations.find(query, {"_id": 0}).sort("created_at", -1).to_list(10000)
    
    # Enrich with client and session names
    for c in conflicts:
        session = await db.audit_sessions.find_one({"id": c.get("session_id")}, {"_id": 0, "name": 1, "client_id": 1})
        if session:
            c["session_name"] = session.get("name", "Unknown")
            client = await db.clients.find_one({"id": session.get("client_id", c.get("client_id"))}, {"_id": 0, "name": 1})
            c["client_name"] = client.get("name", "Unknown") if client else "Unknown"
        else:
            c["session_name"] = "Unknown"
            c["client_name"] = "Unknown"
    
    return conflicts

@portal_router.get("/conflicts/summary")
async def get_conflicts_summary():
    """Get conflict counts grouped by client and session"""
    conflicts = await db.conflict_locations.find({"status": "pending"}, {"_id": 0}).to_list(10000)
    
    total_pending = len(conflicts)
    by_session = {}
    by_client = {}
    
    for c in conflicts:
        sid = c.get("session_id", "unknown")
        cid = c.get("client_id", "unknown")
        by_session[sid] = by_session.get(sid, 0) + 1
        by_client[cid] = by_client.get(cid, 0) + 1
    
    return {
        "total_pending": total_pending,
        "by_session": by_session,
        "by_client": by_client
    }

@portal_router.post("/conflicts/{conflict_id}/approve/{entry_id}")
async def approve_conflict_entry(conflict_id: str, entry_id: str, username: str = "admin"):
    """Approve one entry in a conflict. Moves approved entry to synced_locations, removes rejected data from raw."""
    conflict = await db.conflict_locations.find_one({"id": conflict_id})
    if not conflict:
        raise HTTPException(status_code=404, detail="Conflict not found")
    if conflict["status"] == "resolved":
        raise HTTPException(status_code=400, detail="Conflict already resolved")
    
    # Find the approved entry
    approved_entry = None
    rejected_entries = []
    for entry in conflict["entries"]:
        if entry["entry_id"] == entry_id:
            approved_entry = entry
        else:
            rejected_entries.append(entry)
    
    if not approved_entry:
        raise HTTPException(status_code=404, detail="Entry not found in conflict")
    
    # Mark all entries: approved or rejected
    updated_entries = []
    for entry in conflict["entries"]:
        if entry["entry_id"] == entry_id:
            entry["status"] = "approved"
        else:
            entry["status"] = "rejected"
        updated_entries.append(entry)
    
    # Move approved entry back to synced_locations
    sync_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    synced_loc = SyncedLocation(
        session_id=conflict["session_id"],
        device_id=approved_entry.get("device_id", ""),
        device_name=approved_entry["device_name"],
        location_id=approved_entry.get("location_id", ""),
        location_name=conflict["location_name"],
        items=[SyncedItem(**item) for item in approved_entry["items"]],
        total_items=approved_entry["total_items"],
        total_quantity=approved_entry["total_quantity"],
        is_empty=approved_entry.get("is_empty", False),
        empty_remarks=approved_entry.get("empty_remarks", ""),
        sync_date=sync_date
    )
    
    # Remove any existing synced data for this location (safety)
    await db.synced_locations.delete_many({
        "session_id": conflict["session_id"],
        "location_name": conflict["location_name"]
    })
    
    doc = synced_loc.model_dump()
    doc['synced_at'] = doc['synced_at'].isoformat()
    await db.synced_locations.insert_one(doc)
    
    # Remove rejected entries from sync_inbox and sync_raw_logs
    for rej in rejected_entries:
        rej_device = rej.get("device_name", "")
        rej_session = conflict["session_id"]
        rej_location = conflict["location_name"]

        # Remove from sync_inbox
        await db.sync_inbox.delete_many({
            "session_id": rej_session,
            "location_name": rej_location,
            "device_name": rej_device
        })

        # Remove location from sync_raw_logs raw_payload
        raw_logs = await db.sync_raw_logs.find({
            "session_id": rej_session,
            "device_name": rej_device
        }).to_list(1000)
        for rl in raw_logs:
            payload = rl.get("raw_payload", {})
            locations = payload.get("locations", [])
            filtered = [loc for loc in locations if loc.get("name") != rej_location]
            if len(filtered) == 0:
                # No locations left — remove entire raw log
                await db.sync_raw_logs.delete_one({"id": rl["id"]})
            elif len(filtered) < len(locations):
                # Update raw_payload with filtered locations
                new_loc_count = len(filtered)
                new_items = sum(len(loc.get("items", [])) for loc in filtered)
                new_qty = sum(sum(i.get("quantity", 0) for i in loc.get("items", [])) for loc in filtered)
                payload["locations"] = filtered
                await db.sync_raw_logs.update_one(
                    {"id": rl["id"]},
                    {"$set": {
                        "raw_payload": payload,
                        "location_count": new_loc_count,
                        "total_items": new_items,
                        "total_quantity": new_qty
                    }}
                )

    # Mark conflict as resolved
    resolve_timestamp = datetime.now(timezone.utc).isoformat()
    await db.conflict_locations.update_one(
        {"id": conflict_id},
        {"$set": {
            "status": "resolved",
            "entries": updated_entries,
            "resolved_at": resolve_timestamp,
            "resolved_by": username
        }}
    )
    
    return {
        "message": f"Entry from {approved_entry['device_name']} approved. Location '{conflict['location_name']}' is now in variance. Rejected data removed from raw logs.",
        "approved_device": approved_entry["device_name"],
        "approved_quantity": approved_entry["total_quantity"],
        "rejected_devices_cleaned": [e.get("device_name", "") for e in rejected_entries]
    }

@portal_router.post("/conflicts/{conflict_id}/reject-all")
async def reject_all_conflict_entries(conflict_id: str, username: str = "admin"):
    """Reject all entries in a conflict. Location becomes pending again (needs re-scan)."""
    conflict = await db.conflict_locations.find_one({"id": conflict_id})
    if not conflict:
        raise HTTPException(status_code=404, detail="Conflict not found")
    if conflict["status"] == "resolved":
        raise HTTPException(status_code=400, detail="Conflict already resolved")
    
    updated_entries = []
    for entry in conflict["entries"]:
        entry["status"] = "rejected"
        updated_entries.append(entry)
    
    resolve_timestamp = datetime.now(timezone.utc).isoformat()
    await db.conflict_locations.update_one(
        {"id": conflict_id},
        {"$set": {
            "status": "resolved",
            "entries": updated_entries,
            "resolved_at": resolve_timestamp,
            "resolved_by": username
        }}
    )
    
    # Ensure location is NOT in synced_locations (goes back to pending)
    await db.synced_locations.delete_many({
        "session_id": conflict["session_id"],
        "location_name": conflict["location_name"]
    })
    
    return {
        "message": f"All entries rejected for '{conflict['location_name']}'. Location is now pending (needs re-scan)."
    }

# ==================== SETTINGS ROUTES ====================

@portal_router.get("/settings")
async def get_settings():
    settings = await db.portal_settings.find_one({"id": "portal_settings"}, {"_id": 0})
    if not settings:
        settings = PortalSettings().model_dump()
        await db.portal_settings.insert_one(settings)
    return settings

@portal_router.put("/settings")
async def update_settings(settings: PortalSettings):
    await db.portal_settings.update_one(
        {"id": "portal_settings"},
        {"$set": settings.model_dump()},
        upsert=True
    )
    return {"message": "Settings updated"}

# ==================== INCLUDE ROUTERS ====================

app.include_router(api_router)
app.include_router(portal_router)
app.include_router(sync_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ==================== SEED TEST DATA ====================

async def seed_test_data():
    """Seed the database with test data if empty. Runs on startup."""
    
    # Check if data already exists
    client_count = await db.clients.count_documents({})
    if client_count > 0:
        logger.info(f"Database already has {client_count} clients. Skipping seed.")
        return
    
    logger.info("Seeding test data...")
    
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")
    
    # 1. Create admin user
    admin_exists = await db.portal_users.find_one({"username": "admin"})
    if not admin_exists:
        admin_user = {
            "id": str(uuid.uuid4()),
            "username": "admin",
            "password_hash": hash_password("admin123"),
            "role": "admin",
            "is_active": True,
            "is_approved": True,
            "last_login": None,
            "created_at": now.isoformat()
        }
        await db.portal_users.insert_one(admin_user)
        logger.info("Created admin user (admin/admin123)")
    else:
        # Ensure existing admin has the new fields
        await db.portal_users.update_one(
            {"username": "admin"},
            {"$set": {"is_active": True, "is_approved": True}},
        )
    
    # 2. Create Clients
    client_a_id = str(uuid.uuid4())
    client_b_id = str(uuid.uuid4())
    
    clients = [
        {
            "id": client_a_id,
            "name": "Reliance Retail",
            "code": "RR001",
            "address": "Navi Mumbai, Maharashtra",
            "contact_person": "Mukesh Shah",
            "contact_phone": "+91 9876543210",
            "created_at": now.isoformat(),
            "is_active": True,
            "master_imported": True,
            "master_product_count": 12
        },
        {
            "id": client_b_id,
            "name": "DMart Stores",
            "code": "DM002",
            "address": "Powai, Mumbai",
            "contact_person": "Radhika Patel",
            "contact_phone": "+91 9988776655",
            "created_at": now.isoformat(),
            "is_active": True,
            "master_imported": True,
            "master_product_count": 8
        }
    ]
    await db.clients.insert_many(clients)
    logger.info("Created 2 test clients")
    
    # 3. Upload Master Products for Client A (Reliance Retail)
    master_a = [
        {"id": str(uuid.uuid4()), "client_id": client_a_id, "barcode": "8901030793097", "description": "Tata Salt 1kg", "category": "Grocery", "article_code": "ART001", "article_name": "Salt & Spices", "mrp": 28, "cost": 22, "imported_at": now.isoformat()},
        {"id": str(uuid.uuid4()), "client_id": client_a_id, "barcode": "8901030795098", "description": "Tata Tea Gold 500g", "category": "Beverages", "article_code": "ART002", "article_name": "Tea", "mrp": 285, "cost": 240, "imported_at": now.isoformat()},
        {"id": str(uuid.uuid4()), "client_id": client_a_id, "barcode": "8901063095434", "description": "Aashirvaad Atta 10kg", "category": "Grocery", "article_code": "ART003", "article_name": "Flour", "mrp": 520, "cost": 450, "imported_at": now.isoformat()},
        {"id": str(uuid.uuid4()), "client_id": client_a_id, "barcode": "8901058858082", "description": "Fortune Soyabean Oil 1L", "category": "Grocery", "article_code": "ART004", "article_name": "Cooking Oil", "mrp": 180, "cost": 155, "imported_at": now.isoformat()},
        {"id": str(uuid.uuid4()), "client_id": client_a_id, "barcode": "8901725133542", "description": "Amul Butter 500g", "category": "Dairy", "article_code": "ART005", "article_name": "Dairy Products", "mrp": 280, "cost": 245, "imported_at": now.isoformat()},
        {"id": str(uuid.uuid4()), "client_id": client_a_id, "barcode": "8901725130206", "description": "Amul Milk 1L", "category": "Dairy", "article_code": "ART006", "article_name": "Dairy Products", "mrp": 66, "cost": 56, "imported_at": now.isoformat()},
        {"id": str(uuid.uuid4()), "client_id": client_a_id, "barcode": "8901262150125", "description": "Maggi Noodles 4-pack", "category": "Packaged Food", "article_code": "ART007", "article_name": "Instant Food", "mrp": 56, "cost": 48, "imported_at": now.isoformat()},
        {"id": str(uuid.uuid4()), "client_id": client_a_id, "barcode": "8902519002256", "description": "Parle-G Biscuits 800g", "category": "Packaged Food", "article_code": "ART008", "article_name": "Biscuits", "mrp": 100, "cost": 85, "imported_at": now.isoformat()},
        {"id": str(uuid.uuid4()), "client_id": client_a_id, "barcode": "8901491101653", "description": "Surf Excel Matic 2kg", "category": "Home Care", "article_code": "ART009", "article_name": "Detergent", "mrp": 450, "cost": 380, "imported_at": now.isoformat()},
        {"id": str(uuid.uuid4()), "client_id": client_a_id, "barcode": "8901023024580", "description": "Colgate MaxFresh 150g", "category": "Personal Care", "article_code": "ART010", "article_name": "Oral Care", "mrp": 120, "cost": 98, "imported_at": now.isoformat()},
        {"id": str(uuid.uuid4()), "client_id": client_a_id, "barcode": "8901138511159", "description": "Dettol Soap 125g", "category": "Personal Care", "article_code": "ART011", "article_name": "Bath & Body", "mrp": 58, "cost": 46, "imported_at": now.isoformat()},
        {"id": str(uuid.uuid4()), "client_id": client_a_id, "barcode": "8901764511159", "description": "Cadbury Dairy Milk 50g", "category": "Confectionery", "article_code": "ART012", "article_name": "Chocolates", "mrp": 50, "cost": 42, "imported_at": now.isoformat()},
    ]
    await db.master_products.insert_many(master_a)
    
    # Master Products for Client B (DMart)
    master_b = [
        {"id": str(uuid.uuid4()), "client_id": client_b_id, "barcode": "8901030793097", "description": "Tata Salt 1kg", "category": "Grocery", "article_code": "ART001", "article_name": "Salt", "mrp": 28, "cost": 22, "imported_at": now.isoformat()},
        {"id": str(uuid.uuid4()), "client_id": client_b_id, "barcode": "8901063095434", "description": "Aashirvaad Atta 10kg", "category": "Grocery", "article_code": "ART002", "article_name": "Flour", "mrp": 520, "cost": 450, "imported_at": now.isoformat()},
        {"id": str(uuid.uuid4()), "client_id": client_b_id, "barcode": "8901058858082", "description": "Fortune Oil 1L", "category": "Grocery", "article_code": "ART003", "article_name": "Oil", "mrp": 180, "cost": 155, "imported_at": now.isoformat()},
        {"id": str(uuid.uuid4()), "client_id": client_b_id, "barcode": "8901725133542", "description": "Amul Butter 500g", "category": "Dairy", "article_code": "ART004", "article_name": "Dairy", "mrp": 280, "cost": 245, "imported_at": now.isoformat()},
        {"id": str(uuid.uuid4()), "client_id": client_b_id, "barcode": "8901262150125", "description": "Maggi 4-pack", "category": "Packaged Food", "article_code": "ART005", "article_name": "Noodles", "mrp": 56, "cost": 48, "imported_at": now.isoformat()},
        {"id": str(uuid.uuid4()), "client_id": client_b_id, "barcode": "8902519002256", "description": "Parle-G 800g", "category": "Packaged Food", "article_code": "ART006", "article_name": "Biscuits", "mrp": 100, "cost": 85, "imported_at": now.isoformat()},
        {"id": str(uuid.uuid4()), "client_id": client_b_id, "barcode": "8901491101653", "description": "Surf Excel 2kg", "category": "Home Care", "article_code": "ART007", "article_name": "Detergent", "mrp": 450, "cost": 380, "imported_at": now.isoformat()},
        {"id": str(uuid.uuid4()), "client_id": client_b_id, "barcode": "8901023024580", "description": "Colgate 150g", "category": "Personal Care", "article_code": "ART008", "article_name": "Oral Care", "mrp": 120, "cost": 98, "imported_at": now.isoformat()},
    ]
    await db.master_products.insert_many(master_b)
    logger.info("Created master products for both clients")
    
    # 4. Create Audit Sessions
    session_a1_id = str(uuid.uuid4())
    session_a2_id = str(uuid.uuid4())
    session_b1_id = str(uuid.uuid4())
    
    sessions = [
        {
            "id": session_a1_id,
            "name": "Q1 2026 - Warehouse Audit",
            "client_id": client_a_id,
            "client_name": "Reliance Retail",
            "variance_mode": "bin-wise",
            "status": "active",
            "created_at": now.isoformat(),
            "expected_stock_imported": True
        },
        {
            "id": session_a2_id,
            "name": "Q1 2026 - Store Front Audit",
            "client_id": client_a_id,
            "client_name": "Reliance Retail",
            "variance_mode": "barcode-wise",
            "status": "active",
            "created_at": now.isoformat(),
            "expected_stock_imported": True
        },
        {
            "id": session_b1_id,
            "name": "Feb 2026 - Main Store Audit",
            "client_id": client_b_id,
            "client_name": "DMart Stores",
            "variance_mode": "bin-wise",
            "status": "active",
            "created_at": now.isoformat(),
            "expected_stock_imported": True
        }
    ]
    await db.audit_sessions.insert_many(sessions)
    logger.info("Created 3 audit sessions")
    
    # 5. Import Expected Stock for Session A1 (bin-wise)
    expected_a1 = [
        {"id": str(uuid.uuid4()), "session_id": session_a1_id, "location": "Rack-A01", "barcode": "8901030793097", "description": "Tata Salt 1kg", "category": "Grocery", "mrp": 28, "cost": 22, "qty": 200},
        {"id": str(uuid.uuid4()), "session_id": session_a1_id, "location": "Rack-A01", "barcode": "8901030795098", "description": "Tata Tea Gold 500g", "category": "Beverages", "mrp": 285, "cost": 240, "qty": 80},
        {"id": str(uuid.uuid4()), "session_id": session_a1_id, "location": "Rack-A01", "barcode": "8901063095434", "description": "Aashirvaad Atta 10kg", "category": "Grocery", "mrp": 520, "cost": 450, "qty": 50},
        {"id": str(uuid.uuid4()), "session_id": session_a1_id, "location": "Rack-A02", "barcode": "8901058858082", "description": "Fortune Oil 1L", "category": "Grocery", "mrp": 180, "cost": 155, "qty": 120},
        {"id": str(uuid.uuid4()), "session_id": session_a1_id, "location": "Rack-A02", "barcode": "8901725133542", "description": "Amul Butter 500g", "category": "Dairy", "mrp": 280, "cost": 245, "qty": 60},
        {"id": str(uuid.uuid4()), "session_id": session_a1_id, "location": "Cold-Storage", "barcode": "8901725130206", "description": "Amul Milk 1L", "category": "Dairy", "mrp": 66, "cost": 56, "qty": 300},
        {"id": str(uuid.uuid4()), "session_id": session_a1_id, "location": "Rack-B01", "barcode": "8901262150125", "description": "Maggi Noodles", "category": "Packaged Food", "mrp": 56, "cost": 48, "qty": 150},
        {"id": str(uuid.uuid4()), "session_id": session_a1_id, "location": "Rack-B01", "barcode": "8902519002256", "description": "Parle-G Biscuits", "category": "Packaged Food", "mrp": 100, "cost": 85, "qty": 100},
        {"id": str(uuid.uuid4()), "session_id": session_a1_id, "location": "Rack-C01", "barcode": "8901491101653", "description": "Surf Excel", "category": "Home Care", "mrp": 450, "cost": 380, "qty": 40},
        {"id": str(uuid.uuid4()), "session_id": session_a1_id, "location": "Rack-C01", "barcode": "8901023024580", "description": "Colgate MaxFresh", "category": "Personal Care", "mrp": 120, "cost": 98, "qty": 90},
    ]
    await db.expected_stock.insert_many(expected_a1)
    
    # Expected Stock for Session A2 (barcode-wise)
    expected_a2 = [
        {"id": str(uuid.uuid4()), "session_id": session_a2_id, "location": "", "barcode": "8901030793097", "description": "Tata Salt 1kg", "category": "Grocery", "mrp": 28, "cost": 22, "qty": 50},
        {"id": str(uuid.uuid4()), "session_id": session_a2_id, "location": "", "barcode": "8901262150125", "description": "Maggi Noodles", "category": "Packaged Food", "mrp": 56, "cost": 48, "qty": 30},
        {"id": str(uuid.uuid4()), "session_id": session_a2_id, "location": "", "barcode": "8901764511159", "description": "Dairy Milk 50g", "category": "Confectionery", "mrp": 50, "cost": 42, "qty": 100},
    ]
    await db.expected_stock.insert_many(expected_a2)
    
    # Expected Stock for Session B1 (bin-wise)
    expected_b1 = [
        {"id": str(uuid.uuid4()), "session_id": session_b1_id, "location": "Aisle-1", "barcode": "8901030793097", "description": "Tata Salt 1kg", "category": "Grocery", "mrp": 28, "cost": 22, "qty": 100},
        {"id": str(uuid.uuid4()), "session_id": session_b1_id, "location": "Aisle-1", "barcode": "8901063095434", "description": "Atta 10kg", "category": "Grocery", "mrp": 520, "cost": 450, "qty": 30},
        {"id": str(uuid.uuid4()), "session_id": session_b1_id, "location": "Aisle-2", "barcode": "8901262150125", "description": "Maggi 4-pack", "category": "Packaged Food", "mrp": 56, "cost": 48, "qty": 80},
        {"id": str(uuid.uuid4()), "session_id": session_b1_id, "location": "Aisle-2", "barcode": "8902519002256", "description": "Parle-G 800g", "category": "Packaged Food", "mrp": 100, "cost": 85, "qty": 60},
        {"id": str(uuid.uuid4()), "session_id": session_b1_id, "location": "Aisle-3", "barcode": "8901491101653", "description": "Surf Excel 2kg", "category": "Home Care", "mrp": 450, "cost": 380, "qty": 25},
    ]
    await db.expected_stock.insert_many(expected_b1)
    logger.info("Created expected stock for all sessions")
    
    # 6. Create Synced Physical Data (simulating scanner sync)
    # Session A1: Warehouse Audit synced data
    synced_a1 = [
        {
            "id": str(uuid.uuid4()),
            "session_id": session_a1_id,
            "location_name": "Rack-A01",
            "total_quantity": 315,
            "items": [
                {"barcode": "8901030793097", "product_name": "Tata Salt 1kg", "quantity": 195, "scanned_at": now.isoformat()},
                {"barcode": "8901030795098", "product_name": "Tata Tea Gold", "quantity": 78, "scanned_at": now.isoformat()},
                {"barcode": "8901063095434", "product_name": "Aashirvaad Atta", "quantity": 42, "scanned_at": now.isoformat()},
            ],
            "synced_at": now.isoformat()
        },
        {
            "id": str(uuid.uuid4()),
            "session_id": session_a1_id,
            "location_name": "Rack-A02",
            "total_quantity": 192,
            "items": [
                {"barcode": "8901058858082", "product_name": "Fortune Oil 1L", "quantity": 118, "scanned_at": now.isoformat()},
                {"barcode": "8901725133542", "product_name": "Amul Butter", "quantity": 57, "scanned_at": now.isoformat()},
                {"barcode": "8901138511159", "product_name": "Dettol Soap", "quantity": 17, "scanned_at": now.isoformat()},
            ],
            "synced_at": now.isoformat()
        },
        {
            "id": str(uuid.uuid4()),
            "session_id": session_a1_id,
            "location_name": "Cold-Storage",
            "total_quantity": 288,
            "items": [
                {"barcode": "8901725130206", "product_name": "Amul Milk 1L", "quantity": 288, "scanned_at": now.isoformat()},
            ],
            "synced_at": now.isoformat()
        },
        {
            "id": str(uuid.uuid4()),
            "session_id": session_a1_id,
            "location_name": "Rack-B01",
            "total_quantity": 265,
            "items": [
                {"barcode": "8901262150125", "product_name": "Maggi Noodles", "quantity": 145, "scanned_at": now.isoformat()},
                {"barcode": "8902519002256", "product_name": "Parle-G", "quantity": 98, "scanned_at": now.isoformat()},
                {"barcode": "5901234123457", "product_name": "Unknown Import Item", "quantity": 22, "scanned_at": now.isoformat()},
            ],
            "synced_at": now.isoformat()
        },
        {
            "id": str(uuid.uuid4()),
            "session_id": session_a1_id,
            "location_name": "Rack-C01",
            "total_quantity": 128,
            "items": [
                {"barcode": "8901491101653", "product_name": "Surf Excel", "quantity": 38, "scanned_at": now.isoformat()},
                {"barcode": "8901023024580", "product_name": "Colgate", "quantity": 90, "scanned_at": now.isoformat()},
            ],
            "synced_at": now.isoformat()
        },
    ]
    await db.synced_locations.insert_many(synced_a1)
    
    # Session B1: DMart audit synced data
    synced_b1 = [
        {
            "id": str(uuid.uuid4()),
            "session_id": session_b1_id,
            "location_name": "Aisle-1",
            "total_quantity": 135,
            "items": [
                {"barcode": "8901030793097", "product_name": "Tata Salt", "quantity": 102, "scanned_at": now.isoformat()},
                {"barcode": "8901063095434", "product_name": "Atta 10kg", "quantity": 28, "scanned_at": now.isoformat()},
                {"barcode": "8901725133542", "product_name": "Amul Butter", "quantity": 5, "scanned_at": now.isoformat()},
            ],
            "synced_at": now.isoformat()
        },
        {
            "id": str(uuid.uuid4()),
            "session_id": session_b1_id,
            "location_name": "Aisle-2",
            "total_quantity": 138,
            "items": [
                {"barcode": "8901262150125", "product_name": "Maggi", "quantity": 75, "scanned_at": now.isoformat()},
                {"barcode": "8902519002256", "product_name": "Parle-G", "quantity": 63, "scanned_at": now.isoformat()},
            ],
            "synced_at": now.isoformat()
        },
        {
            "id": str(uuid.uuid4()),
            "session_id": session_b1_id,
            "location_name": "Aisle-3",
            "total_quantity": 22,
            "items": [
                {"barcode": "8901491101653", "product_name": "Surf Excel", "quantity": 22, "scanned_at": now.isoformat()},
            ],
            "synced_at": now.isoformat()
        },
    ]
    await db.synced_locations.insert_many(synced_b1)
    logger.info("Created synced physical data for sessions")
    
    # 7. Create Sync Raw Logs
    sync_logs = [
        {
            "id": str(uuid.uuid4()),
            "device_name": "CipherLab-WH01",
            "client_id": client_a_id,
            "session_id": session_a1_id,
            "sync_date": today,
            "synced_at": now.isoformat(),
            "raw_payload": {
                "locations": [
                    {"name": "Rack-A01", "items": [
                        {"barcode": "8901030793097", "product_name": "Tata Salt 1kg", "quantity": 195, "scanned_at": now.isoformat()},
                        {"barcode": "8901030795098", "product_name": "Tata Tea Gold", "quantity": 78, "scanned_at": now.isoformat()},
                        {"barcode": "8901063095434", "product_name": "Aashirvaad Atta", "quantity": 42, "scanned_at": now.isoformat()},
                    ]},
                    {"name": "Rack-A02", "items": [
                        {"barcode": "8901058858082", "product_name": "Fortune Oil 1L", "quantity": 118, "scanned_at": now.isoformat()},
                        {"barcode": "8901725133542", "product_name": "Amul Butter", "quantity": 57, "scanned_at": now.isoformat()},
                        {"barcode": "8901138511159", "product_name": "Dettol Soap", "quantity": 17, "scanned_at": now.isoformat()},
                    ]},
                ],
                "device_name": "CipherLab-WH01",
                "session_id": session_a1_id,
                "client_id": client_a_id
            },
            "location_count": 2,
            "total_items": 6,
            "total_quantity": 507,
            "action": "sync"
        },
        {
            "id": str(uuid.uuid4()),
            "device_name": "CipherLab-WH01",
            "client_id": client_a_id,
            "session_id": session_a1_id,
            "sync_date": today,
            "synced_at": now.isoformat(),
            "raw_payload": {
                "locations": [
                    {"name": "Cold-Storage", "items": [
                        {"barcode": "8901725130206", "product_name": "Amul Milk 1L", "quantity": 288, "scanned_at": now.isoformat()},
                    ]},
                    {"name": "Rack-B01", "items": [
                        {"barcode": "8901262150125", "product_name": "Maggi Noodles", "quantity": 145, "scanned_at": now.isoformat()},
                        {"barcode": "8902519002256", "product_name": "Parle-G", "quantity": 98, "scanned_at": now.isoformat()},
                        {"barcode": "5901234123457", "product_name": "Unknown Import Item", "quantity": 22, "scanned_at": now.isoformat()},
                    ]},
                    {"name": "Rack-C01", "items": [
                        {"barcode": "8901491101653", "product_name": "Surf Excel", "quantity": 38, "scanned_at": now.isoformat()},
                        {"barcode": "8901023024580", "product_name": "Colgate", "quantity": 90, "scanned_at": now.isoformat()},
                    ]},
                ],
                "device_name": "CipherLab-WH01",
                "session_id": session_a1_id,
                "client_id": client_a_id
            },
            "location_count": 3,
            "total_items": 6,
            "total_quantity": 681,
            "action": "sync"
        },
        {
            "id": str(uuid.uuid4()),
            "device_name": "Newland-DM01",
            "client_id": client_b_id,
            "session_id": session_b1_id,
            "sync_date": today,
            "synced_at": now.isoformat(),
            "raw_payload": {
                "locations": [
                    {"name": "Aisle-1", "items": [
                        {"barcode": "8901030793097", "product_name": "Tata Salt", "quantity": 102, "scanned_at": now.isoformat()},
                        {"barcode": "8901063095434", "product_name": "Atta 10kg", "quantity": 28, "scanned_at": now.isoformat()},
                        {"barcode": "8901725133542", "product_name": "Amul Butter", "quantity": 5, "scanned_at": now.isoformat()},
                    ]},
                    {"name": "Aisle-2", "items": [
                        {"barcode": "8901262150125", "product_name": "Maggi", "quantity": 75, "scanned_at": now.isoformat()},
                        {"barcode": "8902519002256", "product_name": "Parle-G", "quantity": 63, "scanned_at": now.isoformat()},
                    ]},
                    {"name": "Aisle-3", "items": [
                        {"barcode": "8901491101653", "product_name": "Surf Excel", "quantity": 22, "scanned_at": now.isoformat()},
                    ]},
                ],
                "device_name": "Newland-DM01",
                "session_id": session_b1_id,
                "client_id": client_b_id
            },
            "location_count": 3,
            "total_items": 6,
            "total_quantity": 295,
            "action": "sync"
        },
    ]
    await db.sync_raw_logs.insert_many(sync_logs)
    logger.info("Created sync raw logs")
    
    # 8. Create a Device
    device = {
        "id": str(uuid.uuid4()),
        "device_name": "CipherLab-WH01",
        "device_type": "CipherLab RK25",
        "sync_password_hash": hash_password("audix2024"),
        "last_sync": now.isoformat(),
        "is_active": True,
        "registered_at": now.isoformat(),
        "client_id": client_a_id
    }
    await db.devices.insert_one(device)
    
    device2 = {
        "id": str(uuid.uuid4()),
        "device_name": "Newland-DM01",
        "device_type": "Newland MT90",
        "sync_password_hash": hash_password("audix2024"),
        "last_sync": now.isoformat(),
        "is_active": True,
        "registered_at": now.isoformat(),
        "client_id": client_b_id
    }
    await db.devices.insert_one(device2)
    logger.info("Created 2 test devices")
    
    logger.info("=== Seed data complete! ===")
    logger.info("Portal login: admin / admin123")
    logger.info("Clients: Reliance Retail (RR001), DMart Stores (DM002)")
    logger.info("Sessions: 3 audit sessions with expected stock and physical data")

@app.on_event("startup")
async def startup_event():
    """Run seed data on startup"""
    await seed_test_data()

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
