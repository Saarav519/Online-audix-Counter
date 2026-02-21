from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File
from fastapi.security import HTTPBasic, HTTPBasicCredentials
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
    role: str = "admin"  # admin, viewer
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class PortalUserCreate(BaseModel):
    username: str
    password: str
    role: str = "admin"

class PortalUserLogin(BaseModel):
    username: str
    password: str

# Client Model
class Client(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    code: str  # Short code for client
    address: Optional[str] = None
    contact_person: Optional[str] = None
    contact_phone: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_active: bool = True
    master_imported: bool = False
    master_product_count: int = 0

class ClientCreate(BaseModel):
    name: str
    code: str
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
    synced_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    sync_date: str  # Date string for grouping (YYYY-MM-DD)

class SyncRequest(BaseModel):
    device_name: str
    sync_password: str
    client_id: str
    session_id: str
    locations: List[Dict[str, Any]]
    clear_after_sync: bool = False

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
        role=user.role
    )
    doc = portal_user.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.portal_users.insert_one(doc)
    
    return {"message": "User registered successfully", "user_id": portal_user.id}

@portal_router.post("/login")
async def login_portal_user(credentials: PortalUserLogin):
    user = await db.portal_users.find_one({"username": credentials.username}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if not verify_password(credentials.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    return {
        "message": "Login successful",
        "user": {
            "id": user["id"],
            "username": user["username"],
            "role": user["role"]
        }
    }

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
    result = await db.clients.delete_one({"id": client_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Client not found")
    # Also delete master products for this client
    await db.master_products.delete_many({"client_id": client_id})
    return {"message": "Client deleted"}

# ==================== MASTER PRODUCT ROUTES (Client-Level) ====================

@portal_router.post("/clients/{client_id}/import-master")
async def import_master_products(client_id: str, file: UploadFile = File(...)):
    """Import product master catalog CSV at client level. Replaces existing master on re-upload."""
    # Verify client exists
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Read CSV file
    content = await file.read()
    decoded = content.decode('utf-8')
    reader = csv.DictReader(io.StringIO(decoded))
    
    # Clear existing master products for this client
    await db.master_products.delete_many({"client_id": client_id})
    
    # Import new master products
    records = []
    for row in reader:
        # Normalize column names (case-insensitive, strip whitespace)
        norm_row = {k.strip().lower().replace(' ', '_'): v.strip() for k, v in row.items()}
        
        barcode = norm_row.get('barcode', '')
        if not barcode:
            continue  # Skip rows without barcode
        
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
        records.append(doc)
    
    if records:
        await db.master_products.insert_many(records)
    
    # Update client flag
    await db.clients.update_one(
        {"id": client_id},
        {"$set": {"master_imported": True, "master_product_count": len(records)}}
    )
    
    return {
        "message": f"Imported {len(records)} master products",
        "product_count": len(records)
    }

@portal_router.get("/clients/{client_id}/master-products")
async def get_master_products(client_id: str, limit: int = 1000, skip: int = 0):
    """Get master products for a client with pagination"""
    total = await db.master_products.count_documents({"client_id": client_id})
    records = await db.master_products.find(
        {"client_id": client_id}, {"_id": 0}
    ).skip(skip).limit(limit).to_list(limit)
    
    return {
        "products": records,
        "total": total,
        "limit": limit,
        "skip": skip
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
    # Verify session exists
    session = await db.audit_sessions.find_one({"id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    variance_mode = session.get("variance_mode", "bin-wise")
    
    # Read CSV file
    content = await file.read()
    decoded = content.decode('utf-8')
    reader = csv.DictReader(io.StringIO(decoded))
    
    # Clear existing expected stock for this session
    await db.expected_stock.delete_many({"session_id": session_id})
    
    # Import new expected stock based on variance mode
    records = []
    for row in reader:
        # Normalize column names (case-insensitive, strip whitespace)
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
        records.append(doc)
    
    if records:
        await db.expected_stock.insert_many(records)
    
    # Update session flag
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
    device = await db.devices.find_one({"device_name": sync_request.device_name})
    if not device:
        # Auto-register device
        device = Device(
            device_name=sync_request.device_name,
            sync_password_hash=hash_password(sync_request.sync_password),
            client_id=sync_request.client_id,
            session_id=sync_request.session_id
        )
        doc = device.model_dump()
        doc['created_at'] = doc['created_at'].isoformat()
        if doc['last_sync_at']:
            doc['last_sync_at'] = doc['last_sync_at'].isoformat()
        await db.devices.insert_one(doc)
        device = doc
    else:
        # Verify password
        if not verify_password(sync_request.sync_password, device.get("sync_password_hash", "")):
            raise HTTPException(status_code=401, detail="Invalid sync password")
    
    # Verify session exists
    session = await db.audit_sessions.find_one({"id": sync_request.session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    sync_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    sync_timestamp = datetime.now(timezone.utc).isoformat()
    synced_count = 0
    
    # Store raw sync log (append-only audit trail)
    raw_log = {
        "id": str(uuid.uuid4()),
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
    
    for loc_data in sync_request.locations:
        location_id = loc_data.get("id", str(uuid.uuid4()))
        location_name = loc_data.get("name", "Unknown")
        items = loc_data.get("items", [])
        
        # Delete existing synced data for this location in this session
        await db.synced_locations.delete_many({
            "session_id": sync_request.session_id,
            "location_name": location_name
        })
        
        # Create synced items
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
        
        # Create synced location
        synced_loc = SyncedLocation(
            session_id=sync_request.session_id,
            device_id=device["id"] if isinstance(device, dict) else device.id,
            device_name=sync_request.device_name,
            location_id=location_id,
            location_name=location_name,
            items=synced_items,
            total_items=len(synced_items),
            total_quantity=total_qty,
            sync_date=sync_date
        )
        
        doc = synced_loc.model_dump()
        doc['synced_at'] = doc['synced_at'].isoformat()
        await db.synced_locations.insert_one(doc)
        synced_count += 1
    
    # Update device last sync
    await db.devices.update_one(
        {"device_name": sync_request.device_name},
        {
            "$set": {
                "last_sync_at": datetime.now(timezone.utc).isoformat(),
                "client_id": sync_request.client_id,
                "session_id": sync_request.session_id
            }
        }
    )
    
    # Generate alerts for high variance
    await check_and_generate_alerts(sync_request.session_id, sync_request.client_id)
    
    return {
        "message": "Sync successful",
        "locations_synced": synced_count,
        "sync_date": sync_date
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
async def get_sync_logs(client_id: str = None, session_id: str = None, limit: int = 100):
    """Get raw sync logs, optionally filtered by client and/or session"""
    query = {}
    if client_id:
        query["client_id"] = client_id
    if session_id:
        query["session_id"] = session_id
    
    logs = await db.sync_raw_logs.find(query, {"_id": 0}).sort("synced_at", -1).to_list(limit)
    return logs

@portal_router.get("/sync-logs/{log_id}")
async def get_sync_log_detail(log_id: str):
    """Get detailed raw sync log by ID"""
    log = await db.sync_raw_logs.find_one({"id": log_id}, {"_id": 0})
    if not log:
        raise HTTPException(status_code=404, detail="Sync log not found")
    return log

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
    """Generate professional remark based on variance"""
    if not in_product_master and not in_expected_stock:
        return "Not in Master — Extra item found during physical count"
    if in_product_master and not in_expected_stock and scanned:
        return "In Master, Not in Stock — Product exists in catalog but had no expected stock"
    if not in_master and not in_product_master:
        return "Not in Master — Extra item found during physical count"
    if not in_master:
        return "Not in Master — Extra item found during physical count"
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

# ==================== REPORTS ROUTES ====================

@portal_router.get("/reports/{session_id}/bin-wise")
async def get_bin_wise_report(session_id: str):
    """Bin-wise summary report: Location, Stock Qty, Physical Qty, Difference Qty, Accuracy%, Remarks"""
    expected = await db.expected_stock.find({"session_id": session_id}, {"_id": 0}).to_list(100000)
    expected_by_location = {}
    for e in expected:
        loc = e.get("location", "Unknown")
        if loc not in expected_by_location:
            expected_by_location[loc] = 0
        expected_by_location[loc] += e.get("qty", 0)
    
    synced = await db.synced_locations.find({"session_id": session_id}, {"_id": 0}).to_list(100000)
    physical_by_location = {}
    for s in synced:
        loc = s["location_name"]
        if loc not in physical_by_location:
            physical_by_location[loc] = 0
        physical_by_location[loc] += s["total_quantity"]
    
    all_locations = set(expected_by_location.keys()) | set(physical_by_location.keys())
    
    report = []
    total_stock = 0
    total_physical = 0
    total_diff = 0
    
    for loc in sorted(all_locations):
        stock_qty = expected_by_location.get(loc, 0)
        physical_qty = physical_by_location.get(loc, 0)
        diff_qty = physical_qty - stock_qty
        accuracy = calc_accuracy(stock_qty, physical_qty)
        in_master = loc in expected_by_location
        scanned = loc in physical_by_location
        remark = generate_remark(stock_qty, physical_qty, accuracy, in_master, scanned)
        
        total_stock += stock_qty
        total_physical += physical_qty
        total_diff += diff_qty
        
        report.append({
            "location": loc,
            "stock_qty": stock_qty,
            "physical_qty": physical_qty,
            "difference_qty": diff_qty,
            "accuracy_pct": accuracy,
            "remark": remark
        })
    
    total_accuracy = calc_accuracy(total_stock, total_physical)
    
    return {
        "report": report,
        "totals": {
            "stock_qty": total_stock,
            "physical_qty": total_physical,
            "difference_qty": total_diff,
            "accuracy_pct": total_accuracy
        }
    }

@portal_router.get("/reports/{session_id}/detailed")
async def get_detailed_report(session_id: str):
    """Detailed item-wise report with values, accuracy%, remarks. Uses master products for product info."""
    # Load master products for product info enrichment
    master_by_barcode = await get_master_for_session(session_id)
    
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
                physical_map[key] = {
                    "location": loc,
                    "barcode": item["barcode"],
                    "product_name": item.get("product_name", ""),
                    "quantity": 0
                }
            physical_map[key]["quantity"] += item["quantity"]
    
    # Also include barcodes that are in master but not in expected stock or physical
    # For items in master with no expected stock: show them if they were scanned
    all_keys = set(expected_map.keys()) | set(physical_map.keys())
    
    report = []
    totals = {
        "stock_qty": 0, "stock_value": 0,
        "physical_qty": 0, "physical_value": 0,
        "diff_qty": 0, "diff_value": 0
    }
    
    for key in sorted(all_keys):
        exp = expected_map.get(key, {})
        phy = physical_map.get(key, {})
        
        location = exp.get("location") or phy.get("location", "")
        barcode = exp.get("barcode") or phy.get("barcode", "")
        
        # Enrich product info from master products (priority: master > expected > physical)
        master_info = master_by_barcode.get(barcode, {})
        description = master_info.get("description") or exp.get("description") or phy.get("product_name", "")
        category = master_info.get("category") or exp.get("category", "")
        mrp = master_info.get("mrp") or exp.get("mrp", 0)
        cost = master_info.get("cost") or exp.get("cost", 0)
        
        stock_qty = exp.get("qty", 0)
        physical_qty = phy.get("quantity", 0)
        diff_qty = physical_qty - stock_qty
        
        stock_value = stock_qty * cost
        physical_value = physical_qty * cost
        diff_value = diff_qty * cost
        
        accuracy = calc_accuracy(stock_qty, physical_qty)
        in_expected = key in expected_map
        in_prod_master = barcode in master_by_barcode
        scanned = key in physical_map
        remark = generate_remark(stock_qty, physical_qty, accuracy, in_master=in_expected, scanned=scanned, in_product_master=in_prod_master, in_expected_stock=in_expected)
        
        totals["stock_qty"] += stock_qty
        totals["stock_value"] += stock_value
        totals["physical_qty"] += physical_qty
        totals["physical_value"] += physical_value
        totals["diff_qty"] += diff_qty
        totals["diff_value"] += diff_value
        
        report.append({
            "location": location,
            "barcode": barcode,
            "description": description,
            "category": category,
            "mrp": mrp,
            "cost": cost,
            "stock_qty": stock_qty,
            "stock_value": stock_value,
            "physical_qty": physical_qty,
            "physical_value": physical_value,
            "diff_qty": diff_qty,
            "diff_value": diff_value,
            "accuracy_pct": accuracy,
            "remark": remark,
            "in_master": barcode in master_by_barcode,
            "in_expected_stock": key in expected_map
        })
    
    totals["accuracy_pct"] = calc_accuracy(totals["stock_qty"], totals["physical_qty"])
    return {"report": report, "totals": totals}


@portal_router.get("/reports/{session_id}/barcode-wise")
async def get_barcode_wise_report(session_id: str):
    """Barcode-wise variance: Pivots by barcode across all locations, uses master for product info"""
    # Load master products for product info enrichment
    master_by_barcode = await get_master_for_session(session_id)
    
    expected = await db.expected_stock.find({"session_id": session_id}, {"_id": 0}).to_list(100000)
    
    # Pivot expected by barcode (sum across locations)
    expected_by_barcode = {}
    for e in expected:
        bc = e["barcode"]
        if bc not in expected_by_barcode:
            expected_by_barcode[bc] = {"qty": 0}
        expected_by_barcode[bc]["qty"] += e.get("qty", 0)
    
    # Pivot physical by barcode (sum across all synced locations)
    synced = await db.synced_locations.find({"session_id": session_id}, {"_id": 0}).to_list(100000)
    physical_by_barcode = {}
    for s in synced:
        for item in s["items"]:
            bc = item["barcode"]
            if bc not in physical_by_barcode:
                physical_by_barcode[bc] = {
                    "barcode": bc,
                    "product_name": item.get("product_name", ""),
                    "quantity": 0
                }
            physical_by_barcode[bc]["quantity"] += item["quantity"]
    
    all_barcodes = set(expected_by_barcode.keys()) | set(physical_by_barcode.keys())
    
    report = []
    totals = {
        "stock_qty": 0, "stock_value": 0,
        "physical_qty": 0, "physical_value": 0,
        "diff_qty": 0, "diff_value": 0
    }
    
    for bc in sorted(all_barcodes):
        exp = expected_by_barcode.get(bc, {})
        phy = physical_by_barcode.get(bc, {})
        
        # Enrich from master products (priority: master > expected stock > physical)
        master_info = master_by_barcode.get(bc, {})
        description = master_info.get("description") or phy.get("product_name", "")
        category = master_info.get("category", "")
        mrp = master_info.get("mrp", 0)
        cost = master_info.get("cost", 0)
        
        stock_qty = exp.get("qty", 0)
        physical_qty = phy.get("quantity", 0)
        diff_qty = physical_qty - stock_qty
        
        stock_value = stock_qty * cost
        physical_value = physical_qty * cost
        diff_value = diff_qty * cost
        
        accuracy = calc_accuracy(stock_qty, physical_qty)
        in_expected = bc in expected_by_barcode
        in_prod_master = bc in master_by_barcode
        scanned = bc in physical_by_barcode
        remark = generate_remark(stock_qty, physical_qty, accuracy, in_master=in_expected, scanned=scanned, in_product_master=in_prod_master, in_expected_stock=in_expected)
        
        totals["stock_qty"] += stock_qty
        totals["stock_value"] += stock_value
        totals["physical_qty"] += physical_qty
        totals["physical_value"] += physical_value
        totals["diff_qty"] += diff_qty
        totals["diff_value"] += diff_value
        
        report.append({
            "barcode": bc,
            "description": description,
            "category": category,
            "mrp": mrp,
            "cost": cost,
            "stock_qty": stock_qty,
            "stock_value": stock_value,
            "physical_qty": physical_qty,
            "physical_value": physical_value,
            "diff_qty": diff_qty,
            "diff_value": diff_value,
            "accuracy_pct": accuracy,
            "remark": remark,
            "in_master": bc in master_by_barcode,
            "in_expected_stock": bc in expected_by_barcode
        })
    
    totals["accuracy_pct"] = calc_accuracy(totals["stock_qty"], totals["physical_qty"])
    return {"report": report, "totals": totals}


@portal_router.get("/reports/{session_id}/article-wise")
async def get_article_wise_report(session_id: str):
    """Article-wise variance: Groups barcodes by article_code, calculates variance at article level"""
    expected = await db.expected_stock.find({"session_id": session_id}, {"_id": 0}).to_list(100000)
    
    # Build barcode -> article mapping and aggregate expected by article
    barcode_to_article = {}
    expected_by_article = {}
    for e in expected:
        bc = e["barcode"]
        article_code = e.get("article_code", "") or bc  # fallback to barcode if no article
        article_name = e.get("article_name", "") or e.get("description", "")
        category = e.get("category", "")
        cost = e.get("cost", 0)
        mrp = e.get("mrp", 0)
        
        barcode_to_article[bc] = article_code
        
        if article_code not in expected_by_article:
            expected_by_article[article_code] = {
                "article_code": article_code,
                "article_name": article_name,
                "category": category,
                "barcodes": set(),
                "mrp": mrp,
                "cost": cost,
                "qty": 0
            }
        expected_by_article[article_code]["barcodes"].add(bc)
        expected_by_article[article_code]["qty"] += e.get("qty", 0)
    
    # Aggregate physical by article
    synced = await db.synced_locations.find({"session_id": session_id}, {"_id": 0}).to_list(100000)
    physical_by_article = {}
    unmapped_barcodes = {}
    
    for s in synced:
        for item in s["items"]:
            bc = item["barcode"]
            article_code = barcode_to_article.get(bc, None)
            
            if article_code is None:
                # Barcode not in master - track as unmapped
                if bc not in unmapped_barcodes:
                    unmapped_barcodes[bc] = {
                        "barcode": bc,
                        "product_name": item.get("product_name", ""),
                        "quantity": 0
                    }
                unmapped_barcodes[bc]["quantity"] += item["quantity"]
            else:
                if article_code not in physical_by_article:
                    physical_by_article[article_code] = 0
                physical_by_article[article_code] += item["quantity"]
    
    # Build report from expected articles
    report = []
    totals = {
        "stock_qty": 0, "stock_value": 0,
        "physical_qty": 0, "physical_value": 0,
        "diff_qty": 0, "diff_value": 0
    }
    
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
        diff_qty = physical_qty - stock_qty
        
        stock_value = stock_qty * cost
        physical_value = physical_qty * cost
        diff_value = diff_qty * cost
        
        accuracy = calc_accuracy(stock_qty, physical_qty)
        in_master = ac in expected_by_article
        scanned = ac in physical_by_article
        remark = generate_remark(stock_qty, physical_qty, accuracy, in_master, scanned)
        
        totals["stock_qty"] += stock_qty
        totals["stock_value"] += stock_value
        totals["physical_qty"] += physical_qty
        totals["physical_value"] += physical_value
        totals["diff_qty"] += diff_qty
        totals["diff_value"] += diff_value
        
        report.append({
            "article_code": article_code,
            "article_name": article_name,
            "category": category,
            "barcodes": barcodes,
            "barcode_count": len(barcodes),
            "mrp": mrp,
            "cost": cost,
            "stock_qty": stock_qty,
            "stock_value": stock_value,
            "physical_qty": physical_qty,
            "physical_value": physical_value,
            "diff_qty": diff_qty,
            "diff_value": diff_value,
            "accuracy_pct": accuracy,
            "remark": remark
        })
    
    # Add unmapped barcodes as "No Article" entries
    for bc, data in sorted(unmapped_barcodes.items()):
        physical_qty = data["quantity"]
        accuracy = 0.0
        remark = generate_remark(0, physical_qty, accuracy, in_master=False, scanned=True)
        
        totals["physical_qty"] += physical_qty
        totals["diff_qty"] += physical_qty
        
        report.append({
            "article_code": "UNMAPPED",
            "article_name": f"Not in Master ({bc})",
            "category": "Unmapped",
            "barcodes": [bc],
            "barcode_count": 1,
            "mrp": 0,
            "cost": 0,
            "stock_qty": 0,
            "stock_value": 0,
            "physical_qty": physical_qty,
            "physical_value": 0,
            "diff_qty": physical_qty,
            "diff_value": 0,
            "accuracy_pct": accuracy,
            "remark": remark
        })
    
    totals["accuracy_pct"] = calc_accuracy(totals["stock_qty"], totals["physical_qty"])
    return {"report": report, "totals": totals}


@portal_router.get("/reports/{session_id}/category-summary")
async def get_category_summary(session_id: str):
    """Category-wise summary: Groups all data by category"""
    expected = await db.expected_stock.find({"session_id": session_id}, {"_id": 0}).to_list(100000)
    
    # Build barcode -> category mapping from expected
    barcode_info = {}
    expected_by_category = {}
    for e in expected:
        bc = e["barcode"]
        cat = e.get("category", "") or "Uncategorized"
        cost = e.get("cost", 0)
        
        barcode_info[bc] = {"category": cat, "cost": cost}
        
        if cat not in expected_by_category:
            expected_by_category[cat] = {"qty": 0, "value": 0, "item_count": 0}
        expected_by_category[cat]["qty"] += e.get("qty", 0)
        expected_by_category[cat]["value"] += e.get("qty", 0) * cost
        expected_by_category[cat]["item_count"] += 1
    
    # Aggregate physical by category
    synced = await db.synced_locations.find({"session_id": session_id}, {"_id": 0}).to_list(100000)
    physical_by_category = {}
    
    for s in synced:
        for item in s["items"]:
            bc = item["barcode"]
            info = barcode_info.get(bc, {"category": "Unmapped", "cost": 0})
            cat = info["category"]
            cost = info["cost"]
            
            if cat not in physical_by_category:
                physical_by_category[cat] = {"qty": 0, "value": 0}
            physical_by_category[cat]["qty"] += item["quantity"]
            physical_by_category[cat]["value"] += item["quantity"] * cost
    
    all_categories = set(expected_by_category.keys()) | set(physical_by_category.keys())
    
    report = []
    totals = {
        "stock_qty": 0, "stock_value": 0,
        "physical_qty": 0, "physical_value": 0,
        "diff_qty": 0, "diff_value": 0,
        "item_count": 0
    }
    
    for cat in sorted(all_categories):
        exp = expected_by_category.get(cat, {"qty": 0, "value": 0, "item_count": 0})
        phy = physical_by_category.get(cat, {"qty": 0, "value": 0})
        
        stock_qty = exp["qty"]
        stock_value = exp["value"]
        physical_qty = phy["qty"]
        physical_value = phy["value"]
        diff_qty = physical_qty - stock_qty
        diff_value = physical_value - stock_value
        item_count = exp["item_count"]
        
        accuracy = calc_accuracy(stock_qty, physical_qty)
        in_master = cat in expected_by_category
        scanned = cat in physical_by_category
        remark = generate_remark(stock_qty, physical_qty, accuracy, in_master, scanned)
        
        totals["stock_qty"] += stock_qty
        totals["stock_value"] += stock_value
        totals["physical_qty"] += physical_qty
        totals["physical_value"] += physical_value
        totals["diff_qty"] += diff_qty
        totals["diff_value"] += diff_value
        totals["item_count"] += item_count
        
        report.append({
            "category": cat,
            "item_count": item_count,
            "stock_qty": stock_qty,
            "stock_value": round(stock_value, 2),
            "physical_qty": physical_qty,
            "physical_value": round(physical_value, 2),
            "diff_qty": diff_qty,
            "diff_value": round(diff_value, 2),
            "accuracy_pct": accuracy,
            "remark": remark
        })
    
    totals["accuracy_pct"] = calc_accuracy(totals["stock_qty"], totals["physical_qty"])
    totals["stock_value"] = round(totals["stock_value"], 2)
    totals["physical_value"] = round(totals["physical_value"], 2)
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

# ==================== DASHBOARD ROUTES ====================

@portal_router.get("/dashboard")
async def get_dashboard():
    """Live dashboard data"""
    # Get counts
    clients_count = await db.clients.count_documents({"is_active": True})
    active_sessions = await db.audit_sessions.count_documents({"status": "active"})
    total_devices = await db.devices.count_documents({"is_active": True})
    
    # Get recent syncs
    recent_syncs = await db.synced_locations.find(
        {}, {"_id": 0}
    ).sort("synced_at", -1).limit(10).to_list(10)
    
    # Get device status
    devices = await db.devices.find({"is_active": True}, {"_id": 0, "sync_password_hash": 0}).to_list(100)
    
    # Get unread alerts
    unread_alerts = await db.alerts.count_documents({"is_read": False})
    
    return {
        "stats": {
            "clients": clients_count,
            "active_sessions": active_sessions,
            "devices": total_devices,
            "unread_alerts": unread_alerts
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

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
