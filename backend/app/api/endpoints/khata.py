"""
Retail Intelligence & Decision Support System (RIDSS)
Customer Khata Aging & Ledger Audit API
Target Facility: 4,500 sq. ft. Independent Supermarket — Dalli Rajhara
"""

from datetime import datetime, date
from typing import Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException
from ...db import db
from ...engines.khata import categorize_khata_aging

router = APIRouter()


class KhataPaymentRequest(BaseModel):
    account_id: str = Field(..., description="Customer Khata account ID, e.g. KH-001")
    payment_amount: float = Field(..., gt=0, description="Amount paid by customer in INR")
    payment_mode: str = Field("UPI", description="Payment mode: 'CASH', 'UPI', 'NEFT'")
    reference_note: Optional[str] = Field(None, description="Bank/UPI reference number")


@router.get("/aging")
async def get_khata_aging_report():
    """
    Audited aging report of outstanding credit accounts:
    - 0-15 days: Current / Within cycle
    - 16-30 days: Mildly overdue
    - 31-60 days: Strongly overdue (Warning)
    - 60+ days: Severe overdue / Critical credit leakage risk
    """
    start_time = datetime.now()
    today = date.today()

    pool = db.get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT 
                    account_id,
                    customer_name,
                    phone_number,
                    credit_limit,
                    current_balance,
                    last_payment_date,
                    status
                FROM customer_khata
                ORDER BY current_balance DESC;
            """)
            accounts = cur.fetchall()

            report = categorize_khata_aging(accounts, as_of_date=today)

    elapsed = (datetime.now() - start_time).total_seconds() * 1000.0

    return {
        "status": "success",
        "data": report,
        "metadata": {
            "generated_at": datetime.now().isoformat(),
            "version": "1.0",
            "execution_time_ms": round(elapsed, 2)
        }
    }


@router.post("/payment")
async def record_khata_payment(payload: KhataPaymentRequest):
    """
    Records customer credit repayment with double-entry balance reconciliation.
    """
    start_time = datetime.now()

    pool = db.get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT current_balance, customer_name FROM customer_khata WHERE account_id = %s", (payload.account_id,))
            acc = cur.fetchone()
            if not acc:
                raise HTTPException(status_code=404, detail=f"Khata account '{payload.account_id}' not found.")

            current_bal = float(acc["current_balance"])
            new_bal = current_bal - payload.payment_amount

            # Update account
            cur.execute("""
                UPDATE customer_khata 
                SET current_balance = %s,
                    last_payment_date = CURRENT_TIMESTAMP
                WHERE account_id = %s;
            """, (new_bal, payload.account_id))

            # Record in khata_ledger
            cur.execute("""
                INSERT INTO khata_ledger (account_id, entry_type, amount, balance_after, recorded_at)
                VALUES (%s, 'CREDIT', %s, %s, CURRENT_TIMESTAMP);
            """, (payload.account_id, -payload.payment_amount, new_bal))

            conn.commit()

    elapsed = (datetime.now() - start_time).total_seconds() * 1000.0

    return {
        "status": "success",
        "data": {
            "account_id": payload.account_id,
            "customer_name": acc["customer_name"],
            "amount_paid": payload.payment_amount,
            "payment_mode": payload.payment_mode,
            "previous_balance": current_bal,
            "reconciled_balance": new_bal,
            "reference_note": payload.reference_note
        },
        "metadata": {
            "generated_at": datetime.now().isoformat(),
            "version": "1.0",
            "execution_time_ms": round(elapsed, 2)
        }
    }
