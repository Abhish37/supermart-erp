"""
Smart Replenishment, Peak-Day Buffer Logic & Auto-Ordering Engine
Optimized for ultra-fast single round-trip evaluation
Features:
1. Payday Tsunami (1st-10th of month) 1.5x buffer threshold calculation
2. Automated Purchase Order PDF Generation (ReportLab) with Vendor Name & Phone
3. WhatsApp Dispatch for Instant Verification
4. Real-time Floor Manager Tablet Routing to pull oldest FIFO batch from 2nd floor
"""

import os
import uuid
import datetime
import logging
from pathlib import Path
from pydantic import BaseModel
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from .config import settings
from .db import db
from .whatsapp import whatsapp_client
from .websockets import ws_manager

logger = logging.getLogger("supermart.replenishment")

PO_STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage" / "purchase_orders"
PO_STORAGE_DIR.mkdir(parents=True, exist_ok=True)

def is_payday_tsunami_window() -> bool:
    today_day = datetime.date.today().day
    return settings.PEAK_DAY_BUFFER_START <= today_day <= settings.PEAK_DAY_BUFFER_END

def calculate_dynamic_threshold(base_min_threshold: int) -> int:
    if is_payday_tsunami_window():
        return int(base_min_threshold * settings.PEAK_DAY_BUFFER_MULTIPLIER)
    return base_min_threshold

def generate_po_pdf(
    po_number: str,
    vendor_name: str,
    vendor_phone: str,
    sku_id: str,
    product_name: str,
    current_stock: int,
    reorder_qty: int,
    unit_cost: float,
    total_cost: float
) -> str:
    filename = f"{po_number}.pdf"
    filepath = PO_STORAGE_DIR / filename
    
    c = canvas.Canvas(str(filepath), pagesize=letter)
    width, height = letter

    # Header Banner
    c.setFillColor(colors.black)
    c.rect(0, height - 70, width, 70, stroke=0, fill=1)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(40, height - 42, "SUPERMART ENTERPRISE — REPLENISHMENT PO")
    c.setFont("Helvetica", 9)
    c.drawString(40, height - 58, "Automated Supply Chain Purchase Order — Vendor Verification Attachment")

    # Document Details
    c.setFillColor(colors.black)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(40, height - 95, f"PURCHASE ORDER: {po_number}")
    c.setFont("Helvetica", 9)
    c.drawString(40, height - 110, f"Date: {datetime.date.today().strftime('%B %d, %Y')} | Status: PENDING OWNER AUTHORIZATION")

    # Vendor Details Card
    c.setStrokeColor(colors.black)
    c.setFillColor(colors.HexColor("#F4F4F5"))
    c.roundRect(40, height - 180, width - 80, 55, 3, stroke=1, fill=1)
    
    c.setFillColor(colors.black)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(52, height - 140, "VENDOR / MANDI SUPPLIER:")
    c.setFont("Helvetica", 9)
    c.drawString(52, height - 156, f"Company: {vendor_name}")
    c.drawString(52, height - 170, f"Contact: {vendor_phone}")

    # Table Header
    y = height - 215
    c.setFillColor(colors.black)
    c.rect(40, y, width - 80, 22, stroke=1, fill=1)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(50, y + 6, "SKU CODE")
    c.drawString(140, y + 6, "PRODUCT DESCRIPTION")
    c.drawString(330, y + 6, "CURRENT STOCK")
    c.drawString(420, y + 6, "REORDER QTY")
    c.drawString(520, y + 6, "TOTAL EST.")

    # Table Row
    y -= 28
    c.setFillColor(colors.black)
    c.setFont("Helvetica", 9)
    c.drawString(50, y + 6, sku_id)
    c.drawString(140, y + 6, product_name[:32])
    c.drawString(330, y + 6, f"{current_stock} pcs")
    c.setFont("Helvetica-Bold", 9)
    c.drawString(420, y + 6, f"{reorder_qty} pcs")
    c.drawString(520, y + 6, f"Rs {total_cost:,.2f}")
    c.line(40, y, width - 40, y)

    # Summary
    y -= 45
    c.setFont("Helvetica-Bold", 11)
    c.drawRightString(width - 50, y, f"Total Purchase Order Amount: Rs {total_cost:,.2f}")

    # Signature Block
    c.setFont("Helvetica", 9)
    c.drawString(40, 90, "Authorized Approval: _________________________________________")
    c.drawString(40, 75, "SuperMart Operations Director / Store Owner")
    c.drawString(40, 45, "Generated automatically via SuperMart Replenishment Subsystem.")

    c.save()
    logger.info(f"Purchase Order PDF generated: {filepath}")
    return filename

async def check_and_trigger_replenishment():
    is_tsunami = is_payday_tsunami_window()
    results = {
        "is_payday_tsunami_window": is_tsunami,
        "shelf_routing_alerts": [],
        "purchase_orders_created": []
    }

    # Consolidated Single Query for high performance
    query = """
        SELECT 
            l.id as layout_id, l.aisle_id, l.shelf_section, l.sku_id, l.max_shelf_capacity,
            l.current_shelf_stock,
            p.name as product_name, p.min_stock_threshold, p.base_wholesale_rate,
            p.vendor_name, p.vendor_phone,
            COALESCE(st.total_store_stock, 0) as total_store_stock,
            fifo.batch_id as fifo_batch_id,
            COALESCE(fifo.quantity, 0) as fifo_batch_qty,
            fifo.arrival_date as fifo_arrival_date
        FROM store_layout l
        JOIN products_master p ON l.sku_id = p.sku_id
        LEFT JOIN (
            SELECT sku_id, SUM(quantity) as total_store_stock
            FROM inventory_batches
            WHERE status IN ('Shelf', 'Storage')
            GROUP BY sku_id
        ) st ON st.sku_id = l.sku_id
        LEFT JOIN LATERAL (
            SELECT batch_id, quantity, arrival_date
            FROM inventory_batches
            WHERE sku_id = l.sku_id AND status = 'Storage' AND quantity > 0
            ORDER BY arrival_date ASC
            LIMIT 1
        ) fifo ON true
        WHERE l.floor_level = 0
    """
    items = await db.fetch_all(query)

    for item in items:
        sku = item["sku_id"]
        shelf_stock = int(item["current_shelf_stock"])
        base_thresh = int(item["min_stock_threshold"])
        dynamic_thresh = calculate_dynamic_threshold(base_thresh)
        total_store_stock = int(item["total_store_stock"])

        # Shelf Replenishment Floor Alert
        if shelf_stock <= (item["max_shelf_capacity"] * 0.40) or shelf_stock <= dynamic_thresh:
            if item.get("fifo_batch_id"):
                pull_qty = min(
                    int(item["fifo_batch_qty"]),
                    int(item["max_shelf_capacity"] - shelf_stock)
                )
                routing_alert = {
                    "type": "SHELF_REPLENISHMENT_ROUTING",
                    "sku_id": sku,
                    "product_name": item["product_name"],
                    "target_aisle": item["aisle_id"],
                    "target_shelf": item["shelf_section"],
                    "current_shelf_stock": shelf_stock,
                    "pull_from_floor": "2nd-Floor Private Label Storage",
                    "pull_batch_id": item["fifo_batch_id"],
                    "pull_quantity": pull_qty,
                    "fifo_arrival_date": str(item["fifo_arrival_date"]),
                    "timestamp": str(datetime.datetime.now())
                }
                await ws_manager.broadcast_to_floor(routing_alert)
                results["shelf_routing_alerts"].append(routing_alert)

        # Store-wide PO Reorder
        if total_store_stock < dynamic_thresh:
            po_number = f"PO-{sku.replace('SKU-', '')}-{datetime.date.today().strftime('%Y%m%d')}-{uuid.uuid4().hex[:4].upper()}"
            reorder_qty = max(50, dynamic_thresh * 2 - total_store_stock)
            unit_cost = float(item["base_wholesale_rate"])
            total_cost = reorder_qty * unit_cost

            pdf_filename = generate_po_pdf(
                po_number=po_number,
                vendor_name=item["vendor_name"] or "Apex Agro Wholesale",
                vendor_phone=item["vendor_phone"] or "+919876543210",
                sku_id=sku,
                product_name=item["product_name"],
                current_stock=total_store_stock,
                reorder_qty=reorder_qty,
                unit_cost=unit_cost,
                total_cost=total_cost
            )

            pdf_download_url = f"http://localhost:8000/api/replenishment/po/{pdf_filename}"

            wa_response = await whatsapp_client.send_purchase_order_notification(
                po_number=po_number,
                vendor_name=item["vendor_name"] or "Apex Agro Wholesale",
                vendor_phone=item["vendor_phone"] or "+919876543210",
                item_name=item["product_name"],
                reorder_quantity=reorder_qty,
                estimated_cost=total_cost,
                pdf_url=pdf_download_url
            )

            results["purchase_orders_created"].append({
                "po_number": po_number,
                "sku_id": sku,
                "product_name": item["product_name"],
                "total_current_stock": total_store_stock,
                "dynamic_threshold": dynamic_thresh,
                "reorder_quantity": reorder_qty,
                "total_cost": total_cost,
                "pdf_filename": pdf_filename,
                "pdf_url": pdf_download_url,
                "whatsapp_status": wa_response.get("status")
            })

    return results
