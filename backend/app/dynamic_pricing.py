"""
Dynamic Commodity Pricing Engine
Automates Base Rate Adjustments & Instantaneous POS Price Sync via WebSockets
"""

import logging
import asyncio
from pydantic import BaseModel, Field
from .db import db
from .websockets import ws_manager

logger = logging.getLogger("supermart.pricing")

class CommodityPriceAdjustmentRequest(BaseModel):
    sku_id: str = Field(..., description="Target commodity SKU ID (e.g. SKU-SUGAR-01)")
    new_wholesale_rate: float = Field(..., description="Day wholesale rate per kg/liter (e.g. 42.50)")

class PriceAdjustmentResponse(BaseModel):
    sku_id: str
    product_name: str
    old_wholesale_rate: float
    new_wholesale_rate: float
    target_margin_pct: float
    old_retail_price: float
    new_retail_price: float
    affected_batches_count: int
    message: str

async def adjust_commodity_base_rate(req: CommodityPriceAdjustmentRequest) -> PriceAdjustmentResponse:
    # 1. Fetch current product record
    product = await db.fetch_one(
        """
        SELECT sku_id, name, daily_fluctuation_flag, target_margin_pct, base_wholesale_rate
        FROM products_master
        WHERE sku_id = %s
        """,
        (req.sku_id,)
    )
    if not product:
        raise ValueError(f"SKU {req.sku_id} not found in master catalog.")

    product_name = product["name"]
    old_wholesale = float(product["base_wholesale_rate"])
    target_margin = float(product["target_margin_pct"])
    
    # 2. Calculate New Retail Selling Price
    new_retail_price = round(req.new_wholesale_rate * (1 + (target_margin / 100)), 2)

    sample_batch = await db.fetch_one(
        """
        SELECT current_selling_price FROM inventory_batches
        WHERE sku_id = %s AND status IN ('Shelf', 'Storage')
        ORDER BY arrival_date ASC LIMIT 1
        """,
        (req.sku_id,)
    )
    old_retail_price = float(sample_batch["current_selling_price"]) if sample_batch else round(old_wholesale * 1.15, 2)

    # 3. Update Database via Atomic Transaction
    def _execute_update():
        with db.transaction() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE products_master
                    SET base_wholesale_rate = %s, updated_at = NOW()
                    WHERE sku_id = %s
                    """,
                    (req.new_wholesale_rate, req.sku_id)
                )

                cur.execute(
                    """
                    UPDATE inventory_batches
                    SET current_selling_price = %s
                    WHERE sku_id = %s AND status IN ('Shelf', 'Storage')
                    """,
                    (new_retail_price, req.sku_id)
                )
                return cur.rowcount

    affected_batches = await asyncio.to_thread(_execute_update)

    # 4. Instantaneous WebSocket Broadcast to all active POS Terminals
    logger.info(
        f"Dynamic Price Updated for {product_name}: "
        f"Wholesale {old_wholesale} -> {req.new_wholesale_rate}, "
        f"Retail {old_retail_price} -> {new_retail_price}"
    )
    await ws_manager.broadcast_price_update(
        sku_id=req.sku_id,
        product_name=product_name,
        new_price=new_retail_price,
        old_price=old_retail_price
    )

    return PriceAdjustmentResponse(
        sku_id=req.sku_id,
        product_name=product_name,
        old_wholesale_rate=old_wholesale,
        new_wholesale_rate=req.new_wholesale_rate,
        target_margin_pct=target_margin,
        old_retail_price=old_retail_price,
        new_retail_price=new_retail_price,
        affected_batches_count=affected_batches,
        message="Price updated successfully and pushed to all active POS terminals via WebSockets."
    )
