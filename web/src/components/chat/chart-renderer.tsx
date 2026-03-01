"use client";

import { useMemo } from "react";
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

function ChartTooltip({
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

/* ── Main component ─────────────────────────────────────────────── */

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

  if (!chart) {
    return (
      <div className="my-2 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
        Invalid chart specification
      </div>
    );
  }

  const height = chart.height || 300;

  return (
    <div className="my-3 rounded-lg border bg-card p-4">
      {chart.title && (
        <h4 className="mb-3 text-sm font-semibold">{chart.title}</h4>
      )}
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer width="100%" height="100%">
          {renderChart(chart)}
        </ResponsiveContainer>
      </div>
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
      <Tooltip content={<ChartTooltip />} />
      {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
      {series.map((s, i) => (
        <Bar
          key={s.key}
          dataKey={s.key}
          name={s.label || s.key}
          fill={s.color || COLORS[i % COLORS.length]}
          radius={[4, 4, 0, 0]}
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
      <Tooltip content={<ChartTooltip />} />
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
      <Tooltip content={<ChartTooltip />} />
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
          />
        );
      })}
    </AreaChart>
  );
}

function renderPieChart(chart: ChartSpec) {
  const nameKey = chart.nameKey || chart.xKey || "name";
  const valueKey = chart.valueKey || chart.yKey || "value";

  const renderLabel = (entry: Record<string, unknown>) => {
    const name = String(entry.name ?? "");
    const pct = Number(entry.percent ?? 0);
    return `${name} ${(pct * 100).toFixed(0)}%`;
  };

  return (
    <PieChart>
      <Tooltip content={<ChartTooltip />} />
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
        label={renderLabel}
        labelLine={{ strokeWidth: 1 }}
      >
        {chart.data.map((_, i) => (
          <Cell key={i} fill={COLORS[i % COLORS.length]} />
        ))}
      </Pie>
    </PieChart>
  );
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
      <Tooltip content={<ChartTooltip />} />
      <Legend wrapperStyle={{ fontSize: 11 }} />
      {bars.map((s, i) => (
        <Bar
          key={s.key}
          dataKey={s.key}
          name={s.label || s.key}
          fill={s.color || COLORS[i % COLORS.length]}
          radius={[4, 4, 0, 0]}
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
        />
      ))}
    </ComposedChart>
  );
}
