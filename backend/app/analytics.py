"""
Analytics & Financial Ledger Engine
Features:
1. Inventory Velocity Classification: High-Velocity, Steady Sellers, Dead Stock (20+ days)
2. True Net Profit Calculation:
   Revenue - COGS - Amortized Rent - Electricity - Payroll - Process Spillage
"""

import logging
from typing import Dict, Any, List
from .config import settings
from .db import db

logger = logging.getLogger("supermart.analytics")

async def get_inventory_velocity_analysis() -> Dict[str, List[Dict[str, Any]]]:
    """
    Classifies all inventory into three distinct tables:
    1. High-Velocity (Fast Selling)
    2. Steady Sellers
    3. Dead Stock (20+ Days Unsold) -> triggers clearance recommendation
    """
    # Query all active inventory batches with age and recent sales
    query = """
        SELECT 
            b.batch_id, b.sku_id, b.barcode, b.arrival_date, b.cost_price,
            b.current_selling_price, b.quantity, b.status,
            p.name as product_name, p.category,
            EXTRACT(DAY FROM (NOW() - b.arrival_date))::int as days_in_store,
            COALESCE(
                (SELECT SUM(si.quantity) 
                 FROM sales_items si 
                 JOIN sales_ledger sl ON si.transaction_id = sl.transaction_id 
                 WHERE si.batch_id = b.batch_id AND sl.status = 'COMPLETED'), 
                0
            ) as units_sold
        FROM inventory_batches b
        JOIN products_master p ON b.sku_id = p.sku_id
        WHERE b.status IN ('Shelf', 'Storage')
        ORDER BY days_in_store DESC
    """
    batches = await db.fetch_all(query)

    high_velocity = []
    steady_sellers = []
    dead_stock = []

    for b in batches:
        days = int(b["days_in_store"] or 0)
        units_sold = int(b["units_sold"] or 0)
        current_price = float(b["current_selling_price"])
        cost_price = float(b["cost_price"])

        item_data = {
            "batch_id": b["batch_id"],
            "sku_id": b["sku_id"],
            "name": b["product_name"],
            "category": b["category"],
            "barcode": b["barcode"],
            "arrival_date": str(b["arrival_date"]),
            "days_in_store": days,
            "stock_quantity": int(b["quantity"]),
            "cost_price": cost_price,
            "current_selling_price": current_price,
            "units_sold": units_sold,
            "status": b["status"]
        }

        # Classification Logic
        if days >= settings.DEAD_STOCK_THRESHOLD_DAYS and units_sold == 0:
            # Dead Stock: 20+ Days Unsold
            discount_pct = 15.0 if days < 30 else 25.0
            clearance_price = max(cost_price, round(current_price * (1 - (discount_pct / 100)), 2))
            item_data["alert"] = "DEAD_STOCK_TRIGGERED"
            item_data["recommended_discount_pct"] = discount_pct
            item_data["clearance_price"] = clearance_price
            item_data["tied_capital"] = round(cost_price * item_data["stock_quantity"], 2)
            dead_stock.append(item_data)
        elif units_sold >= 10 or days <= 5:
            # High-Velocity (Fast Selling)
            item_data["velocity_score"] = round((units_sold + 1) / max(1, days), 2)
            high_velocity.append(item_data)
        else:
            # Steady Sellers
            steady_sellers.append(item_data)

    return {
        "high_velocity": high_velocity,
        "steady_sellers": steady_sellers,
        "dead_stock": dead_stock,
        "summary": {
            "high_velocity_count": len(high_velocity),
            "steady_count": len(steady_sellers),
            "dead_stock_count": len(dead_stock),
            "total_dead_stock_tied_capital": sum(d.get("tied_capital", 0) for d in dead_stock)
        }
    }

async def calculate_owner_net_profit() -> Dict[str, Any]:
    """
    Calculates True Store Net Profit:
    Revenue
    - Total COGS (Cost of Goods Sold)
    = Gross Profit
    - Daily Amortized Rent
    - Commercial Electricity
    - Staff Payroll
    - Process Spillage Losses
    = Net Profit
    """
    # 1. Total Completed Revenue
    rev_row = await db.fetch_one(
        """
        SELECT 
            COALESCE(SUM(total_amount), 0) as total_revenue,
            COUNT(*) as transaction_count
        FROM sales_ledger
        WHERE status = 'COMPLETED'
        """
    )
    total_revenue = float(rev_row["total_revenue"] or 0)
    tx_count = int(rev_row["transaction_count"] or 0)

    # 2. Total COGS from sales_items
    cogs_row = await db.fetch_one(
        """
        SELECT COALESCE(SUM(si.cogs * si.quantity), 0) as total_cogs
        FROM sales_items si
        JOIN sales_ledger sl ON si.transaction_id = sl.transaction_id
        WHERE sl.status = 'COMPLETED'
        """
    )
    total_cogs = float(cogs_row["total_cogs"] or 0)
    gross_profit = total_revenue - total_cogs
    gross_margin_pct = round((gross_profit / total_revenue * 100), 2) if total_revenue > 0 else 0.0

    # 3. Categorized Overhead Expenses
    overhead_rows = await db.fetch_all(
        """
        SELECT expense_category, COALESCE(SUM(amount), 0) as total_amount
        FROM financial_overhead
        GROUP BY expense_category
        """
    )
    overheads_by_category = {r["expense_category"]: float(r["total_amount"]) for r in overhead_rows}
    
    rent = overheads_by_category.get("Rent", 0.0)
    electricity = overheads_by_category.get("Electricity", 0.0)
    payroll = overheads_by_category.get("Salary", 0.0)
    spillage = overheads_by_category.get("Spillage", 0.0)
    maintenance = overheads_by_category.get("Maintenance", 0.0)

    total_overhead = rent + electricity + payroll + spillage + maintenance

    # 4. Net Profit
    net_profit = gross_profit - total_overhead
    net_margin_pct = round((net_profit / total_revenue * 100), 2) if total_revenue > 0 else 0.0

    return {
        "revenue": round(total_revenue, 2),
        "transaction_count": tx_count,
        "cogs": round(total_cogs, 2),
        "gross_profit": round(gross_profit, 2),
        "gross_margin_pct": gross_margin_pct,
        "overheads": {
            "amortized_rent": round(rent, 2),
            "electricity": round(electricity, 2),
            "staff_salary": round(payroll, 2),
            "process_spillage": round(spillage, 2),
            "maintenance": round(maintenance, 2),
            "total_overhead": round(total_overhead, 2)
        },
        "net_profit": round(net_profit, 2),
        "net_margin_pct": net_margin_pct
    }
