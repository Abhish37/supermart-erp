"""
Bulk-to-Unit Repackaging Workflow
Private Label Factory Floor Automation:
- Mathematical Process Spillage Accounting & Deductions
- Financial Overhead Ledger Logging (Expense Category: 'Spillage')
- Dynamic EAN-13 Barcode Generation for Output Yield
- FIFO Inventory Storage Registration
"""

import uuid
import time
import asyncio
from typing import Optional
from pydantic import BaseModel, Field
from .db import db
from .barcode import generate_ean13

class RepackageRequest(BaseModel):
    sku_id: str = Field(..., description="Target SKU identifier (e.g. SKU-SUGAR-01)")
    bulk_batch_id: str = Field(..., description="Source bulk sack batch ID (e.g. BULK-SACK-50KG)")
    bulk_weight_kg: float = Field(50.0, description="Total weight of input sack in kg")
    bulk_total_cost: float = Field(..., description="Total cost of input sack in currency (e.g. 2000.00)")
    yield_packets: int = Field(..., description="Actual packed yield (e.g. 48)")
    unit_packet_weight_kg: float = Field(1.0, description="Weight per packaged unit in kg (e.g. 1.0)")
    selling_price_per_unit: Optional[float] = Field(None, description="Retail selling price per packet")

class RepackageResult(BaseModel):
    repackage_job_id: str
    sku_id: str
    product_name: str
    bulk_weight_kg: float
    actual_yield_kg: float
    spillage_kg: float
    spillage_financial_loss: float
    unit_cost_price: float
    unit_selling_price: float
    output_batch_id: str
    primary_barcode: str
    sample_barcodes: list[str]
    overhead_entry_id: str
    status: str

async def process_bulk_to_unit_repackaging(req: RepackageRequest) -> RepackageResult:
    # 1. Fetch Product Master details
    product = await db.fetch_one(
        "SELECT sku_id, name, target_margin_pct, base_wholesale_rate FROM products_master WHERE sku_id = %s",
        (req.sku_id,)
    )
    if not product:
        raise ValueError(f"Product SKU {req.sku_id} not found in master records.")

    product_name = product["name"]
    target_margin = float(product["target_margin_pct"])

    # 2. Mathematical Spillage Calculation
    actual_yield_kg = req.yield_packets * req.unit_packet_weight_kg
    spillage_kg = round(req.bulk_weight_kg - actual_yield_kg, 3)
    
    if spillage_kg < 0:
        raise ValueError(f"Yield ({actual_yield_kg}kg) cannot exceed input bulk weight ({req.bulk_weight_kg}kg).")

    # Spillage Financial Loss Calculation
    cost_per_kg = req.bulk_total_cost / req.bulk_weight_kg
    spillage_loss = round(spillage_kg * cost_per_kg, 2)
    
    # Cost price of packaged units (net cost allocated to valid units)
    unit_cost_price = round((req.bulk_total_cost - spillage_loss) / req.yield_packets, 2)
    
    # Selling price calculation (from request or margin threshold)
    if req.selling_price_per_unit is not None and req.selling_price_per_unit > 0:
        unit_selling_price = float(req.selling_price_per_unit)
    else:
        unit_selling_price = round(unit_cost_price * (1 + (target_margin / 100)), 2)

    overhead_id = f"OVH-SPIL-{uuid.uuid4().hex[:8].upper()}"
    spillage_notes = (
        f"Process Spillage: {spillage_kg}kg lost during bulk repackaging of "
        f"{req.bulk_batch_id} into {req.yield_packets}x{req.unit_packet_weight_kg}kg packets."
    )

    seq_base = int(time.time() % 10000000)
    generated_barcodes = [
        generate_ean13(prefix="890200", sequence_num=seq_base + i)
        for i in range(req.yield_packets)
    ]
    primary_barcode = generated_barcodes[0]
    batch_id = f"BATCH-{product['sku_id'].replace('SKU-', '')}-{uuid.uuid4().hex[:6].upper()}"

    def _execute_tx():
        with db.transaction() as conn:
            with conn.cursor() as cur:
                # Insert overhead spillage loss
                cur.execute(
                    """
                    INSERT INTO financial_overhead (
                        overhead_id, expense_category, amount, expense_date, notes
                    ) VALUES (%s, %s, %s, NOW(), %s)
                    """,
                    (overhead_id, "Spillage", spillage_loss, spillage_notes)
                )

                # Insert into inventory batches as Storage status
                cur.execute(
                    """
                    INSERT INTO inventory_batches (
                        batch_id, sku_id, barcode, arrival_date, cost_price,
                        current_selling_price, status, quantity, unit_weight_kg,
                        parent_bulk_batch_id
                    ) VALUES (%s, %s, %s, NOW(), %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        batch_id,
                        req.sku_id,
                        primary_barcode,
                        unit_cost_price,
                        unit_selling_price,
                        "Storage",
                        req.yield_packets,
                        req.unit_packet_weight_kg,
                        req.bulk_batch_id
                    )
                )

    await asyncio.to_thread(_execute_tx)

    return RepackageResult(
        repackage_job_id=f"JOB-{uuid.uuid4().hex[:8].upper()}",
        sku_id=req.sku_id,
        product_name=product_name,
        bulk_weight_kg=req.bulk_weight_kg,
        actual_yield_kg=actual_yield_kg,
        spillage_kg=spillage_kg,
        spillage_financial_loss=spillage_loss,
        unit_cost_price=unit_cost_price,
        unit_selling_price=unit_selling_price,
        output_batch_id=batch_id,
        primary_barcode=primary_barcode,
        sample_barcodes=generated_barcodes[:5],
        overhead_entry_id=overhead_id,
        status="SUCCESS_LOGGED"
    )
