"""
Retail Intelligence & Decision Support System (RIDSS)
Space Productivity Engine: Gross Profit per Linear Foot (GPPLF)
Target Facility: 4,500 sq. ft. Independent Supermarket — Dalli Rajhara
"""

from typing import List, Dict


def calculate_category_gpplf(
    category_sales_data: List[Dict[str, any]],
    store_average_gpplf: float = 0.0
) -> List[Dict[str, any]]:
    """
    Computes Gross Profit per Linear Foot (GPPLF) for each sub-category/department:
    GPPLF_c = sum_{i in c} (NetRevenue_i - COGS_i) / LinearFeetAllocated_c

    Criteria:
    - Category shelf-space targets are recalibrated monthly.
    - Sub-categories with GPPLF < 0.60 * StoreAverage are flagged for:
      "FACING_REDUCTION_OR_ASSORTMENT_PRUNING"
    - Sub-categories with GPPLF >= 1.40 * StoreAverage are flagged for:
      "EXPAND_SHELF_ALLOCATION"
    """
    results = []
    total_store_profit = sum(c.get('gross_profit', 0.0) for c in category_sales_data)
    total_store_linear_feet = sum(c.get('linear_feet', 0.0) for c in category_sales_data)

    if store_average_gpplf <= 0.0:
        if total_store_linear_feet > 0:
            store_average_gpplf = total_store_profit / total_store_linear_feet
        else:
            store_average_gpplf = 1.0

    underperforming_threshold = store_average_gpplf * 0.60
    highperforming_threshold = store_average_gpplf * 1.40

    for item in category_sales_data:
        cat_id = item.get('category_id')
        cat_name = item.get('category_name')
        linear_feet = max(0.1, float(item.get('linear_feet', 1.0)))
        gross_profit = float(item.get('gross_profit', 0.0))
        net_revenue = float(item.get('net_revenue', 0.0))

        gpplf = gross_profit / linear_feet
        ratio_to_store_avg = gpplf / store_average_gpplf if store_average_gpplf > 0 else 1.0

        if gpplf < underperforming_threshold:
            action = "FACING_REDUCTION_OR_ASSORTMENT_PRUNING"
            directive_text = f"Sub-category GPPLF (₹{gpplf:.2f}/ft) is below 60% of store average (₹{store_average_gpplf:.2f}/ft). Reduce shelf facings or prune low-margin dead SKUs."
        elif gpplf >= highperforming_threshold:
            action = "EXPAND_SHELF_ALLOCATION"
            directive_text = f"High-yield category (₹{gpplf:.2f}/ft, {ratio_to_store_avg:.1f}x store average). Expand linear facings to capture incremental gross margin."
        else:
            action = "MAINTAIN_CURRENT_SPACE"
            directive_text = f"Productivity is in line with store baseline (₹{gpplf:.2f}/ft)."

        results.append({
            "category_id": cat_id,
            "category_name": cat_name,
            "linear_feet_allocated": round(linear_feet, 2),
            "net_revenue": round(net_revenue, 2),
            "gross_profit": round(gross_profit, 2),
            "gpplf": round(gpplf, 2),
            "ratio_to_store_avg": round(ratio_to_store_avg, 2),
            "action": action,
            "directive_text": directive_text
        })

    # Sort descending by GPPLF
    return sorted(results, key=lambda x: x['gpplf'], reverse=True)
