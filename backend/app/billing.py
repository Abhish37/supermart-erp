"""
High-Velocity POS Billing Engine & ACID Ledger Enforcement
Rules:
1. 800ms scan debounce via Redis (drops duplicate triggers)
2. Atomic Checkout Transactions (no partial unbilling post-checkout)
3. Mandatory Full Invoice Cancellation/Voiding if error occurs
"""

import uuid
import logging
import asyncio
from typing import List, Optional
from pydantic import BaseModel, Field
from .db import db
from .redis_client import redis_service
from .websockets import ws_manager

logger = logging.getLogger("supermart.billing")

class ScanRequest(BaseModel):
    pos_terminal_id: str = Field(..., description="Terminal ID, e.g. POS-01")
    barcode: str = Field(..., description="Scanned EAN-13 barcode")

class CartItemInput(BaseModel):
    barcode: str
    batch_id: str
    sku_id: str
    name: str
    selling_price: float
    quantity: int = 1

class CheckoutRequest(BaseModel):
    pos_terminal_id: str = Field(..., description="Terminal ID, e.g. POS-01")
    payment_mode: str = Field("UPI", description="Payment mode: 'UPI', 'Cash', or 'Card'")
    items: List[CartItemInput]
    notes: Optional[str] = None

class VoidInvoiceRequest(BaseModel):
    transaction_id: str = Field(..., description="Invoice transaction ID to void")
    pos_terminal_id: str
    voided_reason: str = Field(..., description="Audit reason for cancellation")
    supervisor_pin: Optional[str] = None

async def scan_barcode_item(req: ScanRequest) -> dict:
    # 1. 800ms Scan Debounce Check
    accepted = await redis_service.check_and_debounce_scan(
        terminal_id=req.pos_terminal_id,
        barcode=req.barcode,
        window_ms=800
    )
    if not accepted:
        return {
            "status": "DROPPED",
            "message": "Duplicate scan detected within 800ms. Scan ignored to protect cart integrity.",
            "barcode": req.barcode
        }

    # 2. Database Lookup: Find oldest FIFO batch on Shelf or Storage matching barcode
    query = """
        SELECT 
            b.batch_id, b.sku_id, b.barcode, b.cost_price, b.current_selling_price,
            b.status, b.quantity, b.unit_weight_kg, b.arrival_date,
            p.name as product_name, p.category, p.unit_type,
            COALESCE(l.current_shelf_stock, 0) as shelf_stock,
            l.aisle_id, l.shelf_section
        FROM inventory_batches b
        JOIN products_master p ON b.sku_id = p.sku_id
        LEFT JOIN store_layout l ON (b.sku_id = l.sku_id AND l.floor_level = 0)
        WHERE b.barcode = %s AND b.status IN ('Shelf', 'Storage')
        ORDER BY b.arrival_date ASC
        LIMIT 1
    """
    item = await db.fetch_one(query, (req.barcode,))
    
    if not item:
        # Fallback search by SKU ID
        item = await db.fetch_one(
            """
            SELECT 
                b.batch_id, b.sku_id, b.barcode, b.cost_price, b.current_selling_price,
                b.status, b.quantity, b.unit_weight_kg, b.arrival_date,
                p.name as product_name, p.category, p.unit_type,
                COALESCE(l.current_shelf_stock, 0) as shelf_stock,
                l.aisle_id, l.shelf_section
            FROM inventory_batches b
            JOIN products_master p ON b.sku_id = p.sku_id
            LEFT JOIN store_layout l ON (b.sku_id = l.sku_id AND l.floor_level = 0)
            WHERE b.sku_id = %s AND b.status IN ('Shelf', 'Storage')
            ORDER BY b.arrival_date ASC
            LIMIT 1
            """,
            (req.barcode,)
        )

    if not item:
        return {
            "status": "NOT_FOUND",
            "message": f"No active inventory batch found for barcode/SKU: {req.barcode}",
            "barcode": req.barcode
        }

    return {
        "status": "ACCEPTED",
        "item": {
            "batch_id": item["batch_id"],
            "sku_id": item["sku_id"],
            "name": item["product_name"],
            "barcode": item["barcode"],
            "category": item["category"],
            "selling_price": float(item["current_selling_price"]),
            "unit_weight_kg": float(item["unit_weight_kg"]),
            "shelf_stock": int(item["shelf_stock"]),
            "location": f"{item.get('aisle_id', 'Ground')} / {item.get('shelf_section', 'Main')}",
            "quantity": 1
        }
    }

async def process_atomic_checkout(req: CheckoutRequest) -> dict:
    if not req.items:
        raise ValueError("Cart is empty. Cannot process checkout.")

    total_amount = sum(float(item.selling_price) * item.quantity for item in req.items)
    transaction_id = f"TXN-{uuid.uuid4().hex[:10].upper()}"

    def _execute_checkout_tx():
        with db.transaction() as conn:
            with conn.cursor() as cur:
                # 1. Insert Master Sales Ledger
                cur.execute(
                    """
                    INSERT INTO sales_ledger (
                        transaction_id, pos_terminal_id, total_amount, payment_mode, status, timestamp
                    ) VALUES (%s, %s, %s, %s, 'COMPLETED', NOW())
                    """,
                    (transaction_id, req.pos_terminal_id, total_amount, req.payment_mode)
                )

                # 2. Process Each Cart Item Line
                for it in req.items:
                    cur.execute(
                        """
                        SELECT batch_id, sku_id, cost_price, quantity
                        FROM inventory_batches
                        WHERE batch_id = %s
                        FOR UPDATE
                        """,
                        (it.batch_id,)
                    )
                    batch_row = cur.fetchone()
                    
                    cogs = float(batch_row["cost_price"]) if batch_row else round(it.selling_price * 0.85, 2)

                    # Insert line item in sales_items
                    item_id = f"ITM-{uuid.uuid4().hex[:8].upper()}"
                    cur.execute(
                        """
                        INSERT INTO sales_items (
                            item_id, transaction_id, batch_id, sku_id,
                            selling_price_at_time, cogs, quantity
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                        """,
                        (item_id, transaction_id, it.batch_id, it.sku_id, it.selling_price, cogs, it.quantity)
                    )

                    # Decrement batch quantity or mark Sold if exhausted
                    if batch_row:
                        curr_qty = int(batch_row["quantity"])
                        new_qty = max(0, curr_qty - it.quantity)
                        status = "Sold" if new_qty == 0 else "Shelf"
                        cur.execute(
                            """
                            UPDATE inventory_batches
                            SET quantity = %s, status = %s, sold_at = CASE WHEN %s = 0 THEN NOW() ELSE sold_at END
                            WHERE batch_id = %s
                            """,
                            (new_qty, status, new_qty, it.batch_id)
                        )

                    # Decrement Shelf Stock in store_layout
                    cur.execute(
                        """
                        UPDATE store_layout
                        SET current_shelf_stock = GREATEST(0, current_shelf_stock - %s),
                            updated_at = NOW()
                        WHERE sku_id = %s AND floor_level = 0
                        """,
                        (it.quantity, it.sku_id)
                    )

    await asyncio.to_thread(_execute_checkout_tx)

    # 3. Post-commit: Broadcast real-time stock decrement via WebSockets
    for it in req.items:
        stock_info = await db.fetch_one(
            "SELECT current_shelf_stock FROM store_layout WHERE sku_id = %s AND floor_level = 0",
            (it.sku_id,)
        )
        rem = stock_info["current_shelf_stock"] if stock_info else 0
        await ws_manager.broadcast_inventory_decrement(it.sku_id, rem)

    return {
        "status": "SUCCESS",
        "transaction_id": transaction_id,
        "pos_terminal_id": req.pos_terminal_id,
        "total_amount": round(total_amount, 2),
        "payment_mode": req.payment_mode,
        "items_count": len(req.items),
        "items": [it.model_dump() for it in req.items],
        "message": "Atomic checkout completed. Ledger locked."
    }

async def void_complete_invoice(req: VoidInvoiceRequest) -> dict:
    """
    Strict Ledger Rule: Disallows individual item deletion post-checkout.
    The entire invoice must be voided and regenerated if an error occurs.
    """
    def _execute_void_tx():
        with db.transaction() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT transaction_id, status FROM sales_ledger WHERE transaction_id = %s FOR UPDATE",
                    (req.transaction_id,)
                )
                ledger = cur.fetchone()
                if not ledger:
                    raise ValueError(f"Invoice {req.transaction_id} not found.")
                
                if ledger["status"] == "VOIDED":
                    raise ValueError(f"Invoice {req.transaction_id} is already VOIDED.")

                cur.execute(
                    """
                    UPDATE sales_ledger
                    SET status = 'VOIDED', voided_reason = %s
                    WHERE transaction_id = %s
                    """,
                    (f"POS {req.pos_terminal_id} Void: {req.voided_reason}", req.transaction_id)
                )

                cur.execute(
                    "SELECT batch_id, sku_id, quantity FROM sales_items WHERE transaction_id = %s",
                    (req.transaction_id,)
                )
                items = cur.fetchall()
                for it in items:
                    cur.execute(
                        """
                        UPDATE inventory_batches
                        SET quantity = quantity + %s, status = 'Shelf'
                        WHERE batch_id = %s
                        """,
                        (it["quantity"], it["batch_id"])
                    )
                    cur.execute(
                        """
                        UPDATE store_layout
                        SET current_shelf_stock = current_shelf_stock + %s, updated_at = NOW()
                        WHERE sku_id = %s AND floor_level = 0
                        """,
                        (it["quantity"], it["sku_id"])
                    )

    await asyncio.to_thread(_execute_void_tx)

    return {
        "status": "VOIDED",
        "transaction_id": req.transaction_id,
        "message": "Entire invoice cancelled and voided. Stock returned to inventory.",
        "voided_reason": req.voided_reason
    }
