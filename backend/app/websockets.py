"""
WebSocket Connection Manager for Real-Time Synchronization
Handles 15-20 POS terminals concurrently + Floor Manager Tablets + Owner Dashboard
"""

import json
import logging
from typing import Dict, List, Any
from fastapi import WebSocket

logger = logging.getLogger("supermart.ws")

class ConnectionManager:
    def __init__(self):
        # Maps terminal_id -> WebSocket connection
        self.active_pos_terminals: Dict[str, WebSocket] = {}
        # List of connected floor manager tablets
        self.active_floor_tablets: List[WebSocket] = []
        # List of owner dashboard clients
        self.active_admin_dashboards: List[WebSocket] = []

    async def connect_pos(self, terminal_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_pos_terminals[terminal_id] = websocket
        logger.info(f"POS Terminal {terminal_id} connected. Total active: {len(self.active_pos_terminals)}")
        
        # Send initial handshake acknowledgement
        await websocket.send_json({
            "type": "CONNECTION_ESTABLISHED",
            "terminal_id": terminal_id,
            "message": "Connected to SuperMart High-Velocity POS Sync Core"
        })

    def disconnect_pos(self, terminal_id: str):
        if terminal_id in self.active_pos_terminals:
            del self.active_pos_terminals[terminal_id]
            logger.info(f"POS Terminal {terminal_id} disconnected.")

    async def connect_floor(self, websocket: WebSocket):
        await websocket.accept()
        self.active_floor_tablets.append(websocket)
        logger.info(f"Floor manager tablet connected. Total: {len(self.active_floor_tablets)}")

    def disconnect_floor(self, websocket: WebSocket):
        if websocket in self.active_floor_tablets:
            self.active_floor_tablets.remove(websocket)

    async def connect_admin(self, websocket: WebSocket):
        await websocket.accept()
        self.active_admin_dashboards.append(websocket)
        logger.info(f"Owner admin dashboard connected. Total: {len(self.active_admin_dashboards)}")

    def disconnect_admin(self, websocket: WebSocket):
        if websocket in self.active_admin_dashboards:
            self.active_admin_dashboards.remove(websocket)

    async def broadcast_to_pos(self, message: Dict[str, Any]):
        """
        Broadcasts message to all active POS terminals (15-20 concurrent).
        """
        disconnected = []
        for tid, ws in list(self.active_pos_terminals.items()):
            try:
                await ws.send_json(message)
            except Exception as e:
                logger.warning(f"Error sending to POS {tid}: {e}")
                disconnected.append(tid)
        
        for tid in disconnected:
            self.disconnect_pos(tid)

    async def broadcast_price_update(self, sku_id: str, product_name: str, new_price: float, old_price: float):
        payload = {
            "type": "PRICE_UPDATE",
            "sku_id": sku_id,
            "product_name": product_name,
            "new_price": new_price,
            "old_price": old_price,
            "timestamp": json.dumps(None) # client can use now
        }
        await self.broadcast_to_pos(payload)
        await self.broadcast_to_admin(payload)

    async def broadcast_inventory_decrement(self, sku_id: str, new_shelf_stock: int):
        payload = {
            "type": "INVENTORY_UPDATE",
            "sku_id": sku_id,
            "remaining_shelf_stock": new_shelf_stock
        }
        await self.broadcast_to_pos(payload)
        await self.broadcast_to_admin(payload)

    async def broadcast_to_floor(self, message: Dict[str, Any]):
        disconnected = []
        for ws in list(self.active_floor_tablets):
            try:
                await ws.send_json(message)
            except Exception as e:
                disconnected.append(ws)
        for ws in disconnected:
            self.disconnect_floor(ws)

    async def broadcast_to_admin(self, message: Dict[str, Any]):
        disconnected = []
        for ws in list(self.active_admin_dashboards):
            try:
                await ws.send_json(message)
            except Exception as e:
                disconnected.append(ws)
        for ws in disconnected:
            self.disconnect_admin(ws)

ws_manager = ConnectionManager()
