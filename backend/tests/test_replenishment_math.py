"""
Unit Tests for Deterministic SKU Replenishment & Dynamic Safety Stock Engine
Tests all mathematical formulas from Section 3.1 & Dalli Rajhara Hyperlocal Parameters
"""

import pytest
import math
from datetime import date
from backend.app.engines.replenishment import (
    calculate_ads,
    croston_intermittent_demand,
    calculate_safety_stock,
    calculate_reorder_point,
    compute_net_order_quantity,
    get_z_score,
    evaluate_dalli_rajhara_multipliers
)


def test_ads_calculation():
    sales = [10.0, 0.0, 15.0, 20.0, 0.0]
    stock = [50.0, 0.0, 40.0, 25.0, 0.0]  # Day 2 and 5 are stockouts
    ads = calculate_ads(sales, stock)
    # Only in-stock days evaluated: (10 + 15 + 20) / 3 = 15.0
    assert round(ads, 2) == 15.0


def test_croston_intermittent_demand():
    # Sporadic sales pattern for slow-moving Class-C item
    demand = [0, 0, 5, 0, 0, 0, 6, 0, 4]
    croston_ads = croston_intermittent_demand(demand, alpha=0.15)
    assert croston_ads > 0.0
    assert croston_ads < 5.0  # Smoothed lower than raw spikes due to inter-arrival gap


def test_dynamic_safety_stock_class_a():
    ads = 8.5
    lead_time = 4.0
    std_demand = 2.1
    std_lead_time = 0.8
    z_score = get_z_score('A')  # 1.96

    ss = calculate_safety_stock(ads, lead_time, std_demand, std_lead_time, z_score)
    # Variance term: 4 * 2.1^2 + 8.5^2 * 0.8^2 = 17.64 + 46.24 = 63.88
    # sqrt(63.88) = 7.9925 -> 1.96 * 7.9925 = 15.665
    assert round(ss, 2) == 15.67


def test_reorder_point_with_dalli_rajhara_multipliers():
    ads = 8.5
    lead_time = 4.0
    fest_mult = 1.40  # Pola festival surge
    payday_mult = 1.30  # SAIL mining salary surge
    ss = 15.665

    rop = calculate_reorder_point(ads, lead_time, ss, fest_mult, payday_mult)
    # Adjusted demand = 8.5 * 4.0 * 1.40 * 1.30 = 61.88
    # ROP = 61.88 + 15.665 = 77.545
    assert abs(rop - 77.55) < 0.02


def test_pack_size_and_moq_rounding():
    rop = 77.545
    on_hand = 18.0
    confirmed_inbound = 0.0
    reserved_qty = 0.0
    review_period = 3.0
    ads = 8.5
    pack_size = 12
    moq = 24

    res = compute_net_order_quantity(
        rop=rop,
        on_hand=on_hand,
        confirmed_inbound=confirmed_inbound,
        reserved_qty=reserved_qty,
        review_period=review_period,
        ads=ads,
        pack_size=pack_size,
        moq=moq
    )

    suggested = res["suggested_order_qty"]
    assert suggested % pack_size == 0
    assert suggested >= moq
    assert suggested in (84, 96)


def test_excess_expiry_risk_rejection():
    res = compute_net_order_quantity(
        rop=50.0,
        on_hand=10.0,
        confirmed_inbound=0.0,
        reserved_qty=0.0,
        review_period=7.0,
        ads=2.0,
        pack_size=100,  # Huge pack size
        moq=200,
        shelf_life_days=30  # Short shelf life
    )
    # Order of 200 units on ADS of 2 -> 100+ days cover on a 30-day shelf life item
    assert res["risk_flag"] == "EXCESS_EXPIRY_RISK_REJECT"
