"""
Retail Intelligence & Decision Support System (RIDSS)
Inventory Batches, Expiry Risk Tiers & Loose Repackaging Conversion API
Target Facility: 4,500 sq. ft. Independent Supermarket — Dalli Rajhara
"""

from datetime import datetime, date
from typing import Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException
from ...db import db
from ...engines.expiry_decay import calculate_batch_expiry_strategy
from ...engines.loose_converter import calculate_repackaging_transformation

router = APIRouter()


class LooseConversionRequest(BaseModel):
    bulk_sku: str = Field(..., description="Source bulk commodity SKU, e.g. SKU-BULK-DAL50")
    bulk_consumed_kg: float = Field(..., gt=0, description="Gross quantity of bulk commodity consumed")
    target_pack_sku: str = Field(..., description="Store-branded pack SKU, e.g. SKU-PACK-DAL1")
    target_pack_weight_kg: float = Field(1.0, gt=0, description="Pack size weight in kg")
    packaging_loss_factor: Optional[float] = Field(0.008, description="Packaging loss percentage (default 0.8%)")
    target_selling_price: Optional[float] = Field(165.0, description="Selling price per produced pack")


@router.get("/expiry-risk")
async def get_inventory_expiry_risk():
    """
    Batches categorized into 60d, 45d, 30d, 15d risk tiers:
    - RTV Credit-Note window (tau >= 60d, returnable = True, leftover > 20%)
    - Dynamic Clearance Markdown (tau < 60d, delta*(t) dynamic discount)
    - Enforced 2% floor cash recovery over write-off
    """
    start_time = datetime.now()
    today = date.today()

    pool = db.get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT 
                    b.batch_id,
                    b.sku,
                    p.name AS product_name,
                    b.lot_number,
                    b.received_quantity,
                    b.remaining_quantity,
                    b.landed_cost_unit,
                    b.mfg_date,
                    b.expiry_date,
                    b.vendor_credit_eligible,
                    p.current_selling_price,
                    COALESCE(s.returnable_policy, TRUE) AS vendor_returnable,
                    s.trade_name AS supplier_name
                FROM inventory_batches b
                JOIN products p ON b.sku = p.sku
                LEFT JOIN supplier_skus ss ON p.sku = ss.sku
                LEFT JOIN suppliers s ON ss.supplier_id = s.supplier_id
                WHERE b.remaining_quantity > 0
                ORDER BY b.expiry_date ASC;
            """)
            raw_batches = cur.fetchall()

            categorized_batches = {
                "critical_15d": [],
                "high_30d": [],
                "warning_45d": [],
                "watch_60d": [],
                "safe_healthy": []
            }

            total_capital_at_risk = 0.0

            for b in raw_batches:
                exp_date = b["expiry_date"]
                mfg_date = b["mfg_date"]
                rem_qty = float(b["remaining_quantity"])
                landed_cost = float(b["landed_cost_unit"])
                selling_price = float(b["current_selling_price"])
                returnable = bool(b["vendor_returnable"] and b["vendor_credit_eligible"])

                # Estimate daily velocity
                cur.execute("""
                    SELECT COALESCE(SUM(tl.quantity), 0.0) / 30.0 AS est_ads
                    FROM transaction_lines tl
                    JOIN transactions t ON tl.receipt_id = t.receipt_id
                    WHERE tl.sku = %s
                      AND t.timestamp >= CURRENT_DATE - INTERVAL '30 days';
                """, (b["sku"],))
                ads_row = cur.fetchone()
                ads = float(ads_row["est_ads"]) if (ads_row and ads_row["est_ads"]) else 2.5

                eval_result = calculate_batch_expiry_strategy(
                    sku=b["sku"],
                    lot_number=b["lot_number"],
                    expiry_date=exp_date,
                    current_date=today,
                    mfg_date=mfg_date,
                    on_hand_qty=rem_qty,
                    ads=ads,
                    selling_price=selling_price,
                    landed_cost=landed_cost,
                    vendor_returnable=returnable
                )

                item_payload = {
                    **eval_result,
                    "batch_id": str(b["batch_id"]),
                    "product_name": b["product_name"],
                    "supplier_name": b["supplier_name"] or "Regional Depot"
                }

                tier = eval_result["risk_tier"]
                if "15D" in tier or "EXPIRED" in tier:
                    categorized_batches["critical_15d"].append(item_payload)
                    total_capital_at_risk += eval_result["capital_at_risk"]
                elif "30D" in tier:
                    categorized_batches["high_30d"].append(item_payload)
                    total_capital_at_risk += eval_result["capital_at_risk"]
                elif "45D" in tier:
                    categorized_batches["warning_45d"].append(item_payload)
                    total_capital_at_risk += eval_result["capital_at_risk"]
                elif "60D" in tier:
                    categorized_batches["watch_60d"].append(item_payload)
                else:
                    categorized_batches["safe_healthy"].append(item_payload)

    elapsed = (datetime.now() - start_time).total_seconds() * 1000.0

    return {
        "status": "success",
        "data": {
            "total_capital_at_risk_under_45d": round(total_capital_at_risk, 2),
            "tiers": categorized_batches
        },
        "metadata": {
            "generated_at": datetime.now().isoformat(),
            "version": "1.0",
            "execution_time_ms": round(elapsed, 2)
        }
    }


@router.post("/conversion")
async def execute_loose_to_packaged_conversion(payload: LooseConversionRequest):
    """
    Executes in-store loose commodity disassembly/repackaging transformation.
    Enforces double-entry ledger movements with calibrated packaging loss factor.
    """
    start_time = datetime.now()

    pool = db.get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            # Check bulk stock
            cur.execute("""
                SELECT p.base_cost_price, COALESCE(SUM(b.remaining_quantity), 0.0) AS on_hand
                FROM products p
                LEFT JOIN inventory_batches b ON p.sku = b.sku AND b.remaining_quantity > 0
                WHERE p.sku = %s
                GROUP BY p.base_cost_price;
            """, (payload.bulk_sku,))
            bulk_item = cur.fetchone()

            if not bulk_item:
                raise HTTPException(status_code=404, detail=f"Bulk SKU '{payload.bulk_sku}' not found.")
            if float(bulk_item["on_hand"]) < payload.bulk_consumed_kg:
                raise HTTPException(
                    status_code=400,
                    detail=f"Insufficient bulk inventory. On-hand: {bulk_item['on_hand']}kg, Requested: {payload.bulk_consumed_kg}kg."
                )

            bulk_cost = float(bulk_item["base_cost_price"])

            # Compute transformation math
            result = calculate_repackaging_transformation(
                bulk_sku=payload.bulk_sku,
                bulk_cost_per_kg=bulk_cost,
                bulk_consumed_kg=payload.bulk_consumed_kg,
                target_pack_sku=payload.target_pack_sku,
                target_pack_weight_kg=payload.target_pack_weight_kg,
                packaging_loss_factor=payload.packaging_loss_factor or 0.008,
                target_selling_price=payload.target_selling_price or 0.0
            )

            # Record double-entry movements
            ref_id = f"REPACK-{datetime.now().strftime('%Y%m%d%H%M')}"
            
            # 1. OUT from Bulk
            cur.execute("""
                INSERT INTO inventory_movements (sku, movement_type, quantity_delta, unit_cost, reference_id, notes)
                VALUES (%s, 'LOOSE_CONVERSION_OUT', %s, %s, %s, %s);
            """, (payload.bulk_sku, -payload.bulk_consumed_kg, bulk_cost, ref_id, f"Repackaging into {result['units_produced']} units of {payload.target_pack_sku}"))

            # 2. IN to Packaged
            cur.execute("""
                INSERT INTO inventory_movements (sku, movement_type, quantity_delta, unit_cost, reference_id, notes)
                VALUES (%s, 'LOOSE_CONVERSION_IN', %s, %s, %s, %s);
            """, (payload.target_pack_sku, result["units_produced"], result["unit_cost_produced"], ref_id, f"Repackaged from {payload.bulk_consumed_kg}kg with {result['loss_kg']}kg loss"))

            conn.commit()

    elapsed = (datetime.now() - start_time).total_seconds() * 1000.0

    return {
        "status": "success",
        "data": {
            "transformation_ref": ref_id,
            **result
        },
        "metadata": {
            "generated_at": datetime.now().isoformat(),
            "version": "1.0",
            "execution_time_ms": round(elapsed, 2)
        }
    }
