"""
Master Router for RIDSS REST API v1
"""

from fastapi import APIRouter
from .endpoints.imports import router as imports_router
from .endpoints.dashboard import router as dashboard_router
from .endpoints.replenishment import router as replenishment_router
from .endpoints.inventory import router as inventory_router
from .endpoints.merchandising import router as merchandising_router
from .endpoints.khata import router as khata_router
from .endpoints.assistant import router as assistant_router

api_v1_router = APIRouter(prefix="/api/v1")

api_v1_router.include_router(imports_router, prefix="/imports", tags=["Imports & Ingestion"])
api_v1_router.include_router(dashboard_router, prefix="/dashboard", tags=["Executive Dashboard"])
api_v1_router.include_router(replenishment_router, prefix="/replenishment", tags=["Replenishment & PO"])
api_v1_router.include_router(inventory_router, prefix="/inventory", tags=["Inventory & Expiry"])
api_v1_router.include_router(merchandising_router, prefix="/merchandising", tags=["Merchandising & Lift"])
api_v1_router.include_router(khata_router, prefix="/khata", tags=["Customer Khata"])
api_v1_router.include_router(assistant_router, prefix="/assistant", tags=["Constrained AI Analyst"])
