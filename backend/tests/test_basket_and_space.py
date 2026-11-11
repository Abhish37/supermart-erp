"""
Unit Tests for Analytical Engines:
- Market Basket Mining (FP-Growth Protocol & Lift)
- Expiry Markdown Decay & RTV Credit Note
- Gross Profit per Linear Foot (GPPLF)
- Loose-to-Packaged Transformation Ledger
- Customer Khata Receivables Aging
"""

import pytest
from datetime import date, timedelta
from backend.app.engines.basket_mining import mine_association_rules
from backend.app.engines.expiry_decay import calculate_batch_expiry_strategy
from backend.app.engines.space_productivity import calculate_category_gpplf
from backend.app.engines.loose_converter import calculate_repackaging_transformation
from backend.app.engines.khata import categorize_khata_aging, validate_khata_transaction


def test_market_basket_lift_and_endcap_directive():
    # 1000 transactions
    # Rice in 300, Ghee in 150, Both in 90
    baskets = (
        [["SKU-RICE-25", "SKU-GHEE-01"]] * 90 +
        [["SKU-RICE-25"]] * 210 +
        [["SKU-GHEE-01"]] * 60 +
        [["SKU-OTHER"]] * 640
    )

    item_aisles = {
        "SKU-RICE-25": "Aisle 1 (Staples)",
        "SKU-GHEE-01": "Aisle 4 (Dairy & Fresh)"
    }

    rules = mine_association_rules(
        transactions=baskets,
        min_support=0.015,
        min_confidence=0.25,
        min_lift=1.50,
        end_cap_threshold=1.80,
        item_aisles=item_aisles
    )

    assert len(rules) > 0
    top_rule = rules[0]
    assert round(top_rule["lift"], 2) == 2.00
    # Cross-aisle item with Lift >= 1.80 triggers end-cap layout directive
    assert top_rule["layout_action"] == "SECONDARY_DISPLAY_END_CAP"


def test_expiry_decay_rtv_vs_markdown():
    today = date(2026, 11, 11)
    
    # 1. Vendor returnable batch with tau >= 60 days and expected leftover > 20%
    rtv_eval = calculate_batch_expiry_strategy(
        sku="SKU-GHEE-01",
        lot_number="LOT-01",
        expiry_date=today + timedelta(days=75),
        current_date=today,
        mfg_date=today - timedelta(days=120),
        on_hand_qty=50.0,
        ads=0.2, # Very slow velocity -> 50 units won't sell in 75 days
        selling_price=610.0,
        landed_cost=540.0,
        vendor_returnable=True
    )
    assert rtv_eval["action"] == "GENERATE_RTV_CREDIT_NOTE"

    # 2. Imminent expiry batch (<60d), non-returnable -> dynamic clearance with floor price protection
    markdown_eval = calculate_batch_expiry_strategy(
        sku="SKU-SWEETS-500",
        lot_number="LOT-02",
        expiry_date=today + timedelta(days=20),
        current_date=today,
        mfg_date=today - timedelta(days=40),
        on_hand_qty=30.0,
        ads=0.5,
        selling_price=480.0,
        landed_cost=390.0,
        vendor_returnable=False
    )
    assert markdown_eval["action"] == "APPLY_CLEARANCE_MARKDOWN"
    assert markdown_eval["floor_protected_price"] >= (390.0 * 1.02)  # Floor protected


def test_space_productivity_gpplf():
    cats = [
        {"category_id": "CAT-1", "category_name": "Premium Ghee", "linear_feet": 2.0, "net_revenue": 50000, "gross_profit": 8000}, # GPPLF = 4000
        {"category_id": "CAT-2", "category_name": "Generic Matches", "linear_feet": 5.0, "net_revenue": 2000, "gross_profit": 300}, # GPPLF = 60
    ]
    results = calculate_category_gpplf(cats)
    assert len(results) == 2
    assert results[0]["action"] == "EXPAND_SHELF_ALLOCATION"
    assert results[1]["action"] == "FACING_REDUCTION_OR_ASSORTMENT_PRUNING"


def test_loose_conversion_packaging_loss():
    # 50kg bulk sack transformed into 1kg house packs with 0.8% loss
    res = calculate_repackaging_transformation(
        bulk_sku="SKU-BULK-DAL50",
        bulk_cost_per_kg=120.0,
        bulk_consumed_kg=50.0,
        target_pack_sku="SKU-PACK-DAL1",
        target_pack_weight_kg=1.0,
        packaging_loss_factor=0.008,
        packaging_material_cost_per_unit=2.50,
        target_selling_price=165.0
    )
    assert res["loss_kg"] == 0.4
    assert res["units_produced"] == 49
    assert res["realized_gross_margin_pct"] >= 20.0  # Captures house pack 22-32% margin
    assert len(res["ledger_movements"]) == 2


def test_khata_aging_buckets():
    today = date(2026, 11, 11)
    accounts = [
        {"account_id": "K1", "customer_name": "Alice", "current_balance": 1000.0, "credit_limit": 5000.0, "last_payment_date": today - timedelta(days=10)},
        {"account_id": "K2", "customer_name": "Bob", "current_balance": 2500.0, "credit_limit": 5000.0, "last_payment_date": today - timedelta(days=25)},
        {"account_id": "K3", "customer_name": "Charlie", "current_balance": 8000.0, "credit_limit": 10000.0, "last_payment_date": today - timedelta(days=45)},
        {"account_id": "K4", "customer_name": "David", "current_balance": 15000.0, "credit_limit": 15000.0, "last_payment_date": today - timedelta(days=90)},
    ]
    report = categorize_khata_aging(accounts, as_of_date=today)
    assert report["aging_buckets"]["bucket_0_15"]["count"] == 1
    assert report["aging_buckets"]["bucket_16_30"]["count"] == 1
    assert report["aging_buckets"]["bucket_31_60"]["count"] == 1
    assert report["aging_buckets"]["bucket_60_plus"]["count"] == 1
    assert report["total_outstanding_receivables"] == 26500.0
