"""
SuperMart Math Engine & Payday Tsunami Replenishment Logic
Module 4: Business Logic & Dynamic SKU Inventory Formulas

Formulas:
1. Payday Tsunami Phase:
   - Peak Phase (1st to 10th of the month)
   - Trough Phase (11th to 31st of the month)
2. Safety Stock Calculation:
   Safety Stock = (Max Daily Sales × Max Lead Time) - (Average Daily Sales × Average Lead Time)
3. Reorder Point (ROP) Calculation:
   Reorder Point = (Average Daily Sales × Average Lead Time) + Safety Stock
   Trigger Reorder Alert when Current Inventory <= ROP
4. Economic Order Quantity (Min/Max Replenishment):
   Order Quantity = Max Capacity (e.g. 21-day supply) - Current Inventory at ROP
"""

import datetime
import logging
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from .db import db

logger = logging.getLogger("supermart.math_engine")

class RecalculateRequest(BaseModel):
    sku_id: Optional[str] = Field(None, description="Optional SKU ID to recalculate, or all if None")
    override_day: Optional[int] = Field(None, description="Optional day of month override (1-31) for testing Peak/Trough phases")

def get_current_payday_phase(day_override: Optional[int] = None) -> str:
    """
    Splits calculations into two phases:
    - 'PEAK': 1st to 10th of the month
    - 'TROUGH': 11th to 31st of the month
    """
    today_day = day_override if day_override is not None else datetime.date.today().day
    return "PEAK" if 1 <= today_day <= 10 else "TROUGH"

async def calculate_sku_math_metrics(sku_id: str, day_override: Optional[int] = None) -> Dict[str, Any]:
    """
    Recalculates Safety Stock, ROP, EOQ, and Reorder Trigger for a specific SKU
    dynamically incorporating the Payday Tsunami adjustment.
    """
    phase = get_current_payday_phase(day_override)

    # 1. Fetch product master, existing metrics, and current stock across batches and layout
    sku_info = await db.fetch_one(
        """
        SELECT 
            p.sku_id, p.name, p.category, p.cost_price, p.selling_price,
            p.min_stock_threshold, p.lead_time_days, p.max_lead_time_days,
            p.max_capacity_days, p.vendor_name, p.vendor_phone, p.dealer_id,
            COALESCE(
                (SELECT SUM(quantity) FROM inventory_batches WHERE sku_id = p.sku_id AND status IN ('Shelf', 'Storage')),
                0
            ) as total_inventory,
            COALESCE(
                (SELECT current_shelf_stock FROM store_layout WHERE sku_id = p.sku_id AND floor_level = 0 LIMIT 1),
                0
            ) as shelf_stock,
            m.avg_daily_sales_peak, m.avg_daily_sales_trough,
            m.max_daily_sales_peak, m.max_daily_sales_trough
        FROM products_master p
        LEFT JOIN sku_math_metrics m ON p.sku_id = m.sku_id
        WHERE p.sku_id = %s
        """,
        (sku_id,)
    )

    if not sku_info:
        raise ValueError(f"SKU {sku_id} not found in products_master.")

    # 2. Extract or determine velocity parameters
    avg_peak = float(sku_info.get("avg_daily_sales_peak") or 22.0)
    avg_trough = float(sku_info.get("avg_daily_sales_trough") or 10.0)
    max_peak = float(sku_info.get("max_daily_sales_peak") or 45.0)
    max_trough = float(sku_info.get("max_daily_sales_trough") or 20.0)

    avg_lead_time = float(sku_info.get("lead_time_days") or 3.0)
    max_lead_time = float(sku_info.get("max_lead_time_days") or 7.0)
    max_capacity_days = int(sku_info.get("max_capacity_days") or 21)
    current_inventory = int(sku_info.get("total_inventory") or 0)
    shelf_stock = int(sku_info.get("shelf_stock") or 0)

    # Dynamic Payday Tsunami Selection
    if phase == "PEAK":
        avg_daily_sales = avg_peak
        max_daily_sales = max_peak
    else:
        avg_daily_sales = avg_trough
        max_daily_sales = max_trough

    # FORMULA 1: Safety Stock
    # Safety Stock = (Max Daily Sales × Max Lead Time) - (Average Daily Sales × Average Lead Time)
    raw_safety_stock = (max_daily_sales * max_lead_time) - (avg_daily_sales * avg_lead_time)
    safety_stock = max(5, int(round(raw_safety_stock)))

    # FORMULA 2: Reorder Point (ROP)
    # Reorder Point = (Average Daily Sales × Average Lead Time) + Safety Stock
    raw_rop = (avg_daily_sales * avg_lead_time) + safety_stock
    reorder_point = int(round(raw_rop))

    # FORMULA 3: Max Capacity & Order Quantity (Min/Max Replenishment)
    # Max Capacity = Max Capacity Days supply
    max_capacity_supply = int(round(avg_daily_sales * max_capacity_days))
    # Order Quantity = Max Capacity - Current Inventory at ROP
    order_quantity = max(10, max_capacity_supply - current_inventory)

    # FORMULA 4: Trigger Reorder Alert
    reorder_alert = current_inventory <= reorder_point

    # 3. Upsert metrics into database
    metric_id = f"MATH-{sku_id}"
    await db.execute(
        """
        INSERT INTO sku_math_metrics (
            metric_id, sku_id, avg_daily_sales_peak, avg_daily_sales_trough,
            avg_lead_time_days, max_daily_sales_peak, max_daily_sales_trough,
            max_lead_time_days, current_phase, safety_stock, reorder_point,
            max_capacity_supply, order_quantity, current_inventory,
            reorder_alert_triggered, last_calculated_at
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
        ON CONFLICT (sku_id) DO UPDATE SET
            current_phase = EXCLUDED.current_phase,
            safety_stock = EXCLUDED.safety_stock,
            reorder_point = EXCLUDED.reorder_point,
            max_capacity_supply = EXCLUDED.max_capacity_supply,
            order_quantity = EXCLUDED.order_quantity,
            current_inventory = EXCLUDED.current_inventory,
            reorder_alert_triggered = EXCLUDED.reorder_alert_triggered,
            last_calculated_at = NOW()
        """,
        (
            metric_id, sku_id, avg_peak, avg_trough,
            avg_lead_time, max_peak, max_trough,
            max_lead_time, phase, safety_stock, reorder_point,
            max_capacity_supply, order_quantity, current_inventory,
            reorder_alert
        )
    )

    # If reorder alert triggered and not already queued in reorder_queue, insert suggested PO
    if reorder_alert:
        vendor_id = sku_info.get("dealer_id") or "VND-01"
        cost_price = float(sku_info.get("cost_price") or 40.0)
        po_number = f"PO-{datetime.date.today().strftime('%Y%m%d')}-{sku_id[:8]}"
        total_cost = round(cost_price * order_quantity, 2)
        
        await db.execute(
            """
            INSERT INTO reorder_queue (
                reorder_id, po_number, vendor_id, sku_id, reorder_qty,
                unit_cost, total_cost, status, trigger_reason, created_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, 'SUGGESTED', 'ROP_BREACH', NOW())
            ON CONFLICT (po_number) DO UPDATE SET
                reorder_qty = EXCLUDED.reorder_qty,
                total_cost = EXCLUDED.total_cost
            """,
            (
                f"REORDER-{sku_id}", po_number, vendor_id, sku_id,
                order_quantity, cost_price, total_cost
            )
        )

    return {
        "sku_id": sku_id,
        "name": sku_info["name"],
        "category": sku_info["category"],
        "current_phase": phase,
        "is_peak_phase": phase == "PEAK",
        "variables": {
            "avg_daily_sales": avg_daily_sales,
            "max_daily_sales": max_daily_sales,
            "avg_lead_time_days": avg_lead_time,
            "max_lead_time_days": max_lead_time,
            "max_capacity_days": max_capacity_days,
        },
        "safety_stock": safety_stock,
        "reorder_point": reorder_point,
        "max_capacity_supply": max_capacity_supply,
        "current_inventory": current_inventory,
        "shelf_stock": shelf_stock,
        "order_quantity": order_quantity,
        "reorder_alert_triggered": reorder_alert,
        "formula_breakdown": {
            "safety_stock_formula": f"({max_daily_sales} × {max_lead_time}) - ({avg_daily_sales} × {avg_lead_time}) = {safety_stock}",
            "rop_formula": f"({avg_daily_sales} × {avg_lead_time}) + {safety_stock} = {reorder_point}",
            "order_quantity_formula": f"{max_capacity_supply} (Max Capacity) - {current_inventory} (Current) = {order_quantity}",
            "condition": f"Current Inventory ({current_inventory}) <= ROP ({reorder_point}) => {'ALERT TRIGGERED' if reorder_alert else 'SUFFICIENT STOCK'}"
        }
    }

async def recalculate_all_skus(day_override: Optional[int] = None) -> List[Dict[str, Any]]:
    """
    Recalculates Math Engine metrics for all SKUs in the catalog.
    """
    skus = await db.fetch_all("SELECT sku_id FROM products_master ORDER BY sku_id ASC")
    results = []
    for s in skus:
        res = await calculate_sku_math_metrics(s["sku_id"], day_override)
        results.append(res)
    return results

async def get_all_math_metrics() -> Dict[str, Any]:
    """
    Returns full summary of the Math Engine for the Admin Dashboard.
    """
    today_day = datetime.date.today().day
    phase = get_current_payday_phase()

    metrics = await db.fetch_all(
        """
        SELECT 
            m.*, p.name as product_name, p.category, p.cost_price, p.selling_price,
            p.vendor_name, p.vendor_phone
        FROM sku_math_metrics m
        JOIN products_master p ON m.sku_id = p.sku_id
        ORDER BY m.reorder_alert_triggered DESC, m.sku_id ASC
        """
    )

    alert_count = sum(1 for m in metrics if m["reorder_alert_triggered"])

    return {
        "current_date": str(datetime.date.today()),
        "day_of_month": today_day,
        "current_phase": phase,
        "phase_description": (
            "Payday Tsunami Peak Phase (1st to 10th): Heightened demand velocity and accelerated safety stock buffers."
            if phase == "PEAK"
            else "Trough Phase (11th to 31st): Standard baseline consumption rate and stabilized reorder thresholds."
        ),
        "total_skus": len(metrics),
        "alerts_triggered_count": alert_count,
        "metrics": metrics
    }
