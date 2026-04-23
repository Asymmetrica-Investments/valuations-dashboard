"use client";

import * as React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Cell,
  ReferenceLine,
  Legend,
} from "recharts";
import { Clock, Flame, Wallet, Users, Printer } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UniformInvestorFinancialModel, MetricSeries } from "@/lib/schema";

// ─── Chart palette (actual hex — Tailwind vars won't resolve inside SVG) ───

const P = {
  revenue:    "#e5e5e5",   // neutral-200
  revenueP:   "rgba(229,229,229,0.3)",
  ebitdaPos:  "#34d399",   // emerald-400
  ebitdaNeg:  "#f87171",   // red-400
  ebitdaPosP: "rgba(52,211,153,0.3)",
  ebitdaNegP: "rgba(248,113,113,0.3)",
  cash:       "#818cf8",   // indigo-400
  cashP:      "rgba(129,140,248,0.4)",
  grid:       "rgba(255,255,255,0.05)",
  axis:       "#737373",   // neutral-500
  zero:       "rgba(239,68,68,0.35)",
} as const;

// ─── Formatting helpers ──────────────────────────────────────────────────────

function currencySymbol(currency: string): string {
  return ({ USD: "$", EUR: "€", GBP: "£", CHF: "Fr", JPY: "¥" } as Record<string, string>)[currency] ?? `${currency} `;
}

function fmtCompact(value: number): string {
  const abs = Math.abs(value);
  const neg = value < 0 ? "−" : "";
  if (abs >= 1e9) return `${neg}${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${neg}${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${neg}${(abs / 1e3).toFixed(0)}K`;
  return `${neg}${abs.toFixed(0)}`;
}

function fmtCell(value: number | null, unit: string, sym: string): string {
  if (value == null) return "—";
  if (unit === "percent") return `${value.toFixed(1)}%`;
  if (unit === "ratio")   return `${value.toFixed(2)}×`;
  return `${sym}${fmtCompact(value)}`;
}

function fmtRunway(months: number | null): string {
  if (months == null) return "—";
  if (months > 36) return `${(months / 12).toFixed(0)}y+`;
  if (months > 24) return `${(months / 12).toFixed(1)}y`;
  return `${months.toFixed(1)} mo`;
}

// ─── Runway signal ───────────────────────────────────────────────────────────

type Signal = "none" | "red" | "amber" | "yellow" | "green";

function runwaySignal(months: number | null): Signal {
  if (months == null) return "none";
  if (months < 6)  return "red";
  if (months < 12) return "amber";
  if (months < 18) return "yellow";
  return "green";
}

const SIGNAL_CLASSES: Record<Signal, { value: string; card: string }> = {
  none:   { value: "text-foreground",  card: "border-border bg-card" },
  red:    { value: "text-red-400",     card: "border-red-500/25 bg-red-500/[0.06]" },
  amber:  { value: "text-amber-400",   card: "border-amber-500/25 bg-amber-500/[0.06]" },
  yellow: { value: "text-yellow-400",  card: "border-yellow-500/25 bg-yellow-500/[0.06]" },
  green:  { value: "text-emerald-400", card: "border-emerald-500/25 bg-emerald-500/[0.06]" },
};

// ─── Period collection ───────────────────────────────────────────────────────

function collectPeriods(...series: MetricSeries[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of series) {
    for (const d of s.data) {
      if (!seen.has(d.period)) { seen.add(d.period); out.push(d.period); }
    }
  }
  return out;
}

function lookupPoint(series: MetricSeries, period: string) {
  return series.data.find(d => d.period === period) ?? null;
}

// ─── Custom tooltip ──────────────────────────────────────────────────────────

interface TooltipPayloadItem {
  name: string;
  value: number;
  color: string;
}

function ChartTooltip({
  active,
  payload,
  label,
  sym,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
  sym: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-card shadow-2xl px-3 py-2.5 text-xs min-w-[140px]">
      <p className="text-muted-foreground font-medium mb-2">{label}</p>
      <div className="space-y-1.5">
        {payload.map((item, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-muted-foreground">{item.name}</span>
            </div>
            <span className="font-mono text-foreground tabular-nums">
              {item.value < 0 ? "−" : ""}{sym}{fmtCompact(Math.abs(item.value))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  signal = "none",
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  signal?: Signal;
}) {
  const { value: valueClass, card: cardClass } = SIGNAL_CLASSES[signal];
  return (
    <div className={cn("rounded-xl border p-4 flex flex-col gap-3", cardClass)}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground">
          {label}
        </span>
        <Icon className="h-3.5 w-3.5 text-muted-foreground/50" strokeWidth={1.5} />
      </div>
      <div>
        <div className={cn("text-2xl font-semibold tabular-nums leading-none tracking-tight", valueClass)}>
          {value}
        </div>
        {sub && (
          <div className="text-[11px] text-muted-foreground mt-1.5 leading-none">{sub}</div>
        )}
      </div>
    </div>
  );
}

// ─── Revenue vs EBITDA bar chart ─────────────────────────────────────────────

function RevenueEbitdaChart({
  data,
  sym,
}: {
  data: UniformInvestorFinancialModel;
  sym: string;
}) {
  const periods = collectPeriods(data.revenue, data.ebitda);

  const chartData = periods.map(period => {
    const rev  = lookupPoint(data.revenue, period);
    const ebit = lookupPoint(data.ebitda, period);
    return {
      period,
      revenue:     rev?.value  ?? null,
      ebitda:      ebit?.value ?? null,
      revP:        rev?.isProjected  ?? false,
      ebitP:       ebit?.isProjected ?? false,
    };
  });

  const hasData = chartData.some(d => d.revenue != null || d.ebitda != null);

  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3 break-inside-avoid">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground">
            Revenue vs EBITDA
          </p>
          <p className="text-xs text-muted-foreground/60 mt-0.5">Historical & projected</p>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: P.revenue }} />
            Revenue
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: P.ebitdaPos }} />
            EBITDA
          </span>
        </div>
      </div>

      {hasData ? (
        <div className="h-[220px] print:h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} barGap={3} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke={P.grid} />
            <XAxis
              dataKey="period"
              tick={{ fill: P.axis, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tickFormatter={v => `${sym}${fmtCompact(v)}`}
              tick={{ fill: P.axis, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={56}
            />
            <RechartsTooltip
              cursor={{ fill: "rgba(255,255,255,0.03)" }}
              content={(props: any) => (
                <ChartTooltip {...props} sym={sym} />
              )}
            />
            <ReferenceLine y={0} stroke={P.zero} strokeDasharray="3 3" />
            <Bar dataKey="revenue" name="Revenue" radius={[3, 3, 0, 0]}>
              {chartData.map((d, i) => (
                <Cell key={i} fill={d.revP ? P.revenueP : P.revenue} />
              ))}
            </Bar>
            <Bar dataKey="ebitda" name="EBITDA" radius={[3, 3, 0, 0]}>
              {chartData.map((d, i) => {
                const isNeg = (d.ebitda ?? 0) < 0;
                if (d.ebitP) return <Cell key={i} fill={isNeg ? P.ebitdaNegP : P.ebitdaPosP} />;
                return <Cell key={i} fill={isNeg ? P.ebitdaNeg : P.ebitdaPos} />;
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        </div>
      ) : (
        <EmptyChart />
      )}
    </div>
  );
}

// ─── Cash balance line chart ─────────────────────────────────────────────────

function CashBalanceChart({
  data,
  sym,
  runwayMonths,
}: {
  data: UniformInvestorFinancialModel;
  sym: string;
  runwayMonths: number | null;
}) {
  const chartData = data.cashBalance.data.map(d => ({
    period: d.period,
    cash: d.value,
    isProjected: d.isProjected,
  }));

  const hasData = chartData.length > 0;

  // Split actuals from projected for dual-stroke rendering
  const splitIndex = chartData.findIndex(d => d.isProjected);
  const connectPoint = splitIndex > 0 ? splitIndex - 1 : -1; // last actual, repeated to bridge

  const actuals   = splitIndex >= 0 ? chartData.slice(0, splitIndex + 1)  : chartData;
  const projected = splitIndex >= 0 ? chartData.slice(splitIndex - (splitIndex > 0 ? 1 : 0)) : [];

  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3 break-inside-avoid">
      <div>
        <p className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground">
          Cash Balance
        </p>
        <p className="text-xs text-muted-foreground/60 mt-0.5">
          {runwayMonths != null
            ? `${fmtRunway(runwayMonths)} implied runway`
            : "Balance over time"}
        </p>
      </div>

      {hasData ? (
        <div className="h-[220px] print:h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid vertical={false} stroke={P.grid} />
            <XAxis
              dataKey="period"
              tick={{ fill: P.axis, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tickFormatter={v => `${sym}${fmtCompact(v)}`}
              tick={{ fill: P.axis, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={56}
            />
            <RechartsTooltip
              cursor={{ stroke: "rgba(255,255,255,0.08)", strokeWidth: 1 }}
              content={(props: any) => (
                <ChartTooltip {...props} sym={sym} />
              )}
            />
            <ReferenceLine y={0} stroke={P.zero} strokeDasharray="3 3" />
            {/* Actual line */}
            <Line
              dataKey="cash"
              name="Cash"
              data={actuals}
              stroke={P.cash}
              strokeWidth={2}
              dot={{ r: 3, fill: P.cash, strokeWidth: 0 }}
              activeDot={{ r: 4, fill: P.cash, stroke: "transparent" }}
            />
            {/* Projected line (dashed) */}
            {projected.length > 1 && (
              <Line
                dataKey="cash"
                name="Cash (proj.)"
                data={projected}
                stroke={P.cash}
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={{ r: 3, fill: P.cashP, stroke: P.cash, strokeWidth: 1 }}
                activeDot={{ r: 4 }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
        </div>
      ) : (
        <EmptyChart />
      )}
    </div>
  );
}

// ─── Empty chart state ───────────────────────────────────────────────────────

function EmptyChart() {
  return (
    <div className="h-[220px] flex items-center justify-center">
      <p className="text-xs text-muted-foreground/40 italic">No data available</p>
    </div>
  );
}

// ─── P&L Table ───────────────────────────────────────────────────────────────

const TABLE_ROWS: {
  key: keyof UniformInvestorFinancialModel;
  label: string;
  section?: string;
}[] = [
  { key: "revenue",        label: "Revenue",         section: "Income Statement" },
  { key: "grossMargin",    label: "Gross Margin" },
  { key: "ebitda",         label: "EBITDA" },
  { key: "netIncome",      label: "Net Income" },
  { key: "cac",            label: "CAC",             section: "Unit Economics" },
  { key: "ltv",            label: "LTV" },
  { key: "cashBalance",    label: "Cash Balance",    section: "Cash Position" },
  { key: "monthlyBurnRate",label: "Monthly Burn" },
];

function PnlTable({
  data,
  sym,
}: {
  data: UniformInvestorFinancialModel;
  sym: string;
}) {
  const allSeries = TABLE_ROWS.map(r => data[r.key] as MetricSeries);
  const allPeriods = collectPeriods(...allSeries);
  // Cap at last 8 periods to keep table readable
  const periods = allPeriods.slice(-8);

  // Which periods are projected (any metric has isProjected for that period)
  const projectedSet = new Set(
    allSeries.flatMap(s => s.data.filter(d => d.isProjected).map(d => d.period))
  );

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden break-before-page print:break-before-page">
      <div className="px-4 py-3 border-b border-border">
        <p className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground">
          Standardized P&amp;L
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/60">
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-36 sticky left-0 bg-card z-10">
                Metric
              </th>
              {periods.map(p => (
                <th
                  key={p}
                  className="text-right px-3 py-2.5 font-mono font-medium text-muted-foreground whitespace-nowrap min-w-[80px]"
                >
                  {projectedSet.has(p) ? (
                    <span className="italic text-muted-foreground/60">{p} P</span>
                  ) : p}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TABLE_ROWS.map((row, rowIdx) => {
              const series = data[row.key] as MetricSeries;
              const isFirst = rowIdx === 0;
              const prevRow = rowIdx > 0 ? TABLE_ROWS[rowIdx - 1] : null;
              const showDivider = row.section && row.section !== prevRow?.section;

              return (
                <React.Fragment key={row.key}>
                  {showDivider && !isFirst && (
                    <tr>
                      <td
                        colSpan={periods.length + 1}
                        className="px-4 py-2 border-t border-border/40"
                      >
                        <span className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground/50">
                          {row.section}
                        </span>
                      </td>
                    </tr>
                  )}
                  <tr
                    className={cn(
                      "group transition-colors hover:bg-white/[0.02]",
                      rowIdx % 2 === 0 ? "" : "bg-white/[0.01]"
                    )}
                  >
                    <td className="px-4 py-2.5 text-muted-foreground font-medium sticky left-0 group-hover:bg-card bg-card z-10 whitespace-nowrap">
                      {row.label}
                    </td>
                    {periods.map(period => {
                      const point = lookupPoint(series, period);
                      const value = point?.value ?? null;
                      const isP   = point?.isProjected ?? false;
                      const isNeg = value != null && value < 0;
                      return (
                        <td
                          key={period}
                          className={cn(
                            "px-3 py-2.5 text-right font-mono tabular-nums whitespace-nowrap",
                            value == null && "text-muted-foreground/30",
                            isNeg && "text-red-400",
                            !isNeg && value != null && "text-foreground",
                            isP && "opacity-60 italic"
                          )}
                        >
                          {fmtCell(value, series.unit, sym)}
                        </td>
                      );
                    })}
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main InvestorDashboard ──────────────────────────────────────────────────

export function InvestorDashboard({
  data,
}: {
  data: UniformInvestorFinancialModel;
}) {
  const sym = currencySymbol(data.reportingCurrency);

  // Derived KPIs
  const latestCash = data.cashBalance.data.at(-1);
  const latestBurn = data.monthlyBurnRate.data.at(-1);
  const latestLtv  = data.ltv.data.at(-1);
  const latestCac  = data.cac.data.at(-1);

  const runway: number | null = data.runwayMonths
    ?? (latestCash && latestBurn && latestBurn.value > 0
      ? latestCash.value / latestBurn.value
      : null);

  const ltvCac: number | null = data.ltvToCacRatio
    ?? (latestLtv && latestCac && latestCac.value > 0
      ? latestLtv.value / latestCac.value
      : null);

  const signal = runwaySignal(runway);

  const ltvCacSignal: Signal =
    ltvCac == null ? "none" :
    ltvCac < 1    ? "red"   :
    ltvCac < 3    ? "amber" :
    "green";

  return (
    <div className="w-full max-w-[1100px] space-y-3">
      {/* ── Print-only memo header (hidden on screen) ── */}
      <div className="hidden print:block mb-4 pb-3 border-b border-border">
        <p className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground mb-1">
          DD-Dash · Due Diligence Memo
        </p>
        <p className="text-[10px] text-muted-foreground/50">
          Extracted {new Date(data.extractedAt).toLocaleDateString("en-GB", {
            day: "numeric", month: "long", year: "numeric",
          })} · {data.sourceDocumentType.toUpperCase()} · {data.extractionConfidence} confidence
        </p>
      </div>

      {/* ── Dashboard header ── */}
      <div className="flex items-start justify-between gap-4 px-0.5">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground leading-none">
            {data.companyName}
          </h1>
          <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-2">
            <span>{data.reportingCurrency}</span>
            <span className="text-border">·</span>
            <span className="capitalize">{data.reportingPeriodType}</span>
            <span className="text-border">·</span>
            <span className="capitalize">{data.sourceDocumentType}</span>
            <span className="text-border">·</span>
            <span
              className={cn(
                "capitalize",
                data.extractionConfidence === "high"   && "text-emerald-400",
                data.extractionConfidence === "medium" && "text-amber-400",
                data.extractionConfidence === "low"    && "text-red-400"
              )}
            >
              {data.extractionConfidence} confidence
            </span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Warnings panel — shows on lg screens and always in print */}
          {data.warnings && data.warnings.length > 0 && (
            <div className="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-1.5 max-w-xs hidden lg:block print:block">
              <p className="text-[10px] font-semibold tracking-widest uppercase text-amber-400 mb-1">
                Notes
              </p>
              {data.warnings.slice(0, 2).map((w, i) => (
                <p key={i} className="text-[11px] text-amber-300/60 leading-snug">· {w}</p>
              ))}
            </div>
          )}
          {/* Print button — hidden in the actual printout */}
          <button
            onClick={() => window.print()}
            className={cn(
              "print:hidden flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5",
              "text-xs text-muted-foreground bg-card",
              "hover:text-foreground hover:border-foreground/20 hover:bg-card",
              "active:scale-[0.97] transition-[color,border-color,transform]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            )}
          >
            <Printer className="h-3.5 w-3.5" strokeWidth={1.5} />
            Export PDF
          </button>
        </div>
      </div>

      {/* ── KPI row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 break-inside-avoid">
        <KpiCard
          label="Current Cash"
          value={latestCash ? `${sym}${fmtCompact(latestCash.value)}` : "—"}
          sub={latestCash ? `as of ${latestCash.period}` : undefined}
          icon={Wallet}
        />
        <KpiCard
          label="Monthly Burn"
          value={latestBurn ? `${sym}${fmtCompact(latestBurn.value)}` : "—"}
          sub={latestBurn ? `as of ${latestBurn.period}` : undefined}
          icon={Flame}
        />
        <KpiCard
          label="Implied Runway"
          value={fmtRunway(runway)}
          sub={
            runway != null
              ? runway < 6  ? "Critical — raise now"
              : runway < 12 ? "Caution — start process"
              : runway < 18 ? "Comfortable"
              : "Healthy"
              : undefined
          }
          icon={Clock}
          signal={signal}
        />
        <KpiCard
          label="LTV / CAC"
          value={ltvCac != null ? `${ltvCac.toFixed(2)}×` : "—"}
          sub={
            ltvCac != null
              ? ltvCac < 1 ? "Below break-even"
              : ltvCac < 3 ? "Marginal"
              : `${((ltvCac - 1) * 100).toFixed(0)}% return on acq.`
              : undefined
          }
          icon={Users}
          signal={ltvCacSignal}
        />
      </div>

      {/* ── Charts row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] print:grid-cols-1 gap-3">
        <RevenueEbitdaChart data={data} sym={sym} />
        <CashBalanceChart data={data} sym={sym} runwayMonths={runway} />
      </div>

      {/* ── P&L Table ── */}
      <PnlTable data={data} sym={sym} />

      {/* ── Missing metrics footnote ── */}
      {data.missingMetrics && data.missingMetrics.length > 0 && (
        <p className="text-[11px] text-muted-foreground/40 px-0.5">
          Could not extract: {data.missingMetrics.join(", ")}
        </p>
      )}
    </div>
  );
}
