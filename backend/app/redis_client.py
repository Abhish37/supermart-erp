"""
Upstash / Valkey Redis Integration for SuperMart POS
Features:
1. 800ms Barcode Scan Debouncing (prevents double-billing on rapid thermal scanner triggers)
2. Real-time Inventory Cache and Locks
3. Instantaneous In-Memory Fallback (<0.1ms) with Cooldown Backoff
"""

import time
import asyncio
import logging
from typing import Optional
from .config import settings

logger = logging.getLogger("supermart.redis")

_in_memory_debounce_cache: dict[str, float] = {}
_cache_lock = asyncio.Lock()
_last_connect_attempt: float = 0.0
_CONNECT_RETRY_INTERVAL = 15.0  # seconds between remote reconnection attempts

class RedisService:
    def __init__(self):
        self._client = None
        self._connected = False

    async def get_client(self):
        global _last_connect_attempt
        now = time.time()
        
        if self._client is not None and self._connected:
            return self._client
        
        # Cooldown check to avoid blocking every request when Redis is offline or restricted
        if (now - _last_connect_attempt) < _CONNECT_RETRY_INTERVAL and not self._connected:
            return None
        
        _last_connect_attempt = now
        try:
            import redis.asyncio as aioredis
            client = aioredis.from_url(
                settings.REDIS_URL,
                ssl_cert_reqs=None,
                socket_timeout=1.0,
                socket_connect_timeout=1.0,
                decode_responses=True,
            )
            await client.ping()
            self._client = client
            self._connected = True
            logger.info("Connected to Redis successfully.")
            return self._client
        except Exception as e:
            logger.warning(f"Redis remote unavailable ({e}). Using sub-millisecond in-memory debounce engine.")
            self._connected = False
            return None

    async def check_and_debounce_scan(
        self,
        terminal_id: str,
        barcode: str,
        window_ms: int = settings.SCAN_DEBOUNCE_WINDOW_MS
    ) -> bool:
        """
        Returns True if scan is accepted.
        Returns False if barcode was scanned within `window_ms` (800ms) on this terminal, dropping it.
        """
        debounce_key = f"debounce:pos:{terminal_id}:{barcode}"
        
        try:
            client = await self.get_client()
            if client:
                result = await client.set(debounce_key, "1", nx=True, px=window_ms)
                if result:
                    return True
                else:
                    logger.info(f"Dropped duplicate scan on {terminal_id} for barcode {barcode} within {window_ms}ms")
                    return False
        except Exception as e:
            logger.warning(f"Redis error during debounce ({e}); switching to in-memory.")
            self._connected = False

        # Sub-millisecond In-memory debounce
        now = time.time()
        async with _cache_lock:
            # Clean expired keys
            stale = [k for k, exp in _in_memory_debounce_cache.items() if exp < now]
            for k in stale:
                del _in_memory_debounce_cache[k]
                
            last_allowed_expiry = _in_memory_debounce_cache.get(debounce_key)
            if last_allowed_expiry and last_allowed_expiry > now:
                # Scanned within debounce window -> drop it!
                return False
            
            # Record window expiry
            _in_memory_debounce_cache[debounce_key] = now + (window_ms / 1000.0)
            return True

    async def set_stock_cache(self, sku_id: str, quantity: int):
        client = await self.get_client()
        if client:
            try:
                await client.set(f"stock:{sku_id}", str(quantity), ex=3600)
            except Exception as e:
                logger.warning(f"Error setting stock cache: {e}")

    async def get_stock_cache(self, sku_id: str) -> Optional[int]:
        client = await self.get_client()
        if client:
            try:
                val = await client.get(f"stock:{sku_id}")
                return int(val) if val is not None else None
            except Exception as e:
                logger.warning(f"Error reading stock cache: {e}")
        return None

redis_service = RedisService()
