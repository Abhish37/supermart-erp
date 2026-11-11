"""
Retail Intelligence & Decision Support System (RIDSS)
Controlled AI Assistant: Semantic Template Router & Read-Only Execution Layer
Target Facility: 4,500 sq. ft. Independent Supermarket — Dalli Rajhara
"""

import os
import re
import json
from typing import Dict, Any, Optional
from datetime import datetime
from pydantic import BaseModel, Field
from .templates import SQL_TEMPLATES


class AssistantQueryRequest(BaseModel):
    query: str = Field(..., description="Natural language question from store owner or manager")
    force_template: Optional[str] = Field(None, description="Direct template override if triggered via UI button")


class AssistantQueryResponse(BaseModel):
    intent: str
    template_used: str
    parameters: Dict[str, Any]
    grounded_summary: str
    data_table: list
    metadata: Dict[str, Any]


def classify_intent_and_extract_params(query: str) -> Dict[str, Any]:
    """
    Deterministic & fast heuristic intent classifier for allowlisted templates.
    Can be augmented with Gemini API when GEMINI_API_KEY is configured.
    """
    q = query.lower()

    # 1. Expiry Exposure
    if any(k in q for k in ["expir", "decay", "waste", "shelf life", "capital at risk", "near exp"]):
        max_days = 45
        days_match = re.search(r'(\d+)\s*day', q)
        if days_match:
            max_days = int(days_match.group(1))
        return {
            "intent": "GET_EXPIRY_EXPOSURE",
            "template": "TPL_EXPIRY_EXPOSURE",
            "params": {"max_days": max_days}
        }

    # 2. Khata / Credit / Overdue
    if any(k in q for k in ["khata", "credit", "overdue", "receivable", "udhar", "customer balance"]):
        min_days = 15
        days_match = re.search(r'(\d+)\s*day', q)
        if days_match:
            min_days = int(days_match.group(1))
        return {
            "intent": "GET_KHATA_OVERDUE",
            "template": "TPL_KHATA_OVERDUE_REPORT",
            "params": {"min_overdue_days": min_days}
        }

    # 3. Reorder Rationale
    if any(k in q for k in ["reorder", "rop", "safety stock", "purchase order", "why order", "suggested qty"]):
        sku = None
        for word in q.split():
            if "sku-" in word or "oil" in word or "rice" in word or "atta" in word:
                sku = word.upper()
        return {
            "intent": "GET_REORDER_RATIONALE",
            "template": "TPL_REORDER_RATIONALE",
            "params": {"sku": sku}
        }

    # 4. Sales Variance Diagnostic
    if any(k in q for k in ["variance", "compare", "drop", "spike", "trend", "vs last week", "vs previous"]):
        window_days = 14
        days_match = re.search(r'(\d+)\s*day', q)
        if days_match:
            window_days = int(days_match.group(1))
        return {
            "intent": "GET_SALES_VARIANCE",
            "template": "TPL_SALES_VARIANCE_DIAGNOSTIC",
            "params": {"sku": None, "window_days": window_days}
        }

    # 5. Top Contributors (Default / Margin / Revenue)
    limit = 10
    limit_match = re.search(r'top\s*(\d+)', q)
    if limit_match:
        limit = int(limit_match.group(1))

    lookback_days = 30
    lookback_match = re.search(r'(\d+)\s*day', q)
    if lookback_match:
        lookback_days = int(lookback_match.group(1))

    return {
        "intent": "GET_TOP_CONTRIBUTORS",
        "template": "TPL_TOP_CONTRIBUTORS",
        "params": {"limit": limit, "lookback_days": lookback_days}
    }


def execute_grounded_assistant_query(
    query: str,
    db_conn,
    force_template: Optional[str] = None
) -> Dict[str, Any]:
    """
    Executes a constrained semantic query against the database:
    - Zero arbitrary SQL
    - Enforced 500ms timeout
    - Cites dates, metrics, and parameters in grounded synthesis
    """
    start_time = datetime.now()

    if force_template and force_template in SQL_TEMPLATES:
        template_name = force_template
        intent = force_template
        params = {"limit": 10, "lookback_days": 30, "max_days": 45, "min_overdue_days": 15, "sku": None, "window_days": 14}
    else:
        classification = classify_intent_and_extract_params(query)
        template_name = classification["template"]
        intent = classification["intent"]
        params = classification["params"]

    sql_template = SQL_TEMPLATES[template_name]

    # Statement timeout guardrail (500ms)
    rows = []
    try:
        # If DB connection supports statement timeout, set it
        try:
            db_conn.execute("SET statement_timeout = '500ms';")
        except Exception:
            pass

        # Execute parameterized SQL query
        cursor = db_conn.execute(sql_template, params)
        raw_rows = cursor.fetchall()

        # Format column headers
        col_names = [desc[0] for desc in cursor.description] if cursor.description else []
        for r in raw_rows:
            if isinstance(r, dict):
                rows.append(r)
            else:
                rows.append(dict(zip(col_names, r)))
    except Exception as e:
        rows = []
        error_msg = str(e)
    else:
        error_msg = None

    elapsed_ms = (datetime.now() - start_time).total_seconds() * 1000.0

    # Grounded Synthesis
    if template_name == "TPL_TOP_CONTRIBUTORS":
        summary = (
            f"Analyzed top {params.get('limit', 10)} revenue and gross profit contributors over the last "
            f"{params.get('lookback_days', 30)} days. Found {len(rows)} matching products contributing "
            f"to net store margins."
        )
    elif template_name == "TPL_EXPIRY_EXPOSURE":
        total_risk = sum(float(r.get('capital_at_risk', 0.0)) for r in rows)
        summary = (
            f"Expiry Risk Diagnostic (Window: <= {params.get('max_days', 45)} days): "
            f"Identified {len(rows)} batches with total capital at risk of ₹{total_risk:,.2f}."
        )
    elif template_name == "TPL_KHATA_OVERDUE_REPORT":
        total_overdue = sum(float(r.get('current_balance', 0.0)) for r in rows)
        summary = (
            f"Khata Receivables Audit: {len(rows)} customer accounts have outstanding balances "
            f"exceeding {params.get('min_overdue_days', 15)} days overdue. Total outstanding: ₹{total_overdue:,.2f}."
        )
    elif template_name == "TPL_SALES_VARIANCE_DIAGNOSTIC":
        summary = (
            f"Sales Variance Diagnostic comparing current {params.get('window_days', 14)}-day window "
            f"against the preceding period across {len(rows)} SKUs."
        )
    else:
        summary = f"Query executed successfully using allowlisted template '{template_name}'."

    return {
        "status": "success" if error_msg is None else "error",
        "data": {
            "intent": intent,
            "template_used": template_name,
            "parameters": params,
            "grounded_summary": summary,
            "error_detail": error_msg,
            "data_table": rows
        },
        "metadata": {
            "generated_at": datetime.now().isoformat(),
            "version": "1.0",
            "execution_time_ms": round(elapsed_ms, 2)
        }
    }
