"""
Retail Intelligence & Decision Support System (RIDSS)
Loose-to-Packaged Conversion Ledger Engine
Target Facility: 4,500 sq. ft. Independent Supermarket — Dalli Rajhara
"""

from typing import Dict, List, Optional
import math


def calculate_repackaging_transformation(
    bulk_sku: str,
    bulk_cost_per_kg: float,
    bulk_consumed_kg: float,
    target_pack_sku: str,
    target_pack_weight_kg: float,
    packaging_loss_factor: float = 0.008,  # Calibrated 0.8% loss (0.5% - 1.2%)
    packaging_material_cost_per_unit: float = 2.50, # Pouch + sealing + label
    target_selling_price: float = 0.0
) -> Dict[str, any]:
    """
    Simulates and validates the disassembly/transformation of bulk commodities:
    e.g. 50 kg unbranded grain sacks into 1 kg and 5 kg store-branded bags.
    - Captures gross margins of 22-32% vs branded FMCG margins of 8-12%.
    - Enforces dual inventory movements:
      LOOSE_CONVERSION_OUT on bulk SKU.
      LOOSE_CONVERSION_IN on packaged SKU.
    - Loss factor theta_loss: Net output = BulkConsumed * (1 - theta_loss).
    """
    if bulk_consumed_kg <= 0:
        raise ValueError("Bulk consumed quantity must be greater than zero.")
    if target_pack_weight_kg <= 0:
        raise ValueError("Target pack weight must be greater than zero.")

    loss_kg = round(bulk_consumed_kg * packaging_loss_factor, 3)
    usable_weight_kg = bulk_consumed_kg - loss_kg

    # Theoretical maximum integer units packaged
    units_produced = int(math.floor(usable_weight_kg / target_pack_weight_kg))
    remaining_fractional_kg = round(usable_weight_kg - (units_produced * target_pack_weight_kg), 3)

    # Unit landed cost calculation
    total_bulk_cost = bulk_consumed_kg * bulk_cost_per_kg
    total_packaging_cost = units_produced * packaging_material_cost_per_unit
    total_transformed_cost = total_bulk_cost + total_packaging_cost
    
    unit_cost_produced = round(total_transformed_cost / units_produced, 2) if units_produced > 0 else 0.0

    # Margin comparison vs branded commodity
    gross_margin_pct = 0.0
    if target_selling_price > 0 and unit_cost_produced > 0:
        profit_per_unit = target_selling_price - unit_cost_produced
        gross_margin_pct = round((profit_per_unit / target_selling_price) * 100.0, 2)

    return {
        "bulk_sku": bulk_sku,
        "bulk_consumed_kg": bulk_consumed_kg,
        "loss_kg": loss_kg,
        "loss_percentage": round(packaging_loss_factor * 100.0, 2),
        "target_pack_sku": target_pack_sku,
        "pack_size_kg": target_pack_weight_kg,
        "units_produced": units_produced,
        "leftover_mandi_tail_kg": remaining_fractional_kg,
        "unit_cost_produced": unit_cost_produced,
        "target_selling_price": target_selling_price,
        "realized_gross_margin_pct": gross_margin_pct,
        "ledger_movements": [
            {
                "movement_type": "LOOSE_CONVERSION_OUT",
                "sku": bulk_sku,
                "quantity_delta": -bulk_consumed_kg,
                "unit_cost": bulk_cost_per_kg,
                "notes": f"Disassembly into {units_produced} units of {target_pack_sku}"
            },
            {
                "movement_type": "LOOSE_CONVERSION_IN",
                "sku": target_pack_sku,
                "quantity_delta": units_produced,
                "unit_cost": unit_cost_produced,
                "notes": f"Transformed from {bulk_consumed_kg}kg bulk with {loss_kg}kg loss ({packaging_loss_factor*100:.1f}%)"
            }
        ]
    }
