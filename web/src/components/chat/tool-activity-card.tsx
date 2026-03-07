"use client";

import { useState, useMemo } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  ChevronDown,
  ChevronRight,
  Database,
  FileCode2,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Copy,
  Check,
  Clock,
  TableIcon,
  BarChart3,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ToolActivity } from "./types";
import { ChartRenderer } from "./chart-renderer";

/* ── Tool metadata maps ──────────────────────────────────────────── */

const TOOL_ICONS: Record<string, React.ReactNode> = {
  execute_sql: <Database className="h-3.5 w-3.5" />,
  run_query: <Database className="h-3.5 w-3.5" />,
  query: <Database className="h-3.5 w-3.5" />,
  sql: <Database className="h-3.5 w-3.5" />,
  read_file: <FileCode2 className="h-3.5 w-3.5" />,
  write_file: <FileCode2 className="h-3.5 w-3.5" />,
};

const TOOL_LABELS: Record<string, string> = {
  execute_sql: "SQL Query",
  run_query: "SQL Query",
  query: "SQL Query",
  sql: "SQL Query",
  read_file: "Read File",
  write_file: "Write File",
};

function getToolIcon(name: string) {
  const lower = name.toLowerCase();
  for (const [key, icon] of Object.entries(TOOL_ICONS)) {
    if (lower.includes(key)) return icon;
  }
  return <FileCode2 className="h-3.5 w-3.5" />;
}

function getToolLabel(name: string, customLabel?: string): string {
  if (customLabel) return customLabel;
  const lower = name.toLowerCase();
  for (const [key, label] of Object.entries(TOOL_LABELS)) {
    if (lower.includes(key)) return label;
  }
  return name;
}

function isSqlTool(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.includes("sql") ||
    lower.includes("query") ||
    lower.includes("execute") ||
    lower.includes("databricks") ||
    lower.includes("snowflake") ||
    lower.includes("bigquery") ||
    lower.includes("duckdb") ||
    lower.includes("postgres")
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatNumber(val: unknown): string {
  if (typeof val === "number") {
    if (Math.abs(val) >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
    if (Math.abs(val) >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
    return val % 1 === 0 ? val.toLocaleString() : val.toFixed(2);
  }
  return String(val ?? "—");
}

/* ── Try to parse result text into structured data ───────────────── */

function tryParseResultData(
  result?: string,
  existingData?: Record<string, unknown>[],
): Record<string, unknown>[] | null {
  if (existingData && existingData.length > 0) return existingData;
  if (!result) return null;
  try {
    const parsed = JSON.parse(result);

    // Direct array of objects — most common
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "object") {
      return parsed as Record<string, unknown>[];
    }

    // Wrapper object — look for a nested array (e.g. {data: [...], state: ...})
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      for (const key of ["data", "rows", "results", "records", "items"]) {
        const nested = (parsed as Record<string, unknown>)[key];
        if (Array.isArray(nested) && nested.length > 0) {
          // Array of objects → use directly
          if (typeof nested[0] === "object" && !Array.isArray(nested[0])) {
            return nested as Record<string, unknown>[];
          }
          // Array of arrays (e.g. Databricks data_array) — try to pair with column names
          if (Array.isArray(nested[0])) {
            const columns = tryExtractColumns(parsed as Record<string, unknown>);
            if (columns && columns.length === (nested[0] as unknown[]).length) {
              return (nested as unknown[][]).map((row) => {
                const obj: Record<string, unknown> = {};
                columns.forEach((col, i) => {
                  const val = row[i];
                  const num = typeof val === "string" ? Number(val) : NaN;
                  obj[col] = !isNaN(num) && val !== "" ? num : val;
                });
                return obj;
              });
            }
          }
        }
      }
    }
  } catch {
    // Not JSON — try parsing markdown table
    return parseMarkdownTable(result);
  }
  return null;
}

/** Try to extract column names from a Databricks-style response */
function tryExtractColumns(obj: Record<string, unknown>): string[] | null {
  // Databricks format: .manifest.schema.columns[].name
  const manifest = obj.manifest as Record<string, unknown> | undefined;
  if (manifest) {
    const schema = manifest.schema as Record<string, unknown> | undefined;
    if (schema) {
      const cols = schema.columns as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(cols)) {
        const names = cols.map((c) => String(c.name || c.column_name || ""));
        if (names.every(Boolean)) return names;
      }
    }
  }
  // Generic: look for a "columns" or "headers" array of strings
  for (const key of ["columns", "headers", "fields", "column_names"]) {
    const arr = obj[key];
    if (Array.isArray(arr) && arr.length > 0 && typeof arr[0] === "string") {
      return arr as string[];
    }
  }
  return null;
}

function parseMarkdownTable(text: string): Record<string, unknown>[] | null {
  const lines = text.trim().split("\n").filter((l) => l.trim());
  if (lines.length < 3) return null;

  // Check if it looks like a markdown table
  const headerLine = lines[0];
  if (!headerLine.includes("|")) return null;

  const headers = headerLine
    .split("|")
    .map((h) => h.trim())
    .filter(Boolean);
  if (headers.length < 2) return null;

  // Skip separator line (---|---)
  const dataLines = lines.slice(2);
  const rows: Record<string, unknown>[] = [];

  for (const line of dataLines) {
    if (!line.includes("|")) continue;
    const cells = line
      .split("|")
      .map((c) => c.trim())
      .filter((_, i, arr) => i > 0 && i < arr.length); // trim empty first/last from |...|
    if (cells.length !== headers.length) continue;
    const row: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      const val = cells[i];
      const num = Number(val?.replace(/,/g, ""));
      row[h] = isNaN(num) || val === "" ? val : num;
    });
    rows.push(row);
  }

  return rows.length > 0 ? rows : null;
}

/* ── Auto-detect chart spec from data ────────────────────────────── */

function autoChartSpec(data: Record<string, unknown>[]): string | null {
  if (data.length < 2) return null;

  const keys = Object.keys(data[0]);
  if (keys.length < 2) return null;

  // Find date/text key for x-axis and numeric keys for y-axis
  const numericKeys = keys.filter((k) =>
    data.every((row) => typeof row[k] === "number"),
  );
  const textKeys = keys.filter((k) => !numericKeys.includes(k));

  if (numericKeys.length === 0 || textKeys.length === 0) return null;

  const xKey = textKeys[0];
  const isTimeSeries =
    xKey.toLowerCase().includes("date") ||
    xKey.toLowerCase().includes("month") ||
    xKey.toLowerCase().includes("year") ||
    xKey.toLowerCase().includes("time") ||
    xKey.toLowerCase().includes("day") ||
    xKey.toLowerCase().includes("week") ||
    xKey.toLowerCase().includes("quarter");

  // Choose chart type intelligently
  const chartType = isTimeSeries
    ? data.length > 12
      ? "area"
      : "line"
    : data.length <= 8
      ? "bar"
      : "line";

  const series = numericKeys.slice(0, 4).map((k) => ({
    key: k,
    label: k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
  }));

  // For composed charts (bars + lines), split if there are multiple series
  if (series.length >= 2 && chartType === "bar") {
    return JSON.stringify({
      type: "composed",
      data: data.slice(0, 50),
      xKey,
      bars: [series[0]],
      lines: series.slice(1),
    });
  }

  return JSON.stringify({
    type: chartType,
    data: data.slice(0, 50),
    xKey,
    series,
  });
}

/* ── Main component ──────────────────────────────────────────────── */

interface ToolActivityCardProps {
  activity: ToolActivity;
}

export function ToolActivityCard({ activity }: ToolActivityCardProps) {
  const [showSql, setShowSql] = useState(false);
  const [showData, setShowData] = useState(false);
  const [showChart, setShowChart] = useState(true);
  const [copied, setCopied] = useState(false);

  const { name, phase, sql, durationMs, error, result } = activity;

  const parsedData = useMemo(
    () => tryParseResultData(result, activity.resultData),
    [result, activity.resultData],
  );

  const chartSpec = useMemo(
    () => (parsedData ? autoChartSpec(parsedData) : null),
    [parsedData],
  );

  const icon = getToolIcon(name);
  const label = getToolLabel(name, activity.label);
  const hasSql = Boolean(sql) && isSqlTool(name);
  const hasData = parsedData && parsedData.length > 0;
  const dataKeys = hasData ? Object.keys(parsedData![0]) : [];
  const rowCount = parsedData?.length ?? 0;

  function handleCopySql() {
    if (sql) {
      navigator.clipboard.writeText(sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="my-2 ml-8 overflow-hidden rounded-lg border bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b bg-muted/30 px-3 py-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          {icon}
        </div>
        <span className="text-xs font-semibold">{label}</span>

        {/* Status indicator */}
        {phase === "running" && (
          <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
        )}
        {phase === "completed" && (
          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
        )}
        {phase === "error" && (
          <AlertCircle className="h-3 w-3 text-red-500" />
        )}

        {/* Duration */}
        {durationMs != null && durationMs > 0 && (
          <Badge variant="secondary" className="ml-auto h-4 gap-1 px-1.5 text-[9px]">
            <Clock className="h-2.5 w-2.5" />
            {formatDuration(durationMs)}
          </Badge>
        )}

        {/* Row count */}
        {hasData && (
          <Badge variant="outline" className="h-4 gap-1 px-1.5 text-[9px]">
            <TableIcon className="h-2.5 w-2.5" />
            {rowCount} rows
          </Badge>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-1 border-b bg-muted/10 px-3 py-1.5">
        {hasSql && (
          <button
            onClick={() => setShowSql((v) => !v)}
            className={cn(
              "flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors",
              showSql
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {showSql ? (
              <ChevronDown className="h-2.5 w-2.5" />
            ) : (
              <ChevronRight className="h-2.5 w-2.5" />
            )}
            <FileCode2 className="h-2.5 w-2.5" />
            SQL
          </button>
        )}
        {hasData && (
          <>
            <button
              onClick={() => setShowData((v) => !v)}
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors",
                showData
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {showData ? (
                <ChevronDown className="h-2.5 w-2.5" />
              ) : (
                <ChevronRight className="h-2.5 w-2.5" />
              )}
              <TableIcon className="h-2.5 w-2.5" />
              Data
            </button>
            {chartSpec && (
              <button
                onClick={() => setShowChart((v) => !v)}
                className={cn(
                  "flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors",
                  showChart
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {showChart ? (
                  <ChevronDown className="h-2.5 w-2.5" />
                ) : (
                  <ChevronRight className="h-2.5 w-2.5" />
                )}
                <BarChart3 className="h-2.5 w-2.5" />
                Chart
              </button>
            )}
          </>
        )}
      </div>

      {/* SQL section */}
      {showSql && sql && (
        <div className="relative border-b">
          <div className="flex items-center justify-between border-b border-white/10 bg-[#282c34] px-3 py-1">
            <span className="text-[10px] font-mono text-white/50">SQL</span>
            <button
              onClick={handleCopySql}
              className="flex items-center gap-1 text-[10px] text-white/40 transition-colors hover:text-white/80"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3" /> Copied
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" /> Copy
                </>
              )}
            </button>
          </div>
          <SyntaxHighlighter
            style={oneDark}
            language="sql"
            PreTag="div"
            customStyle={{
              margin: 0,
              padding: "0.75rem",
              background: "#282c34",
              fontSize: "0.7rem",
              maxHeight: "200px",
              overflow: "auto",
            }}
          >
            {sql}
          </SyntaxHighlighter>
        </div>
      )}

      {/* Chart section */}
      {showChart && chartSpec && (
        <div className="border-b p-2">
          <ChartRenderer spec={chartSpec} />
        </div>
      )}

      {/* Data table section */}
      {showData && hasData && (
        <div className="max-h-[300px] overflow-auto border-b">
          <table className="w-full text-[10px]">
            <thead className="sticky top-0 bg-muted">
              <tr>
                {dataKeys.map((key) => (
                  <th
                    key={key}
                    className="whitespace-nowrap border-b px-2.5 py-1.5 text-left font-semibold text-muted-foreground"
                  >
                    {key.replace(/_/g, " ")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {parsedData!.slice(0, 100).map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-border/50 transition-colors hover:bg-muted/30"
                >
                  {dataKeys.map((key) => (
                    <td
                      key={key}
                      className={cn(
                        "whitespace-nowrap px-2.5 py-1",
                        typeof row[key] === "number" && "tabular-nums text-right font-mono",
                      )}
                    >
                      {typeof row[key] === "number"
                        ? formatNumber(row[key])
                        : String(row[key] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {rowCount > 100 && (
            <div className="bg-muted/50 px-3 py-1 text-center text-[9px] text-muted-foreground">
              Showing 100 of {rowCount} rows
            </div>
          )}
        </div>
      )}

      {/* Error section */}
      {error && (
        <div className="border-b bg-red-50 px-3 py-2 text-[11px] text-red-700 dark:bg-red-950/30 dark:text-red-400">
          <AlertCircle className="mr-1 inline h-3 w-3" />
          {error}
        </div>
      )}

      {/* Summary metrics for completed queries */}
      {phase === "completed" && hasData && !showData && !showChart && (
        <div className="px-3 py-2">
          <div className="flex flex-wrap gap-3">
            {dataKeys.slice(0, 4).map((key) => {
              const vals = parsedData!.map((r) => r[key]).filter((v) => typeof v === "number") as number[];
              if (vals.length === 0) return null;
              const sum = vals.reduce((a, b) => a + b, 0);
              const avg = sum / vals.length;
              return (
                <div key={key} className="flex flex-col">
                  <span className="text-[9px] text-muted-foreground">
                    {key.replace(/_/g, " ")}
                  </span>
                  <span className="text-xs font-semibold tabular-nums">
                    avg {formatNumber(avg)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Compact activity timeline (groups multiple tools) ───────────── */

interface ToolActivityTimelineProps {
  activities: ToolActivity[];
}

export function ToolActivityTimeline({ activities }: ToolActivityTimelineProps) {
  if (activities.length === 0) return null;
  if (activities.length === 1) {
    return <ToolActivityCard activity={activities[0]} />;
  }

  return (
    <div className="my-2 ml-8 space-y-0">
      <div className="flex items-center gap-2 pb-1">
        <div className="h-px flex-1 bg-border" />
        <span className="text-[9px] font-medium text-muted-foreground">
          {activities.length} tool calls
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>
      {activities.map((a, i) => (
        <ToolActivityCard key={`${a.name}-${i}`} activity={a} />
      ))}
    </div>
  );
}
