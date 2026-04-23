"""
schemas.py — Pydantic data models for DD-Dash financial extraction.

Design rules:
  - Every numeric field is Optional[float] so the LLM can express genuine
    absence rather than hallucinating a zero.
  - Field descriptions are written as PE analyst notes — they inform both the
    LLM system prompt (via JSON Schema) and any human reading the code.
  - All monetary values are in the document's reporting currency (not millions).
  - Percentages are expressed as 0–100 (e.g., gross_margin_pct = 62.5, not 0.625).
"""

from __future__ import annotations

from typing import List, Literal, Optional
from pydantic import BaseModel, Field


# ─── Per-period metric snapshot ───────────────────────────────────────────────

class FinancialMetrics(BaseModel):
    """
    A single-period financial snapshot extracted from the source document.
    One instance per reporting period (year, quarter, or month).
    """

    period: str = Field(
        ...,
        description=(
            "The reporting period label exactly as it appears in the document, "
            "e.g. '2023', 'Q3 2024', 'FY2023', 'Jan-2025'. "
            "Always preserve the original label — do not normalise or abbreviate."
        ),
    )

    is_projected: bool = Field(
        default=False,
        description=(
            "True if this period contains forecast / projected / budget figures "
            "rather than audited or management actuals. "
            "Labels like 'F', 'E', 'Proj.', 'Budget', or 'Forecast' imply True."
        ),
    )

    # ── Income statement ─────────────────────────────────────────────────────

    revenue: Optional[float] = Field(
        default=None,
        description=(
            "Total net revenue for the period in the document's reporting currency. "
            "Exclude VAT / sales tax. If the document states '€4.2M', store 4_200_000. "
            "Null if not stated."
        ),
    )

    gross_margin_pct: Optional[float] = Field(
        default=None,
        description=(
            "Gross margin as a percentage between 0 and 100. "
            "Formula: (Revenue − COGS) / Revenue × 100. "
            "If the document provides gross profit in absolute terms, derive the %. "
            "Null if neither gross profit nor COGS is available."
        ),
    )

    ebitda: Optional[float] = Field(
        default=None,
        description=(
            "Earnings Before Interest, Taxes, Depreciation & Amortisation. "
            "Absolute value in reporting currency. Negative values indicate an EBITDA loss. "
            "Null if not calculable from the document."
        ),
    )

    net_income: Optional[float] = Field(
        default=None,
        description=(
            "Net profit (or net loss) after all expenses, interest, and taxes. "
            "Negative values are losses. Null if not stated."
        ),
    )

    # ── Unit economics ───────────────────────────────────────────────────────

    cac: Optional[float] = Field(
        default=None,
        description=(
            "Customer Acquisition Cost — the fully-loaded average cost to acquire "
            "one new paying customer during this period. "
            "In reporting currency. Null if not available."
        ),
    )

    ltv: Optional[float] = Field(
        default=None,
        description=(
            "Customer Lifetime Value in reporting currency. "
            "If not stated directly, attempt to derive from: "
            "ARPU × gross_margin_pct/100 × average customer lifetime (months). "
            "Null if insufficient data."
        ),
    )

    # ── Cash position ────────────────────────────────────────────────────────

    cash_balance: Optional[float] = Field(
        default=None,
        description=(
            "Cash and cash equivalents on the balance sheet at the end of the period. "
            "In reporting currency. Null if not stated."
        ),
    )

    monthly_burn_rate: Optional[float] = Field(
        default=None,
        description=(
            "Average net monthly cash consumption (outflows minus inflows) for this period. "
            "Positive = burning cash; negative = generating cash. "
            "If only a quarterly or annual figure is available, divide to monthly equivalent. "
            "Null if not calculable."
        ),
    )

    # ── Derived KPIs (compute if possible, else null) ────────────────────────

    ltv_to_cac_ratio: Optional[float] = Field(
        default=None,
        description=(
            "LTV divided by CAC. A ratio ≥ 3 is generally considered healthy for SaaS. "
            "Compute only if both ltv and cac are non-null and cac > 0. Else null."
        ),
    )

    implied_runway_months: Optional[float] = Field(
        default=None,
        description=(
            "Months of remaining runway = cash_balance / monthly_burn_rate. "
            "Only valid when monthly_burn_rate > 0. Else null."
        ),
    )


# ─── Document-level wrapper ───────────────────────────────────────────────────

class ExtractedFinancials(BaseModel):
    """
    Top-level extraction result returned by the LLM engine.
    Contains all periods found in the document plus metadata about the extraction.
    """

    company_name: str = Field(
        ...,
        description=(
            "Legal or trading name of the company as it appears in the document. "
            "If ambiguous, use the most prominent name."
        ),
    )

    reporting_currency: str = Field(
        ...,
        description=(
            "ISO 4217 currency code for all monetary values in this document, "
            "e.g. 'USD', 'EUR', 'GBP', 'CHF'. "
            "If the document mixes currencies, choose the primary one and note "
            "any conversions in extraction_warnings."
        ),
    )

    reporting_period_type: Literal["annual", "quarterly", "monthly", "mixed"] = Field(
        ...,
        description=(
            "Granularity of the extracted time series. "
            "'mixed' if the document contains both annual and quarterly figures."
        ),
    )

    metrics: List[FinancialMetrics] = Field(
        ...,
        description=(
            "Ordered list of per-period snapshots, chronologically ascending. "
            "Include all periods found — both historical actuals and projections."
        ),
    )

    confidence_score: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description=(
            "Overall extraction confidence between 0.0 and 1.0. "
            "1.0 = all 8 core metrics found directly in the document. "
            "0.7–0.9 = most metrics present, some derived or estimated. "
            "0.4–0.6 = significant gaps, heavy inference required. "
            "< 0.4 = document is unlikely to be a financial statement."
        ),
    )

    extraction_warnings: Optional[List[str]] = Field(
        default=None,
        description=(
            "Non-fatal issues encountered during extraction. Examples: "
            "'Revenue figures appear to be in thousands — multiplied by 1000', "
            "'CAC derived from S&M spend ÷ new customer count', "
            "'No cash balance found; runway cannot be computed'."
        ),
    )

    missing_metrics: Optional[List[str]] = Field(
        default=None,
        description=(
            "Names of the 8 core metrics that could not be extracted or derived "
            "from the document, e.g. ['cac', 'ltv', 'monthly_burn_rate']."
        ),
    )
