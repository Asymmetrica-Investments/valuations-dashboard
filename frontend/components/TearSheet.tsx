"use client";

/**
 * TearSheet — a hidden, rigidly-sized 1200px-wide financial report container.
 * All styles are inline so html2canvas can paint them without needing CSS vars.
 * Rendered off-screen; captured by exportPdf() via html2canvas + jspdf.
 */

import type { ExtractedFinancials, FinancialMetrics } from "@/lib/schema";

// ── Colours (hardcoded hex — no Tailwind vars) ──────────────────────────────
const C = {
  bg: "#09090b",
  surface: "#18181b",
  border: "#27272a",
  borderLight: "#3f3f46",
  textWhite: "#fafafa",
  textMuted: "#a1a1aa",
  textDim: "#71717a",
  textFaint: "#52525b",
  emerald: "#6ee7b7",
  red: "#fca5a5",
  indigo: "#a5b4fc",
  purple: "#c084fc",
  slate: "#94a3b8",
};

// ── Formatters ───────────────────────────────────────────────────────────────
function compactNum(v: number, cur: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: cur,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(v);
}
function fmt(v: number | null | undefined, cur: string) {
  return v == null ? "—" : compactNum(v, cur);
}
function fmtPct(v: number | null | undefined) {
  return v == null ? "—" : `${v.toFixed(1)}%`;
}
function fmtMo(v: number | null | undefined) {
  return v == null ? "—" : `${v.toFixed(1)} mo`;
}
function fmtRatio(v: number | null | undefined) {
  return v == null ? "—" : `${v.toFixed(1)}×`;
}

// ── Mini CSS bar (for the inline chart) ─────────────────────────────────────
function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (Math.abs(value) / max) * 100)) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, width: "100%" }}>
      <div
        style={{
          height: 6,
          width: `${pct}%`,
          backgroundColor: value >= 0 ? color : C.red,
          borderRadius: 3,
          minWidth: 2,
        }}
      />
    </div>
  );
}

// ── DCF valuation (same constants as ValuationView) ──────────────────────────
function computeValuation(latest: FinancialMetrics | undefined) {
  if (!latest) return null;
  const TAX_RATE = 0.25;
  const CAPEX_PCT = 0.035;
  const WC_PCT = 0.02;
  const TERMINAL_G = 0.025;
  const RF = 0.045;
  const BETA = 1.2;
  const RPM = 0.055;
  const RPS = 0.02;
  const RPCP = 0.015;
  const RPC = 0.005;
  const KD = 0.06;
  const D_WEIGHT = 0.3;
  const E_WEIGHT = 0.7;

  const ebitda = latest.ebitda ?? 0;
  const revenue = latest.revenue ?? 0;
  const cash = latest.cash_balance ?? 0;

  const estTax = ebitda > 0 ? ebitda * TAX_RATE : 0;
  const estCapex = revenue * CAPEX_PCT;
  const estWC = revenue * WC_PCT;
  const fcff = ebitda - estTax - estCapex - estWC;
  const ke = RF + BETA * RPM + RPS + RPCP + RPC;
  const wacc = D_WEIGHT * KD * (1 - TAX_RATE) + E_WEIGHT * ke;

  if (fcff <= 0 || wacc <= TERMINAL_G) return null;
  const ev = fcff / (wacc - TERMINAL_G);
  const equity = ev + cash;
  return { fcff, wacc, ev, equity };
}

// ── TearSheet ────────────────────────────────────────────────────────────────
interface TearSheetProps {
  data: ExtractedFinancials;
  innerRef: React.RefObject<HTMLDivElement | null>;
}

export function TearSheet({ data, innerRef }: TearSheetProps) {
  const cur = data.reporting_currency;
  const latest = [...data.metrics].reverse().find((m) => !m.is_projected) ?? data.metrics[data.metrics.length - 1];
  const valuation = computeValuation(latest);

  const maxRevenue = Math.max(1, ...data.metrics.map((m) => Math.abs(m.revenue ?? 0)));
  const maxEbitda = Math.max(1, ...data.metrics.map((m) => Math.abs(m.ebitda ?? 0)));

  const today = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  // ── shared cell style ──
  const th: React.CSSProperties = {
    padding: "6px 10px",
    textAlign: "left",
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: C.textDim,
    borderBottom: `1px solid ${C.border}`,
    whiteSpace: "nowrap",
  };
  const tdBase: React.CSSProperties = {
    padding: "6px 10px",
    fontSize: 11,
    borderBottom: `1px solid ${C.border}`,
    whiteSpace: "nowrap",
  };
  const tdR: React.CSSProperties = { ...tdBase, textAlign: "right", fontVariantNumeric: "tabular-nums" };

  return (
    // Positioned off-screen — not visible to user
    <div
      style={{
        position: "fixed",
        top: -9999,
        left: -9999,
        width: 1200,
        backgroundColor: C.bg,
        fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
        color: C.textWhite,
        padding: 40,
        boxSizing: "border-box",
      }}
      ref={innerRef}
    >
      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28, borderBottom: `1px solid ${C.border}`, paddingBottom: 20 }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: C.textDim, marginBottom: 6 }}>
            Asymmetrica Valuations · Financial Tear-Sheet
          </div>
          <div style={{ fontSize: 28, fontWeight: 300, letterSpacing: "-0.02em", color: C.textWhite }}>
            {data.company_name}
          </div>
          <div style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: C.textMuted, marginTop: 4 }}>
            {data.reporting_period_type} · {cur} · Confidence {Math.round(data.confidence_score * 100)}%
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 9, color: C.textFaint, letterSpacing: "0.1em", textTransform: "uppercase" }}>Generated</div>
          <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>{today}</div>
        </div>
      </div>

      {/* ── KPI ROW ─────────────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 28 }}>
        {[
          { label: "Revenue", value: fmt(latest?.revenue, cur), color: C.textWhite },
          {
            label: "EBITDA",
            value: fmt(latest?.ebitda, cur),
            color: latest?.ebitda == null ? C.textMuted : latest.ebitda >= 0 ? C.emerald : C.red,
          },
          { label: "Cash Balance", value: fmt(latest?.cash_balance, cur), color: C.indigo },
          { label: "Implied Runway", value: fmtMo(latest?.implied_runway_months), color: C.textMuted },
        ].map((kpi) => (
          <div
            key={kpi.label}
            style={{
              backgroundColor: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              padding: "16px 18px",
            }}
          >
            <div style={{ fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: C.textDim, marginBottom: 8 }}>
              {kpi.label}
            </div>
            <div style={{ height: 1, width: 24, backgroundColor: C.borderLight, marginBottom: 10 }} />
            <div style={{ fontSize: 24, fontWeight: 300, color: kpi.color, letterSpacing: "-0.01em" }}>
              {kpi.value}
            </div>
            {latest?.period && (
              <div style={{ fontSize: 9, color: C.textFaint, marginTop: 4 }}>{latest.period}</div>
            )}
          </div>
        ))}
      </div>

      {/* ── CHARTS + MARGINS ────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 28 }}>

        {/* Revenue vs EBITDA bars */}
        <div style={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 18px" }}>
          <div style={{ fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: C.textDim, marginBottom: 14 }}>
            Revenue vs EBITDA
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.metrics.map((m) => (
              <div key={m.period} style={{ display: "grid", gridTemplateColumns: "60px 1fr 1fr", gap: 6, alignItems: "center" }}>
                <div style={{ fontSize: 9, color: C.textDim }}>{m.period}</div>
                <Bar value={m.revenue ?? 0} max={maxRevenue} color={C.textMuted} />
                <Bar value={m.ebitda ?? 0} max={maxEbitda} color={C.emerald} />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 10 }}>
            {[{ label: "Revenue", color: C.textMuted }, { label: "EBITDA", color: C.emerald }].map((l) => (
              <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: l.color }} />
                <div style={{ fontSize: 9, color: C.textDim }}>{l.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Margin evolution table */}
        <div style={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 18px" }}>
          <div style={{ fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: C.textDim, marginBottom: 14 }}>
            Margin Evolution
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Period</th>
                <th style={{ ...th, textAlign: "right" }}>Gross Margin</th>
                <th style={{ ...th, textAlign: "right" }}>EBITDA Margin</th>
                <th style={{ ...th, textAlign: "right" }}>Net Income</th>
              </tr>
            </thead>
            <tbody>
              {data.metrics.map((m) => {
                const ebitdaMargin = m.ebitda != null && m.revenue ? (m.ebitda / m.revenue) * 100 : null;
                return (
                  <tr key={m.period}>
                    <td style={{ ...tdBase, color: C.textMuted }}>{m.period}</td>
                    <td style={{ ...tdR, color: C.indigo }}>{fmtPct(m.gross_margin_pct)}</td>
                    <td style={{ ...tdR, color: C.purple }}>{fmtPct(ebitdaMargin)}</td>
                    <td style={{
                      ...tdR,
                      color: m.net_income == null ? C.textDim : m.net_income >= 0 ? C.emerald : C.red,
                    }}>
                      {fmt(m.net_income, cur)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── FULL METRICS TABLE ───────────────────────────────────────────────── */}
      <div style={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 18px", marginBottom: 28 }}>
        <div style={{ fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: C.textDim, marginBottom: 14 }}>
          Extracted Metrics by Period
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Period", "Revenue", "Gross Margin", "EBITDA", "Net Income", "Cash", "Burn / mo", "Runway", "CAC", "LTV", "LTV/CAC"].map((h, i) => (
                <th key={h} style={{ ...th, textAlign: i === 0 ? "left" : "right" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.metrics.map((m) => (
              <tr key={m.period}>
                <td style={{ ...tdBase, color: C.textWhite }}>
                  {m.period}
                  {m.is_projected && (
                    <span style={{ marginLeft: 6, fontSize: 8, padding: "1px 4px", backgroundColor: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 3, color: "#fbbf24", letterSpacing: "0.1em" }}>
                      PROJ
                    </span>
                  )}
                </td>
                <td style={{ ...tdR, color: C.textMuted }}>{fmt(m.revenue, cur)}</td>
                <td style={{ ...tdR, color: C.indigo }}>{fmtPct(m.gross_margin_pct)}</td>
                <td style={{ ...tdR, color: m.ebitda == null ? C.textDim : m.ebitda >= 0 ? C.emerald : C.red }}>{fmt(m.ebitda, cur)}</td>
                <td style={{ ...tdR, color: m.net_income == null ? C.textDim : m.net_income >= 0 ? C.emerald : C.red }}>{fmt(m.net_income, cur)}</td>
                <td style={{ ...tdR, color: C.textMuted }}>{fmt(m.cash_balance, cur)}</td>
                <td style={{ ...tdR, color: C.textMuted }}>{fmt(m.monthly_burn_rate, cur)}</td>
                <td style={{ ...tdR, color: C.textMuted }}>{fmtMo(m.implied_runway_months)}</td>
                <td style={{ ...tdR, color: C.textMuted }}>{fmt(m.cac, cur)}</td>
                <td style={{ ...tdR, color: C.textMuted }}>{fmt(m.ltv, cur)}</td>
                <td style={{ ...tdR, color: C.textMuted }}>{fmtRatio(m.ltv_to_cac_ratio)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── VALUATION ───────────────────────────────────────────────────────── */}
      {valuation && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 28 }}>
          {[
            { label: "Normalised FCFF", value: fmt(valuation.fcff, cur), color: C.textWhite, glow: "none" },
            {
              label: "Enterprise Value",
              value: fmt(valuation.ev, cur),
              color: C.indigo,
              sub: `WACC ${(valuation.wacc * 100).toFixed(2)}% · g 2.5%`,
              glow: "rgba(99,102,241,0.08)",
              borderColor: "rgba(99,102,241,0.2)",
            },
            {
              label: "FMV of Equity",
              value: fmt(valuation.equity, cur),
              color: C.emerald,
              sub: "EV + cash · no debt assumed",
              glow: "rgba(52,211,153,0.08)",
              borderColor: "rgba(52,211,153,0.2)",
            },
          ].map((card) => (
            <div
              key={card.label}
              style={{
                backgroundColor: card.glow === "none" ? C.surface : card.glow,
                border: `1px solid ${card.borderColor ?? C.border}`,
                borderRadius: 12,
                padding: "16px 18px",
              }}
            >
              <div style={{ fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: C.textDim, marginBottom: 8 }}>
                {card.label}
              </div>
              <div style={{ height: 1, width: 24, backgroundColor: card.borderColor ?? C.borderLight, marginBottom: 10 }} />
              <div style={{ fontSize: 22, fontWeight: 300, color: card.color, letterSpacing: "-0.01em" }}>
                {card.value}
              </div>
              {card.sub && <div style={{ fontSize: 9, color: C.textFaint, marginTop: 4, fontFamily: "monospace" }}>{card.sub}</div>}
            </div>
          ))}
        </div>
      )}

      {/* ── FOOTER ──────────────────────────────────────────────────────────── */}
      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 8, color: C.textFaint, letterSpacing: "0.1em", textTransform: "uppercase" }}>
          Asymmetrica Valuations · Confidential · For internal use only
        </div>
        <div style={{ fontSize: 8, color: C.textFaint, letterSpacing: "0.08em" }}>
          AI-extracted · {Math.round(data.confidence_score * 100)}% confidence · {today}
        </div>
      </div>
    </div>
  );
}
