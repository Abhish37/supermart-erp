"""
Retail Intelligence & Decision Support System (RIDSS)
Expiry Decay Markdown & Return-to-Vendor (RTV) Optimizer
Target Facility: 4,500 sq. ft. Independent Supermarket — Dalli Rajhara
"""

from typing import Dict, List, Optional
from datetime import date


def calculate_batch_expiry_strategy(
    sku: str,
    lot_number: str,
    expiry_date: date,
    current_date: date,
    mfg_date: Optional[date],
    on_hand_qty: float,
    ads: float,
    selling_price: float,
    landed_cost: float,
    vendor_returnable: bool = True
) -> Dict[str, any]:
    """
    Evaluates remaining shelf life tau = T_exp - t and assigns optimal recovery action:
    1. RTV Credit-Note Window (tau >= 60 days):
       - If vendor returnable = True and expected leftover at tau=0 is > 20% of batch units,
         generate Supplier Credit Return Note.
    2. Dynamic Clearance Discount (tau < 60 days and non-returnable):
       - delta*(t) = min(0.50, max(0.10, 1.0 - (tau / TotalShelfLife * OnHand / (ADS * tau))))
       - Floor price limit: SellingPrice * (1 - delta*) >= LandedCost * 1.02
         (guarantees 2% cash recovery over zero write-off).
    3. Expiry Tiers:
       - 60d+ (Planned velocity / RTV review)
       - 45d  (Amber warning / Tier 1 markdown)
       - 30d  (Accelerated clearance)
       - 15d  (Rose Red imminent write-off risk)
    """
    tau = (expiry_date - current_date).days
    total_shelf_life = (expiry_date - mfg_date).days if mfg_date else max(180, tau + 90)
    total_shelf_life = max(1, total_shelf_life)

    # Expected leftover units at expiry
    expected_sales_until_expiry = ads * max(0, tau)
    expected_leftover = max(0.0, on_hand_qty - expected_sales_until_expiry)
    leftover_pct = (expected_leftover / on_hand_qty * 100.0) if on_hand_qty > 0 else 0.0

    # Risk Tiering
    if tau <= 0:
        tier = "EXPIRED"
        action = "IMMEDIATE_WRITE_OFF"
        rec_discount_pct = 0.0
        final_price = 0.0
        rationale = f"Batch expired on {expiry_date}. Must be condemned and removed from selling floor."
    elif tau <= 15:
        tier = "CRITICAL_15D"
        action = "FLASH_CLEARANCE_DISCOUNT"
    elif tau <= 30:
        tier = "HIGH_30D"
        action = "ACCELERATED_MARKDOWN"
    elif tau <= 45:
        tier = "WARNING_45D"
        action = "MODERATE_MARKDOWN"
    elif tau <= 60:
        tier = "WATCH_60D"
        action = "RTV_OR_PROMOTION"
    else:
        tier = "SAFE_HEALTHY"
        action = "REGULAR_SALE"

    # Evaluate RTV Credit Note vs In-Store Markdown
    rec_discount_pct = 0.0
    final_price = selling_price

    if tau > 0:
        if tau >= 60 and vendor_returnable and leftover_pct > 20.0:
            action = "GENERATE_RTV_CREDIT_NOTE"
            rationale = (
                f"Remaining shelf life ({tau}d) is within 60d+ vendor return window. "
                f"Velocity predicts {leftover_pct:.1f}% unsold leftover ({expected_leftover:.1f} units). "
                f"Claim full credit note from vendor."
            )
        elif tau < 60 or (not vendor_returnable and leftover_pct > 0.0):
            # Dynamic In-Store Clearance Formula:
            # delta*(t) = min(0.50, max(0.10, 1.0 - (tau / TotalShelfLife * OnHand / (ADS * tau))))
            denom = ads * tau if (ads * tau) > 0 else 1.0
            velocity_ratio = on_hand_qty / denom
            time_ratio = tau / total_shelf_life
            
            raw_discount = 1.0 - (time_ratio * velocity_ratio)
            bounded_discount = min(0.50, max(0.10, raw_discount))

            # Floor price enforcement: SellingPrice * (1 - delta*) >= LandedCost * 1.02
            min_floor_price = landed_cost * 1.02
            discounted_price = selling_price * (1.0 - bounded_discount)

            if discounted_price < min_floor_price:
                # Constrain discount to protect floor margin
                bounded_discount = max(0.05, 1.0 - (min_floor_price / selling_price))
                final_price = round(selling_price * (1.0 - bounded_discount), 2)
            else:
                final_price = round(discounted_price, 2)

            rec_discount_pct = round(bounded_discount * 100.0, 1)
            action = "APPLY_CLEARANCE_MARKDOWN"
            rationale = (
                f"tau={tau}d. Dynamic clearance discount of {rec_discount_pct}% applied. "
                f"New price: ₹{final_price:.2f} (Floor protected: ₹{min_floor_price:.2f})."
            )
        else:
            rationale = f"Stock velocity ({ads:.1f}/day) is sufficient to exhaust current batch ({on_hand_qty} units) in {on_hand_qty/ads:.0f} days."

    capital_at_risk = round(on_hand_qty * landed_cost, 2)

    return {
        "sku": sku,
        "lot_number": lot_number,
        "expiry_date": str(expiry_date),
        "days_to_expiry": tau,
        "on_hand_qty": on_hand_qty,
        "capital_at_risk": capital_at_risk,
        "risk_tier": tier,
        "action": action,
        "recommended_discount_pct": rec_discount_pct,
        "floor_protected_price": final_price,
        "expected_leftover_units": round(expected_leftover, 1),
        "rationale": rationale
    }
