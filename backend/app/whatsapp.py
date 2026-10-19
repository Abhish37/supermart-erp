"""
WhatsApp Cloud API / Twilio Integration & Verification Dispatcher
Sends automated Purchase Order alerts & PDF download attachments to Owner
"""

import logging
import httpx
from .config import settings

logger = logging.getLogger("supermart.whatsapp")

class WhatsAppClient:
    def __init__(self):
        self.enabled = settings.WHATSAPP_ENABLED
        self.token = settings.WHATSAPP_API_TOKEN
        self.phone_id = settings.WHATSAPP_PHONE_NUMBER_ID
        self.owner_phone = settings.OWNER_PHONE_NUMBER

    async def send_purchase_order_notification(
        self,
        po_number: str,
        vendor_name: str,
        vendor_phone: str,
        item_name: str,
        reorder_quantity: int,
        estimated_cost: float,
        pdf_url: str
    ) -> dict:
        """
        Sends automated Purchase Order alert to Owner's WhatsApp for one-click verification.
        """
        message_body = (
            f"🛒 *SUPERMART AUTOMATED REPLENISHMENT PO ALERT*\n\n"
            f"📄 *PO Number:* `{po_number}`\n"
            f"📦 *Product:* {item_name}\n"
            f"🏭 *Vendor:* {vendor_name} ({vendor_phone})\n"
            f"🔢 *Reorder Qty:* {reorder_quantity} units\n"
            f"💰 *Est. Total:* ₹{estimated_cost:,.2f}\n\n"
            f"📎 *PDF Purchase Order:* {pdf_url}\n\n"
            f"Reply *APPROVE {po_number}* to authorize vendor dispatch."
        )

        if not self.enabled or not self.token or not self.phone_id:
            logger.info(
                f"[SIMULATED WHATSAPP DISPATCH -> {self.owner_phone}]\n"
                f"{message_body}"
            )
            return {
                "status": "SIMULATED",
                "recipient": self.owner_phone,
                "message": message_body,
                "pdf_url": pdf_url
            }

        # Meta WhatsApp Cloud API Endpoint
        url = f"https://graph.facebook.com/v18.0/{self.phone_id}/messages"
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
        payload = {
            "messaging_product": "whatsapp",
            "to": self.owner_phone.replace("+", ""),
            "type": "text",
            "text": {
                "body": message_body
            }
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(url, headers=headers, json=payload)
                resp.raise_for_status()
                data = resp.json()
                logger.info(f"WhatsApp Cloud API message delivered: {data}")
                return {
                    "status": "DELIVERED",
                    "response": data,
                    "recipient": self.owner_phone
                }
        except Exception as e:
            logger.error(f"WhatsApp delivery failed: {e}. Falling back to system log.")
            return {
                "status": "FAILED",
                "error": str(e),
                "fallback_message": message_body
            }

whatsapp_client = WhatsAppClient()
