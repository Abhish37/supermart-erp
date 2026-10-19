"""
High-Performance Database Connection Pool using Psycopg 3 & Psycopg Pool
Strict ACID Compliance & Reusable Connection Pooling for 15-20 Concurrent POS Terminals
Supports both Cloud SSL (external) and Render Private Network (internal) connections
"""

import logging
import asyncio
from typing import Any, Optional
from contextlib import contextmanager
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool
from .config import settings

logger = logging.getLogger("supermart.db")

class Database:
    def __init__(self):
        self._pool: Optional[ConnectionPool] = None

    def get_pool(self) -> ConnectionPool:
        if self._pool is None:
            is_ssl = "sslmode=require" in settings.DATABASE_URL or "oregon-postgres" in settings.DATABASE_URL
            kwargs = {
                "row_factory": dict_row,
                "autocommit": False,
                "connect_timeout": 15,
            }
            if is_ssl:
                kwargs["sslmode"] = "require"

            self._pool = ConnectionPool(
                conninfo=settings.DATABASE_URL,
                min_size=1,
                max_size=10,
                timeout=15.0,
                kwargs=kwargs,
                open=True,
            )
        return self._pool

    @contextmanager
    def transaction(self):
        """
        Pulls a connection from pool, begins an ACID transaction block,
        auto-commits on exit, and returns connection to pool.
        """
        pool = self.get_pool()
        with pool.connection() as conn:
            with conn.transaction():
                yield conn

    async def fetch_all(self, query: str, params: Optional[tuple | list | dict] = None) -> list[dict[str, Any]]:
        def _fetch():
            pool = self.get_pool()
            with pool.connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(query, params)
                    records = cur.fetchall()
                    return [dict(r) for r in records]
        return await asyncio.to_thread(_fetch)

    async def fetch_one(self, query: str, params: Optional[tuple | list | dict] = None) -> Optional[dict[str, Any]]:
        def _fetch():
            pool = self.get_pool()
            with pool.connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(query, params)
                    record = cur.fetchone()
                    return dict(record) if record else None
        return await asyncio.to_thread(_fetch)

    async def execute(self, query: str, params: Optional[tuple | list | dict] = None) -> int:
        def _exec():
            pool = self.get_pool()
            with pool.connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(query, params)
                    count = cur.rowcount
                conn.commit()
                return count
        return await asyncio.to_thread(_exec)

db = Database()
