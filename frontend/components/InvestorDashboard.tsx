"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence, MotionConfig } from "framer-motion";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { FileDown, X, TrendingUp, TrendingDown, Minus, Loader2, Sun, Moon } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DotPattern } from "@/components/ui/dot-pattern";
import { NumberTicker } from "@/components/ui/number-ticker";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import type { ExtractedFinancials, FinancialMetrics } from "@/lib/schema";

// ── Animation variants ───────────────────────────────��────────────────────────

const stagger = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.11, delayChildren: 0.06 },
  },
};

const fadeUp = {
  hidden: { opacity: 0, y: 28, filter: "blur(8px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { type: "spring" as const, stiffness: 72, damping: 20 },
  },
};

const kpiStagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

// ── Chart palette (hardcoded hex — SVG can't resolve CSS vars) ─────────────
const P = {
  revenue: "#a1a1aa",       // zinc-400
  ebitdaPos: "#00C875",     // brand neon-green
  ebitdaNeg: "#fca5a5",     // red-300
  cash: "#a5b4fc",          // indigo-300
  grid: "rgba(255,255,255,0.04)",
  axis: "#52525b",          // zinc-600
  zero: "rgba(252,165,165,0.25)",
  grossMargin: "#818cf8",   // indigo-400
  ebitdaMargin: "#c084fc",  // purple-400
  netIncome: "#94a3b8",     // slate-400 — contrasting muted blue
};

// ── Module-level compact formatter (no closure deps) ─────────��───────────────
function compactNum(v: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(v);
}

// ── Formatters ──────────────────���────────────────────────��────────────────────
function fmtCurrency(v: number | null | undefined, cur: string): string {
  if (v == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: cur,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(v);
}
function fmtPct(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v.toFixed(1)}%`;
}
function fmtRatio(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v.toFixed(1)}×`;
}
function fmtMonths(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v.toFixed(1)} mo`;
}

// ── Runway signal ───────────────────────���─────────────────────────────────────
function runwayClass(mo: number | null | undefined) {
  if (mo == null) return "text-zinc-500";
  if (mo < 6) return "text-red-600 dark:text-red-400";
  if (mo < 12) return "text-amber-600 dark:text-amber-400";
  if (mo < 18) return "text-yellow-600 dark:text-yellow-400";
  return "text-[#00C875]";
}
function runwayIcon(mo: number | null | undefined) {
  if (mo == null) return <Minus className="size-4 text-zinc-500" />;
  if (mo < 6) return <TrendingDown className="size-4 text-red-600 dark:text-red-400" />;
  if (mo < 18) return <Minus className="size-4 text-amber-600 dark:text-amber-400" />;
  return <TrendingUp className="size-4 text-[#00C875]" />;
}

// ── PremiumCard: glassmorphism + mouse-tracking border spotlight ──────────────
interface PremiumCardProps {
  children: React.ReactNode;
  className?: string;
}

function PremiumCard({ children, className }: PremiumCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const onMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, []);

  const onLeave = useCallback(() => setPos(null), []);

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className={cn(
        "relative p-[1px] rounded-2xl overflow-hidden",
        className
      )}
    >
      {/* Static base border */}
      <div className="absolute inset-0 rounded-2xl border border-zinc-200 dark:border-zinc-800/50" />

      {/* Metallic spotlight — follows cursor along the 1px border gap */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-2xl transition-opacity duration-500"
        style={{
          opacity: pos ? 1 : 0,
          background: pos
            ? `radial-gradient(320px circle at ${pos.x}px ${pos.y}px, rgba(161,161,170,0.18), transparent 65%)`
            : "none",
        }}
      />

      {/* Card surface */}
      <div className="relative rounded-[calc(1rem-1px)] bg-white dark:bg-zinc-900/50 backdrop-blur-xl">
        {children}
      </div>
    </div>
  );
}

// ── GlassPanel: glassmorphism without hover glow (charts, table) ──────────────
function GlassPanel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-zinc-200 dark:border-zinc-800/50 bg-white/90 dark:bg-zinc-900/40 backdrop-blur-xl",
        className
      )}
    >
      {children}
    </div>
  );
}

// ── KPI card ─────────────────���───────────────────────────────────────���────────
interface KpiCardProps {
  label: string;
  rawValue: number | null | undefined;
  formatFn: (v: number) => string;
  sub?: string;
  icon?: React.ReactNode;
  valueClass?: string;
}

function KpiCard({ label, rawValue, formatFn, sub, icon, valueClass }: KpiCardProps) {
  return (
    <motion.div variants={fadeUp}>
      <PremiumCard className="h-full">
        <div className="flex flex-col gap-3 p-5">
          {/* Label */}
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">
            {label}
          </p>

          {/* Thin precision line */}
          <div className="h-px w-8 bg-gradient-to-r from-zinc-700 to-transparent" />

          {/* Value */}
          <div className="flex items-end justify-between gap-2">
            <span
              className={cn(
                "text-5xl font-light tracking-tight text-zinc-900 leading-none",
                !valueClass && "dark:text-white",
                valueClass
              )}
            >
              {rawValue != null ? (
                <NumberTicker value={rawValue} format={formatFn} />
              ) : (
                "—"
              )}
            </span>
            {icon}
          </div>

          {/* Sub-label */}
          {sub && (
            <p className="text-[11px] text-zinc-500 tracking-wide">{sub}</p>
          )}
        </div>
      </PremiumCard>
    </motion.div>
  );
}

// ── Chart theme hook ─────────────────────────────────────────────────────────
function useChartTheme() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== "light";
  return {
    isDark,
    tooltipStyle: isDark
      ? { backgroundColor: "#09090b", borderColor: "#27272a", borderRadius: "8px", fontSize: "12px", color: "#fff", boxShadow: "0 4px 24px rgba(0,0,0,0.6)" }
      : { backgroundColor: "#ffffff", borderColor: "#e4e4e7", borderRadius: "8px", fontSize: "12px", color: "#111827", boxShadow: "0 4px 24px rgba(0,0,0,0.1)" },
    axisTickFill: isDark ? "#d4d4d8" : "#52525b",
    axisLine: isDark ? "#3f3f46" : "#d4d4d8",
    grid: isDark ? "#27272a" : "#e4e4e7",
    itemColor: isDark ? "#e4e4e7" : "#374151",
    labelColor: isDark ? "#a1a1aa" : "#6b7280",
    cursorFill: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)",
    cursorStroke: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
    legendColor: isDark ? "#d4d4d8" : "#52525b",
  } as const;
}

// ── Panel header ──────────────────────────���──────────────────────────────────��
function PanelHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex flex-col px-5 pt-5 pb-0">
      <div className="flex items-center gap-3">
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">
          {title}
        </p>
        <div className="flex-1 h-px bg-gradient-to-r from-zinc-800 to-transparent" />
      </div>
      {sub && (
        <p className="mt-1 mb-4 text-[10px] uppercase tracking-widest text-zinc-500">
          {sub}
        </p>
      )}
    </div>
  );
}

// ── Formula primitives (no react-katex needed) ───────────────��────────────────

/** Inline fraction rendered as a vertical CSS flex stack */
function Frac({ n, d }: { n: React.ReactNode; d: React.ReactNode }) {
  return (
    <span className="inline-flex flex-col items-center align-middle mx-[3px] leading-none">
      <span className="px-1 pb-[2px] text-[12px]">{n}</span>
      <span className="w-full border-t border-zinc-500/60" />
      <span className="px-1 pt-[2px] text-[12px]">{d}</span>
    </span>
  );
}

/** WACC = [D/V · Kd(1−t)] + [E/V · Ke] */
function WaccFormula() {
  return (
    <div className="flex flex-wrap items-center gap-x-[2px] gap-y-2 font-mono text-[13px] text-zinc-200 leading-none py-1">
      <span className="italic text-zinc-300">WACC</span>
      <span className="text-zinc-500 mx-1.5">=</span>
      <span className="text-zinc-600">[</span>
      <Frac n={<span className="text-zinc-300">D</span>} d={<span className="text-zinc-300">V</span>} />
      <span className="text-zinc-500 mx-1">·</span>
      <span className="text-zinc-300">K<sub className="text-[10px] text-zinc-400">d</sub></span>
      <span className="text-zinc-500 mx-1">(1 −</span>
      <span className="text-zinc-300">t</span>
      <span className="text-zinc-500">)</span>
      <span className="text-zinc-600">]</span>
      <span className="text-zinc-500 mx-1.5">+</span>
      <span className="text-zinc-600">[</span>
      <Frac n={<span className="text-zinc-300">E</span>} d={<span className="text-zinc-300">V</span>} />
      <span className="text-zinc-500 mx-1">·</span>
      <span className="text-zinc-300">K<sub className="text-[10px] text-zinc-400">e</sub></span>
      <span className="text-zinc-600">]</span>
    </div>
  );
}

/** Ke = rf + (β × rpm) + rps + rpcp + rpc + rpp */
function CAPMFormula() {
  return (
    <div className="flex flex-wrap items-center gap-x-[2px] gap-y-2 font-mono text-[13px] text-zinc-200 leading-none py-1">
      <span className="text-zinc-300">K<sub className="text-[10px] text-zinc-400">e</sub></span>
      <span className="text-zinc-500 mx-1.5">=</span>
      <span className="italic text-zinc-400">r<sub className="text-[10px]">f</sub></span>
      <span className="text-zinc-500 mx-1.5">+</span>
      <span className="text-zinc-500">(</span>
      <span className="text-zinc-300">β</span>
      <span className="text-zinc-500 mx-1">×</span>
      <span className="italic text-zinc-400">r<sub className="text-[10px]">pm</sub></span>
      <span className="text-zinc-500">)</span>
      <span className="text-zinc-500 mx-1.5">+</span>
      <span className="italic text-zinc-400">r<sub className="text-[10px]">ps</sub></span>
      <span className="text-zinc-500 mx-1.5">+</span>
      <span className="italic text-zinc-400">r<sub className="text-[10px]">pcp</sub></span>
      <span className="text-zinc-500 mx-1.5">+</span>
      <span className="italic text-zinc-400">r<sub className="text-[10px]">pc</sub></span>
      <span className="text-zinc-500 mx-1.5">+</span>
      <span className="italic text-zinc-400">r<sub className="text-[10px]">pp</sub></span>
    </div>
  );
}

// ── Valuation tab ─────────────────────────────────────────────────��───────────

interface ValuationViewProps {
  data: ExtractedFinancials;
  latest: FinancialMetrics | undefined;
  cur: string;
  currencyFmt: (v: number) => string;
  themeOverride?: "dark" | "light";
  sectionHeader?: string;
  isExport?: boolean;
}

function ValuationView({ data, latest, cur, currencyFmt, themeOverride, sectionHeader, isExport }: ValuationViewProps) {
  const [scenario, setScenario] = useState<"base" | "stress">("base");
  const CT = useChartTheme();

  // When rendering inside the hidden export container, override chart colors
  // to match exportTheme instead of relying on the global next-themes state.
  const isDarkOverride = themeOverride != null ? themeOverride === "dark" : CT.isDark;
  const chartTheme = themeOverride != null ? {
    tooltipStyle: isDarkOverride
      ? { backgroundColor: "#09090b", borderColor: "#27272a", borderRadius: "8px", fontSize: "12px", color: "#fff", boxShadow: "0 4px 24px rgba(0,0,0,0.6)" }
      : { backgroundColor: "#ffffff", borderColor: "#e4e4e7", borderRadius: "8px", fontSize: "12px", color: "#111827", boxShadow: "0 4px 24px rgba(0,0,0,0.1)" },
    axisTickFill: isDarkOverride ? "#d4d4d8" : "#52525b",
    axisLine:     isDarkOverride ? "#3f3f46" : "#d4d4d8",
    grid:         isDarkOverride ? "#27272a" : "#e4e4e7",
    itemColor:    isDarkOverride ? "#e4e4e7" : "#374151",
    labelColor:   isDarkOverride ? "#a1a1aa" : "#6b7280",
    cursorFill:   isDarkOverride ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)",
  } as const : CT;

  // ── DCF assumption constants ──────────���────────────────────────────────────
  const TAX_RATE   = 0.25;   // 25% effective tax rate
  const CAPEX_PCT  = 0.035;  // 3.5% of revenue
  const WC_PCT     = 0.020;  // 2.0% working capital Δ % of revenue
  const TERMINAL_G = 0.025;  // 2.5% perpetual growth rate
  const RF         = 0.045;  // 4.5% risk-free rate (10-yr Treasury)
  const BETA       = 1.20;   // levered beta
  const RPM        = 0.055;  // 5.5% equity risk premium (Damodaran)
  const RPS        = 0.020;  // 2.0% size premium
  const RPCP       = 0.015;  // 1.5% company-specific risk
  const RPC_BASE   = 0.005;  // 0.5% country risk (base)
  const RPC_STRESS = 0.015;  // 1.5% country risk (stress)
  const RPP        = 0.000;  // portfolio premium
  const KD         = 0.060;  // 6.0% pre-tax cost of debt
  const D_WEIGHT   = 0.30;
  const E_WEIGHT   = 0.70;

  // ── Derived metrics ───────────���──────────────────────────���─────────────────
  const ebitda  = latest?.ebitda  ?? 0;
  const revenue = latest?.revenue ?? 0;
  const cash    = latest?.cash_balance ?? 0;

  const estTax   = ebitda > 0 ? ebitda * TAX_RATE : 0;
  const estCapex = revenue * CAPEX_PCT;
  const estWC    = revenue * WC_PCT;
  const fcff     = ebitda - estTax - estCapex - estWC;

  const rpc = scenario === "base" ? RPC_BASE : RPC_STRESS;
  const ke  = RF + BETA * RPM + RPS + RPCP + rpc + RPP;
  const wacc = D_WEIGHT * KD * (1 - TAX_RATE) + E_WEIGHT * ke;

  const hasEnoughData = fcff > 0 && wacc > TERMINAL_G;
  const ev          = hasEnoughData ? fcff / (wacc - TERMINAL_G) : null;
  const equityValue = ev != null ? ev + cash : null;

  // Pre-compute both scenarios (used when isExport=true to show both side-by-side)
  const keBase          = RF + BETA * RPM + RPS + RPCP + RPC_BASE + RPP;
  const waccBase        = D_WEIGHT * KD * (1 - TAX_RATE) + E_WEIGHT * keBase;
  const hasEnoughBase   = fcff > 0 && waccBase > TERMINAL_G;
  const evBase          = hasEnoughBase ? fcff / (waccBase - TERMINAL_G) : null;
  const equityBase      = evBase != null ? evBase + cash : null;

  const keStress        = RF + BETA * RPM + RPS + RPCP + RPC_STRESS + RPP;
  const waccStress      = D_WEIGHT * KD * (1 - TAX_RATE) + E_WEIGHT * keStress;
  const hasEnoughStress = fcff > 0 && waccStress > TERMINAL_G;
  const evStress        = hasEnoughStress ? fcff / (waccStress - TERMINAL_G) : null;
  const equityStress    = evStress != null ? evStress + cash : null;

  // ── FCFF waterfall data ──────────��──────────────────────��─────────────────
  const cumPostTax   = ebitda - estTax;
  const cumPostCapex = cumPostTax - estCapex;
  const waterfallData = [
    { name: "EBITDA", spacer: 0,             bar: ebitda,   isNeg: false, isResult: false },
    { name: "Tax",    spacer: cumPostTax,     bar: estTax,   isNeg: true,  isResult: false },
    { name: "CAPEX",  spacer: cumPostCapex,   bar: estCapex, isNeg: true,  isResult: false },
    { name: "Δ WC",   spacer: cumPostCapex - estWC, bar: estWC, isNeg: true, isResult: false },
    { name: "FCFF",   spacer: 0,             bar: Math.abs(fcff), isNeg: fcff < 0, isResult: true },
  ];

  // ── WACC input rows ───────────���─────────────────────────────��──────────────
  const inputRows = [
    { label: "Risk-free rate",        sym: "rᶠ",   val: `${(RF * 100).toFixed(1)}%` },
    { label: "Beta",                  sym: "β",    val: BETA.toFixed(2) },
    { label: "Equity risk premium",   sym: "rₚₘ",  val: `${(RPM * 100).toFixed(1)}%` },
    { label: "Size premium",          sym: "rₚₛ",  val: `${(RPS * 100).toFixed(1)}%` },
    { label: "Company-specific risk", sym: "rₚ꜀",  val: `${(RPCP * 100).toFixed(1)}%` },
    { label: "Country risk",          sym: "rₚ꜀ₚ", val: `${(rpc * 100).toFixed(1)}%` },
    { label: "Cost of equity",        sym: "Kₑ",   val: `${(ke * 100).toFixed(2)}%`, hi: true },
    { label: "Cost of debt",          sym: "Kd",   val: `${(KD * 100).toFixed(1)}%` },
    { label: "Tax rate",              sym: "t",    val: `${(TAX_RATE * 100).toFixed(0)}%` },
    { label: "Debt weight",           sym: "D/V",  val: `${(D_WEIGHT * 100).toFixed(0)}%` },
    { label: "WACC",                  sym: "WACC", val: `${(wacc * 100).toFixed(2)}%`, hi: true },
    { label: "Terminal growth",       sym: "g",    val: `${(TERMINAL_G * 100).toFixed(1)}%` },
  ];

  return (
    <motion.div
      key="valuation"
      variants={stagger}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      {/* ── Row 1: FCFF Waterfall + WACC Engine ─────────────────────────────── */}
      <div className="export-section w-full">
        {sectionHeader && (
          <h2 className="text-sm font-normal uppercase tracking-wide text-gray-500 dark:text-gray-400 border-b border-gray-300 dark:border-gray-800 pb-2 mb-6 mt-4 w-full">
            {sectionHeader}
          </h2>
        )}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[3fr_2fr] items-start pb-8">

        {/* Section A — FCFF Waterfall */}
        <motion.div variants={fadeUp}>
          <GlassPanel className="break-inside-avoid">
            <PanelHeader
              title="FCFF Waterfall Bridge"
              sub={`${latest?.period ?? "latest period"} · derived assumptions`}
            />
            <div className="h-[260px] px-2 pt-2 pb-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={waterfallData} barCategoryGap="28%">
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={chartTheme.grid} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: chartTheme.axisTickFill, fontSize: 11 }}
                    axisLine={{ stroke: chartTheme.axisLine }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: chartTheme.axisTickFill, fontSize: 11 }}
                    axisLine={{ stroke: chartTheme.axisLine }}
                    tickLine={false}
                    tickFormatter={(v) => compactNum(v).replace(/[A-Za-z]+$/, "")}
                    width={48}
                  />
                  <Tooltip
                    contentStyle={chartTheme.tooltipStyle}
                    itemStyle={{ color: chartTheme.itemColor }}
                    labelStyle={{ color: chartTheme.labelColor }}
                    formatter={(v, name) =>
                      name === "spacer"
                        ? null
                        : [fmtCurrency(v as number, cur), ""]
                    }
                    cursor={{ fill: chartTheme.cursorFill }}
                  />
                  {/* Invisible spacer floats the bars */}
                  <Bar dataKey="spacer" stackId="wf" fill="transparent" legendType="none" />
                  {/* Colored value bars */}
                  <Bar dataKey="bar" stackId="wf" name="Value" radius={[3, 3, 0, 0]}>
                    {waterfallData.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={
                          entry.isResult
                            ? entry.isNeg ? "#fca5a5" : "#00C875"
                            : entry.isNeg
                            ? "#fca5a5"
                            : "#a1a1aa"
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="px-5 pb-4">
              <p className="text-[10px] text-zinc-600 leading-relaxed">
                FCFF = EBITDA − est. taxes ({(TAX_RATE * 100).toFixed(0)}%) − est. CAPEX ({(CAPEX_PCT * 100).toFixed(1)}% rev.) − Δ working capital ({(WC_PCT * 100).toFixed(1)}% rev.)
              </p>
            </div>
          </GlassPanel>
        </motion.div>

        {/* Section B — WACC Engine */}
        <motion.div variants={fadeUp} className={isExport ? "mb-8" : ""}>
          <GlassPanel className={`${isExport ? "h-auto" : "h-full"} break-inside-avoid`}>
            <PanelHeader title="Cost of Capital Engine" />
            <div className={isExport ? "px-5 pb-8 pt-1" : "px-5 pb-5 pt-1 space-y-3"}>

              {!isExport && (
                <>
                  {/* WACC formula */}
                  <div className="rounded-xl border border-zinc-200 dark:border-zinc-800/60 bg-zinc-50 dark:bg-zinc-900/60 px-4 py-3">
                    <p className="text-[9px] uppercase tracking-[0.18em] text-zinc-600 mb-2">WACC</p>
                    <WaccFormula />
                  </div>

                  {/* CAPM formula */}
                  <div className="rounded-xl border border-zinc-200 dark:border-zinc-800/60 bg-zinc-50 dark:bg-zinc-900/60 px-4 py-3">
                    <p className="text-[9px] uppercase tracking-[0.18em] text-zinc-600 mb-2">Cost of Equity · CAPM</p>
                    <CAPMFormula />
                  </div>
                </>
              )}

              {/* Input rows */}
              <div className="space-y-[2px]">
                {inputRows.map((row) => (
                  <div
                    key={row.label}
                    className={cn(
                      "flex items-center justify-between rounded-lg px-3 py-1.5",
                      row.hi
                        ? "bg-zinc-100 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/30"
                        : "hover:bg-zinc-100/60 dark:hover:bg-white/[0.02] transition-colors"
                    )}
                  >
                    <span className="text-[11px] text-zinc-500">{row.label}</span>
                    <span
                      className={cn(
                        "font-mono text-[12px] tabular-nums",
                        row.hi ? "text-zinc-800 dark:text-zinc-200 font-medium" : "text-zinc-500 dark:text-zinc-400"
                      )}
                    >
                      {row.val}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </GlassPanel>
        </motion.div>
        </div>
        {isExport && <div className="h-8 w-full shrink-0 bg-transparent" />}
      </div>

      {/* ── Row 2: Value Conclusion ────────────────────────────────────────── */}
      {isExport ? (
        <>
          {/* ── Export: Base Case ── */}
          <div className="export-section w-full">
            <GlassPanel>
              <div className="px-5 pt-5 pb-3">
                <p className="text-xs uppercase tracking-widest text-zinc-500">Base Case Assumptions</p>
              </div>
              {hasEnoughBase && evBase != null && equityBase != null ? (
                <div className="grid grid-cols-1 gap-4 px-5 pb-6 sm:grid-cols-3">
                  <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800/40 bg-zinc-50 dark:bg-zinc-900/30 p-5">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Norm. FCFF</p>
                    <div className="mt-3 h-px w-8 bg-gradient-to-r from-zinc-700 to-transparent" />
                    <p className="mt-3 text-4xl font-light text-zinc-900 dark:text-white tabular-nums">
                      <NumberTicker value={fcff} format={currencyFmt} />
                    </p>
                    <p className="mt-1 font-mono text-[10px] text-zinc-500">{latest?.period}</p>
                  </div>
                  <div className="relative overflow-hidden rounded-2xl border border-indigo-500/20 bg-indigo-500/[0.04] p-5">
                    <div aria-hidden className="pointer-events-none absolute -top-8 left-1/2 h-32 w-32 -translate-x-1/2 rounded-full bg-indigo-500/10 blur-[40px]" />
                    <p className="relative text-[10px] uppercase tracking-[0.18em] text-zinc-500">Enterprise Value</p>
                    <div className="relative mt-3 h-px w-8 bg-gradient-to-r from-indigo-700/50 to-transparent" />
                    <p className="relative mt-3 text-4xl font-light text-zinc-900 dark:text-white tabular-nums">
                      <NumberTicker value={evBase} format={currencyFmt} delay={0.2} />
                    </p>
                    <p className="relative mt-1 font-mono text-[10px] text-zinc-500">
                      WACC {(waccBase * 100).toFixed(2)}% · g {(TERMINAL_G * 100).toFixed(1)}%
                    </p>
                  </div>
                  <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-5">
                    <div aria-hidden className="pointer-events-none absolute -top-8 left-1/2 h-32 w-32 -translate-x-1/2 rounded-full bg-emerald-500/10 blur-[40px]" />
                    <p className="relative text-[10px] uppercase tracking-[0.18em] text-zinc-500">FMV of Equity</p>
                    <div className="relative mt-3 h-px w-8 bg-gradient-to-r from-emerald-700/50 to-transparent" />
                    <p className="relative mt-3 text-4xl font-light text-[#00C875] tabular-nums">
                      <NumberTicker value={equityBase} format={currencyFmt} delay={0.4} />
                    </p>
                    <p className="relative mt-1 font-mono text-[10px] text-zinc-500">EV + cash · no debt assumed</p>
                  </div>
                </div>
              ) : (
                <div className="px-5 pb-6">
                  <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800/40 bg-zinc-50 dark:bg-zinc-900/30 p-8 text-center">
                    <p className="text-sm font-light text-zinc-500">Insufficient data to compute DCF valuation.</p>
                    <p className="mt-1 text-[11px] text-zinc-700">Requires positive EBITDA and revenue in the extracted metrics.</p>
                  </div>
                </div>
              )}
            </GlassPanel>
          </div>

          {/* ── Export: Stress Case ── */}
          <div className="export-section w-full mt-8 pb-6 mb-8">
            <GlassPanel>
              <div className="px-5 pt-5 pb-3">
                <p className="text-xs uppercase tracking-widest text-zinc-500">Stress Case Assumptions</p>
              </div>
              {hasEnoughStress && evStress != null && equityStress != null ? (
                <div className="grid grid-cols-1 gap-4 px-5 pb-6 sm:grid-cols-3">
                  <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800/40 bg-zinc-50 dark:bg-zinc-900/30 p-5">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Norm. FCFF</p>
                    <div className="mt-3 h-px w-8 bg-gradient-to-r from-zinc-700 to-transparent" />
                    <p className="mt-3 text-4xl font-light text-zinc-900 dark:text-white tabular-nums">
                      <NumberTicker value={fcff} format={currencyFmt} />
                    </p>
                    <p className="mt-1 font-mono text-[10px] text-zinc-500">{latest?.period}</p>
                  </div>
                  <div className="relative overflow-hidden rounded-2xl border border-indigo-500/20 bg-indigo-500/[0.04] p-5">
                    <div aria-hidden className="pointer-events-none absolute -top-8 left-1/2 h-32 w-32 -translate-x-1/2 rounded-full bg-indigo-500/10 blur-[40px]" />
                    <p className="relative text-[10px] uppercase tracking-[0.18em] text-zinc-500">Enterprise Value</p>
                    <div className="relative mt-3 h-px w-8 bg-gradient-to-r from-indigo-700/50 to-transparent" />
                    <p className="relative mt-3 text-4xl font-light text-zinc-900 dark:text-white tabular-nums">
                      <NumberTicker value={evStress} format={currencyFmt} delay={0.2} />
                    </p>
                    <p className="relative mt-1 font-mono text-[10px] text-zinc-500">
                      WACC {(waccStress * 100).toFixed(2)}% · g {(TERMINAL_G * 100).toFixed(1)}%
                    </p>
                  </div>
                  <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-5">
                    <div aria-hidden className="pointer-events-none absolute -top-8 left-1/2 h-32 w-32 -translate-x-1/2 rounded-full bg-emerald-500/10 blur-[40px]" />
                    <p className="relative text-[10px] uppercase tracking-[0.18em] text-zinc-500">FMV of Equity</p>
                    <div className="relative mt-3 h-px w-8 bg-gradient-to-r from-emerald-700/50 to-transparent" />
                    <p className="relative mt-3 text-4xl font-light text-[#00C875] tabular-nums">
                      <NumberTicker value={equityStress} format={currencyFmt} delay={0.4} />
                    </p>
                    <p className="relative mt-1 font-mono text-[10px] text-zinc-500">EV + cash · no debt assumed</p>
                  </div>
                </div>
              ) : (
                <div className="px-5 pb-6">
                  <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800/40 bg-zinc-50 dark:bg-zinc-900/30 p-8 text-center">
                    <p className="text-sm font-light text-zinc-500">Insufficient data to compute DCF valuation.</p>
                    <p className="mt-1 text-[11px] text-zinc-700">Requires positive EBITDA and revenue in the extracted metrics.</p>
                  </div>
                </div>
              )}
            </GlassPanel>
            <div className="h-8 w-full shrink-0 bg-transparent" />
          </div>
        </>
      ) : (
        <motion.div variants={fadeUp} className="export-section w-full">
          <GlassPanel>
            {/* Header + scenario toggle */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4">
              <div className="flex items-center gap-3">
                <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">
                  Value Conclusion
                </p>
                <div className="h-px w-24 bg-gradient-to-r from-zinc-800 to-transparent" />
              </div>
              <div className="flex rounded-xl border border-zinc-200 dark:border-zinc-800/60 bg-zinc-100 dark:bg-zinc-900/60 p-[3px] gap-[3px]">
                {(["base", "stress"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setScenario(s)}
                    className={cn(
                      "rounded-[8px] px-3 py-1 text-[10px] uppercase tracking-widest transition-colors duration-200",
                      scenario === s
                        ? "bg-white dark:bg-zinc-700/60 text-zinc-800 dark:text-zinc-200 shadow-sm"
                        : "text-zinc-500 dark:text-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-400"
                    )}
                  >
                    {s === "base" ? "Base" : "Stress"}
                  </button>
                ))}
              </div>
            </div>

            {hasEnoughData && ev != null && equityValue != null ? (
              <div className="grid grid-cols-1 gap-4 px-5 pb-6 sm:grid-cols-3">
                <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800/40 bg-zinc-50 dark:bg-zinc-900/30 p-5">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Norm. FCFF</p>
                  <div className="mt-3 h-px w-8 bg-gradient-to-r from-zinc-700 to-transparent" />
                  <p className="mt-3 text-4xl font-light text-zinc-900 dark:text-white tabular-nums">
                    <NumberTicker value={fcff} format={currencyFmt} />
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-zinc-500">{latest?.period}</p>
                </div>
                <div className="relative overflow-hidden rounded-2xl border border-indigo-500/20 bg-indigo-500/[0.04] p-5">
                  <div aria-hidden className="pointer-events-none absolute -top-8 left-1/2 h-32 w-32 -translate-x-1/2 rounded-full bg-indigo-500/10 blur-[40px]" />
                  <p className="relative text-[10px] uppercase tracking-[0.18em] text-zinc-500">Enterprise Value</p>
                  <div className="relative mt-3 h-px w-8 bg-gradient-to-r from-indigo-700/50 to-transparent" />
                  <p className="relative mt-3 text-4xl font-light text-zinc-900 dark:text-white tabular-nums">
                    <NumberTicker value={ev} format={currencyFmt} delay={0.2} />
                  </p>
                  <p className="relative mt-1 font-mono text-[10px] text-zinc-500">
                    WACC {(wacc * 100).toFixed(2)}% · g {(TERMINAL_G * 100).toFixed(1)}%
                  </p>
                </div>
                <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-5">
                  <div aria-hidden className="pointer-events-none absolute -top-8 left-1/2 h-32 w-32 -translate-x-1/2 rounded-full bg-emerald-500/10 blur-[40px]" />
                  <p className="relative text-[10px] uppercase tracking-[0.18em] text-zinc-500">FMV of Equity</p>
                  <div className="relative mt-3 h-px w-8 bg-gradient-to-r from-emerald-700/50 to-transparent" />
                  <p className="relative mt-3 text-4xl font-light text-[#00C875] tabular-nums">
                    <NumberTicker value={equityValue} format={currencyFmt} delay={0.4} />
                  </p>
                  <p className="relative mt-1 font-mono text-[10px] text-zinc-500">EV + cash · no debt assumed</p>
                </div>
              </div>
            ) : (
              <div className="px-5 pb-6">
                <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800/40 bg-zinc-50 dark:bg-zinc-900/30 p-8 text-center">
                  <p className="text-sm font-light text-zinc-500">Insufficient data to compute DCF valuation.</p>
                  <p className="mt-1 text-[11px] text-zinc-700">Requires positive EBITDA and revenue in the extracted metrics.</p>
                </div>
              </div>
            )}
          </GlassPanel>
        </motion.div>
      )}
    </motion.div>
  );
}

// ── ExportContent ─────────────────────────────────────────────────────────────
// Fully inline-styled so it renders correctly regardless of the global theme.
function ExportContent({ data, theme }: { data: ExtractedFinancials; theme: "dark" | "light" }) {
  const isDark = theme === "dark";
  const bg    = isDark ? "#09090b" : "#FAF9F6";
  const card  = isDark ? "#111111" : "#ffffff";
  const brd   = isDark ? "rgba(255,255,255,0.08)" : "#e5e7eb";
  const txt   = isDark ? "#fafafa" : "#111827";
  const muted = isDark ? "#71717a" : "#6b7280";
  const dim   = isDark ? "#52525b" : "#9ca3af";

  const cGrid = isDark ? "#27272a" : "#e4e4e7";
  const cAxis = isDark ? "#d4d4d8" : "#52525b";
  const cLine = isDark ? "#3f3f46" : "#d4d4d8";
  const cItem = isDark ? "#e4e4e7" : "#374151";
  const cLbl  = isDark ? "#a1a1aa" : "#6b7280";
  const cCur  = isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)";
  const cCurL = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";
  const tStyle: React.CSSProperties = { backgroundColor: card, borderColor: brd, borderRadius: 8, fontSize: 11, color: txt };

  const cur = data.reporting_currency;
  const latest = [...data.metrics].reverse().find((m) => !m.is_projected) ?? data.metrics.at(-1);
  const chartData = data.metrics.map((m) => ({
    period: m.period,
    revenue: m.revenue,
    ebitda: m.ebitda,
    cash: m.cash_balance,
    gross_margin_pct: m.gross_margin_pct,
    ebitda_margin_pct: m.ebitda != null && m.revenue ? (m.ebitda / m.revenue) * 100 : null,
    net_income: m.net_income,
  }));

  const fmtC = (v: number | null | undefined) =>
    v == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: cur, notation: "compact", maximumFractionDigits: 1 }).format(v);
  const fmtPctE = (v: number | null | undefined) => v == null ? "—" : `${v.toFixed(1)}%`;
  const fmtRatioE = (v: number | null | undefined) => v == null ? "—" : `${v.toFixed(1)}×`;
  const fmtMoE = (v: number | null | undefined) => v == null ? "—" : `${v.toFixed(1)} mo`;

  const chartMax = Math.max(1, ...chartData.flatMap((d) => [Math.abs(d.revenue ?? 0), Math.abs(d.ebitda ?? 0), Math.abs(d.cash ?? 0), Math.abs(d.net_income ?? 0)]));
  const unit = chartMax >= 1e9 ? `billions · ${cur}` : chartMax >= 1e6 ? `millions · ${cur}` : chartMax >= 1e3 ? `thousands · ${cur}` : cur;

  const secPad: React.CSSProperties = { backgroundColor: bg, padding: 0, paddingBottom: 24, width: "100%" };
  const panelStyle = (extra?: React.CSSProperties): React.CSSProperties => ({ borderRadius: 12, border: `1px solid ${brd}`, backgroundColor: card, overflow: "hidden", ...extra });
  const panelHeader = (title: string, sub?: string) => (
    <div style={{ padding: "14px 16px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <p style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: muted, margin: 0 }}>{title}</p>
        <div style={{ flex: 1, height: 1, background: `linear-gradient(to right, ${brd}, transparent)` }} />
      </div>
      {sub && <p style={{ fontSize: 9, color: dim, letterSpacing: "0.1em", textTransform: "uppercase", margin: "4px 0 0" }}>{sub}</p>}
    </div>
  );
  const sectionLabel = (label: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
      <p style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: dim, whiteSpace: "nowrap", margin: 0 }}>{label}</p>
      <div style={{ flex: 1, height: 1, backgroundColor: brd }} />
    </div>
  );

  const kpiCards = [
    { label: "Revenue",      value: fmtC(latest?.revenue),       sub: latest?.period },
    { label: "EBITDA",       value: fmtC(latest?.ebitda),         sub: latest?.period, color: (latest?.ebitda ?? 0) >= 0 ? "#00C875" : (isDark ? "#fca5a5" : "#b91c1c") },
    { label: "Cash Balance", value: fmtC(latest?.cash_balance),   sub: latest?.period },
    { label: "Runway",       value: fmtMoE(latest?.implied_runway_months), sub: "implied" },
  ];

  return (
    <div style={{ width: 1400, backgroundColor: bg, fontFamily: "var(--font-geist-sans, system-ui, sans-serif)" }}>

      {/* ── Section 1: Header + KPI grid ── */}
      <div className="export-section w-full" style={{ ...secPad, paddingTop: 36, paddingBottom: 28 }}>
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.2em", textTransform: "uppercase", color: muted, margin: 0 }}>
            Asymmetrica · Investment Due Diligence
          </p>
          <h1 style={{ fontSize: 30, fontWeight: 300, color: txt, margin: "6px 0 0", letterSpacing: "-0.02em" }}>{data.company_name}</h1>
          <p style={{ fontSize: 10, color: muted, margin: "4px 0 0", letterSpacing: "0.12em", textTransform: "uppercase" }}>
            {data.reporting_period_type} · {cur} · {Math.round(data.confidence_score * 100)}% confidence
          </p>
        </div>
        <div style={{
          fontSize: 14, fontWeight: 400, textTransform: "uppercase", letterSpacing: "0.025em",
          color: isDark ? "#9ca3af" : "#6b7280",
          borderBottom: `1px solid ${isDark ? "#1f2937" : "#d1d5db"}`,
          paddingBottom: 8, marginBottom: 24, marginTop: 16, width: "100%",
        }}>
          Operating Metrics
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {kpiCards.map(({ label, value, sub, color }) => (
            <div key={label} style={panelStyle({ padding: "16px 20px" })}>
              <p style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: muted, margin: 0 }}>{label}</p>
              <div style={{ height: 1, width: 32, background: `linear-gradient(to right, ${dim}, transparent)`, margin: "10px 0" }} />
              <p style={{ fontSize: 32, fontWeight: 300, color: color ?? txt, margin: 0, lineHeight: 1 }}>{value}</p>
              {sub && <p style={{ fontSize: 10, color: dim, margin: "6px 0 0" }}>{sub}</p>}
            </div>
          ))}
        </div>
      </div>

      {/* ── Section 2: Revenue vs EBITDA + Cash Balance ── */}
      <div className="export-section w-full" style={secPad}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={panelStyle()}>
            {panelHeader("Revenue vs EBITDA", `in ${unit}`)}
            <div style={{ height: 230, padding: "8px 4px 4px" }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} barGap={3} barCategoryGap="32%">
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={cGrid} />
                  <XAxis dataKey="period" tick={{ fill: cAxis, fontSize: 10 }} axisLine={{ stroke: cLine }} tickLine={false} />
                  <YAxis tick={{ fill: cAxis, fontSize: 10 }} axisLine={{ stroke: cLine }} tickLine={false} tickFormatter={(v) => compactNum(v).replace(/[A-Za-z]+$/, "")} width={44} />
                  <Tooltip contentStyle={tStyle} itemStyle={{ color: cItem }} labelStyle={{ color: cLbl }} formatter={(v) => fmtC(v as number)} cursor={{ fill: cCur }} />
                  <Legend wrapperStyle={{ fontSize: 9, color: cAxis, paddingTop: 6 }} iconType="square" iconSize={6} />
                  <ReferenceLine y={0} stroke={P.zero} />
                  <Bar dataKey="revenue" name="Revenue" radius={[3,3,0,0]} fill={P.revenue} isAnimationActive={false} />
                  <Bar dataKey="ebitda" name="EBITDA" fill={P.ebitdaPos} radius={[3,3,0,0]} isAnimationActive={false}>
                    {chartData.map((e, i) => <Cell key={i} fill={(e.ebitda ?? 0) >= 0 ? P.ebitdaPos : P.ebitdaNeg} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div style={panelStyle()}>
            {panelHeader("Cash Balance", `in ${unit}`)}
            <div style={{ height: 230, padding: "8px 4px 4px" }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={cGrid} />
                  <XAxis dataKey="period" tick={{ fill: cAxis, fontSize: 10 }} axisLine={{ stroke: cLine }} tickLine={false} padding={{ left: 20, right: 20 }} />
                  <YAxis tick={{ fill: cAxis, fontSize: 10 }} axisLine={{ stroke: cLine }} tickLine={false} tickFormatter={(v) => compactNum(v).replace(/[A-Za-z]+$/, "")} width={44} />
                  <Tooltip contentStyle={tStyle} itemStyle={{ color: cItem }} labelStyle={{ color: cLbl }} formatter={(v) => fmtC(v as number)} cursor={{ stroke: cCurL }} />
                  <Line type="monotone" dataKey="cash" name="Cash" stroke={P.cash} strokeWidth={1.5} dot={{ r: 2.5, fill: P.cash, strokeWidth: 0 }} activeDot={{ r: 4, strokeWidth: 0 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* ── Section 3: Margin Evolution + Profitability ── */}
      <div className="export-section w-full" style={secPad}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={panelStyle()}>
            {panelHeader("Margin Evolution", "in percent")}
            <div style={{ height: 230, padding: "8px 4px 4px" }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={cGrid} />
                  <XAxis dataKey="period" tick={{ fill: cAxis, fontSize: 10 }} axisLine={{ stroke: cLine }} tickLine={false} padding={{ left: 20, right: 20 }} />
                  <YAxis tick={{ fill: cAxis, fontSize: 10 }} axisLine={{ stroke: cLine }} tickLine={false} tickFormatter={(v) => `${v.toFixed(0)}%`} width={40} />
                  <Tooltip contentStyle={tStyle} itemStyle={{ color: cItem }} labelStyle={{ color: cLbl }} formatter={(v) => `${(v as number).toFixed(1)}%`} cursor={{ stroke: cCurL }} />
                  <Legend wrapperStyle={{ fontSize: 9, color: cAxis, paddingTop: 6 }} iconType="square" iconSize={6} />
                  <ReferenceLine y={0} stroke={P.zero} />
                  <Line type="monotone" dataKey="gross_margin_pct" name="Gross Margin" stroke={P.grossMargin} strokeWidth={1.5} dot={{ r: 2.5, fill: P.grossMargin, strokeWidth: 0 }} activeDot={{ r: 4, strokeWidth: 0 }} connectNulls isAnimationActive={false} />
                  <Line type="monotone" dataKey="ebitda_margin_pct" name="EBITDA Margin" stroke={P.ebitdaMargin} strokeWidth={1.5} strokeDasharray="4 3" dot={{ r: 2.5, fill: P.ebitdaMargin, strokeWidth: 0 }} activeDot={{ r: 4, strokeWidth: 0 }} connectNulls isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div style={panelStyle()}>
            {panelHeader("Profitability Conversion", `in ${unit}`)}
            <div style={{ height: 230, padding: "8px 4px 4px" }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} barGap={4} barCategoryGap="30%">
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={cGrid} />
                  <XAxis dataKey="period" tick={{ fill: cAxis, fontSize: 10 }} axisLine={{ stroke: cLine }} tickLine={false} />
                  <YAxis tick={{ fill: cAxis, fontSize: 10 }} axisLine={{ stroke: cLine }} tickLine={false} tickFormatter={(v) => compactNum(v).replace(/[A-Za-z]+$/, "")} width={44} />
                  <Tooltip contentStyle={tStyle} itemStyle={{ color: cItem }} labelStyle={{ color: cLbl }} formatter={(v) => fmtC(v as number)} cursor={{ fill: cCur }} />
                  <Legend wrapperStyle={{ fontSize: 9, color: cAxis, paddingTop: 6 }} iconType="square" iconSize={6} />
                  <ReferenceLine y={0} stroke={P.zero} />
                  <Bar dataKey="ebitda" name="EBITDA" fill={P.ebitdaPos} radius={[3,3,0,0]} isAnimationActive={false}>
                    {chartData.map((e, i) => <Cell key={i} fill={(e.ebitda ?? 0) >= 0 ? P.ebitdaPos : P.ebitdaNeg} />)}
                  </Bar>
                  <Bar dataKey="net_income" name="Net Income" fill={P.netIncome} radius={[3,3,0,0]} isAnimationActive={false}>
                    {chartData.map((e, i) => <Cell key={i} fill={(e.net_income ?? 0) >= 0 ? P.netIncome : P.ebitdaNeg} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* ── Section 4: Metrics table ── */}
      <div className="export-section w-full" style={secPad}>
        <div style={panelStyle({ padding: "16px 0 8px" })}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 16px 12px" }}>
            <p style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: muted, margin: 0 }}>Extracted Metrics by Period</p>
            <div style={{ flex: 1, height: 1, background: `linear-gradient(to right, ${brd}, transparent)` }} />
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${brd}` }}>
                {["Period", "Revenue", "Gross Margin", "EBITDA", "Net Income", "Cash", "Burn/mo", "Runway", "CAC", "LTV", "LTV/CAC"].map((h, i) => (
                  <th key={h} style={{ padding: "0 12px 8px", textAlign: i === 0 ? "left" : "right", fontSize: 8, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: muted }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.metrics.map((m, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${brd}` }}>
                  <td style={{ padding: "6px 12px", color: txt, fontWeight: 300 }}>{m.period}{m.is_projected && <span style={{ marginLeft: 6, fontSize: 8, padding: "1px 4px", borderRadius: 3, backgroundColor: "rgba(245,158,11,0.1)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.2)" }}>proj</span>}</td>
                  <td style={{ padding: "6px 12px", textAlign: "right", color: txt, fontWeight: 300, fontVariantNumeric: "tabular-nums" }}>{fmtC(m.revenue)}</td>
                  <td style={{ padding: "6px 12px", textAlign: "right", color: txt, fontWeight: 300, fontVariantNumeric: "tabular-nums" }}>{fmtPctE(m.gross_margin_pct)}</td>
                  <td style={{ padding: "6px 12px", textAlign: "right", color: m.ebitda == null ? dim : m.ebitda >= 0 ? "#00C875" : (isDark ? "#fca5a5" : "#b91c1c"), fontWeight: 300, fontVariantNumeric: "tabular-nums" }}>{fmtC(m.ebitda)}</td>
                  <td style={{ padding: "6px 12px", textAlign: "right", color: m.net_income == null ? dim : m.net_income >= 0 ? "#00C875" : (isDark ? "#fca5a5" : "#b91c1c"), fontWeight: 300, fontVariantNumeric: "tabular-nums" }}>{fmtC(m.net_income)}</td>
                  <td style={{ padding: "6px 12px", textAlign: "right", color: txt, fontWeight: 300, fontVariantNumeric: "tabular-nums" }}>{fmtC(m.cash_balance)}</td>
                  <td style={{ padding: "6px 12px", textAlign: "right", color: txt, fontWeight: 300, fontVariantNumeric: "tabular-nums" }}>{fmtC(m.monthly_burn_rate)}</td>
                  <td style={{ padding: "6px 12px", textAlign: "right", color: txt, fontWeight: 300, fontVariantNumeric: "tabular-nums" }}>{fmtMoE(m.implied_runway_months)}</td>
                  <td style={{ padding: "6px 12px", textAlign: "right", color: txt, fontWeight: 300, fontVariantNumeric: "tabular-nums" }}>{fmtC(m.cac)}</td>
                  <td style={{ padding: "6px 12px", textAlign: "right", color: txt, fontWeight: 300, fontVariantNumeric: "tabular-nums" }}>{fmtC(m.ltv)}</td>
                  <td style={{ padding: "6px 12px", textAlign: "right", color: txt, fontWeight: 300, fontVariantNumeric: "tabular-nums" }}>{fmtRatioE(m.ltv_to_cac_ratio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}

// ── PDF export ───────────────────────────────────────────────────────────────
async function exportPdf(
  exportEl: HTMLElement,
  companyName: string,
  onProgress: (s: string) => void,
  bgColor: string
) {
  onProgress("Rendering layout…");
  await new Promise<void>((r) => setTimeout(r, 2000));

  const { toPng } = await import("html-to-image");
  const jsPDF = (await import("jspdf")).default;

  const sections = Array.from(exportEl.querySelectorAll<HTMLElement>(".export-section"));
  if (sections.length === 0) throw new Error("No .export-section elements found");

  // Parse bgColor hex → RGB for page fill
  const bgR = parseInt(bgColor.slice(1, 3), 16);
  const bgG = parseInt(bgColor.slice(3, 5), 16);
  const bgB = parseInt(bgColor.slice(5, 7), 16);

  const pdf = new jsPDF("l", "mm", "a4");
  const pageWidth = 297;
  const pageHeight = 210;
  const marginX = 12;   // left / right gutter
  const marginY = 6;    // top / bottom gutter
  let currentY = marginY;
  let firstSection = true;

  // Paint the first page background before placing any images
  pdf.setFillColor(bgR, bgG, bgB);
  pdf.rect(0, 0, pageWidth, pageHeight, "F");

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    onProgress(`Capturing section ${i + 1} of ${sections.length}…`);
    const imgData = await toPng(section, { backgroundColor: bgColor, pixelRatio: 2 });
    const imgProps = pdf.getImageProperties(imgData);
    const scaledHeight = (imgProps.height * (pageWidth - marginX * 2)) / imgProps.width;

    if (!firstSection && currentY + scaledHeight > pageHeight - marginY && currentY !== marginY) {
      pdf.addPage();
      currentY = marginY;
      // Paint new page background before placing image
      pdf.setFillColor(bgR, bgG, bgB);
      pdf.rect(0, 0, pageWidth, pageHeight, "F");
    }
    pdf.addImage(imgData, "PNG", marginX, currentY, pageWidth - marginX * 2, scaledHeight);
    currentY += scaledHeight + 4;
    firstSection = false;
  }

  onProgress("Downloading…");
  pdf.save(`${companyName.toLowerCase().replace(/\s+/g, "-")}-tear-sheet.pdf`);
}

// ── Export modal ─────────────────────────────────────────────────────────────
interface ExportModalProps {
  data: ExtractedFinancials;
  fileName: string;
  tearSheetRef: React.RefObject<HTMLDivElement | null>;
  exportTheme: "dark" | "light";
  onExportThemeChange: (t: "dark" | "light") => void;
  onClose: () => void;
}

function ExportModal({ data, fileName, tearSheetRef, exportTheme, onExportThemeChange, onClose }: ExportModalProps) {
  const [status, setStatus] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const bgColor = exportTheme === "dark" ? "#09090b" : "#FAF9F6";

  const cur = data.reporting_currency;
  const latest: FinancialMetrics | undefined =
    [...data.metrics].reverse().find((m) => !m.is_projected) ??
    data.metrics[data.metrics.length - 1];
  const currencyFmt = useCallback(
    (v: number) =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: cur,
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(v),
    [cur]
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleDownload() {
    if (!tearSheetRef.current) return;
    try {
      await exportPdf(tearSheetRef.current, data.company_name, setStatus, bgColor);
      setDone(true);
      setStatus(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`Export failed: ${msg}`);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ backdropFilter: "blur(12px)", backgroundColor: "rgba(9,9,11,0.8)" }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0, transition: { type: "spring", stiffness: 72, damping: 18 } }}
          exit={{ opacity: 0, scale: 0.96, y: 10, transition: { duration: 0.15 } }}
          className="relative w-full max-w-5xl rounded-2xl border border-zinc-200 dark:border-zinc-800/60 bg-white dark:bg-zinc-950 shadow-2xl overflow-y-auto max-h-[95vh]"
        >
          <button onClick={onClose} className="absolute right-4 top-4 rounded-lg p-1.5 text-zinc-500 transition-colors hover:text-zinc-800 dark:hover:text-zinc-200">
            <X className="size-4" />
          </button>

          <div className="p-6">
            {/* Header row: title + export theme toggle */}
            <div className="flex items-start justify-between gap-4 pr-8">
              <div>
                <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-500 mb-1">Export</p>
                <h3 className="text-lg font-light text-zinc-900 dark:text-white tracking-tight">
                  {fileName || "Financial Tear-Sheet"}
                </h3>
                <p className="mt-1 text-[11px] text-zinc-500">
                  Landscape A4 · {exportTheme === "dark" ? "Dark" : "Light"} theme
                </p>
              </div>

              {/* Export theme toggle */}
              <div className="flex shrink-0 items-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800/60 bg-zinc-100 dark:bg-zinc-900/60 p-[3px]">
                {(["dark", "light"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => onExportThemeChange(t)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[10px] uppercase tracking-widest transition-colors duration-200",
                      exportTheme === t
                        ? "bg-white dark:bg-zinc-700/60 text-zinc-900 dark:text-zinc-100 shadow-sm"
                        : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                    )}
                  >
                    {t === "dark" ? <Moon className="size-3" /> : <Sun className="size-3" />}
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 h-px bg-zinc-200 dark:bg-zinc-800/60" />

            {/* Live preview */}
            <div
              className="mt-5 rounded-xl border border-zinc-200 dark:border-zinc-800/50 overflow-y-auto overflow-x-hidden flex justify-center items-start"
              style={{ maxHeight: "60vh", backgroundColor: bgColor }}
            >
              <div style={{ zoom: 0.64, pointerEvents: "none", userSelect: "none", width: 1200, flexShrink: 0, transformOrigin: "top center" }}>
                <ExportContent data={data} theme={exportTheme} />
                <MotionConfig reducedMotion="always">
                  <div
                    className={exportTheme === "dark" ? "dark w-full" : "w-full"}
                    style={{ backgroundColor: bgColor, padding: 0 }}
                  >
                    <ValuationView
                      data={data}
                      latest={latest}
                      cur={cur}
                      currencyFmt={currencyFmt}
                      themeOverride={exportTheme}
                      sectionHeader="Valuation Analysis"
                      isExport={true}
                    />
                  </div>
                </MotionConfig>
              </div>
            </div>

            {(status || done) && (
              <div className={cn(
                "mt-4 flex items-center gap-2 rounded-xl px-4 py-2.5 text-[11px]",
                done ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-300" : "bg-zinc-100 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-400"
              )}>
                {!done && <Loader2 className="size-3.5 animate-spin shrink-0" />}
                <span>{done ? "PDF downloaded successfully." : status}</span>
              </div>
            )}

            <div className="mt-5 flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-800/60 bg-zinc-50 dark:bg-zinc-900/50 py-2.5 text-[11px] uppercase tracking-widest text-zinc-500 transition-colors hover:text-zinc-700 dark:hover:text-zinc-300"
              >
                Cancel
              </button>
              <button
                onClick={handleDownload}
                disabled={!!status}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-[11px] uppercase tracking-widest transition-all",
                  status
                    ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600 cursor-not-allowed"
                    : "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-white"
                )}
              >
                <FileDown className="size-3.5" />
                {status ? "Working…" : "Download PDF"}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export function InvestorDashboard({ data, fileName = "" }: { data: ExtractedFinancials; fileName?: string }) {
  const cur = data.reporting_currency;
  const CT = useChartTheme();
  const { resolvedTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<"metrics" | "valuation">("metrics");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportTheme, setExportTheme] = useState<"dark" | "light">("dark");
  const tearSheetRef = useRef<HTMLDivElement>(null);

  // Sync exportTheme default whenever modal opens
  useEffect(() => {
    if (exportOpen) setExportTheme(resolvedTheme === "light" ? "light" : "dark");
  }, [exportOpen, resolvedTheme]);

  const latest: FinancialMetrics | undefined =
    [...data.metrics].reverse().find((m) => !m.is_projected) ??
    data.metrics[data.metrics.length - 1];

  const chartData = data.metrics.map((m) => {
    const ebitda_margin_pct =
      m.ebitda != null && m.revenue != null && m.revenue !== 0
        ? (m.ebitda / m.revenue) * 100
        : null;
    return {
      period: m.period,
      revenue: m.revenue,
      ebitda: m.ebitda,
      cash: m.cash_balance,
      gross_margin_pct: m.gross_margin_pct,
      ebitda_margin_pct,
      net_income: m.net_income,
      projected: m.is_projected,
    };
  });

  const runway =
    latest?.implied_runway_months ??
    (latest?.cash_balance != null &&
    latest?.monthly_burn_rate != null &&
    latest.monthly_burn_rate > 0
      ? latest.cash_balance / latest.monthly_burn_rate
      : null);

  const currencyFmt = useCallback(
    (v: number) =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: cur,
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(v),
    [cur]
  );

  const monthsFmt = useCallback((v: number) => `${v.toFixed(1)} mo`, []);

  // Detect dominant magnitude for the currency unit subtitle
  const chartMaxAbs = Math.max(
    1,
    ...chartData.flatMap((d) => [
      Math.abs(d.revenue ?? 0),
      Math.abs(d.ebitda ?? 0),
      Math.abs(d.cash ?? 0),
      Math.abs(d.net_income ?? 0),
    ])
  );
  const currencyUnit =
    chartMaxAbs >= 1e9
      ? `in billions · ${cur}`
      : chartMaxAbs >= 1e6
      ? `in millions · ${cur}`
      : chartMaxAbs >= 1e3
      ? `in thousands · ${cur}`
      : cur;

  return (
    <div className="relative w-full max-w-[1100px] px-4 pb-12">
      {/* ── Background layers ─────────────────────���───────────────────────── */}

      {/* Dot matrix */}
      <DotPattern
        width={22}
        height={22}
        cx={1}
        cy={1}
        cr={1}
        className="fill-white/[0.018] [mask-image:radial-gradient(ellipse_70%_50%_at_50%_0%,black_30%,transparent_100%)] print:hidden"
      />

      {/* Luminous Engine blobs */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden print:hidden"
      >
        <div className="absolute -top-32 left-1/2 h-[480px] w-[640px] -translate-x-1/2 rounded-full bg-indigo-500/[0.05] blur-[100px]" />
        <div className="absolute top-1/3 right-1/4 h-[280px] w-[280px] rounded-full bg-slate-400/[0.04] blur-[80px]" />
        <div className="absolute bottom-0 left-1/4 h-[200px] w-[400px] rounded-full bg-zinc-500/[0.04] blur-[80px]" />
      </div>

      {/* ── Print-only memo header ────────────────────────────────────────── */}
      <div className="hidden print:block mb-4">
        <p className="text-[10px] uppercase tracking-widest text-zinc-500">
          Due Diligence Memo
        </p>
        <h1 className="text-2xl font-light tracking-tight text-zinc-900 dark:text-white mt-1">
          {data.company_name}
        </h1>
        <p className="text-xs text-zinc-500 mt-1">
          {data.reporting_period_type.charAt(0).toUpperCase() +
            data.reporting_period_type.slice(1)}{" "}
          · {cur} · Confidence {Math.round(data.confidence_score * 100)}%
        </p>
        <div className="mt-3 h-px bg-zinc-200 dark:bg-zinc-800" />
      </div>

      {/* ── Animated content ──────────────────────────────────────────���──── */}
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="relative space-y-5"
      >
        {/* Header */}
        <motion.div
          variants={fadeUp}
          className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-start sm:justify-between"
          data-print-hide
        >
          <div>
            <h2 className="text-2xl font-light tracking-tight text-zinc-900 dark:text-white">
              {data.company_name}
            </h2>
            <p className="mt-0.5 text-[11px] uppercase tracking-[0.16em] text-zinc-500">
              {data.reporting_period_type} · {cur} ·{" "}
              {Math.round(data.confidence_score * 100)}% confidence
            </p>
          </div>
          <button
            onClick={() => setExportOpen(true)}
            className="mt-1 inline-flex items-center gap-2 self-start rounded-xl border border-zinc-200 dark:border-zinc-800/60 bg-white dark:bg-zinc-900/50 px-4 py-2 text-[11px] uppercase tracking-widest text-zinc-500 dark:text-zinc-400 backdrop-blur-sm transition-colors hover:border-zinc-300 dark:hover:border-zinc-700 hover:text-zinc-800 dark:hover:text-zinc-200"
            data-print-hide
          >
            <FileDown className="size-3.5" />
            Export PDF
          </button>
        </motion.div>

        {/* Tab navigation */}
        <motion.div variants={fadeUp} data-print-hide>
          <div className="inline-flex rounded-2xl border border-zinc-200 dark:border-zinc-800/50 bg-zinc-100 dark:bg-zinc-900/40 backdrop-blur-sm p-[3px] gap-[3px]">
            {(["metrics", "valuation"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "rounded-[calc(1rem-3px)] px-5 py-2 text-[11px] uppercase tracking-[0.16em] transition-all duration-200",
                  activeTab === tab
                    ? "bg-white dark:bg-zinc-700/60 text-zinc-900 dark:text-zinc-200 shadow-sm"
                    : "text-zinc-500 dark:text-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-400"
                )}
              >
                {tab === "metrics" ? "Operating Metrics" : "Valuation Analysis"}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Tab content */}
        <AnimatePresence mode="wait">
          {activeTab === "metrics" ? (
            <motion.div
              key="metrics"
              initial={{ opacity: 0, y: 16, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)", transition: { type: "spring" as const, stiffness: 72, damping: 20 } }}
              exit={{ opacity: 0, y: -8, filter: "blur(4px)", transition: { duration: 0.18 } }}
              className="space-y-5"
            >
              {/* KPI grid */}
              <motion.div
                variants={kpiStagger}
                initial="hidden"
                animate="show"
                className="grid grid-cols-2 gap-3 sm:grid-cols-4"
              >
                <KpiCard
                  label="Revenue"
                  rawValue={latest?.revenue}
                  formatFn={currencyFmt}
                  sub={latest?.period}
                />
                <KpiCard
                  label="EBITDA"
                  rawValue={latest?.ebitda}
                  formatFn={currencyFmt}
                  sub={latest?.period}
                  valueClass={
                    latest?.ebitda == null
                      ? ""
                      : latest.ebitda >= 0
                      ? "text-[#00C875] dark:text-[#00C875]"
                      : "text-red-600 dark:text-red-400"
                  }
                />
                <KpiCard
                  label="Cash Balance"
                  rawValue={latest?.cash_balance}
                  formatFn={currencyFmt}
                  sub={latest?.period}
                />
                <KpiCard
                  label="Runway"
                  rawValue={runway}
                  formatFn={monthsFmt}
                  sub="implied"
                  icon={runwayIcon(runway)}
                  valueClass={runwayClass(runway)}
                />
              </motion.div>

              {/* Charts 2×2 grid */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 print:grid-cols-1">

                {/* Chart 1 — Revenue vs EBITDA */}
                <GlassPanel className="break-inside-avoid">
                  <PanelHeader title="Revenue vs EBITDA" sub={currencyUnit} />
                  <div className="h-[230px] px-2 pt-4 pb-2 print:h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} barGap={3} barCategoryGap="32%">
                        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={CT.grid} />
                        <XAxis
                          dataKey="period"
                          tick={{ fill: CT.axisTickFill, fontSize: 12 }}
                          axisLine={{ stroke: CT.axisLine }}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fill: CT.axisTickFill, fontSize: 12 }}
                          axisLine={{ stroke: CT.axisLine }}
                          tickLine={false}
                          tickFormatter={(v) => compactNum(v).replace(/[A-Za-z]+$/, "")}
                          width={48}
                        />
                        <Tooltip
                          contentStyle={CT.tooltipStyle}
                          itemStyle={{ color: CT.itemColor }}
                          labelStyle={{ color: CT.labelColor }}
                          formatter={(v) => fmtCurrency(v as number, cur)}
                          cursor={{ fill: CT.cursorFill }}
                        />
                        <Legend
                          wrapperStyle={{ fontSize: 10, color: CT.legendColor, paddingTop: 8 }}
                          iconType="square"
                          iconSize={7}
                        />
                        <ReferenceLine y={0} stroke={P.zero} />
                        <Bar
                          dataKey="revenue"
                          name="Revenue"
                          radius={[3, 3, 0, 0]}
                          fill={P.revenue}
                        />
                        <Bar dataKey="ebitda" name="EBITDA" fill={P.ebitdaPos} radius={[3, 3, 0, 0]}>
                          {chartData.map((entry, i) => (
                            <Cell
                              key={i}
                              fill={(entry.ebitda ?? 0) >= 0 ? P.ebitdaPos : P.ebitdaNeg}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </GlassPanel>

                {/* Chart 2 — Cash Balance */}
                <GlassPanel className="break-inside-avoid">
                  <PanelHeader title="Cash Balance" sub={currencyUnit} />
                  <div className="h-[230px] px-2 pt-4 pb-2 print:h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <defs>
                          <linearGradient id="cashGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={P.cash} stopOpacity={0.2} />
                            <stop offset="95%" stopColor={P.cash} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={CT.grid} />
                        <XAxis
                          dataKey="period"
                          tick={{ fill: CT.axisTickFill, fontSize: 12 }}
                          axisLine={{ stroke: CT.axisLine }}
                          tickLine={false}
                          padding={{ left: 30, right: 30 }}
                        />
                        <YAxis
                          tick={{ fill: CT.axisTickFill, fontSize: 12 }}
                          axisLine={{ stroke: CT.axisLine }}
                          tickLine={false}
                          tickFormatter={(v) => compactNum(v).replace(/[A-Za-z]+$/, "")}
                          width={48}
                        />
                        <Tooltip
                          contentStyle={CT.tooltipStyle}
                          itemStyle={{ color: CT.itemColor }}
                          labelStyle={{ color: CT.labelColor }}
                          formatter={(v) => fmtCurrency(v as number, cur)}
                          cursor={{ stroke: CT.cursorStroke }}
                        />
                        <Line
                          type="monotone"
                          dataKey="cash"
                          name="Cash"
                          stroke={P.cash}
                          strokeWidth={1.5}
                          dot={{ r: 2.5, fill: P.cash, strokeWidth: 0 }}
                          activeDot={{ r: 4, strokeWidth: 0 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </GlassPanel>

                {/* Chart 3 — Margin Evolution */}
                <GlassPanel className="break-inside-avoid">
                  <PanelHeader title="Margin Evolution" sub="in percent" />
                  <div className="h-[230px] px-2 pt-4 pb-2 print:h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <defs>
                          <filter id="glowIndigo" x="-20%" y="-20%" width="140%" height="140%">
                            <feGaussianBlur stdDeviation="3" result="blur" />
                            <feMerge>
                              <feMergeNode in="blur" />
                              <feMergeNode in="SourceGraphic" />
                            </feMerge>
                          </filter>
                          <filter id="glowPurple" x="-20%" y="-20%" width="140%" height="140%">
                            <feGaussianBlur stdDeviation="3" result="blur" />
                            <feMerge>
                              <feMergeNode in="blur" />
                              <feMergeNode in="SourceGraphic" />
                            </feMerge>
                          </filter>
                        </defs>
                        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={CT.grid} />
                        <XAxis
                          dataKey="period"
                          tick={{ fill: CT.axisTickFill, fontSize: 12 }}
                          axisLine={{ stroke: CT.axisLine }}
                          tickLine={false}
                          padding={{ left: 30, right: 30 }}
                        />
                        <YAxis
                          tick={{ fill: CT.axisTickFill, fontSize: 12 }}
                          axisLine={{ stroke: CT.axisLine }}
                          tickLine={false}
                          tickFormatter={(v) => `${v.toFixed(0)}%`}
                          width={44}
                        />
                        <Tooltip
                          contentStyle={CT.tooltipStyle}
                          itemStyle={{ color: CT.itemColor }}
                          labelStyle={{ color: CT.labelColor }}
                          formatter={(v) => `${(v as number).toFixed(1)}%`}
                          cursor={{ stroke: CT.cursorStroke }}
                        />
                        <Legend
                          wrapperStyle={{ fontSize: 10, color: CT.legendColor, paddingTop: 8 }}
                          iconType="square"
                          iconSize={7}
                        />
                        <ReferenceLine y={0} stroke={P.zero} />
                        <Line
                          type="monotone"
                          dataKey="gross_margin_pct"
                          name="Gross Margin"
                          stroke={P.grossMargin}
                          strokeWidth={1.5}
                          dot={{ r: 2.5, fill: P.grossMargin, strokeWidth: 0 }}
                          activeDot={{ r: 4, strokeWidth: 0 }}
                          connectNulls
                        />
                        <Line
                          type="monotone"
                          dataKey="ebitda_margin_pct"
                          name="EBITDA Margin"
                          stroke={P.ebitdaMargin}
                          strokeWidth={1.5}
                          strokeDasharray="4 3"
                          dot={{ r: 2.5, fill: P.ebitdaMargin, strokeWidth: 0 }}
                          activeDot={{ r: 4, strokeWidth: 0 }}
                          connectNulls
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </GlassPanel>

                {/* Chart 4 — Profitability Conversion */}
                <GlassPanel className="break-inside-avoid">
                  <PanelHeader title="Profitability Conversion" sub={currencyUnit} />
                  <div className="h-[230px] px-2 pt-4 pb-2 print:h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} barGap={4} barCategoryGap="30%">
                        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={CT.grid} />
                        <XAxis
                          dataKey="period"
                          tick={{ fill: CT.axisTickFill, fontSize: 12 }}
                          axisLine={{ stroke: CT.axisLine }}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fill: CT.axisTickFill, fontSize: 12 }}
                          axisLine={{ stroke: CT.axisLine }}
                          tickLine={false}
                          tickFormatter={(v) => compactNum(v).replace(/[A-Za-z]+$/, "")}
                          width={48}
                        />
                        <Tooltip
                          contentStyle={CT.tooltipStyle}
                          itemStyle={{ color: CT.itemColor }}
                          labelStyle={{ color: CT.labelColor }}
                          formatter={(v) => fmtCurrency(v as number, cur)}
                          cursor={{ fill: CT.cursorFill }}
                        />
                        <Legend
                          wrapperStyle={{ fontSize: 10, color: CT.legendColor, paddingTop: 8 }}
                          iconType="square"
                          iconSize={7}
                        />
                        <ReferenceLine y={0} stroke={P.zero} />
                        <Bar
                          dataKey="ebitda"
                          name="EBITDA"
                          fill={P.ebitdaPos}
                          radius={[3, 3, 0, 0]}
                        >
                          {chartData.map((entry, i) => (
                            <Cell
                              key={i}
                              fill={(entry.ebitda ?? 0) >= 0 ? P.ebitdaPos : P.ebitdaNeg}
                            />
                          ))}
                        </Bar>
                        <Bar
                          dataKey="net_income"
                          name="Net Income"
                          fill={P.netIncome}
                          radius={[3, 3, 0, 0]}
                        >
                          {chartData.map((entry, i) => (
                            <Cell
                              key={i}
                              fill={(entry.net_income ?? 0) >= 0 ? P.netIncome : P.ebitdaNeg}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </GlassPanel>
              </div>

              {/* Metrics table */}
              <div className="break-before-page">
                <GlassPanel>
                  <PanelHeader title="Extracted Metrics by Period" />
                  <div className="overflow-x-auto px-1 pb-2 pt-4">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-zinc-200 dark:border-zinc-800/40 hover:bg-transparent">
                          {[
                            "Period",
                            "Revenue",
                            "Gross Margin",
                            "EBITDA",
                            "Net Income",
                            "Cash",
                            "Burn / mo",
                            "Runway",
                            "CAC",
                            "LTV",
                            "LTV/CAC",
                          ].map((h, i) => (
                            <TableHead
                              key={h}
                              className={cn(
                                "text-[10px] uppercase tracking-widest text-zinc-500",
                                i > 0 && "text-right"
                              )}
                            >
                              {h}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.metrics.map((m, i) => (
                          <TableRow
                            key={i}
                            className="border-zinc-200 dark:border-zinc-800/30 hover:bg-zinc-100/60 dark:hover:bg-white/[0.015] transition-colors"
                          >
                            <TableCell className="whitespace-nowrap text-sm font-light text-zinc-700 dark:text-zinc-300">
                              {m.period}
                              {m.is_projected && (
                                <span className="ml-2 rounded px-1 py-0.5 text-[9px] uppercase tracking-wider bg-amber-500/10 text-amber-400/80 border border-amber-500/15">
                                  proj
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums text-zinc-700 dark:text-zinc-300 font-light">
                              {fmtCurrency(m.revenue, cur)}
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums text-zinc-700 dark:text-zinc-300 font-light">
                              {fmtPct(m.gross_margin_pct)}
                            </TableCell>
                            <TableCell
                              className={cn(
                                "text-right text-sm tabular-nums font-light",
                                m.ebitda == null
                                  ? "text-zinc-600"
                                  : m.ebitda >= 0
                                  ? "text-[#00C875]"
                                  : "text-red-600 dark:text-red-400/80"
                              )}
                            >
                              {fmtCurrency(m.ebitda, cur)}
                            </TableCell>
                            <TableCell
                              className={cn(
                                "text-right text-sm tabular-nums font-light",
                                m.net_income == null
                                  ? "text-zinc-600"
                                  : m.net_income >= 0
                                  ? "text-[#00C875]"
                                  : "text-red-600 dark:text-red-400/80"
                              )}
                            >
                              {fmtCurrency(m.net_income, cur)}
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums text-zinc-700 dark:text-zinc-300 font-light">
                              {fmtCurrency(m.cash_balance, cur)}
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums text-zinc-700 dark:text-zinc-300 font-light">
                              {fmtCurrency(m.monthly_burn_rate, cur)}
                            </TableCell>
                            <TableCell
                              className={cn(
                                "text-right text-sm tabular-nums font-light",
                                runwayClass(m.implied_runway_months)
                              )}
                            >
                              {fmtMonths(m.implied_runway_months)}
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums text-zinc-700 dark:text-zinc-300 font-light">
                              {fmtCurrency(m.cac, cur)}
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums text-zinc-700 dark:text-zinc-300 font-light">
                              {fmtCurrency(m.ltv, cur)}
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums text-zinc-700 dark:text-zinc-300 font-light">
                              {fmtRatio(m.ltv_to_cac_ratio)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </GlassPanel>
              </div>

              {/* Extraction warnings */}
              {data.extraction_warnings && data.extraction_warnings.length > 0 && (
                <GlassPanel>
                  <PanelHeader title="Extraction Notes" />
                  <ul className="space-y-1.5 px-5 py-4">
                    {data.extraction_warnings.map((w, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-[11px] text-zinc-400"
                      >
                        <span className="mt-0.5 text-zinc-500">·</span>
                        {w}
                      </li>
                    ))}
                  </ul>
                </GlassPanel>
              )}
            </motion.div>
          ) : (
            <ValuationView
              key="valuation"
              data={data}
              latest={latest}
              cur={cur}
              currencyFmt={currencyFmt}
            />
          )}
        </AnimatePresence>
      </motion.div>

      {/* Hidden export container — fixed off-screen so it never affects document scroll */}
      <div
        ref={tearSheetRef}
        className="fixed top-0 left-[-10000px] w-[1200px] h-auto overflow-visible pointer-events-none"
        style={{ padding: 0, margin: 0, fontFamily: "var(--font-geist-sans, system-ui, sans-serif)" }}
      >
        {/* Sections 1-4: operating metrics (inline-styled, theme-isolated) */}
        <ExportContent data={data} theme={exportTheme} />

        {/* Section 5: valuation analysis — MotionConfig forces Framer Motion to the
            animate target immediately, bypassing opacity-0/blur initial states */}
        <MotionConfig reducedMotion="always">
          <div
            className={exportTheme === "dark" ? "dark w-full" : "w-full"}
            style={{ backgroundColor: exportTheme === "dark" ? "#09090b" : "#FAF9F6", padding: 0 }}
          >
            <ValuationView
              data={data}
              latest={latest}
              cur={cur}
              currencyFmt={currencyFmt}
              themeOverride={exportTheme}
              sectionHeader="Valuation Analysis"
              isExport={true}
            />
          </div>
        </MotionConfig>
      </div>

      {/* Export modal */}
      {exportOpen && (
        <ExportModal
          data={data}
          fileName={fileName}
          tearSheetRef={tearSheetRef}
          exportTheme={exportTheme}
          onExportThemeChange={setExportTheme}
          onClose={() => setExportOpen(false)}
        />
      )}
    </div>
  );
}
