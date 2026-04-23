/**
 * lib/schema.ts — TypeScript types mirroring the Python backend's Pydantic models.
 *
 * These match `backend/schemas.py` exactly so the JSON response from
 * POST /api/v1/extract-financials can be typed directly.
 */

export interface FinancialMetrics {
  /** Reporting period label as it appears in the document (e.g. "2023", "Q3 2024"). */
  period: string;
  /** True when this period contains projected / forecast figures. */
  is_projected: boolean;

  // ── Income statement ──────────────────────────────────────────────────────
  /** Total net revenue in the document's reporting currency (absolute, not millions). */
  revenue: number | null;
  /** Gross margin as a percentage between 0 and 100. */
  gross_margin_pct: number | null;
  /** EBITDA — negative values indicate a loss. */
  ebitda: number | null;
  /** Net profit / loss after all expenses, interest, and taxes. */
  net_income: number | null;

  // ── Unit economics ────────────────────────────────────────────────────────
  /** Customer Acquisition Cost in reporting currency. */
  cac: number | null;
  /** Customer Lifetime Value in reporting currency. */
  ltv: number | null;

  // ── Cash ──────────────────────────────────────────────────────────────────
  /** Cash and cash equivalents at period end. */
  cash_balance: number | null;
  /** Average net monthly cash consumption (positive = burning cash). */
  monthly_burn_rate: number | null;

  // ── Derived KPIs ──────────────────────────────────────────────────────────
  /** LTV ÷ CAC. Healthy threshold for SaaS is ≥ 3. */
  ltv_to_cac_ratio: number | null;
  /** cash_balance ÷ monthly_burn_rate in months. */
  implied_runway_months: number | null;
}

export interface ExtractedFinancials {
  /** Legal or trading name of the company as it appears in the document. */
  company_name: string;
  /** ISO 4217 currency code, e.g. "USD", "EUR", "CHF". */
  reporting_currency: string;
  /** Granularity of the extracted time series. */
  reporting_period_type: "annual" | "quarterly" | "monthly" | "mixed";
  /** All extracted periods in chronological ascending order. */
  metrics: FinancialMetrics[];
  /** Overall extraction confidence between 0.0 and 1.0. */
  confidence_score: number;
  /** Non-fatal issues encountered (unit conversions, derived fields, etc.). */
  extraction_warnings: string[] | null;
  /** Names of the 8 core metrics that could not be found or derived. */
  missing_metrics: string[] | null;
}
