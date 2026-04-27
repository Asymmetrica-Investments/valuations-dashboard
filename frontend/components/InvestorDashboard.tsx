"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
import { FileDown, X, TrendingUp, TrendingDown, Minus, Loader2 } from "lucide-react";
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
  ebitdaPos: "#6ee7b7",     // emerald-300 — muted, premium
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
  if (mo == null) return "text-zinc-600";
  if (mo < 6) return "text-red-300";
  if (mo < 12) return "text-amber-300";
  if (mo < 18) return "text-yellow-300";
  return "text-emerald-300";
}
function runwayIcon(mo: number | null | undefined) {
  if (mo == null) return <Minus className="size-4 text-zinc-600" />;
  if (mo < 6) return <TrendingDown className="size-4 text-red-300" />;
  if (mo < 18) return <Minus className="size-4 text-amber-300" />;
  return <TrendingUp className="size-4 text-emerald-300" />;
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
      <div className="absolute inset-0 rounded-2xl border border-zinc-800/50" />

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
      <div className="relative rounded-[calc(1rem-1px)] bg-zinc-900/50 backdrop-blur-xl">
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
        "rounded-2xl border border-zinc-800/50 bg-zinc-900/40 backdrop-blur-xl",
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
                "text-5xl font-light tracking-tight text-white leading-none",
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

// ── Chart tooltip ───────��──────────────────────────────────────���──────────────
const tooltipStyle: React.CSSProperties = {
  backgroundColor: "#09090b",
  borderColor: "#27272a",
  borderRadius: "8px",
  fontSize: "12px",
  color: "#fff",
  boxShadow: "0 4px 24px rgba(0,0,0,0.6)",
};

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
}

function ValuationView({ data, latest, cur, currencyFmt }: ValuationViewProps) {
  const [scenario, setScenario] = useState<"base" | "stress">("base");

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
      {/* ── Row 1: FCFF Waterfall + WACC Engine ─────────���─────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[3fr_2fr]">

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
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: "#d4d4d8", fontSize: 11 }}
                    axisLine={{ stroke: "#3f3f46" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "#d4d4d8", fontSize: 11 }}
                    axisLine={{ stroke: "#3f3f46" }}
                    tickLine={false}
                    tickFormatter={(v) => compactNum(v).replace(/[A-Za-z]+$/, "")}
                    width={48}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    itemStyle={{ color: "#e4e4e7" }}
                    labelStyle={{ color: "#a1a1aa" }}
                    formatter={(v, name) =>
                      name === "spacer"
                        ? null
                        : [fmtCurrency(v as number, cur), ""]
                    }
                    cursor={{ fill: "rgba(255,255,255,0.03)" }}
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
                            ? entry.isNeg ? "#fca5a5" : "#6ee7b7"
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
        <motion.div variants={fadeUp}>
          <GlassPanel className="h-full break-inside-avoid">
            <PanelHeader title="Cost of Capital Engine" />
            <div className="px-5 pb-5 pt-1 space-y-3">

              {/* WACC formula */}
              <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/60 px-4 py-3">
                <p className="text-[9px] uppercase tracking-[0.18em] text-zinc-600 mb-2">WACC</p>
                <WaccFormula />
              </div>

              {/* CAPM formula */}
              <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/60 px-4 py-3">
                <p className="text-[9px] uppercase tracking-[0.18em] text-zinc-600 mb-2">Cost of Equity · CAPM</p>
                <CAPMFormula />
              </div>

              {/* Input rows */}
              <div className="space-y-[2px]">
                {inputRows.map((row) => (
                  <div
                    key={row.label}
                    className={cn(
                      "flex items-center justify-between rounded-lg px-3 py-1.5",
                      row.hi
                        ? "bg-zinc-800/40 border border-zinc-700/30"
                        : "hover:bg-white/[0.02] transition-colors"
                    )}
                  >
                    <span className="text-[11px] text-zinc-500">{row.label}</span>
                    <span
                      className={cn(
                        "font-mono text-[12px] tabular-nums",
                        row.hi ? "text-zinc-200 font-medium" : "text-zinc-400"
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

      {/* ── Row 2: Value Conclusion ────────────────────────────────────────── */}
      <motion.div variants={fadeUp}>
        <GlassPanel>
          {/* Header + scenario toggle */}
          <div className="flex items-center justify-between px-5 pt-5 pb-4">
            <div className="flex items-center gap-3">
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">
                Value Conclusion
              </p>
              <div className="h-px w-24 bg-gradient-to-r from-zinc-800 to-transparent" />
            </div>
            <div className="flex rounded-xl border border-zinc-800/60 bg-zinc-900/60 p-[3px] gap-[3px]">
              {(["base", "stress"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setScenario(s)}
                  className={cn(
                    "rounded-[8px] px-3 py-1 text-[10px] uppercase tracking-widest transition-colors duration-200",
                    scenario === s
                      ? "bg-zinc-700/60 text-zinc-200"
                      : "text-zinc-600 hover:text-zinc-400"
                  )}
                >
                  {s === "base" ? "Base" : "Stress"}
                </button>
              ))}
            </div>
          </div>

          {hasEnoughData && ev != null && equityValue != null ? (
            <div className="grid grid-cols-1 gap-4 px-5 pb-6 sm:grid-cols-3">

              {/* Normalised FCFF */}
              <div className="rounded-2xl border border-zinc-800/40 bg-zinc-900/30 p-5">
                <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                  Norm. FCFF
                </p>
                <div className="mt-3 h-px w-8 bg-gradient-to-r from-zinc-700 to-transparent" />
                <p className="mt-3 text-3xl font-light text-zinc-300 tabular-nums">
                  <NumberTicker value={fcff} format={currencyFmt} />
                </p>
                <p className="mt-1 text-[10px] text-zinc-600">{latest?.period}</p>
              </div>

              {/* Enterprise Value */}
              <div className="relative overflow-hidden rounded-2xl border border-indigo-500/20 bg-indigo-500/[0.04] p-5">
                <div
                  aria-hidden
                  className="pointer-events-none absolute -top-8 left-1/2 h-32 w-32 -translate-x-1/2 rounded-full bg-indigo-500/10 blur-[40px]"
                />
                <p className="relative text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                  Enterprise Value
                </p>
                <div className="relative mt-3 h-px w-8 bg-gradient-to-r from-indigo-700/50 to-transparent" />
                <p className="relative mt-3 text-4xl font-light text-white tabular-nums">
                  <NumberTicker value={ev} format={currencyFmt} delay={0.2} />
                </p>
                <p className="relative mt-1 font-mono text-[10px] text-zinc-500">
                  WACC {(wacc * 100).toFixed(2)}% · g {(TERMINAL_G * 100).toFixed(1)}%
                </p>
              </div>

              {/* FMV of Equity */}
              <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-5">
                <div
                  aria-hidden
                  className="pointer-events-none absolute -top-8 left-1/2 h-32 w-32 -translate-x-1/2 rounded-full bg-emerald-500/10 blur-[40px]"
                />
                <p className="relative text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                  FMV of Equity
                </p>
                <div className="relative mt-3 h-px w-8 bg-gradient-to-r from-emerald-700/50 to-transparent" />
                <p className="relative mt-3 text-4xl font-light text-emerald-200 tabular-nums">
                  <NumberTicker value={equityValue} format={currencyFmt} delay={0.4} />
                </p>
                <p className="relative mt-1 font-mono text-[10px] text-zinc-500">
                  EV + cash · no debt assumed
                </p>
              </div>
            </div>
          ) : (
            <div className="px-5 pb-6">
              <div className="rounded-2xl border border-zinc-800/40 bg-zinc-900/30 p-8 text-center">
                <p className="text-sm font-light text-zinc-500">
                  Insufficient data to compute DCF valuation.
                </p>
                <p className="mt-1 text-[11px] text-zinc-700">
                  Requires positive EBITDA and revenue in the extracted metrics.
                </p>
              </div>
            </div>
          )}
        </GlassPanel>
      </motion.div>
    </motion.div>
  );
}

// ── Color resolver: canvas converts oklch/lab → rgb for html2canvas ──────────
// html2canvas v1.x cannot parse oklch()/lab() color functions. This uses the
// browser's own canvas fill parser to resolve any modern color to rgb/rgba.
function resolveOklch(value: string): string {
  try {
    const cvs = document.createElement("canvas");
    cvs.width = cvs.height = 1;
    const ctx = cvs.getContext("2d");
    if (!ctx) return value;
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    if (a === 0) return "transparent";
    if (a < 255) return `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`;
    return `rgb(${r},${g},${b})`;
  } catch {
    return value;
  }
}

// ── Pre-fetch all stylesheets, convert oklch/lab → rgb, return as one string ──
async function prepareStyles(): Promise<string> {
  const re = /oklch\([^)]+\)|lab\([^)]+\)/g;
  const parts: string[] = [];

  for (const el of Array.from(document.querySelectorAll("style"))) {
    parts.push((el.textContent ?? "").replace(re, resolveOklch));
  }

  await Promise.all(
    Array.from(
      document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')
    ).map(async (link) => {
      try {
        const res = await fetch(link.href);
        const text = await res.text();
        parts.push(text.replace(re, resolveOklch));
      } catch {
        /* skip unreachable sheets */
      }
    })
  );

  return parts.join("\n");
}

// ── PDF export ───────────────────────────────────────────────────────────────
async function exportPdf(
  exportEl: HTMLElement,
  companyName: string,
  onProgress: (s: string) => void
) {
  onProgress("Preparing styles…");
  const convertedCss = await prepareStyles();

  onProgress("Rendering layout…");
  const html2canvas = (await import("html2canvas")).default;
  const jsPDF = (await import("jspdf")).default;

  onProgress("Capturing screenshot…");
  const canvas = await html2canvas(exportEl, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: "#09090b",
    logging: false,
    width: exportEl.scrollWidth,
    height: exportEl.scrollHeight,
    windowWidth: exportEl.scrollWidth,
    windowHeight: exportEl.scrollHeight,
    x: 0,
    y: 0,
    onclone: (clonedDoc: Document) => {
      // Swap all stylesheets for the pre-converted version (no oklch/lab).
      // The converted CSS keeps every Tailwind class intact — only the color
      // function syntax changes from oklch() to rgb().
      clonedDoc
        .querySelectorAll('style, link[rel="stylesheet"]')
        .forEach((el) => el.remove());
      const style = clonedDoc.createElement("style");
      style.textContent = convertedCss;
      clonedDoc.head.appendChild(style);
    },
  });

  onProgress("Building PDF…");
  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pdfW = pdf.internal.pageSize.getWidth();
  const pdfH = pdf.internal.pageSize.getHeight();

  const ratio = canvas.height / canvas.width;
  const imgH = pdfW * ratio;
  let yOffset = 0;
  let remainingH = imgH;

  while (remainingH > 0) {
    if (yOffset > 0) pdf.addPage();
    pdf.addImage(imgData, "PNG", 0, -yOffset, pdfW, imgH);
    yOffset += pdfH;
    remainingH -= pdfH;
  }

  onProgress("Downloading…");
  pdf.save(`${companyName.toLowerCase().replace(/\s+/g, "-")}-tear-sheet.pdf`);
}

// ── ExportContent: pixel-perfect layout using real dashboard components ───────
// Renders Operating Metrics then a CSS page-break then Valuation Analysis.
// Wrapping style overrides all CSS vars with hex so dark theme is guaranteed
// regardless of the html class state during html2canvas capture.
function ExportContent({ data, fileName }: { data: ExtractedFinancials; fileName?: string }) {
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

  const monthsFmt = useCallback((v: number) => `${v.toFixed(1)} mo`, []);

  const runway =
    latest?.implied_runway_months ??
    (latest?.cash_balance != null &&
    latest?.monthly_burn_rate != null &&
    latest.monthly_burn_rate > 0
      ? latest.cash_balance / latest.monthly_burn_rate
      : null);

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

  const today = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <div
      className="dark"
      style={
        {
          width: 1400,
          backgroundColor: "#09090b",
          padding: "36px 48px",
          fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
          // Hex overrides for dark-theme CSS variables — ensures correct colors
          // even if the capturing context lacks the .dark class on <html>.
          "--background": "#09090b",
          "--foreground": "#fafafa",
          "--card": "#18181b",
          "--card-foreground": "#fafafa",
          "--popover": "#18181b",
          "--popover-foreground": "#fafafa",
          "--muted": "#27272a",
          "--muted-foreground": "#a1a1aa",
          "--border": "rgba(255,255,255,0.1)",
          "--input": "rgba(255,255,255,0.15)",
          "--ring": "#71717a",
          "--primary": "#e4e4e7",
          "--primary-foreground": "#18181b",
          "--secondary": "#27272a",
          "--secondary-foreground": "#fafafa",
          "--accent": "#27272a",
          "--accent-foreground": "#fafafa",
          "--destructive": "#ef4444",
        } as React.CSSProperties
      }
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="mb-5 pb-5 border-b border-zinc-800">
        <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-600 mb-1">
          Asymmetrica Valuations · {fileName || "Financial Analysis"}
        </p>
        <h1 className="text-3xl font-light tracking-tight text-white mb-1">
          {data.company_name}
        </h1>
        <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-400">
          {data.reporting_period_type} · {cur} ·{" "}
          {Math.round(data.confidence_score * 100)}% confidence
        </p>
        <p className="text-[9px] text-zinc-600 mt-1">{today}</p>
      </div>

      {/* ── Section: Operating Metrics ────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-5">
        <span className="text-[8px] font-bold uppercase tracking-[0.22em] text-zinc-600 whitespace-nowrap">
          Operating Metrics
        </span>
        <div className="flex-1 h-px bg-zinc-800" />
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <KpiCard label="Revenue" rawValue={latest?.revenue} formatFn={currencyFmt} sub={latest?.period} />
        <KpiCard
          label="EBITDA"
          rawValue={latest?.ebitda}
          formatFn={currencyFmt}
          sub={latest?.period}
          valueClass={latest?.ebitda == null ? "" : latest.ebitda >= 0 ? "text-emerald-300" : "text-red-300"}
        />
        <KpiCard label="Cash Balance" rawValue={latest?.cash_balance} formatFn={currencyFmt} sub={latest?.period} />
        <KpiCard
          label="Runway"
          rawValue={runway}
          formatFn={monthsFmt}
          sub="implied"
          icon={runwayIcon(runway)}
          valueClass={runwayClass(runway)}
        />
      </div>

      {/* Charts 2×2 */}
      <div className="grid grid-cols-2 gap-6 mb-6">

        {/* Chart 1 — Revenue vs EBITDA */}
        <GlassPanel>
          <PanelHeader title="Revenue vs EBITDA" sub={currencyUnit} />
          <div className="h-[230px] px-2 pt-4 pb-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barGap={3} barCategoryGap="32%">
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="period" tick={{ fill: "#d4d4d8", fontSize: 12 }} axisLine={{ stroke: "#3f3f46" }} tickLine={false} />
                <YAxis tick={{ fill: "#d4d4d8", fontSize: 12 }} axisLine={{ stroke: "#3f3f46" }} tickLine={false}
                  tickFormatter={(v) => compactNum(v).replace(/[A-Za-z]+$/, "")} width={48} />
                <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#e4e4e7" }} labelStyle={{ color: "#a1a1aa" }}
                  formatter={(v) => fmtCurrency(v as number, cur)} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                <Legend wrapperStyle={{ fontSize: 10, color: "#d4d4d8", paddingTop: 8 }} iconType="square" iconSize={7} />
                <ReferenceLine y={0} stroke={P.zero} />
                <Bar dataKey="revenue" name="Revenue" radius={[3, 3, 0, 0]} fill={P.revenue} />
                <Bar dataKey="ebitda" name="EBITDA" fill={P.ebitdaPos} radius={[3, 3, 0, 0]}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={(entry.ebitda ?? 0) >= 0 ? P.ebitdaPos : P.ebitdaNeg} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassPanel>

        {/* Chart 2 — Cash Balance */}
        <GlassPanel>
          <PanelHeader title="Cash Balance" sub={currencyUnit} />
          <div className="h-[230px] px-2 pt-4 pb-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="period" tick={{ fill: "#d4d4d8", fontSize: 12 }} axisLine={{ stroke: "#3f3f46" }} tickLine={false} padding={{ left: 30, right: 30 }} />
                <YAxis tick={{ fill: "#d4d4d8", fontSize: 12 }} axisLine={{ stroke: "#3f3f46" }} tickLine={false}
                  tickFormatter={(v) => compactNum(v).replace(/[A-Za-z]+$/, "")} width={48} />
                <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#e4e4e7" }} labelStyle={{ color: "#a1a1aa" }}
                  formatter={(v) => fmtCurrency(v as number, cur)} cursor={{ stroke: "rgba(255,255,255,0.06)" }} />
                <Line type="monotone" dataKey="cash" name="Cash" stroke={P.cash} strokeWidth={1.5}
                  dot={{ r: 2.5, fill: P.cash, strokeWidth: 0 }} activeDot={{ r: 4, strokeWidth: 0 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </GlassPanel>

        {/* Chart 3 — Margin Evolution */}
        <GlassPanel>
          <PanelHeader title="Margin Evolution" sub="in percent" />
          <div className="h-[230px] px-2 pt-4 pb-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="period" tick={{ fill: "#d4d4d8", fontSize: 12 }} axisLine={{ stroke: "#3f3f46" }} tickLine={false} padding={{ left: 30, right: 30 }} />
                <YAxis tick={{ fill: "#d4d4d8", fontSize: 12 }} axisLine={{ stroke: "#3f3f46" }} tickLine={false}
                  tickFormatter={(v) => `${v.toFixed(0)}%`} width={44} />
                <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#e4e4e7" }} labelStyle={{ color: "#a1a1aa" }}
                  formatter={(v) => `${(v as number).toFixed(1)}%`} cursor={{ stroke: "rgba(255,255,255,0.06)" }} />
                <Legend wrapperStyle={{ fontSize: 10, color: "#d4d4d8", paddingTop: 8 }} iconType="square" iconSize={7} />
                <ReferenceLine y={0} stroke={P.zero} />
                <Line type="monotone" dataKey="gross_margin_pct" name="Gross Margin" stroke={P.grossMargin} strokeWidth={1.5}
                  dot={{ r: 2.5, fill: P.grossMargin, strokeWidth: 0 }} activeDot={{ r: 4, strokeWidth: 0 }} connectNulls />
                <Line type="monotone" dataKey="ebitda_margin_pct" name="EBITDA Margin" stroke={P.ebitdaMargin} strokeWidth={1.5}
                  strokeDasharray="4 3" dot={{ r: 2.5, fill: P.ebitdaMargin, strokeWidth: 0 }} activeDot={{ r: 4, strokeWidth: 0 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </GlassPanel>

        {/* Chart 4 — Profitability Conversion */}
        <GlassPanel>
          <PanelHeader title="Profitability Conversion" sub={currencyUnit} />
          <div className="h-[230px] px-2 pt-4 pb-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barGap={4} barCategoryGap="30%">
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="period" tick={{ fill: "#d4d4d8", fontSize: 12 }} axisLine={{ stroke: "#3f3f46" }} tickLine={false} />
                <YAxis tick={{ fill: "#d4d4d8", fontSize: 12 }} axisLine={{ stroke: "#3f3f46" }} tickLine={false}
                  tickFormatter={(v) => compactNum(v).replace(/[A-Za-z]+$/, "")} width={48} />
                <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#e4e4e7" }} labelStyle={{ color: "#a1a1aa" }}
                  formatter={(v) => fmtCurrency(v as number, cur)} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                <Legend wrapperStyle={{ fontSize: 10, color: "#d4d4d8", paddingTop: 8 }} iconType="square" iconSize={7} />
                <ReferenceLine y={0} stroke={P.zero} />
                <Bar dataKey="ebitda" name="EBITDA" fill={P.ebitdaPos} radius={[3, 3, 0, 0]}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={(entry.ebitda ?? 0) >= 0 ? P.ebitdaPos : P.ebitdaNeg} />
                  ))}
                </Bar>
                <Bar dataKey="net_income" name="Net Income" fill={P.netIncome} radius={[3, 3, 0, 0]}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={(entry.net_income ?? 0) >= 0 ? P.netIncome : P.ebitdaNeg} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassPanel>
      </div>

      {/* Metrics table */}
      <GlassPanel className="mb-6">
        <PanelHeader title="Extracted Metrics by Period" />
        <div className="overflow-x-auto px-1 pb-2 pt-4">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800/40 hover:bg-transparent">
                {["Period", "Revenue", "Gross Margin", "EBITDA", "Net Income", "Cash", "Burn / mo", "Runway", "CAC", "LTV", "LTV/CAC"].map((h, i) => (
                  <TableHead key={h} className={cn("text-[10px] uppercase tracking-widest text-zinc-500", i > 0 && "text-right")}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.metrics.map((m, i) => (
                <TableRow key={i} className="border-zinc-800/30">
                  <TableCell className="whitespace-nowrap text-sm font-light text-zinc-300">
                    {m.period}
                    {m.is_projected && (
                      <span className="ml-2 rounded px-1 py-0.5 text-[9px] uppercase tracking-wider bg-amber-500/10 text-amber-400/80 border border-amber-500/15">proj</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums text-zinc-300 font-light">{fmtCurrency(m.revenue, cur)}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums text-zinc-300 font-light">{fmtPct(m.gross_margin_pct)}</TableCell>
                  <TableCell className={cn("text-right text-sm tabular-nums font-light", m.ebitda == null ? "text-zinc-600" : m.ebitda >= 0 ? "text-emerald-300/80" : "text-red-300/80")}>
                    {fmtCurrency(m.ebitda, cur)}
                  </TableCell>
                  <TableCell className={cn("text-right text-sm tabular-nums font-light", m.net_income == null ? "text-zinc-600" : m.net_income >= 0 ? "text-emerald-300/80" : "text-red-300/80")}>
                    {fmtCurrency(m.net_income, cur)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums text-zinc-300 font-light">{fmtCurrency(m.cash_balance, cur)}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums text-zinc-300 font-light">{fmtCurrency(m.monthly_burn_rate, cur)}</TableCell>
                  <TableCell className={cn("text-right text-sm tabular-nums font-light", runwayClass(m.implied_runway_months))}>
                    {fmtMonths(m.implied_runway_months)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums text-zinc-300 font-light">{fmtCurrency(m.cac, cur)}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums text-zinc-300 font-light">{fmtCurrency(m.ltv, cur)}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums text-zinc-300 font-light">{fmtRatio(m.ltv_to_cac_ratio)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </GlassPanel>

      {/* ── Page break between sections ───────────────────────────────────── */}
      <div style={{ pageBreakBefore: "always", breakBefore: "page" }} />

      {/* ── Section: Fair Market Value Analysis ──────────────────────────── */}
      <div className="flex items-center gap-3 mb-5 pt-8">
        <span className="text-[8px] font-bold uppercase tracking-[0.22em] text-zinc-600 whitespace-nowrap">
          Fair Market Value Analysis
        </span>
        <div className="flex-1 h-px bg-zinc-800" />
      </div>

      <ValuationView data={data} latest={latest} cur={cur} currencyFmt={currencyFmt} />
    </div>
  );
}

// ── Export modal ─────────────────────────────────────────────────────────────
interface ExportModalProps {
  data: ExtractedFinancials;
  fileName: string;
  tearSheetRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
}

function ExportModal({ data, fileName, tearSheetRef, onClose }: ExportModalProps) {
  const [status, setStatus] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleDownload() {
    if (!tearSheetRef.current) return;
    try {
      await exportPdf(tearSheetRef.current, data.company_name, setStatus);
      setDone(true);
      setStatus(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[export] PDF generation failed:", err);
      console.error("[export] Error message:", msg);
      console.error("[export] tearSheetRef.current:", tearSheetRef.current);
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
          className="relative w-full max-w-5xl rounded-2xl border border-zinc-800/60 bg-zinc-950 shadow-2xl overflow-y-auto max-h-[95vh]"
        >
          {/* Close */}
          <button
            onClick={onClose}
            className="absolute right-4 top-4 rounded-lg p-1.5 text-zinc-600 transition-colors hover:text-zinc-300"
          >
            <X className="size-4" />
          </button>

          <div className="p-6">
            {/* Title */}
            <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-600 mb-1">Export</p>
            <h3 className="text-lg font-light text-white tracking-tight">
              {fileName || "Financial Tear-Sheet"}
            </h3>
            <p className="mt-1 text-[11px] text-zinc-500">
              Landscape A4 PDF · 1400px desktop layout · Operating Metrics + Valuation
            </p>

            <div className="mt-5 h-px bg-zinc-800/60" />

            {/* Scrollable live preview — zoom shrinks content AND affects layout,
                so overflow-y-auto gives true vertical scrolling at the scaled size */}
            <div
              className="mt-5 rounded-xl border border-zinc-800/50 overflow-y-auto overflow-x-hidden"
              style={{ maxHeight: "70vh", background: "#09090b" }}
            >
              <div style={{ zoom: 0.64, pointerEvents: "none", userSelect: "none" }}>
                <ExportContent data={data} fileName={fileName} />
              </div>
            </div>

            {/* Status / done message */}
            {(status || done) && (
              <div className={cn(
                "mt-4 flex items-center gap-2 rounded-xl px-4 py-2.5 text-[11px]",
                done ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-300" : "bg-zinc-800/60 text-zinc-400"
              )}>
                {!done && <Loader2 className="size-3.5 animate-spin shrink-0" />}
                <span>{done ? "PDF downloaded successfully." : status}</span>
              </div>
            )}

            {/* Actions */}
            <div className="mt-5 flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 rounded-xl border border-zinc-800/60 bg-zinc-900/50 py-2.5 text-[11px] uppercase tracking-widest text-zinc-500 transition-colors hover:text-zinc-300"
              >
                Cancel
              </button>
              <button
                onClick={handleDownload}
                disabled={!!status}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-[11px] uppercase tracking-widest transition-all",
                  status
                    ? "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                    : "bg-zinc-100 text-zinc-900 hover:bg-white"
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
  const [activeTab, setActiveTab] = useState<"metrics" | "valuation">("metrics");
  const [exportOpen, setExportOpen] = useState(false);
  const tearSheetRef = useRef<HTMLDivElement>(null);

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
        <h1 className="text-2xl font-light tracking-tight text-white mt-1">
          {data.company_name}
        </h1>
        <p className="text-xs text-zinc-500 mt-1">
          {data.reporting_period_type.charAt(0).toUpperCase() +
            data.reporting_period_type.slice(1)}{" "}
          · {cur} · Confidence {Math.round(data.confidence_score * 100)}%
        </p>
        <div className="mt-3 h-px bg-zinc-800" />
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
            <h2 className="text-2xl font-light tracking-tight text-white">
              {data.company_name}
            </h2>
            <p className="mt-0.5 text-[11px] uppercase tracking-[0.16em] text-zinc-500">
              {data.reporting_period_type} · {cur} ·{" "}
              {Math.round(data.confidence_score * 100)}% confidence
            </p>
          </div>
          <button
            onClick={() => setExportOpen(true)}
            className="mt-1 inline-flex items-center gap-2 self-start rounded-xl border border-zinc-800/60 bg-zinc-900/50 px-4 py-2 text-[11px] uppercase tracking-widest text-zinc-400 backdrop-blur-sm transition-colors hover:border-zinc-700 hover:text-zinc-200"
            data-print-hide
          >
            <FileDown className="size-3.5" />
            Export PDF
          </button>
        </motion.div>

        {/* Tab navigation */}
        <motion.div variants={fadeUp} data-print-hide>
          <div className="inline-flex rounded-2xl border border-zinc-800/50 bg-zinc-900/40 backdrop-blur-sm p-[3px] gap-[3px]">
            {(["metrics", "valuation"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "rounded-[calc(1rem-3px)] px-5 py-2 text-[11px] uppercase tracking-[0.16em] transition-all duration-200",
                  activeTab === tab
                    ? "bg-zinc-700/60 text-zinc-200 shadow-sm"
                    : "text-zinc-600 hover:text-zinc-400"
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
                      ? "text-emerald-300"
                      : "text-red-300"
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
                        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#27272a" />
                        <XAxis
                          dataKey="period"
                          tick={{ fill: "#d4d4d8", fontSize: 12 }}
                          axisLine={{ stroke: "#3f3f46" }}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fill: "#d4d4d8", fontSize: 12 }}
                          axisLine={{ stroke: "#3f3f46" }}
                          tickLine={false}
                          tickFormatter={(v) => compactNum(v).replace(/[A-Za-z]+$/, "")}
                          width={48}
                        />
                        <Tooltip
                          contentStyle={tooltipStyle}
                          itemStyle={{ color: "#e4e4e7" }}
                          labelStyle={{ color: "#a1a1aa" }}
                          formatter={(v) => fmtCurrency(v as number, cur)}
                          cursor={{ fill: "rgba(255,255,255,0.03)" }}
                        />
                        <Legend
                          wrapperStyle={{ fontSize: 10, color: "#d4d4d8", paddingTop: 8 }}
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
                        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#27272a" />
                        <XAxis
                          dataKey="period"
                          tick={{ fill: "#d4d4d8", fontSize: 12 }}
                          axisLine={{ stroke: "#3f3f46" }}
                          tickLine={false}
                          padding={{ left: 30, right: 30 }}
                        />
                        <YAxis
                          tick={{ fill: "#d4d4d8", fontSize: 12 }}
                          axisLine={{ stroke: "#3f3f46" }}
                          tickLine={false}
                          tickFormatter={(v) => compactNum(v).replace(/[A-Za-z]+$/, "")}
                          width={48}
                        />
                        <Tooltip
                          contentStyle={tooltipStyle}
                          itemStyle={{ color: "#e4e4e7" }}
                          labelStyle={{ color: "#a1a1aa" }}
                          formatter={(v) => fmtCurrency(v as number, cur)}
                          cursor={{ stroke: "rgba(255,255,255,0.06)" }}
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
                        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#27272a" />
                        <XAxis
                          dataKey="period"
                          tick={{ fill: "#d4d4d8", fontSize: 12 }}
                          axisLine={{ stroke: "#3f3f46" }}
                          tickLine={false}
                          padding={{ left: 30, right: 30 }}
                        />
                        <YAxis
                          tick={{ fill: "#d4d4d8", fontSize: 12 }}
                          axisLine={{ stroke: "#3f3f46" }}
                          tickLine={false}
                          tickFormatter={(v) => `${v.toFixed(0)}%`}
                          width={44}
                        />
                        <Tooltip
                          contentStyle={tooltipStyle}
                          itemStyle={{ color: "#e4e4e7" }}
                          labelStyle={{ color: "#a1a1aa" }}
                          formatter={(v) => `${(v as number).toFixed(1)}%`}
                          cursor={{ stroke: "rgba(255,255,255,0.06)" }}
                        />
                        <Legend
                          wrapperStyle={{ fontSize: 10, color: "#d4d4d8", paddingTop: 8 }}
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
                        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#27272a" />
                        <XAxis
                          dataKey="period"
                          tick={{ fill: "#d4d4d8", fontSize: 12 }}
                          axisLine={{ stroke: "#3f3f46" }}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fill: "#d4d4d8", fontSize: 12 }}
                          axisLine={{ stroke: "#3f3f46" }}
                          tickLine={false}
                          tickFormatter={(v) => compactNum(v).replace(/[A-Za-z]+$/, "")}
                          width={48}
                        />
                        <Tooltip
                          contentStyle={tooltipStyle}
                          itemStyle={{ color: "#e4e4e7" }}
                          labelStyle={{ color: "#a1a1aa" }}
                          formatter={(v) => fmtCurrency(v as number, cur)}
                          cursor={{ fill: "rgba(255,255,255,0.03)" }}
                        />
                        <Legend
                          wrapperStyle={{ fontSize: 10, color: "#d4d4d8", paddingTop: 8 }}
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
                        <TableRow className="border-zinc-800/40 hover:bg-transparent">
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
                            className="border-zinc-800/30 hover:bg-white/[0.015] transition-colors"
                          >
                            <TableCell className="whitespace-nowrap text-sm font-light text-zinc-300">
                              {m.period}
                              {m.is_projected && (
                                <span className="ml-2 rounded px-1 py-0.5 text-[9px] uppercase tracking-wider bg-amber-500/10 text-amber-400/80 border border-amber-500/15">
                                  proj
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums text-zinc-300 font-light">
                              {fmtCurrency(m.revenue, cur)}
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums text-zinc-300 font-light">
                              {fmtPct(m.gross_margin_pct)}
                            </TableCell>
                            <TableCell
                              className={cn(
                                "text-right text-sm tabular-nums font-light",
                                m.ebitda == null
                                  ? "text-zinc-600"
                                  : m.ebitda >= 0
                                  ? "text-emerald-300/80"
                                  : "text-red-300/80"
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
                                  ? "text-emerald-300/80"
                                  : "text-red-300/80"
                              )}
                            >
                              {fmtCurrency(m.net_income, cur)}
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums text-zinc-300 font-light">
                              {fmtCurrency(m.cash_balance, cur)}
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums text-zinc-300 font-light">
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
                            <TableCell className="text-right text-sm tabular-nums text-zinc-300 font-light">
                              {fmtCurrency(m.cac, cur)}
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums text-zinc-300 font-light">
                              {fmtCurrency(m.ltv, cur)}
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums text-zinc-300 font-light">
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

      {/* Hidden export container — pushed off-screen, captured by html2canvas */}
      <div
        ref={tearSheetRef}
        style={{
          position: "absolute",
          top: -9999,
          left: -9999,
          zIndex: -1,
          width: 1400,
        }}
      >
        <ExportContent data={data} fileName={fileName} />
      </div>

      {/* Export modal */}
      {exportOpen && (
        <ExportModal
          data={data}
          fileName={fileName}
          tearSheetRef={tearSheetRef}
          onClose={() => setExportOpen(false)}
        />
      )}
    </div>
  );
}
