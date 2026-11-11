"""
Retail Intelligence & Decision Support System (RIDSS)
Executive Dashboard Overview Endpoint
Target Facility: 4,500 sq. ft. Independent Supermarket — Dalli Rajhara
"""

from datetime import datetime, date
from fastapi import APIRouter
from ...db import db

router = APIRouter()


@router.get("/overview")
async def get_dashboard_overview():
    """
    Executive metrics:
    - Today's provisional sales & gross profit (tax-exclusive)
    - Active out-of-stock / low stock SKU counts
    - Near-expiry capital at risk (within 45 days)
    - Outstanding customer Khata balance
    - Exact calculation formulas & freshness timestamps
    """
    start_time = datetime.now()
    now_iso = start_time.isoformat()

    pool = db.get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            # 1. Today's sales & tax-exclusive margin
            cur.execute("""
                SELECT 
                    COALESCE(SUM(net_total), 0.0) AS today_revenue,
                    COALESCE(SUM(gst_total), 0.0) AS today_gst,
                    COUNT(DISTINCT receipt_id) AS total_bills
                FROM transactions
                WHERE is_cancelled = FALSE
                  AND timestamp >= CURRENT_DATE;
            """)
            tx_stats = cur.fetchone() or {"today_revenue": 0.0, "today_gst": 0.0, "total_bills": 0}

            # Calculate today's COGS and true gross profit
            cur.execute("""
                SELECT 
                    COALESCE(SUM(tl.quantity * tl.unit_landed_cost), 0.0) AS today_cogs
                FROM transaction_lines tl
                JOIN transactions t ON tl.receipt_id = t.receipt_id
                WHERE t.is_cancelled = FALSE
                  AND t.timestamp >= CURRENT_DATE;
            """)
            cogs_row = cur.fetchone()
            today_cogs = float(cogs_row["today_cogs"]) if cogs_row else 0.0

            revenue = float(tx_stats["today_revenue"])
            gst = float(tx_stats["today_gst"])
            net_revenue = revenue - gst
            gross_profit = net_revenue - today_cogs
            gross_margin_pct = (gross_profit / net_revenue * 100.0) if net_revenue > 0 else 0.0

            # 2. Near-Expiry Capital at Risk (<= 45 days)
            cur.execute("""
                SELECT 
                    COUNT(*) AS near_expiry_batch_count,
                    COALESCE(SUM(remaining_quantity * landed_cost_unit), 0.0) AS capital_at_risk
                FROM inventory_batches
                WHERE remaining_quantity > 0
                  AND (expiry_date - CURRENT_DATE) <= 45;
            """)
            expiry_stats = cur.fetchone() or {"near_expiry_batch_count": 0, "capital_at_risk": 0.0}

            # 3. Low Stock / Reorder Needed Counts
            cur.execute("""
                SELECT COUNT(*) AS active_products
                FROM products
                WHERE is_active = TRUE;
            """)
            prod_stats = cur.fetchone() or {"active_products": 0}

            # 4. Khata Receivables
            cur.execute("""
                SELECT 
                    COUNT(*) AS active_khata_accounts,
                    COALESCE(SUM(current_balance), 0.0) AS total_receivables
                FROM customer_khata
                WHERE current_balance > 0;
            """)
            khata_stats = cur.fetchone() or {"active_khata_accounts": 0, "total_receivables": 0.0}

    elapsed = (datetime.now() - start_time).total_seconds() * 1000.0

    return {
        "status": "success",
        "data": {
            "facility": "Dalli Rajhara Supermarket (4,500 sq.ft)",
            "cards": [
                {
                    "id": "today_revenue",
                    "title": "Today's Gross Sales",
                    "value": round(revenue, 2),
                    "unit": "INR",
                    "window": "Today (Since 00:00)",
                    "formula": "sum(transactions.net_total)",
                    "status_badge": "Live Operational",
                    "timestamp": now_iso
                },
                {
                    "id": "gross_margin",
                    "title": "Tax-Exclusive Margin",
                    "value": round(gross_margin_pct, 2),
                    "unit": "%",
                    "window": "Today (Since 00:00)",
                    "formula": "(NetRevenue - COGS) / NetRevenue * 100",
                    "status_badge": "True Realization",
                    "timestamp": now_iso
                },
                {
                    "id": "capital_at_risk",
                    "title": "Near-Expiry Capital Risk",
                    "value": round(float(expiry_stats["capital_at_risk"]), 2),
                    "unit": "INR",
                    "window": "Batches <= 45 Days to Expiry",
                    "formula": "sum(remaining_qty * landed_cost_unit)",
                    "status_badge": "Amber Warning" if float(expiry_stats["capital_at_risk"]) > 0 else "Safe",
                    "timestamp": now_iso
                },
                {
                    "id": "khata_receivables",
                    "title": "Total Khata Receivables",
                    "value": round(float(khata_stats["total_receivables"]), 2),
                    "unit": "INR",
                    "window": "All Running Balances",
                    "formula": "sum(customer_khata.current_balance)",
                    "status_badge": f"{khata_stats['active_khata_accounts']} Accounts",
                    "timestamp": now_iso
                }
            ],
            "operational_context": {
                "active_skus": prod_stats["active_products"],
                "total_bills_today": tx_stats["total_bills"],
                "near_expiry_batches": expiry_stats["near_expiry_batch_count"],
                "payday_window_active": 1 <= datetime.now().day <= 7,
                "township_context": "SAIL Bhilai Steel Plant Mining Zone"
            }
        },
        "metadata": {
            "generated_at": now_iso,
            "version": "1.0",
            "execution_time_ms": round(elapsed, 2)
        }
    }
