"""
Retail Intelligence & Decision Support System (RIDSS)
Customer Khata (Local Credit) Double-Entry Accounting & Aging Engine
Target Facility: 4,500 sq. ft. Independent Supermarket — Dalli Rajhara
"""

from typing import List, Dict, Optional, Tuple
from datetime import datetime, date


def categorize_khata_aging(
    accounts: List[Dict[str, any]],
    as_of_date: date
) -> Dict[str, any]:
    """
    Computes Khata receivables aging across the 4 standard operational buckets:
    - 0-15 days: Current / Within grace period
    - 16-30 days: Mildly overdue / Reminder required
    - 31-60 days: Strongly overdue / Warning, freeze new credit
    - 60+ days: Severe overdue / Critical credit leakage risk
    """
    bucket_summary = {
        "bucket_0_15": {"count": 0, "total_balance": 0.0, "accounts": []},
        "bucket_16_30": {"count": 0, "total_balance": 0.0, "accounts": []},
        "bucket_31_60": {"count": 0, "total_balance": 0.0, "accounts": []},
        "bucket_60_plus": {"count": 0, "total_balance": 0.0, "accounts": []},
    }

    total_outstanding_receivables = 0.0
    total_credit_limit_granted = 0.0

    for acc in accounts:
        balance = float(acc.get("current_balance", 0.0))
        limit = float(acc.get("credit_limit", 5000.0))
        total_credit_limit_granted += limit

        if balance <= 0:
            continue

        total_outstanding_receivables += balance

        last_payment = acc.get("last_payment_date")
        if isinstance(last_payment, str):
            last_date = datetime.fromisoformat(last_payment.replace("Z", "+00:00")).date()
        elif isinstance(last_payment, datetime):
            last_date = last_payment.date()
        elif isinstance(last_payment, date):
            last_date = last_payment
        else:
            last_date = as_of_date

        days_overdue = max(0, (as_of_date - last_date).days)
        credit_utilization_pct = round((balance / limit) * 100.0, 1) if limit > 0 else 100.0

        item = {
            "account_id": acc.get("account_id"),
            "customer_name": acc.get("customer_name"),
            "phone_number": acc.get("phone_number"),
            "current_balance": round(balance, 2),
            "credit_limit": round(limit, 2),
            "utilization_pct": credit_utilization_pct,
            "days_overdue": days_overdue,
            "status": acc.get("status", "ACTIVE")
        }

        if days_overdue <= 15:
            bucket_summary["bucket_0_15"]["count"] += 1
            bucket_summary["bucket_0_15"]["total_balance"] += balance
            bucket_summary["bucket_0_15"]["accounts"].append(item)
        elif days_overdue <= 30:
            bucket_summary["bucket_16_30"]["count"] += 1
            bucket_summary["bucket_16_30"]["total_balance"] += balance
            bucket_summary["bucket_16_30"]["accounts"].append(item)
        elif days_overdue <= 60:
            bucket_summary["bucket_31_60"]["count"] += 1
            bucket_summary["bucket_31_60"]["total_balance"] += balance
            bucket_summary["bucket_31_60"]["accounts"].append(item)
        else:
            bucket_summary["bucket_60_plus"]["count"] += 1
            bucket_summary["bucket_60_plus"]["total_balance"] += balance
            bucket_summary["bucket_60_plus"]["accounts"].append(item)

    for k in bucket_summary:
        bucket_summary[k]["total_balance"] = round(bucket_summary[k]["total_balance"], 2)

    overall_utilization = (
        round((total_outstanding_receivables / total_credit_limit_granted) * 100.0, 1)
        if total_credit_limit_granted > 0 else 0.0
    )

    return {
        "as_of_date": str(as_of_date),
        "total_outstanding_receivables": round(total_outstanding_receivables, 2),
        "total_credit_limit_granted": round(total_credit_limit_granted, 2),
        "overall_utilization_pct": overall_utilization,
        "aging_buckets": bucket_summary
    }


def validate_khata_transaction(
    current_balance: float,
    credit_limit: float,
    charge_amount: float,
    account_status: str
) -> Tuple[bool, str]:
    """
    Guards against credit leakage:
    - Rejects if account is FROZEN or SETTLED.
    - Rejects if charge exceeds available credit limit.
    """
    if account_status.upper() != "ACTIVE":
        return False, f"Account is {account_status}. No new credit charges permitted."

    new_balance = current_balance + charge_amount
    if new_balance > credit_limit:
        excess = new_balance - credit_limit
        return False, f"Credit limit exceeded by ₹{excess:.2f}. Limit: ₹{credit_limit:.2f}, Proposed: ₹{new_balance:.2f}."

    return True, "Approved"
