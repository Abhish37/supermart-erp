"""
Retail Intelligence & Decision Support System (RIDSS)
Allowlisted Parameterized Analytical SQL Templates
Enforces zero arbitrary SQL execution with grounded parameters
"""

from typing import Dict, Any, List

# Allowlisted template SQL definitions
SQL_TEMPLATES = {
    "TPL_TOP_CONTRIBUTORS": """
        SELECT 
            tl.sku,
            p.name AS product_name,
            c.name AS category_name,
            SUM(tl.quantity) AS total_units_sold,
            SUM(tl.line_total) AS gross_revenue,
            SUM(tl.line_total - (tl.quantity * tl.unit_landed_cost) - tl.tax_amount) AS net_gross_profit,
            ROUND(
                (SUM(tl.line_total - (tl.quantity * tl.unit_landed_cost) - tl.tax_amount) / NULLIF(SUM(tl.line_total - tl.tax_amount), 0)) * 100.0, 
                2
            ) AS gross_margin_pct
        FROM transaction_lines tl
        JOIN products p ON tl.sku = p.sku
        JOIN categories c ON p.category_id = c.category_id
        JOIN transactions t ON tl.receipt_id = t.receipt_id
        WHERE t.is_cancelled = FALSE
          AND t.timestamp >= NOW() - (:lookback_days || ' days')::INTERVAL
        GROUP BY tl.sku, p.name, c.name
        ORDER BY net_gross_profit DESC
        LIMIT :limit;
    """,

    "TPL_SALES_VARIANCE_DIAGNOSTIC": """
        WITH current_period AS (
            SELECT 
                tl.sku,
                SUM(tl.quantity) AS cur_qty,
                SUM(tl.line_total) AS cur_revenue
            FROM transaction_lines tl
            JOIN transactions t ON tl.receipt_id = t.receipt_id
            WHERE t.is_cancelled = FALSE
              AND t.timestamp >= NOW() - (:window_days || ' days')::INTERVAL
              AND (:sku IS NULL OR tl.sku = :sku)
            GROUP BY tl.sku
        ),
        prior_period AS (
            SELECT 
                tl.sku,
                SUM(tl.quantity) AS prior_qty,
                SUM(tl.line_total) AS prior_revenue
            FROM transaction_lines tl
            JOIN transactions t ON tl.receipt_id = t.receipt_id
            WHERE t.is_cancelled = FALSE
              AND t.timestamp >= NOW() - (2 * :window_days || ' days')::INTERVAL
              AND t.timestamp < NOW() - (:window_days || ' days')::INTERVAL
              AND (:sku IS NULL OR tl.sku = :sku)
            GROUP BY tl.sku
        )
        SELECT 
            p.sku,
            p.name,
            COALESCE(c.cur_qty, 0) AS current_qty,
            COALESCE(pr.prior_qty, 0) AS prior_qty,
            (COALESCE(c.cur_qty, 0) - COALESCE(pr.prior_qty, 0)) AS qty_variance,
            ROUND(
                CASE WHEN COALESCE(pr.prior_qty, 0) > 0 
                     THEN ((COALESCE(c.cur_qty, 0) - pr.prior_qty)::NUMERIC / pr.prior_qty) * 100.0 
                     ELSE 100.0 
                END, 2
            ) AS percentage_change,
            COALESCE(c.cur_revenue, 0) AS current_revenue,
            COALESCE(pr.prior_revenue, 0) AS prior_revenue
        FROM products p
        LEFT JOIN current_period c ON p.sku = c.sku
        LEFT JOIN prior_period pr ON p.sku = pr.sku
        WHERE (:sku IS NULL OR p.sku = :sku)
          AND (c.cur_qty IS NOT NULL OR pr.prior_qty IS NOT NULL)
        ORDER BY qty_variance ASC
        LIMIT 25;
    """,

    "TPL_EXPIRY_EXPOSURE": """
        SELECT 
            b.batch_id,
            b.sku,
            p.name AS product_name,
            b.lot_number,
            b.remaining_quantity,
            b.expiry_date,
            (b.expiry_date - CURRENT_DATE) AS days_remaining,
            b.landed_cost_unit,
            ROUND(b.remaining_quantity * b.landed_cost_unit, 2) AS capital_at_risk,
            b.vendor_credit_eligible,
            s.trade_name AS supplier_name
        FROM inventory_batches b
        JOIN products p ON b.sku = p.sku
        LEFT JOIN supplier_skus ss ON p.sku = ss.sku
        LEFT JOIN suppliers s ON ss.supplier_id = s.supplier_id
        WHERE b.remaining_quantity > 0
          AND (b.expiry_date - CURRENT_DATE) <= :max_days
        ORDER BY days_remaining ASC;
    """,

    "TPL_REORDER_RATIONALE": """
        SELECT 
            r.rec_id,
            r.action_type,
            r.sku,
            p.name AS product_name,
            r.suggested_value,
            r.rationale,
            r.evidence_payload,
            r.status,
            r.created_at
        FROM recommendations r
        JOIN products p ON r.sku = p.sku
        WHERE (:sku IS NULL OR r.sku = :sku)
        ORDER BY r.created_at DESC
        LIMIT 10;
    """,

    "TPL_KHATA_OVERDUE_REPORT": """
        SELECT 
            k.account_id,
            k.customer_name,
            k.phone_number,
            k.credit_limit,
            k.current_balance,
            k.last_payment_date,
            (CURRENT_DATE - k.last_payment_date::DATE) AS days_since_last_payment,
            ROUND((k.current_balance / NULLIF(k.credit_limit, 0)) * 100.0, 1) AS credit_utilization_pct,
            k.status
        FROM customer_khata k
        WHERE k.current_balance > 0
          AND (CURRENT_DATE - k.last_payment_date::DATE) >= :min_overdue_days
        ORDER BY days_since_last_payment DESC;
    """
}
