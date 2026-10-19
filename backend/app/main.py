"""
SuperMart Enterprise ERP & High-Velocity POS API Core
FastAPI Application with Real-Time WebSockets, ACID Billing, and FIFO Replenishment
"""

import os
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from .config import settings
from .db import db
from .websockets import ws_manager
from .barcode import is_valid_ean13, generate_ean13
from .billing import (
    ScanRequest, scan_barcode_item,
    CheckoutRequest, process_atomic_checkout,
    VoidInvoiceRequest, void_complete_invoice
)
from .repackaging import RepackageRequest, process_bulk_to_unit_repackaging
from .dynamic_pricing import CommodityPriceAdjustmentRequest, adjust_commodity_base_rate
from .replenishment import check_and_trigger_replenishment, PO_STORAGE_DIR
from .analytics import get_inventory_velocity_analysis, calculate_owner_net_profit

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    description="High-velocity POS & ERP backend with real-time WebSocket sync and strict ACID compliance."
)

# Enable CORS for Next.js frontend (Vercel & localhost)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================================================================
# WEBSOCKET ENDPOINTS
# =========================================================================

@app.websocket("/ws/pos/{terminal_id}")
async def pos_websocket_endpoint(websocket: WebSocket, terminal_id: str):
    """
    Subscribes a POS terminal (e.g. POS-01 ... POS-20) for real-time price & stock updates.
    """
    await ws_manager.connect_pos(terminal_id, websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # Handle client heartbeat or ping
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect_pos(terminal_id)
    except Exception:
        ws_manager.disconnect_pos(terminal_id)

@app.websocket("/ws/floor")
async def floor_websocket_endpoint(websocket: WebSocket):
    """
    Subscribes floor manager tablets for real-time FIFO shelf replenishment alerts.
    """
    await ws_manager.connect_floor(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect_floor(websocket)

@app.websocket("/ws/admin")
async def admin_websocket_endpoint(websocket: WebSocket):
    """
    Subscribes Owner/Admin dashboard for real-time metrics and alerts.
    """
    await ws_manager.connect_admin(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect_admin(websocket)

# =========================================================================
# POS BILLING ENDPOINTS (HIGH-VELOCITY & ACID COMPLIANCE)
# =========================================================================

@app.post("/api/pos/scan")
async def pos_scan_item(req: ScanRequest):
    return await scan_barcode_item(req)

@app.post("/api/pos/checkout")
async def pos_checkout(req: CheckoutRequest):
    try:
        return await process_atomic_checkout(req)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Checkout transaction failed: {e}")

@app.post("/api/pos/void-transaction")
async def pos_void_transaction(req: VoidInvoiceRequest):
    try:
        return await void_complete_invoice(req)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/pos/recent-invoices")
async def get_recent_invoices(limit: int = 15):
    query = """
        SELECT 
            transaction_id, pos_terminal_id, total_amount, payment_mode, status,
            voided_reason, timestamp
        FROM sales_ledger
        ORDER BY timestamp DESC
        LIMIT %s
    """
    return await db.fetch_all(query, (limit,))

# =========================================================================
# DYNAMIC COMMODITY PRICING MODULE
# =========================================================================

@app.get("/api/pricing/commodities")
async def get_commodity_items():
    query = """
        SELECT 
            p.sku_id, p.name, p.category, p.daily_fluctuation_flag,
            p.target_margin_pct, p.base_wholesale_rate, p.unit_type,
            COALESCE(
                (SELECT current_selling_price FROM inventory_batches WHERE sku_id = p.sku_id AND status IN ('Shelf', 'Storage') LIMIT 1),
                p.base_wholesale_rate * (1 + p.target_margin_pct / 100)
            ) as current_retail_price
        FROM products_master p
        ORDER BY p.daily_fluctuation_flag DESC, p.sku_id ASC
    """
    return await db.fetch_all(query)

@app.post("/api/pricing/update-commodity")
async def update_commodity_price(req: CommodityPriceAdjustmentRequest):
    try:
        return await adjust_commodity_base_rate(req)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

# =========================================================================
# BULK-TO-UNIT REPACKAGING WORKFLOW
# =========================================================================

@app.post("/api/repackaging/convert")
async def convert_bulk_to_unit(req: RepackageRequest):
    try:
        return await process_bulk_to_unit_repackaging(req)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/repackaging/history")
async def get_repackaging_history():
    query = """
        SELECT overhead_id, amount as spillage_loss, expense_date, notes
        FROM financial_overhead
        WHERE expense_category = 'Spillage'
        ORDER BY expense_date DESC
        LIMIT 20
    """
    return await db.fetch_all(query)

# =========================================================================
# AUTOMATED REPLENISHMENT & PURCHASE ORDERS
# =========================================================================

@app.post("/api/replenishment/evaluate")
async def evaluate_replenishment():
    return await check_and_trigger_replenishment()

@app.get("/api/replenishment/po/{filename}")
async def download_po_pdf(filename: str):
    filepath = PO_STORAGE_DIR / filename
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="Purchase Order PDF not found.")
    return FileResponse(
        path=str(filepath),
        media_type="application/pdf",
        filename=filename
    )

# =========================================================================
# PHYSICAL STORE LAYOUT (GROUND FLOOR MAPPING)
# =========================================================================

@app.get("/api/store/layout")
async def get_store_layout():
    query = """
        SELECT 
            l.id, l.aisle_id, l.shelf_section, l.sku_id, l.max_shelf_capacity,
            l.current_shelf_stock, l.floor_level,
            p.name as product_name, p.category, p.min_stock_threshold,
            COALESCE(
                (SELECT current_selling_price FROM inventory_batches WHERE sku_id = l.sku_id AND status IN ('Shelf', 'Storage') LIMIT 1),
                0
            ) as selling_price,
            COALESCE(
                (SELECT barcode FROM inventory_batches WHERE sku_id = l.sku_id AND status IN ('Shelf', 'Storage') ORDER BY arrival_date ASC LIMIT 1),
                ''
            ) as sample_barcode
        FROM store_layout l
        JOIN products_master p ON l.sku_id = p.sku_id
        ORDER BY l.floor_level ASC, l.aisle_id ASC, l.shelf_section ASC
    """
    return await db.fetch_all(query)

# =========================================================================
# OWNER DASHBOARD & FINANCIAL ANALYTICS
# =========================================================================

@app.get("/api/analytics/velocity")
async def get_velocity_tables():
    return await get_inventory_velocity_analysis()

@app.get("/api/analytics/net-profit")
async def get_net_profit_summary():
    return await calculate_owner_net_profit()

@app.get("/api/analytics/overview")
async def get_overview():
    profit = await calculate_owner_net_profit()
    velocity = await get_inventory_velocity_analysis()
    return {
        "financials": profit,
        "velocity_summary": velocity["summary"],
        "active_pos_terminals": len(ws_manager.active_pos_terminals)
    }

# =========================================================================
# HEALTH CHECK
# =========================================================================

@app.get("/health")
async def health_check():
    db_ok = True
    try:
        await db.fetch_one("SELECT 1")
    except Exception:
        db_ok = False
        
    return {
        "status": "healthy" if db_ok else "degraded",
        "database_connected": db_ok,
        "active_pos_count": len(ws_manager.active_pos_terminals),
        "version": "1.0.0"
    }
