"use client";

import { useMemo, useRef } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Check, Download, Table2 } from "lucide-react";

/* ── Default colour palette ─────────────────────────────────────── */

const COLORS = [
  "#6366f1", // indigo
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#ec4899", // pink
  "#84cc16", // lime
];

/* ── Chart spec types ───────────────────────────────────────────── */

interface SeriesSpec {
  key: string;
  color?: string;
  label?: string;
}

interface ChartSpec {
  type: "bar" | "line" | "area" | "pie" | "composed";
  title?: string;
  data: Record<string, unknown>[];
  xKey?: string;
  yKey?: string;
  nameKey?: string;
  valueKey?: string;
  color?: string;
  series?: SeriesSpec[];
  bars?: SeriesSpec[];
  lines?: SeriesSpec[];
  height?: number;
}

/* ── Formatter ──────────────────────────────────────────────────── */

function formatValue(val: unknown): string {
  if (typeof val === "number") {
    if (Math.abs(val) >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
    if (Math.abs(val) >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
    return val % 1 === 0 ? val.toLocaleString() : val.toFixed(2);
  }
  return String(val ?? "");
}

/* ── Custom tooltip ─────────────────────────────────────────────── */

// Stable singleton — avoids creating new JSX on every render.
const TOOLTIP_CONTENT = <ChartTooltipInner />;

function ChartTooltipInner({
  active,
  payload,
  label,
}: {
  active?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background/95 px-3 py-2 shadow-md backdrop-blur-sm">
      {label && (
        <p className="mb-1 text-xs font-medium text-muted-foreground">
          {label}
        </p>
      )}
      {payload.map((entry, i) => (
        <p key={i} className="text-xs" style={{ color: entry.color }}>
          <span className="font-medium">{entry.name || entry.dataKey}:</span>{" "}
          {formatValue(entry.value)}
        </p>
      ))}
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────── *
 *
 * IMPORTANT: This component is rendered INSIDE ReactMarkdown's
 * component tree via the `code` override.  It must NOT use useState
 * or useEffect — Recharts' ResponsiveContainer + animations can
 * cause infinite re‑render loops when combined with React state
 * inside ReactMarkdown.
 *
 * Interactive features (CSV download, table toggle) use refs and
 * direct DOM manipulation instead.
 * ─────────────────────────────────────────────────────────────────── */

interface ChartRendererProps {
  spec: string;
}

export function ChartRenderer({ spec }: ChartRendererProps) {
  const chart = useMemo<ChartSpec | null>(() => {
    try {
      const parsed = JSON.parse(spec);
      if (!parsed.type || !Array.isArray(parsed.data)) return null;
      return parsed as ChartSpec;
    } catch {
      return null;
    }
  }, [spec]);

  const containerRef = useRef<HTMLDivElement>(null);

  if (!chart) {
    return (
      <div className="my-2 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
        Invalid chart specification
      </div>
    );
  }

  const height = chart.height || 300;

  function handleDownload() {
    if (!chart) return;
    const headers = Object.keys(chart.data[0] || {});
    const csv = [
      headers.join(","),
      ...chart.data.map((row) =>
        headers
          .map((h) => {
            const v = row[h];
            const s = String(v ?? "");
            return s.includes(",") ? `"${s}"` : s;
          })
          .join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(chart.title || "chart-data").replace(/\s+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div ref={containerRef} className="my-3 overflow-hidden rounded-xl border bg-card shadow-sm">
      {/* ── Header bar ───────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <h4 className="truncate text-sm font-semibold">
            {chart.title || "Data Visualization"}
          </h4>
          <span className="inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
            <Check className="h-2.5 w-2.5 text-emerald-600 dark:text-emerald-400" />
          </span>
        </div>
        <button
          onClick={handleDownload}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="Download CSV"
        >
          <Download className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── Chart ────────────────────────────────────────────────── */}
      <div className="p-4" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          {renderChart(chart)}
        </ResponsiveContainer>
      </div>

      {/* ── Collapsible data table (native <details>, no React state) */}
      <details className="border-t">
        <summary className="flex cursor-pointer items-center gap-1.5 px-4 py-2 text-xs font-medium text-muted-foreground select-none hover:bg-muted/30 transition-colors">
          <Table2 className="h-3.5 w-3.5" />
          View data table
        </summary>
        <ChartDataTable data={chart.data} />
      </details>
    </div>
  );
}

/* ── Data table view ───────────────────────────────────────────── */

function ChartDataTable({ data }: { data: Record<string, unknown>[] }) {
  if (!data.length) {
    return <p className="p-4 text-xs text-muted-foreground">No data</p>;
  }
  const headers = Object.keys(data[0]);
  return (
    <div className="max-h-[400px] overflow-auto">
      <table className="min-w-full text-xs">
        <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                className="whitespace-nowrap border-b px-3 py-2 text-left text-xs font-semibold"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="transition-colors hover:bg-muted/30">
              {headers.map((h) => (
                <td
                  key={h}
                  className="whitespace-nowrap border-b px-3 py-1.5 text-xs tabular-nums"
                >
                  {formatValue(row[h])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Chart type renderers ───────────────────────────────────────── */

function renderChart(chart: ChartSpec) {
  switch (chart.type) {
    case "bar":
      return renderBarChart(chart);
    case "line":
      return renderLineChart(chart);
    case "area":
      return renderAreaChart(chart);
    case "pie":
      return renderPieChart(chart);
    case "composed":
      return renderComposedChart(chart);
    default:
      return renderBarChart(chart);
  }
}

function renderBarChart(chart: ChartSpec) {
  const xKey = chart.xKey || "name";
  const series = chart.series || [
    { key: chart.yKey || "value", color: chart.color || COLORS[0] },
  ];

  return (
    <BarChart data={chart.data} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
      <XAxis
        dataKey={xKey}
        tick={{ fontSize: 11 }}
        className="text-muted-foreground"
      />
      <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" tickFormatter={formatValue} />
      <Tooltip content={TOOLTIP_CONTENT} />
      {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
      {series.map((s, i) => (
        <Bar
          key={s.key}
          dataKey={s.key}
          name={s.label || s.key}
          fill={s.color || COLORS[i % COLORS.length]}
          radius={[4, 4, 0, 0]}
          isAnimationActive={false}
        />
      ))}
    </BarChart>
  );
}

function renderLineChart(chart: ChartSpec) {
  const xKey = chart.xKey || "name";
  const series = chart.series || [
    { key: chart.yKey || "value", color: chart.color || COLORS[0] },
  ];

  return (
    <LineChart data={chart.data} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
      <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
      <YAxis tick={{ fontSize: 11 }} tickFormatter={formatValue} />
      <Tooltip content={TOOLTIP_CONTENT} />
      {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
      {series.map((s, i) => (
        <Line
          key={s.key}
          type="monotone"
          dataKey={s.key}
          name={s.label || s.key}
          stroke={s.color || COLORS[i % COLORS.length]}
          strokeWidth={2}
          dot={{ r: 3 }}
          activeDot={{ r: 5 }}
          isAnimationActive={false}
        />
      ))}
    </LineChart>
  );
}

function renderAreaChart(chart: ChartSpec) {
  const xKey = chart.xKey || "name";
  const series = chart.series || [
    { key: chart.yKey || "value", color: chart.color || COLORS[0] },
  ];

  return (
    <AreaChart data={chart.data} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
      <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
      <YAxis tick={{ fontSize: 11 }} tickFormatter={formatValue} />
      <Tooltip content={TOOLTIP_CONTENT} />
      {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
      {series.map((s, i) => {
        const color = s.color || COLORS[i % COLORS.length];
        return (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label || s.key}
            stroke={color}
            fill={color}
            fillOpacity={0.15}
            strokeWidth={2}
            isAnimationActive={false}
          />
        );
      })}
    </AreaChart>
  );
}

function renderPieChart(chart: ChartSpec) {
  const nameKey = chart.nameKey || chart.xKey || "name";
  const valueKey = chart.valueKey || chart.yKey || "value";

  return (
    <PieChart>
      <Tooltip content={TOOLTIP_CONTENT} />
      <Legend wrapperStyle={{ fontSize: 11 }} />
      <Pie
        data={chart.data}
        dataKey={valueKey}
        nameKey={nameKey}
        cx="50%"
        cy="50%"
        outerRadius={100}
        innerRadius={40}
        paddingAngle={2}
        label={renderPieLabel}
        labelLine={{ strokeWidth: 1 }}
        isAnimationActive={false}
      >
        {chart.data.map((_, i) => (
          <Cell key={i} fill={COLORS[i % COLORS.length]} />
        ))}
      </Pie>
    </PieChart>
  );
}

// Stable reference — avoids new function on every render
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderPieLabel(entry: any) {
  const name = String(entry.name ?? "");
  const pct = Number(entry.percent ?? 0);
  return `${name} ${(pct * 100).toFixed(0)}%`;
}

function renderComposedChart(chart: ChartSpec) {
  const xKey = chart.xKey || "name";
  const bars = chart.bars || [];
  const lines = chart.lines || [];

  return (
    <ComposedChart data={chart.data} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
      <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
      <YAxis tick={{ fontSize: 11 }} tickFormatter={formatValue} />
      <Tooltip content={TOOLTIP_CONTENT} />
      <Legend wrapperStyle={{ fontSize: 11 }} />
      {bars.map((s, i) => (
        <Bar
          key={s.key}
          dataKey={s.key}
          name={s.label || s.key}
          fill={s.color || COLORS[i % COLORS.length]}
          radius={[4, 4, 0, 0]}
          isAnimationActive={false}
        />
      ))}
      {lines.map((s, i) => (
        <Line
          key={s.key}
          type="monotone"
          dataKey={s.key}
          name={s.label || s.key}
          stroke={s.color || COLORS[(bars.length + i) % COLORS.length]}
          strokeWidth={2}
          dot={{ r: 3 }}
          isAnimationActive={false}
        />
      ))}
    </ComposedChart>
  );
}
