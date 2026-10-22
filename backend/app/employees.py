"""
SuperMart Employee Management & End-of-Day Cash Reconciliation Subsystem
Module 2.4:
- Cashier Authentication (Employee ID + PIN login)
- Employee Profiles, Bonuses & Deductions (Leave, Cash Mishandling, Product Damage, Rude Behavior)
- Fault Counter System (>3 Yellow, >5 Red)
- End of Day Cash Tally:
    Physical Cash - ₹3,000 Buffer vs System Cash
    Logs discrepancy to profile for deduction & fault count
"""

import uuid
import datetime
import logging
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from .db import db

logger = logging.getLogger("supermart.employees")

class CashierLoginRequest(BaseModel):
    employee_id: str = Field(..., description="Employee ID, e.g. EMP-101")
    pin: str = Field(..., description="4-6 digit numeric PIN")
    pos_terminal_id: str = Field("POS-01", description="Bound POS terminal")

class DeductionRequest(BaseModel):
    employee_id: str
    amount: float
    reason: str = Field(..., description="'Leave', 'Cash Mishandling', 'Product Damage', 'Rude Behavior'")
    notes: Optional[str] = None

class CashReconciliationRequest(BaseModel):
    pos_terminal_id: str = Field(..., description="POS Terminal ID")
    cashier_id: str = Field(..., description="Employee ID")
    physical_cash: float = Field(..., description="Total physical currency counted in drawer")
    notes: Optional[str] = None

async def authenticate_cashier(req: CashierLoginRequest) -> Dict[str, Any]:
    """
    Verifies Employee ID & PIN. Binds cashier session to POS terminal.
    """
    emp = await db.fetch_one(
        "SELECT * FROM employees WHERE employee_id = %s AND active = true",
        (req.employee_id,)
    )

    if not emp:
        raise ValueError(f"Employee {req.employee_id} not found or inactive.")

    # Match PIN (plain or hashed)
    if str(emp["pin_hash"]).strip() != str(req.pin).strip():
        raise ValueError("Invalid Cashier PIN. Access denied.")

    session_token = f"SESS-{uuid.uuid4().hex[:16]}"

    # Determine visual fault badge
    fault_count = int(emp["fault_count"])
    fault_badge = "NORMAL"
    if fault_count > 5:
        fault_badge = "RED" # Serious warning / disciplinary review
    elif fault_count > 3:
        fault_badge = "YELLOW" # Attention required

    return {
        "status": "AUTHENTICATED",
        "session_token": session_token,
        "employee_id": emp["employee_id"],
        "cashier_name": emp["name"],
        "role": emp["role"],
        "pos_terminal_id": req.pos_terminal_id,
        "fault_count": fault_count,
        "fault_badge": fault_badge,
        "login_time": datetime.datetime.now().isoformat()
    }

async def get_all_employees() -> List[Dict[str, Any]]:
    """
    Returns all employee profiles with fault counter tagging:
    >3 faults = Yellow
    >5 faults = Red
    """
    employees = await db.fetch_all(
        """
        SELECT 
            e.employee_id, e.name, e.phone, e.address, e.role,
            e.base_salary, e.bonuses, e.fault_count, e.active, e.created_at,
            COALESCE((SELECT SUM(amount) FROM employee_deductions WHERE employee_id = e.employee_id), 0) as total_deductions
        FROM employees e
        ORDER BY e.fault_count DESC, e.employee_id ASC
        """
    )

    result = []
    for emp in employees:
        fault_count = int(emp["fault_count"])
        badge = "NORMAL"
        if fault_count > 5:
            badge = "RED"
        elif fault_count > 3:
            badge = "YELLOW"

        base_sal = float(emp["base_salary"])
        bonuses = float(emp["bonuses"])
        deductions = float(emp["total_deductions"])
        net_payable = max(0.0, base_sal + bonuses - deductions)

        result.append({
            "employee_id": emp["employee_id"],
            "name": emp["name"],
            "phone": emp["phone"],
            "address": emp["address"],
            "role": emp["role"],
            "base_salary": base_sal,
            "bonuses": bonuses,
            "total_deductions": deductions,
            "net_payable": net_payable,
            "fault_count": fault_count,
            "fault_badge": badge,
            "active": emp["active"]
        })

    return result

async def add_employee_deduction(req: DeductionRequest) -> Dict[str, Any]:
    """
    Logs an employee deduction with mandatory reason dropdown:
    Leave, Cash Mishandling, Product Damage, Rude Behavior.
    Increments fault counter for disciplinary tracking.
    """
    valid_reasons = ["Leave", "Cash Mishandling", "Product Damage", "Rude Behavior"]
    if req.reason not in valid_reasons:
        raise ValueError(f"Invalid reason '{req.reason}'. Must be one of: {valid_reasons}")

    deduction_id = f"DED-{uuid.uuid4().hex[:8].upper()}"

    await db.execute(
        """
        INSERT INTO employee_deductions (
            deduction_id, employee_id, amount, reason, notes, deduction_date, created_at
        ) VALUES (%s, %s, %s, %s, %s, NOW(), NOW())
        """,
        (deduction_id, req.employee_id, req.amount, req.reason, req.notes)
    )

    # Increment fault counter if cash mishandling, product damage, or rude behavior
    if req.reason in ["Cash Mishandling", "Product Damage", "Rude Behavior"]:
        await db.execute(
            """
            UPDATE employees
            SET fault_count = fault_count + 1
            WHERE employee_id = %s
            """,
            (req.employee_id,)
        )

    emp = await db.fetch_one(
        "SELECT name, fault_count FROM employees WHERE employee_id = %s",
        (req.employee_id,)
    )

    fault_count = int(emp["fault_count"]) if emp else 0
    badge = "RED" if fault_count > 5 else ("YELLOW" if fault_count > 3 else "NORMAL")

    return {
        "status": "DEDUCTION_LOGGED",
        "deduction_id": deduction_id,
        "employee_id": req.employee_id,
        "employee_name": emp["name"] if emp else "",
        "amount": req.amount,
        "reason": req.reason,
        "updated_fault_count": fault_count,
        "fault_badge": badge
    }

async def process_end_of_day_cash_tally(req: CashReconciliationRequest) -> Dict[str, Any]:
    """
    End of Day Cash Tally:
    Cashier enters physical cash in drawer.
    System subtracts ₹3,000 opening buffer.
    System cash = SUM(total_amount) for Cash payments on that terminal today.
    If Physical Cash != System Cash, discrepancy is logged directly to profile for deduction.
    """
    OPENING_BUFFER = 3000.00

    # Calculate System Cash for today's Cash transactions on this terminal
    cash_row = await db.fetch_one(
        """
        SELECT COALESCE(SUM(total_amount), 0) as system_cash_total, COUNT(*) as cash_txn_count
        FROM sales_ledger
        WHERE pos_terminal_id = %s
          AND payment_mode = 'Cash'
          AND status = 'COMPLETED'
          AND timestamp >= CURRENT_DATE
        """,
        (req.pos_terminal_id,)
    )

    system_cash = float(cash_row["system_cash_total"] or 0.0)
    cash_txns = int(cash_row["cash_txn_count"] or 0)

    # Net physical cash excluding buffer
    net_physical_cash = req.physical_cash - OPENING_BUFFER
    # Discrepancy: positive means excess cash, negative means drawer shortfall
    discrepancy = round(net_physical_cash - system_cash, 2)

    deduction_logged = False
    recon_id = f"RECON-{uuid.uuid4().hex[:8].upper()}"

    if abs(discrepancy) > 0.01:
        # Drawer discrepancy detected!
        if discrepancy < 0:
            # Cash shortfall: Log automatic deduction against cashier
            shortfall = abs(discrepancy)
            ded_id = f"DED-SHORT-{uuid.uuid4().hex[:6].upper()}"
            await db.execute(
                """
                INSERT INTO employee_deductions (
                    deduction_id, employee_id, amount, reason, notes, deduction_date, created_at
                ) VALUES (%s, %s, %s, 'Cash Mishandling', %s, NOW(), NOW())
                """,
                (
                    ded_id, req.cashier_id, shortfall,
                    f"End-of-day drawer shortfall: System expected ₹{system_cash:,.2f}, physical count was ₹{net_physical_cash:,.2f} on {req.pos_terminal_id}."
                )
            )
            # Increment fault counter
            await db.execute(
                "UPDATE employees SET fault_count = fault_count + 1 WHERE employee_id = %s",
                (req.cashier_id,)
            )
            deduction_logged = True

    # Record cash reconciliation record
    await db.execute(
        """
        INSERT INTO cash_reconciliations (
            reconciliation_id, pos_terminal_id, cashier_id, opening_buffer,
            physical_cash, system_cash, discrepancy, deduction_logged, notes, reconciled_at
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
        """,
        (
            recon_id, req.pos_terminal_id, req.cashier_id, OPENING_BUFFER,
            req.physical_cash, system_cash, discrepancy, deduction_logged, req.notes
        )
    )

    return {
        "status": "RECONCILED",
        "reconciliation_id": recon_id,
        "pos_terminal_id": req.pos_terminal_id,
        "cashier_id": req.cashier_id,
        "opening_buffer": OPENING_BUFFER,
        "physical_cash_entered": req.physical_cash,
        "net_physical_cash": net_physical_cash,
        "system_cash_expected": system_cash,
        "discrepancy": discrepancy,
        "is_balanced": abs(discrepancy) <= 0.01,
        "deduction_logged": deduction_logged,
        "message": (
            "✓ Cash drawer is 100% balanced with system cash."
            if abs(discrepancy) <= 0.01
            else f"⚠️ Discrepancy of ₹{discrepancy:+,.2f} detected. {'Shortfall deducted from cashier salary.' if discrepancy < 0 else 'Surplus noted for store manager audit.'}"
        )
    }

async def get_recent_reconciliations(limit: int = 10) -> List[Dict[str, Any]]:
    return await db.fetch_all(
        """
        SELECT 
            r.*, e.name as cashier_name
        FROM cash_reconciliations r
        JOIN employees e ON r.cashier_id = e.employee_id
        ORDER BY r.reconciled_at DESC
        LIMIT %s
        """,
        (limit,)
    )
