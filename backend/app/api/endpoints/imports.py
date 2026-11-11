"""
Retail Intelligence & Decision Support System (RIDSS)
POS Ingestion Adapter & Cryptographic Deduplication Gateway
Target Facility: 4,500 sq. ft. Independent Supermarket — Dalli Rajhara
"""

import hashlib
import io
import csv
from datetime import datetime
from typing import Dict, Any, List
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from ...db import db

router = APIRouter()


def compute_payload_hash(content: bytes) -> str:
    """Computes SHA-256 cryptographic hash of POS payload."""
    return hashlib.sha256(content).hexdigest()


@router.post("/pos")
async def import_pos_csv(file: UploadFile = File(...)):
    """
    Multipart file upload (CSV) containing daily POS dump.
    Performs:
    1. Cryptographic Deduplication (SHA-256 payload hash).
    2. Header & row schema validation.
    3. Transaction & line persistence with tax-exclusive gross margin separation.
    4. FEFO inventory batch deduction & inventory movement logging.
    5. Malformed rows redirected to Quarantine Queue.
    """
    start_time = datetime.now()
    content = await file.read()
    file_hash = compute_payload_hash(content)

    pool = db.get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            # 1. Check Idempotency via SHA-256
            cur.execute("SELECT file_hash, imported_at FROM raw_import_hashes WHERE file_hash = %s", (file_hash,))
            existing = cur.fetchone()
            if existing:
                raise HTTPException(
                    status_code=409,
                    detail=f"Duplicate POS file payload detected. File with SHA-256 hash '{file_hash[:12]}...' was already imported at {existing['imported_at']}."
                )

            # Record hash in raw_import_hashes
            cur.execute(
                "INSERT INTO raw_import_hashes (file_hash, file_name, imported_at) VALUES (%s, %s, %s)",
                (file_hash, file.filename or "pos_dump.csv", datetime.now())
            )

            # 2. Parse CSV
            text_stream = io.StringIO(content.decode("utf-8", errors="replace"))
            reader = csv.DictReader(text_stream)

            processed_count = 0
            quarantined_count = 0
            quarantine_errors = []

            for row_idx, row in enumerate(reader, start=1):
                try:
                    # Expected standard or kaggle headers:
                    receipt_id = (
                        row.get("receipt_id") or row.get("Receipt_ID") or 
                        row.get("Customer_ID") or f"POS-{datetime.now().strftime('%Y%m%d')}-{row_idx:04d}"
                    )
                    sku = (row.get("sku") or row.get("SKU") or row.get("Item_Name") or "").strip()
                    qty = float(row.get("quantity") or row.get("Quantity") or 1.0)
                    selling_gross = float(
                        row.get("unit_selling_price") or row.get("Price_Per_Item") or 
                        row.get("selling_price") or 0.0
                    )
                    payment_mode = (row.get("payment_mode") or row.get("Payment_Method") or "CASH").upper()

                    if not sku or qty <= 0:
                        raise ValueError(f"Invalid row: missing SKU or non-positive quantity ({qty})")

                    # Check or create product baseline
                    cur.execute("SELECT sku, mrp, base_cost_price, gst_rate FROM products WHERE sku = %s", (sku,))
                    prod = cur.fetchone()
                    if not prod:
                        # Auto-stub product if new
                        gst_rate = 5.0
                        cost_est = selling_gross * 0.85
                        cur.execute(
                            """
                            INSERT INTO products (sku, barcode, name, brand, category_id, base_unit, mrp, base_cost_price, current_selling_price, gst_rate)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                            ON CONFLICT (sku) DO NOTHING
                            """,
                            (sku, f"BC-{sku}", sku, "General", "CAT-STAPLES", "pcs", selling_gross, cost_est, selling_gross, gst_rate)
                        )
                        base_cost = cost_est
                    else:
                        gst_rate = float(prod["gst_rate"])
                        base_cost = float(prod["base_cost_price"])

                    # Tax-exclusive math
                    net_selling_price = selling_gross / (1.0 + (gst_rate / 100.0))
                    tax_amount = (selling_gross - net_selling_price) * qty
                    line_total = selling_gross * qty

                    # Insert transaction header
                    cur.execute(
                        """
                        INSERT INTO transactions (receipt_id, cashier_id, timestamp, gross_total, discount_total, gst_total, net_total, payment_mode)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (receipt_id) DO UPDATE 
                        SET gross_total = transactions.gross_total + EXCLUDED.gross_total,
                            gst_total = transactions.gst_total + EXCLUDED.gst_total,
                            net_total = transactions.net_total + EXCLUDED.net_total
                        """,
                        (receipt_id, "CASHIER-01", datetime.now(), line_total, 0.0, tax_amount, line_total, payment_mode)
                    )

                    # FEFO Batch Allocation
                    cur.execute(
                        "SELECT batch_id, remaining_quantity FROM inventory_batches WHERE sku = %s AND remaining_quantity > 0 ORDER BY expiry_date ASC",
                        (sku,)
                    )
                    batches = cur.fetchall()
                    qty_to_deplete = qty
                    allocated_batch_id = None

                    for b in batches:
                        if qty_to_deplete <= 0:
                            break
                        b_id = b["batch_id"]
                        b_rem = float(b["remaining_quantity"])
                        deduct = min(qty_to_deplete, b_rem)
                        
                        cur.execute("UPDATE inventory_batches SET remaining_quantity = remaining_quantity - %s WHERE batch_id = %s", (deduct, b_id))
                        cur.execute(
                            """
                            INSERT INTO inventory_movements (sku, batch_id, movement_type, quantity_delta, unit_cost, reference_id, notes)
                            VALUES (%s, %s, 'SALE', %s, %s, %s, %s)
                            """,
                            (sku, b_id, -deduct, base_cost, receipt_id, f"POS Sale Invoice {receipt_id}")
                        )
                        qty_to_deplete -= deduct
                        allocated_batch_id = b_id

                    # Insert transaction line
                    cur.execute(
                        """
                        INSERT INTO transaction_lines (receipt_id, sku, batch_id, quantity, unit_selling_price, unit_landed_cost, tax_rate, tax_amount, line_total)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                        """,
                        (receipt_id, sku, allocated_batch_id, qty, net_selling_price, base_cost, gst_rate, tax_amount, line_total)
                    )
                    processed_count += 1

                except Exception as row_err:
                    quarantined_count += 1
                    cur.execute(
                        """
                        INSERT INTO quarantine_errors (file_hash, row_number, raw_data, reason, status)
                        VALUES (%s, %s, %s, %s, 'UNRESOLVED')
                        """,
                        (file_hash, row_idx, row, str(row_err))
                    )
                    quarantine_errors.append({"row": row_idx, "error": str(row_err)})

            # Update hash row count
            cur.execute("UPDATE raw_import_hashes SET total_rows = %s WHERE file_hash = %s", (processed_count, file_hash))
            conn.commit()

    elapsed = (datetime.now() - start_time).total_seconds() * 1000.0

    return {
        "status": "success",
        "data": {
            "file_name": file.filename,
            "sha256_hash": file_hash,
            "processed_rows": processed_count,
            "quarantined_rows": quarantined_count,
            "quarantine_sample": quarantine_errors[:5],
            "fefo_allocation_enforced": True
        },
        "metadata": {
            "generated_at": datetime.now().isoformat(),
            "version": "1.0",
            "execution_time_ms": round(elapsed, 2)
        }
    }
