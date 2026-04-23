import { z } from "zod";

// ---------------------------------------------------------------------------
// Primitive building blocks
// ---------------------------------------------------------------------------

/**
 * A single time-series data point.
 * `period` is a label like "2022", "Q3 2023", or "Jan 2024".
 * `value` is always in base currency units (e.g. USD, not millions).
 * `isProjected` distinguishes actuals from forecasts.
 */
const MetricPointSchema = z.object({
  period: z.string().describe("Period label, e.g. '2022', 'Q3 2023', 'Jan 2024'"),
  value: z.number().describe("Absolute value in base currency units"),
  isProjected: z.boolean().default(false).describe("True if this is a forecast / projected figure"),
});

/**
 * A named metric with its full time series.
 */
const MetricSeriesSchema = z.object({
  label: z.string().describe("Human-readable name for this metric"),
  unit: z
    .enum(["USD", "EUR", "GBP", "CHF", "percent", "ratio", "other"])
    .describe("Unit of measure"),
  currency: z.string().optional().describe("ISO 4217 currency code when unit is a currency"),
  data: z.array(MetricPointSchema).min(1),
  notes: z.string().optional().describe("Any caveats, restatements, or source notes"),
});

// ---------------------------------------------------------------------------
// Uniform Investor Financial Model
// ---------------------------------------------------------------------------

/**
 * The canonical schema that every uploaded financial document is normalised into.
 * All eight core metrics are required; each may have zero or more data points
 * depending on what was extractable from the source document.
 */
export const UniformInvestorFinancialModelSchema = z.object({
  // ── Company metadata ─────────────────────────────────────────────────────
  companyName: z.string().describe("Legal or trading name of the company"),
  reportingCurrency: z
    .string()
    .describe("Primary ISO 4217 currency used throughout the document"),
  reportingPeriodType: z
    .enum(["annual", "quarterly", "monthly", "mixed"])
    .describe("Granularity of the time series data"),
  sourceDocumentType: z
    .enum(["pdf", "excel", "csv", "unknown"])
    .describe("File format of the original upload"),
  extractedAt: z.string().describe("ISO 8601 timestamp of extraction"),

  // ── Core financial metrics ────────────────────────────────────────────────

  /** Total revenue / net revenue. */
  revenue: MetricSeriesSchema.describe(
    "Total revenue or net revenue (after returns/discounts)"
  ),

  /**
   * Gross margin expressed as a percentage (0–100).
   * If the source provides gross profit in absolute terms, convert to %.
   */
  grossMargin: MetricSeriesSchema.describe(
    "Gross margin as a percentage: (Revenue − COGS) / Revenue × 100"
  ),

  /**
   * Earnings Before Interest, Taxes, Depreciation & Amortisation.
   * Absolute value in reporting currency.
   */
  ebitda: MetricSeriesSchema.describe(
    "EBITDA — absolute value in reporting currency"
  ),

  /** Net income / net profit after tax. Negative values indicate a net loss. */
  netIncome: MetricSeriesSchema.describe(
    "Net income (profit after tax). Negative = net loss."
  ),

  /**
   * Customer Acquisition Cost — total sales & marketing spend divided by
   * new customers acquired in the same period.
   */
  cac: MetricSeriesSchema.describe(
    "Customer Acquisition Cost per new customer in reporting currency"
  ),

  /**
   * Lifetime Value of a customer in reporting currency.
   * If not directly stated, Claude should attempt to derive it from
   * ARPU × gross margin % × average customer lifetime.
   */
  ltv: MetricSeriesSchema.describe(
    "Customer Lifetime Value in reporting currency"
  ),

  /** Cash and cash equivalents on the balance sheet at period end. */
  cashBalance: MetricSeriesSchema.describe(
    "Cash and cash equivalents at period end"
  ),

  /**
   * Net cash consumed per month.
   * Positive = cash being burned; negative = cash being generated.
   * If only quarterly/annual figures are available, annualise and divide.
   */
  monthlyBurnRate: MetricSeriesSchema.describe(
    "Average net monthly cash burn (positive = burning cash)"
  ),

  // ── Derived / computed fields (optional) ─────────────────────────────────
  ltvToCacRatio: z
    .number()
    .optional()
    .describe("LTV ÷ CAC ratio for the most recent period"),
  runwayMonths: z
    .number()
    .optional()
    .describe("Estimated months of runway = cashBalance / monthlyBurnRate"),

  // ── Extraction quality ────────────────────────────────────────────────────
  extractionConfidence: z
    .enum(["high", "medium", "low"])
    .describe(
      "Claude's overall confidence in the extraction quality. " +
      "'high' = all 8 metrics found directly. " +
      "'medium' = some derived/estimated. " +
      "'low' = significant data missing or ambiguous."
    ),
  missingMetrics: z
    .array(z.string())
    .optional()
    .describe("Names of metrics that could not be extracted from the document"),
  warnings: z
    .array(z.string())
    .optional()
    .describe("Non-fatal issues found during extraction, e.g. currency conversions or restatements"),
});

export type MetricPoint = z.infer<typeof MetricPointSchema>;
export type MetricSeries = z.infer<typeof MetricSeriesSchema>;
export type UniformInvestorFinancialModel = z.infer<typeof UniformInvestorFinancialModelSchema>;
