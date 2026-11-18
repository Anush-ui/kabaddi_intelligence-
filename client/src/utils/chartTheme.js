export const CHART_COLORS = {
  teamA: "#22d3ee",
  teamB: "#fb7185",
  accent: "#34d399",
  amber: "#fbbf24",
  violet: "#a78bfa",
  muted: "#8595ab",
  grid: "rgba(148, 163, 184, 0.13)",
  text: "#e9eef7",
  panel: "#0c1523",
};

export const axisProps = {
  stroke: "rgba(148, 163, 184, 0.18)",
  tick: { fill: CHART_COLORS.muted, fontSize: 11 },
  tickLine: false,
};

export const tooltipProps = {
  contentStyle: {
    background: "rgba(9, 16, 27, 0.96)",
    border: "1px solid rgba(148, 163, 184, 0.22)",
    borderRadius: 10,
    boxShadow: "0 18px 40px rgba(0, 0, 0, 0.45)",
    fontSize: 12,
    color: CHART_COLORS.text,
  },
  labelStyle: { color: CHART_COLORS.text, fontWeight: 600, marginBottom: 4 },
  itemStyle: { color: CHART_COLORS.muted, fontSize: 12 },
  cursor: { fill: "rgba(148, 163, 184, 0.06)" },
};

export function pct(value, digits = 0) {
  return `${((Number(value) || 0) * 100).toFixed(digits)}%`;
}
