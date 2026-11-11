"""
Retail Intelligence & Decision Support System (RIDSS)
Constrained AI Analyst (RAG Semantic Layer) Endpoint
Target Facility: 4,500 sq. ft. Independent Supermarket — Dalli Rajhara
"""

from fastapi import APIRouter
from ...db import db
from ...assistant.router import (
    AssistantQueryRequest,
    AssistantQueryResponse,
    execute_grounded_assistant_query
)

router = APIRouter()


@router.post("/query")
async def assistant_query(payload: AssistantQueryRequest):
    """
    Controlled AI Assistant executing strictly via allowlisted parameterized SQL templates.
    - Zero arbitrary mutation
    - Read-only execution with 500ms timeout
    - Grounded synthesis citing exact dates and metrics
    """
    pool = db.get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            response = execute_grounded_assistant_query(
                query=payload.query,
                db_conn=cur,
                force_template=payload.force_template
            )
            return response
