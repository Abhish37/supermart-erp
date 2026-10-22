"""
SuperMart Enterprise ERP & High-Velocity POS API Core
FastAPI Application with Real-Time WebSockets, ACID Billing, FIFO Replenishment,
Math Engine, Hardware Integrations, Employee Cash Reconciliation & Supply Chain 3-Way Tally
"""

import os
from pathlib import Path
from typing import Optional, List
from pydantic import BaseModel, Field
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query
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

# New Subsystems
from .math_engine import (
    calculate_sku_math_metrics, recalculate_all_skus, get_all_math_metrics,
    RecalculateRequest
)
from .hardware_integrations import (
    initiate_pinelabs_payment, check_pinelabs_status, generate_raw_esc_pos_receipt,
    PineLabsInitiateRequest
)
from .employees import (
    authenticate_cashier, get_all_employees, add_employee_deduction,
    process_end_of_day_cash_tally, get_recent_reconciliations,
    CashierLoginRequest, DeductionRequest, CashReconciliationRequest
)
from .supply_chain import (
    get_all_vendors, upsert_vendor, get_reorder_queue, update_reorder_status,
    run_three_way_check, get_all_reconciliations,
    VendorCreateOrUpdateRequest, UpdateOrderStatusRequest, ThreeWayReconciliationRequest
)
from .pdf_export import generate_financial_ledger_pdf, FINANCIAL_REPORT_DIR

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="2.0.0",
    description="High-velocity edge-local POS & ERP backend with real-time WebSocket sync and strict ACID compliance."
)

# Enable CORS for Next.js frontend
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
    await ws_manager.connect_pos(terminal_id, websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect_pos(terminal_id)
    except Exception:
        ws_manager.disconnect_pos(terminal_id)

@app.websocket("/ws/floor")
async def floor_websocket_endpoint(websocket: WebSocket):
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
    await ws_manager.connect_admin(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect_admin(websocket)

# =========================================================================
# MODULE 1: POS BILLING & HARDWARE ENDPOINTS
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
            transaction_id, pos_terminal_id, cashier_id, cashier_name,
            total_amount, rounded_amount, payment_mode, payment_ref_id,
            status, voided_reason, sync_status, timestamp
        FROM sales_ledger
        ORDER BY timestamp DESC
        LIMIT %s
    """
    return await db.fetch_all(query, (limit,))

# Hardware: PineLabs Payment Terminal
@app.post("/api/pos/hardware/pinelabs/initiate")
async def api_initiate_pinelabs(req: PineLabsInitiateRequest):
    return await initiate_pinelabs_payment(req)

@app.get("/api/pos/hardware/pinelabs/status/{request_id}")
async def api_check_pinelabs_status(request_id: str):
    try:
        return await check_pinelabs_status(request_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

# =========================================================================
# MODULE 2.4: EMPLOYEE AUTH & CASH RECONCILIATION
# =========================================================================

@app.post("/api/employees/login")
async def api_employee_login(req: CashierLoginRequest):
    try:
        return await authenticate_cashier(req)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))

@app.get("/api/employees/list")
async def api_get_employees():
    return await get_all_employees()

@app.post("/api/employees/deductions")
async def api_add_deduction(req: DeductionRequest):
    try:
        return await add_employee_deduction(req)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/employees/cash-tally")
async def api_cash_reconciliation(req: CashReconciliationRequest):
    return await process_end_of_day_cash_tally(req)

@app.get("/api/employees/cash-tally/history")
async def api_reconciliation_history(limit: int = 10):
    return await get_recent_reconciliations(limit)

# =========================================================================
# MODULE 4: THE MATH ENGINE (BUSINESS LOGIC)
# =========================================================================

@app.get("/api/math/metrics")
async def api_get_math_metrics():
    return await get_all_math_metrics()

@app.get("/api/math/metrics/{sku_id}")
async def api_get_sku_math_metrics(sku_id: str):
    try:
        return await calculate_sku_math_metrics(sku_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@app.post("/api/math/recalculate")
async def api_recalculate_math(req: RecalculateRequest):
    if req.sku_id:
        try:
            return await calculate_sku_math_metrics(req.sku_id, req.override_day)
        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))
    else:
        return await recalculate_all_skus(req.override_day)

# =========================================================================
# MODULE 2.5 & 3: SUPPLY CHAIN, VENDORS & 3-WAY RECONCILIATION
# =========================================================================

@app.get("/api/supply-chain/vendors")
async def api_get_vendors():
    return await get_all_vendors()

@app.post("/api/supply-chain/vendors")
async def api_upsert_vendor(req: VendorCreateOrUpdateRequest):
    return await upsert_vendor(req)

@app.get("/api/supply-chain/reorder-queue")
async def api_get_reorder_queue():
    return await get_reorder_queue()

@app.post("/api/supply-chain/reorder/status")
async def api_update_reorder_status(req: UpdateOrderStatusRequest):
    try:
        return await update_reorder_status(req)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/supply-chain/three-way-check")
async def api_three_way_check(req: ThreeWayReconciliationRequest):
    return await run_three_way_check(req)

@app.get("/api/supply-chain/reconciliations")
async def api_get_reconciliations():
    return await get_all_reconciliations()

# =========================================================================
# MODULE 2.1 & 2.2: FINANCIAL LEDGER, PDF EXPORT & STORE LAYOUT
# =========================================================================

@app.get("/api/financial/download-pdf")
async def api_download_financial_pdf(date_filter: str = Query("This Month", description="'Today', 'This Week', 'This Month'")):
    filename = await generate_financial_ledger_pdf(date_filter)
    filepath = FINANCIAL_REPORT_DIR / filename
    return FileResponse(
        path=str(filepath),
        media_type="application/pdf",
        filename=filename
    )

class UpdateCostPriceRequest(BaseModel):
    cost_price: float = Field(..., description="New cost price")

@app.put("/api/products/{sku_id}/cost-price")
async def api_update_cost_price(sku_id: str, req: UpdateCostPriceRequest):
    await db.execute(
        "UPDATE products_master SET cost_price = %s, updated_at = NOW() WHERE sku_id = %s",
        (req.cost_price, sku_id)
    )
    return {"status": "SUCCESS", "sku_id": sku_id, "cost_price": req.cost_price}

@app.get("/api/store/layout")
async def get_store_layout():
    """
    Returns Ground floor interactive 2D map with sales velocity scores,
    and individual product details inside shelves with unsold age.
    """
    query = """
        SELECT 
            l.id, l.aisle_id, l.shelf_section, l.sku_id, l.max_shelf_capacity,
            l.current_shelf_stock, l.floor_level, l.sales_velocity_score, l.performance_status,
            p.name as product_name, p.category, p.min_stock_threshold,
            p.cost_price, p.selling_price, p.vendor_name, p.min_monthly_target, p.flaw_flag,
            COALESCE(
                (SELECT barcode FROM inventory_batches WHERE sku_id = l.sku_id AND status IN ('Shelf', 'Storage') ORDER BY arrival_date ASC LIMIT 1),
                p.barcode
            ) as sample_barcode,
            COALESCE(
                (SELECT EXTRACT(DAY FROM (NOW() - arrival_date))::int FROM inventory_batches WHERE sku_id = l.sku_id AND status = 'Shelf' ORDER BY arrival_date ASC LIMIT 1),
                0
            ) as oldest_batch_days_unsold
        FROM store_layout l
        JOIN products_master p ON l.sku_id = p.sku_id
        ORDER BY l.floor_level ASC, l.aisle_id ASC, l.shelf_section ASC
    """
    return await db.fetch_all(query)

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

@app.post("/api/replenishment/evaluate")
async def evaluate_replenishment():
    return await check_and_trigger_replenishment()

@app.get("/api/replenishment/po/{filename}")
async def download_po_pdf(filename: str):
    filepath = PO_STORAGE_DIR / filename
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="Purchase Order PDF not found.")
    return FileResponse(path=str(filepath), media_type="application/pdf", filename=filename)

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
    math_summary = await get_all_math_metrics()
    return {
        "financials": profit,
        "velocity_summary": velocity["summary"],
        "math_summary": {
            "current_phase": math_summary["current_phase"],
            "alerts_count": math_summary["alerts_triggered_count"]
        },
        "active_pos_terminals": len(ws_manager.active_pos_terminals)
    }

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
        "version": "2.0.0"
    }
