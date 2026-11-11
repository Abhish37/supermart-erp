"""
Retail Intelligence & Decision Support System (RIDSS)
Multi-Dimensional ABC / XYZ Categorization Matrix
Target Facility: 4,500 sq. ft. Independent Supermarket — Dalli Rajhara
"""

from typing import List, Dict
import math


def compute_abc_xyz_matrix(sku_stats: List[Dict[str, any]]) -> List[Dict[str, any]]:
    """
    Computes the 9-cell ABC/XYZ matrix:
    - ABC: Cumulative Revenue or Gross Profit contribution
      Class A: Top 80% of cumulative monetary value (~20% SKUs)
      Class B: Next 15% of cumulative value (~30% SKUs)
      Class C: Bottom 5% of cumulative value (~50% SKUs)
    
    - XYZ: Demand predictability via Coefficient of Variation (CV = std_demand / ADS)
      Class X: CV <= 0.50 (Stable, automated ordering eligible)
      Class Y: 0.50 < CV <= 1.20 (Variable/seasonal, safety buffer inflated)
      Class Z: CV > 1.20 (Erratic/lumpy, manual buyer review enforced)
    """
    if not sku_stats:
        return []

    # Sort descending by monetary value (revenue or gross margin)
    sorted_skus = sorted(sku_stats, key=lambda x: x.get('total_value', 0.0), reverse=True)
    total_store_value = sum(x.get('total_value', 0.0) for x in sorted_skus)

    if total_store_value <= 0:
        total_store_value = 1.0  # Prevent divide-by-zero

    running_cumulative = 0.0
    results = []

    for item in sorted_skus:
        val = item.get('total_value', 0.0)
        running_cumulative += val
        cum_pct = (running_cumulative / total_store_value) * 100.0

        # ABC Assignment
        if cum_pct <= 80.0 or len(results) == 0:
            abc = 'A'
        elif cum_pct <= 95.0:
            abc = 'B'
        else:
            abc = 'C'

        # XYZ Assignment
        ads = item.get('ads', 0.0)
        std_demand = item.get('std_demand', 0.0)

        if ads <= 0.0:
            cv = 999.0
            xyz = 'Z'
        else:
            cv = std_demand / ads
            if cv <= 0.50:
                xyz = 'X'
            elif cv <= 1.20:
                xyz = 'Y'
            else:
                xyz = 'Z'

        # Replenishment Policy Guideline
        if abc == 'A' and xyz == 'X':
            policy = "AUTOMATED_OPTIMAL: High value, predictable demand. Tight safety stock."
        elif abc == 'A' and xyz in ('Y', 'Z'):
            policy = "CRITICAL_ATTENTION: High value, erratic demand. Requires frequent human review."
        elif abc == 'C' and xyz == 'Z':
            policy = "PRUNING_OR_ORDER_ON_DEMAND: Low value, sporadic demand. Evaluate assortment rationalization."
        else:
            policy = "BUFFERED_STANDARD: Standard periodic replenishment with safety buffer."

        results.append({
            "sku": item.get('sku'),
            "name": item.get('name'),
            "total_value": round(val, 2),
            "cum_percentage": round(cum_pct, 2),
            "abc_class": abc,
            "ads": round(ads, 2),
            "std_demand": round(std_demand, 2),
            "cv": round(cv, 2),
            "xyz_class": xyz,
            "matrix_cell": f"{abc}{xyz}",
            "replenishment_policy": policy
        })

    return results
