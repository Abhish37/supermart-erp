"""
Retail Intelligence & Decision Support System (RIDSS)
Deterministic SKU Replenishment & Dynamic Safety Stock Engine
Target Facility: 4,500 sq. ft. Independent Supermarket — Dalli Rajhara, Chhattisgarh
"""

import math
from typing import List, Dict, Optional, Tuple
from datetime import date, timedelta


def calculate_ads(sales_by_day: List[float], stock_by_day: Optional[List[float]] = None) -> float:
    """
    Calculate Average Daily Sales (ADS) over active lookback window,
    excluding verified out-of-stock days (Stock == 0).
    ADS_i = sum(Sales) / count(InStockDays)
    """
    if not sales_by_day:
        return 0.0

    if stock_by_day is None or len(stock_by_day) != len(sales_by_day):
        # Fallback to non-zero days or all days if stock trace not provided
        valid_sales = [s for s in sales_by_day if s > 0]
        return sum(valid_sales) / len(valid_sales) if valid_sales else 0.0

    in_stock_sales = [s for s, stock in zip(sales_by_day, stock_by_day) if stock > 0]
    if not in_stock_sales:
        return 0.0

    return sum(in_stock_sales) / len(in_stock_sales)


def croston_intermittent_demand(demand_series: List[float], alpha: float = 0.15) -> float:
    """
    Croston's Method for slow-moving, sporadic Class-C items.
    z_t: exponentially smoothed non-zero demand magnitude
    p_t: exponentially smoothed inter-arrival periods
    forecast_ADS = z_t / p_t
    """
    non_zero_demands = [d for d in demand_series if d > 0]
    if not non_zero_demands:
        return 0.0

    # Initialize
    z = non_zero_demands[0]
    p = 1.0
    q = 1  # Inter-arrival counter

    for val in demand_series[1:]:
        if val > 0:
            z = alpha * val + (1.0 - alpha) * z
            p = alpha * q + (1.0 - alpha) * p
            q = 1
        else:
            q += 1

    if p <= 0:
        return z
    return z / p


def get_z_score(abc_class: str) -> float:
    """
    Cycle Service Level Z-Scores:
    Class-A: 97.5% CSL -> Z = 1.96
    Class-B: 95.0% CSL -> Z = 1.64
    Class-C: 90.0% CSL -> Z = 1.28
    """
    cls = (abc_class or 'C').upper()
    if cls == 'A':
        return 1.96
    elif cls == 'B':
        return 1.64
    return 1.28


def calculate_safety_stock(
    ads: float,
    lead_time_mean: float,
    std_demand: float,
    std_lead_time: float,
    z_score: float = 1.96
) -> float:
    """
    Dynamic Safety Stock (SS_i) incorporating both demand variance (sigma_D)
    and supplier delivery lead-time variance (sigma_L):
    SS_i = Z * sqrt( (L_mean * sigma_D^2) + (ADS^2 * sigma_L^2) )
    """
    variance_term = (lead_time_mean * (std_demand ** 2)) + ((ads ** 2) * (std_lead_time ** 2))
    if variance_term <= 0:
        return 0.0
    return z_score * math.sqrt(variance_term)


def calculate_reorder_point(
    ads: float,
    lead_time_mean: float,
    safety_stock: float,
    fest_mult: float = 1.0,
    payday_mult: float = 1.0
) -> float:
    """
    Reorder Point (ROP_i):
    ROP_i = (ADS_i * L_mean * M_fest * M_payday) + SS_i
    """
    adjusted_lead_time_demand = (ads * lead_time_mean) * fest_mult * payday_mult
    return adjusted_lead_time_demand + safety_stock


def compute_net_order_quantity(
    rop: float,
    on_hand: float,
    confirmed_inbound: float,
    reserved_qty: float,
    review_period: float,
    ads: float,
    pack_size: int,
    moq: int,
    shelf_life_days: Optional[int] = None
) -> Dict[str, any]:
    """
    Net Purchase Order Quantity (OrderQty_i):
    IP_i = OnHand_i + ConfirmedInbound_i - Reserved_i
    RawOrder_i = max(0, ROP_i + (ADS_i * ReviewPeriod) - IP_i)
    SuggestedOrder_i = ceil(max(RawOrder_i, MOQ) / PackSize) * PackSize

    Constraint: If EstimatedCoverDays > ShelfLifeDays * 0.60 -> flag EXCESS_EXPIRY_RISK_REJECT
    """
    pack_size = max(1, int(pack_size))
    moq = max(1, int(moq))

    inventory_position = on_hand + confirmed_inbound - reserved_qty
    target_stock = rop + (ads * review_period)
    raw_qty = max(0.0, target_stock - inventory_position)

    if raw_qty <= 0.0:
        return {
            "suggested_order_qty": 0,
            "raw_order_qty": 0.0,
            "inventory_position": inventory_position,
            "target_stock": round(target_stock, 2),
            "cover_days": round(inventory_position / ads, 1) if ads > 0 else 999.0,
            "risk_flag": None,
            "rationale": f"Inventory position ({inventory_position:.1f}) meets target stock level ({target_stock:.1f}). No replenishment required."
        }

    bounded_qty = max(raw_qty, float(moq))
    pack_rounded = math.ceil(bounded_qty / pack_size) * pack_size

    # Check cover days & shelf life constraint
    cover_days = (inventory_position + pack_rounded) / ads if ads > 0 else 0.0
    risk_flag = None

    if shelf_life_days and shelf_life_days > 0:
        max_allowed_cover = shelf_life_days * 0.60
        if cover_days > max_allowed_cover:
            risk_flag = "EXCESS_EXPIRY_RISK_REJECT"

    rationale = (
        f"Target Stock: {target_stock:.1f} (ROP {rop:.1f} + {review_period:.0f}d Review Buffer {ads * review_period:.1f}). "
        f"Current IP: {inventory_position:.1f}. Raw Deficit: {raw_qty:.1f}. "
        f"Rounded to Pack {pack_size} & MOQ {moq} -> {pack_rounded} units."
    )

    return {
        "suggested_order_qty": pack_rounded,
        "raw_order_qty": round(raw_qty, 2),
        "inventory_position": round(inventory_position, 2),
        "target_stock": round(target_stock, 2),
        "cover_days": round(cover_days, 1),
        "risk_flag": risk_flag,
        "rationale": rationale
    }


def evaluate_dalli_rajhara_multipliers(
    sku_category: str,
    target_date: date,
    lead_time_days: int,
    local_events: Optional[List[Dict]] = None
) -> Tuple[float, float, List[str]]:
    """
    Evaluates Dalli Rajhara Hyperlocal Operating Parameters:
    1. SAIL / Bhilai Steel Plant (BSP) Township Payday:
       - Salaries paid 1st to 7th.
       - Bulk-staple consumption factor M_payday = 1.30 to 1.45 applied during reorders
         evaluated 7 days prior to month-end through the 7th.
    2. Regional Cultural Calendar:
       - Pola (M_fest = 1.40)
       - Hareli (M_fest = 1.35)
       - Durgotsav & Diwali (M_fest = 1.80 to 2.50)
    """
    payday_mult = 1.0
    fest_mult = 1.0
    triggers = []

    # 1. Payday Logic for Staples & Bulk Commodities
    is_staple = any(cat in (sku_category or '').upper() for cat in ['STAPLE', 'OIL', 'RICE', 'ATTA', 'PULSE', 'SUGAR'])
    
    # Check if target date is in last 7 days of month or 1st-7th of month
    day = target_date.day
    is_month_end_eval = day >= 24
    is_salary_week = 1 <= day <= 7

    if is_staple and (is_month_end_eval or is_salary_week):
        payday_mult = 1.35
        triggers.append(f"SAIL Mining Payday Rush Active (M_payday={payday_mult:.2f})")

    # 2. Regional Festival Logic
    horizon_end = target_date + timedelta(days=lead_time_days)
    if local_events:
        for event in local_events:
            ev_start = event.get('start_date')
            ev_end = event.get('end_date')
            if isinstance(ev_start, str):
                ev_start = date.fromisoformat(ev_start)
            if isinstance(ev_end, str):
                ev_end = date.fromisoformat(ev_end)

            # Check overlap between [target_date, horizon_end] and [ev_start, ev_end]
            if not (horizon_end < ev_start or target_date > ev_end):
                ev_mult = float(event.get('demand_multiplier', 1.20))
                if ev_mult > fest_mult:
                    fest_mult = ev_mult
                    triggers.append(f"Regional Festival Active: {event.get('name')} (M_fest={fest_mult:.2f})")

    return fest_mult, payday_mult, triggers
