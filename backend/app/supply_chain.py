"""
SuperMart Supply Chain, 3-Way Reconciliation & Vendor Reorder Subsystem
Modules 2.5 & 3:
1. Vendor Database (Add/Edit Dealers, Linked SKUs, Supply Rates)
2. Reorder Queue (Suggested -> Place Order -> Ordered -> Arrived / GRN)
3. 3-Way Reconciliation:
   [A] Units received at 2nd-floor storage
   [B] Units scanned into cartons for ground floor
   [C] Units sold at POS
   Rule: A = B + C + Current Shelf Stock
   Mismatch triggers "Stealing/Shrinkage Alert"
"""

import uuid
import datetime
import logging
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from .db import db

logger = logging.getLogger("supermart.supply_chain")

# -------------------------------------------------------------
# 1. VENDORS / DEALERS
# -------------------------------------------------------------
class VendorCreateOrUpdateRequest(BaseModel):
    vendor_id: Optional[str] = None
    name: str = Field(..., description="Vendor / Dealer Business Name")
    phone: str = Field(..., description="Contact phone")
    email: Optional[str] = None
    address: Optional[str] = None
    linked_skus: Optional[List[str]] = None
    supply_rate: float = Field(0.0, description="Base supply rate")

async def get_all_vendors() -> List[Dict[str, Any]]:
    return await db.fetch_all("SELECT * FROM vendors ORDER BY name ASC")

async def upsert_vendor(req: VendorCreateOrUpdateRequest) -> Dict[str, Any]:
    vendor_id = req.vendor_id or f"VND-{uuid.uuid4().hex[:6].upper()}"
    linked_skus_str = str(req.linked_skus or [])
    
    await db.execute(
        """
        INSERT INTO vendors (vendor_id, name, phone, email, address, linked_skus, supply_rate, active, created_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, true, NOW())
        ON CONFLICT (vendor_id) DO UPDATE SET
            name = EXCLUDED.name,
            phone = EXCLUDED.phone,
            email = EXCLUDED.email,
            address = EXCLUDED.address,
            linked_skus = EXCLUDED.linked_skus,
            supply_rate = EXCLUDED.supply_rate
        """,
        (vendor_id, req.name, req.phone, req.email, req.address, linked_skus_str, req.supply_rate)
    )
    
    return {
        "status": "SAVED",
        "vendor_id": vendor_id,
        "name": req.name,
        "phone": req.phone
    }

# -------------------------------------------------------------
# 2. REORDER QUEUE & PURCHASE ORDERS
# -------------------------------------------------------------
class UpdateOrderStatusRequest(BaseModel):
    reorder_id: str
    status: str = Field(..., description="'ORDERED' or 'ARRIVED'") # GRN = Goods Received Note

async def get_reorder_queue() -> List[Dict[str, Any]]:
    return await db.fetch_all(
        """
        SELECT 
            r.*, p.name as product_name, p.category, p.unit_type,
            v.name as vendor_name, v.phone as vendor_phone
        FROM reorder_queue r
        JOIN products_master p ON r.sku_id = p.sku_id
        JOIN vendors v ON r.vendor_id = v.vendor_id
        ORDER BY 
            CASE r.status 
                WHEN 'SUGGESTED' THEN 1 
                WHEN 'ORDERED' THEN 2 
                ELSE 3 
            END,
            r.created_at DESC
        """
    )

async def update_reorder_status(req: UpdateOrderStatusRequest) -> Dict[str, Any]:
    """
    Transitions PO through supply chain:
    - SUGGESTED -> ORDERED: Owner authorises order to mandi/vendor
    - ORDERED -> ARRIVED (GRN): Goods arrive, stock increments in 2nd-floor storage
    """
    po = await db.fetch_one("SELECT * FROM reorder_queue WHERE reorder_id = %s", (req.reorder_id,))
    if not po:
        raise ValueError(f"Reorder record {req.reorder_id} not found.")

    if req.status == "ORDERED":
        await db.execute(
            """
            UPDATE reorder_queue
            SET status = 'ORDERED', ordered_at = NOW()
            WHERE reorder_id = %s
            """,
            (req.reorder_id,)
        )
    elif req.status == "ARRIVED":
        # GRN (Goods Received Note): Arrival of stock
        # 1. Update PO status
        await db.execute(
            """
            UPDATE reorder_queue
            SET status = 'ARRIVED', arrived_at = NOW()
            WHERE reorder_id = %s
            """,
            (req.reorder_id,)
        )
        # 2. Create new inventory batch in 2nd-floor storage with generated EAN-13 barcode
        from .barcode import generate_ean13
        import random
        prefix = int(f"890{random.randint(100000000, 999999999)}")
        new_barcode = generate_ean13(prefix)
        new_batch_id = f"BATCH-GRN-{uuid.uuid4().hex[:8].upper()}"
        
        await db.execute(
            """
            INSERT INTO inventory_batches (
                batch_id, sku_id, barcode, arrival_date, cost_price,
                current_selling_price, status, quantity, created_at
            ) VALUES (
                %s, %s, %s, NOW(), %s,
                (SELECT selling_price FROM products_master WHERE sku_id = %s),
                'Storage', %s, NOW()
            )
            """,
            (new_batch_id, po["sku_id"], new_barcode, po["unit_cost"], po["sku_id"], po["reorder_qty"])
        )

        # 3. Increment 2nd-floor storage capacity in store_layout if exists
        await db.execute(
            """
            UPDATE store_layout
            SET current_shelf_stock = current_shelf_stock + %s, updated_at = NOW()
            WHERE sku_id = %s AND floor_level = 2
            """,
            (po["reorder_qty"], po["sku_id"])
        )

    return {
        "status": "UPDATED",
        "reorder_id": req.reorder_id,
        "new_status": req.status,
        "message": f"Order status updated to {req.status}."
    }

# -------------------------------------------------------------
# 3. THREE-WAY RECONCILIATION & SHRINKAGE ALERT
# -------------------------------------------------------------
class ThreeWayReconciliationRequest(BaseModel):
    sku_id: str
    units_received_storage_a: int = Field(..., description="[A] Units received at 2nd-floor storage")
    units_moved_cartons_b: int = Field(..., description="[B] Units scanned into cartons to ground floor")
    notes: Optional[str] = None

async def run_three_way_check(req: ThreeWayReconciliationRequest) -> Dict[str, Any]:
    """
    3-Way Reconciliation Check:
    [A] Units received at 2nd-floor storage
    [B] Units scanned into cartons to ground floor shelves
    [C] Units sold at POS
    Ground Floor Current Shelf Stock

    Balance Formula:
    A = B + C + Current Shelf Stock
    If there is a mismatch, flags a 'Stealing/Shrinkage Alert'!
    """
    # 1. Fetch [C] Units Sold at POS
    sold_row = await db.fetch_one(
        """
        SELECT COALESCE(SUM(si.quantity), 0) as units_sold
        FROM sales_items si
        JOIN sales_ledger sl ON si.transaction_id = sl.transaction_id
        WHERE si.sku_id = %s AND sl.status = 'COMPLETED'
        """,
        (req.sku_id,)
    )
    units_sold_c = int(sold_row["units_sold"] or 0)

    # 2. Fetch current shelf stock
    shelf_row = await db.fetch_one(
        "SELECT current_shelf_stock FROM store_layout WHERE sku_id = %s AND floor_level = 0 LIMIT 1",
        (req.sku_id,)
    )
    current_shelf_stock = int(shelf_row["current_shelf_stock"] or 0) if shelf_row else 0

    # 3. Calculate 3-Way balance
    # Expected Storage + Shelf accounting:
    # Storage Inflow = Storage Outflow to Shelves + In-Storage Residue
    # Ground Floor Inflow (B) should equal Sold (C) + Remaining on Shelf
    # Total A should reconcile against: In-Storage remaining + (B) Moved
    expected_sum = req.units_moved_cartons_b + units_sold_c + current_shelf_stock
    # Discrepancy between Received A and (B + C + Shelf Stock)
    discrepancy = req.units_received_storage_a - expected_sum

    has_shrinkage = abs(discrepancy) > 0
    recon_id = f"RECON-{uuid.uuid4().hex[:8].upper()}"

    await db.execute(
        """
        INSERT INTO supply_chain_reconciliation (
            reconciliation_id, sku_id, units_received_storage_a, units_moved_cartons_b,
            units_sold_pos_c, current_shelf_stock, discrepancy, shrinkage_alert,
            status, notes, reconciled_at
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
        """,
        (
            recon_id, req.sku_id, req.units_received_storage_a, req.units_moved_cartons_b,
            units_sold_c, current_shelf_stock, discrepancy, has_shrinkage,
            "SHRINKAGE_ALERT" if has_shrinkage else "VERIFIED",
            req.notes or (f"Shrinkage mismatch: {discrepancy} units missing" if has_shrinkage else "Tally matches")
        )
    )

    return {
        "status": "EVALUATED",
        "reconciliation_id": recon_id,
        "sku_id": req.sku_id,
        "storage_received_a": req.units_received_storage_a,
        "cartons_moved_b": req.units_moved_cartons_b,
        "pos_units_sold_c": units_sold_c,
        "current_shelf_stock": current_shelf_stock,
        "discrepancy": discrepancy,
        "shrinkage_alert": has_shrinkage,
        "equation": f"A ({req.units_received_storage_a}) vs [B ({req.units_moved_cartons_b}) + C ({units_sold_c}) + Shelf ({current_shelf_stock}) = {expected_sum}]",
        "message": (
            "✓ 3-Way Tally 100% Balanced. No shrinkage or leakage detected."
            if not has_shrinkage
            else f"🚨 SHRINKAGE ALERT TRIGGERED: Discrepancy of {abs(discrepancy)} units detected between storage and POS shelf tally! Potential theft or unregistered spoilage."
        )
    }

async def get_all_reconciliations() -> List[Dict[str, Any]]:
    return await db.fetch_all(
        """
        SELECT 
            r.*, p.name as product_name, p.category
        FROM supply_chain_reconciliation r
        JOIN products_master p ON r.sku_id = p.sku_id
        ORDER BY r.reconciled_at DESC
        LIMIT 25
        """
    )
