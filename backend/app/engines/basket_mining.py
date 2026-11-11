"""
Retail Intelligence & Decision Support System (RIDSS)
Market Basket Affinity & Association Mining Engine (FP-Growth Protocol)
Target Facility: 4,500 sq. ft. Independent Supermarket — Dalli Rajhara
"""

from typing import List, Dict, Set, Tuple
from collections import defaultdict
import itertools


def mine_association_rules(
    transactions: List[List[str]],
    min_support: float = 0.015,
    min_confidence: float = 0.40,
    min_lift: float = 1.60,
    end_cap_threshold: float = 1.80,
    item_aisles: Dict[str, str] = None
) -> List[Dict[str, any]]:
    """
    Mines 2-item association rules from transaction baskets.
    - Support(X -> Y) = P(X and Y) = Count(X and Y) / Total_Baskets
    - Confidence(X -> Y) = P(Y | X) = Support(X and Y) / Support(X)
    - Lift(X -> Y) = Support(X and Y) / (Support(X) * Support(Y))
    
    Layout Directive:
    If Lift >= 1.80 and items reside in separate physical aisles/departments:
    -> "Secondary Display / Co-Locate End-Cap"
    """
    item_aisles = item_aisles or {}
    total_baskets = len(transactions)
    if total_baskets == 0:
        return []

    # 1. Count individual item frequencies
    item_counts = defaultdict(int)
    pair_counts = defaultdict(int)

    for basket in transactions:
        unique_items = sorted(list(set(basket)))
        for item in unique_items:
            item_counts[item] += 1
        
        # Count all 2-item combinations in basket
        for item1, item2 in itertools.combinations(unique_items, 2):
            pair_counts[(item1, item2)] += 1

    rules = []

    # 2. Evaluate candidate pairs
    for (item_a, item_b), count_ab in pair_counts.items():
        support_ab = count_ab / total_baskets
        if support_ab < min_support:
            continue

        count_a = item_counts[item_a]
        count_b = item_counts[item_b]

        support_a = count_a / total_baskets
        support_b = count_b / total_baskets

        # Evaluate Rule: A -> B
        conf_a_to_b = support_ab / support_a if support_a > 0 else 0.0
        lift_ab = support_ab / (support_a * support_b) if (support_a * support_b) > 0 else 0.0

        if conf_a_to_b >= min_confidence and lift_ab >= min_lift:
            aisle_a = item_aisles.get(item_a, "Aisle A")
            aisle_b = item_aisles.get(item_b, "Aisle B")
            is_cross_aisle = (aisle_a != aisle_b)
            
            action = "STANDARD_CROSS_MERCHANDISE"
            if lift_ab >= end_cap_threshold and is_cross_aisle:
                action = "SECONDARY_DISPLAY_END_CAP"
            elif lift_ab >= end_cap_threshold:
                action = "SHELF_ADJACENT_STRIP"

            rules.append({
                "antecedent": item_a,
                "consequent": item_b,
                "support": round(support_ab, 4),
                "confidence": round(conf_a_to_b, 4),
                "lift": round(lift_ab, 3),
                "count": count_ab,
                "aisle_antecedent": aisle_a,
                "aisle_consequent": aisle_b,
                "is_cross_aisle": is_cross_aisle,
                "layout_action": action,
                "recommendation_text": (
                    f"Strong co-purchase affinity (Lift: {lift_ab:.2f}x, Conf: {conf_a_to_b*100:.1f}%). "
                    f"Directive: {action} between '{item_a}' and '{item_b}'."
                )
            })

        # Evaluate Rule: B -> A
        conf_b_to_a = support_ab / support_b if support_b > 0 else 0.0
        lift_ba = lift_ab  # Lift is symmetric for pairwise associations

        if conf_b_to_a >= min_confidence and lift_ba >= min_lift:
            aisle_a = item_aisles.get(item_a, "Aisle A")
            aisle_b = item_aisles.get(item_b, "Aisle B")
            is_cross_aisle = (aisle_a != aisle_b)

            action = "STANDARD_CROSS_MERCHANDISE"
            if lift_ba >= end_cap_threshold and is_cross_aisle:
                action = "SECONDARY_DISPLAY_END_CAP"
            elif lift_ba >= end_cap_threshold:
                action = "SHELF_ADJACENT_STRIP"

            rules.append({
                "antecedent": item_b,
                "consequent": item_a,
                "support": round(support_ab, 4),
                "confidence": round(conf_b_to_a, 4),
                "lift": round(lift_ba, 3),
                "count": count_ab,
                "aisle_antecedent": aisle_b,
                "aisle_consequent": aisle_a,
                "is_cross_aisle": is_cross_aisle,
                "layout_action": action,
                "recommendation_text": (
                    f"Strong co-purchase affinity (Lift: {lift_ba:.2f}x, Conf: {conf_b_to_a*100:.1f}%). "
                    f"Directive: {action} between '{item_b}' and '{item_a}'."
                )
            })

    # Sort descending by Lift
    return sorted(rules, key=lambda r: r['lift'], reverse=True)
