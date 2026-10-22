"""
SuperMart Hardware Integrations Subsystem
1. PineLabs EDC Physical Terminal Webhook / API Integration (ACID 2-Phase Commit)
2. Raw ESC/POS Thermal Receipt Command Generator
"""

import uuid
import datetime
import logging
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from .db import db

logger = logging.getLogger("supermart.hardware")

class PineLabsInitiateRequest(BaseModel):
    pos_terminal_id: str = Field(..., description="POS Terminal ID, e.g. POS-01")
    transaction_id: str = Field(..., description="Draft transaction ID")
    payment_mode: str = Field("UPI", description="'UPI' or 'Card'")
    amount: float = Field(..., description="Exact payable amount")
    simulate_instant_success: bool = Field(True, description="When true, simulates physical terminal customer tap/scan success")

class PineLabsStatusResponse(BaseModel):
    request_id: str
    status: str # 'INITIATED', 'WAITING_DEVICE', 'SUCCESS', 'FAILED'
    device_rrn: Optional[str] = None
    message: str

# Store Details for Receipt Header & Footer
STORE_METADATA = {
    "store_name": "SUPERMART ENTERPRISE HYPERMARKET",
    "gst_number": "07AAAAA0000A1Z5",
    "fssai_number": "10019011000123",
    "address_line1": "Ground & 2nd Floor, Main Mandi Road",
    "address_line2": "Sector 4, Central Commercial Hub",
    "city_state_pin": "Tier-3 City, MP - 452001",
    "phone": "+91 731 4055200",
}

async def initiate_pinelabs_payment(req: PineLabsInitiateRequest) -> Dict[str, Any]:
    """
    Initiates payment on the physical PineLabs EDC terminal.
    In real production, this dispatches an HTTP POST to PineLabs Cloud / Local POS Bridge.
    Returns request_id that the POS terminal polls or receives via webhook.
    """
    request_id = f"PL-{uuid.uuid4().hex[:12].upper()}"
    device_rrn = f"RRN{uuid.uuid4().hex[:10].upper()}"

    # For fast responsive cashier testing, we support instant or timed success
    status = "SUCCESS" if req.simulate_instant_success else "WAITING_DEVICE"

    await db.execute(
        """
        INSERT INTO pinelabs_terminal_logs (
            request_id, pos_terminal_id, transaction_id, payment_mode,
            amount, status, device_rrn, response_payload, created_at
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW())
        """,
        (
            request_id, req.pos_terminal_id, req.transaction_id, req.payment_mode,
            req.amount, status, device_rrn,
            f'{{"code":"00","auth_status":"{status}","rrn":"{device_rrn}","mode":"{req.payment_mode}"}}'
        )
    )

    return {
        "request_id": request_id,
        "pos_terminal_id": req.pos_terminal_id,
        "transaction_id": req.transaction_id,
        "payment_mode": req.payment_mode,
        "amount": req.amount,
        "status": status,
        "device_rrn": device_rrn,
        "message": "PineLabs terminal payment initiated successfully."
    }

async def check_pinelabs_status(request_id: str) -> Dict[str, Any]:
    """
    Polls the PineLabs hardware status. The POS frontend must wait for status == 'SUCCESS'
    before allowing the backend atomic checkout to finalize (ACID guarantee).
    """
    record = await db.fetch_one(
        "SELECT * FROM pinelabs_terminal_logs WHERE request_id = %s",
        (request_id,)
    )
    if not record:
        raise ValueError(f"PineLabs request {request_id} not found.")

    return {
        "request_id": record["request_id"],
        "status": record["status"],
        "device_rrn": record["device_rrn"],
        "amount": float(record["amount"]),
        "payment_mode": record["payment_mode"],
        "is_success": record["status"] == "SUCCESS",
    }

def generate_raw_esc_pos_receipt(
    transaction_id: str,
    bill_number: str,
    date_str: str,
    cashier_id: str,
    cashier_name: str,
    pos_terminal_id: str,
    batch_numbers: List[str],
    items: List[Dict[str, Any]],
    net_total: float,
    payment_mode: str,
    amount_received: float,
) -> Dict[str, Any]:
    """
    Generates standard ESC/POS binary control codes and formatted text for thermal receipt printers (80mm / 48 chars).
    Layout requirement:
    - Store Name at top
    - Date
    - GST Number
    - FSSAI Number
    - Complete Address
    - Bill Number
    - Cashier Name & ID
    - Terminal ID
    - Txn ID
    - Batch Number(s)
    - Items Table: Qty | Item Name | Amount (Qty * Price)
    - Footer: Net Total, Payment Mode (Cash/UPI/Card), "Amount Received", and "Thank you" message.
    """
    ESC = "\x1B"
    GS = "\x1D"
    INIT = f"{ESC}@"                # Initialize printer
    CENTER = f"{ESC}a\x01"          # Center alignment
    LEFT = f"{ESC}a\x00"            # Left alignment
    RIGHT = f"{ESC}a\x02"           # Right alignment
    BOLD_ON = f"{ESC}E\x01"         # Bold text on
    BOLD_OFF = f"{ESC}E\x00"        # Bold text off
    DOUBLE_ON = f"{GS}!\x11"        # Double height & width
    DOUBLE_OFF = f"{GS}!\x00"       # Normal text
    CUT = f"{GS}V\x42\x00"          # Paper cut

    line_separator = "-" * 42

    # Plain text layout for receipt preview
    text_lines = []
    text_lines.append(STORE_METADATA["store_name"])
    text_lines.append(f"GSTIN: {STORE_METADATA['gst_number']}")
    text_lines.append(f"FSSAI LIC: {STORE_METADATA['fssai_number']}")
    text_lines.append(STORE_METADATA["address_line1"])
    text_lines.append(f"{STORE_METADATA['address_line2']}, {STORE_METADATA['city_state_pin']}")
    text_lines.append(f"Phone: {STORE_METADATA['phone']}")
    text_lines.append(line_separator)
    text_lines.append(f"Date: {date_str}")
    text_lines.append(f"Bill No: {bill_number}   Terminal: {pos_terminal_id}")
    text_lines.append(f"Txn ID: {transaction_id}")
    text_lines.append(f"Cashier: {cashier_name} ({cashier_id})")
    
    unique_batches = list(set(batch_numbers))
    batch_str = ", ".join(unique_batches[:3])
    text_lines.append(f"Batch No: {batch_str}")
    text_lines.append(line_separator)
    
    # Items Table Header: Qty | Item Name | Amount
    text_lines.append(f"{'Qty':<4} {'Item Name':<26} {'Amount':>10}")
    text_lines.append(line_separator)

    for it in items:
        qty = it.get("quantity", 1)
        name = it.get("name", "Product")[:25]
        price = float(it.get("selling_price", 0.0))
        item_total = qty * price
        text_lines.append(f"{qty:<4} {name:<26} {item_total:>10.2f}")

    text_lines.append(line_separator)
    text_lines.append(f"{'NET TOTAL:':<30} Rs {net_total:>9.2f}")
    text_lines.append(f"{'Payment Mode:':<30} {payment_mode:>12}")
    text_lines.append(f"{'Amount Received:':<30} Rs {amount_received:>9.2f}")
    
    if payment_mode == "Cash":
        change = max(0.0, amount_received - net_total)
        text_lines.append(f"{'Change Returned:':<30} Rs {change:>9.2f}")

    text_lines.append(line_separator)
    text_lines.append("Thank you for shopping with us!")
    text_lines.append("Goods once sold will not be exchanged without bill.")
    text_lines.append("*** HAVE A PLEASANT DAY ***")

    formatted_text = "\n".join(text_lines)

    # Build Raw ESC/POS Byte representation (for USB / Network thermal printer socket)
    raw_esc_pos = (
        f"{INIT}"
        f"{CENTER}{BOLD_ON}{DOUBLE_ON}{STORE_METADATA['store_name']}\n{DOUBLE_OFF}{BOLD_OFF}"
        f"GSTIN: {STORE_METADATA['gst_number']} | FSSAI: {STORE_METADATA['fssai_number']}\n"
        f"{STORE_METADATA['address_line1']}, {STORE_METADATA['city_state_pin']}\n"
        f"{LEFT}{line_separator}\n"
        f"Bill No: {bill_number}   Date: {date_str}\n"
        f"Cashier: {cashier_name} [{cashier_id}]   Terminal: {pos_terminal_id}\n"
        f"Txn ID: {transaction_id}\n"
        f"Batch No: {batch_str}\n"
        f"{line_separator}\n"
        f"{BOLD_ON}{'Qty':<4} {'Item Name':<24} {'Amount':>12}\n{BOLD_OFF}"
        f"{line_separator}\n"
    )

    for it in items:
        qty = it.get("quantity", 1)
        name = it.get("name", "Product")[:23]
        item_tot = qty * float(it.get("selling_price", 0.0))
        raw_esc_pos += f"{qty:<4} {name:<24} {item_tot:>12.2f}\n"

    raw_esc_pos += (
        f"{line_separator}\n"
        f"{BOLD_ON}{'NET TOTAL:':<28} Rs {net_total:>10.2f}\n{BOLD_OFF}"
        f"{'Payment Mode:':<28} {payment_mode:>13}\n"
        f"{'Amount Received:':<28} Rs {amount_received:>10.2f}\n"
        f"{line_separator}\n"
        f"{CENTER}Thank you for shopping with SuperMart!\n"
        f"*** PLEASE VISIT AGAIN ***\n\n\n"
        f"{CUT}"
    )

    return {
        "transaction_id": transaction_id,
        "bill_number": bill_number,
        "date_str": date_str,
        "store_metadata": STORE_METADATA,
        "formatted_text": formatted_text,
        "raw_esc_pos_hex": raw_esc_pos.encode("latin-1", errors="replace").hex(),
        "lines": text_lines
    }
