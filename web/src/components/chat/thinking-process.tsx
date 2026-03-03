"use client";

import { useState, useMemo } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Clock,
  Database,
  FileCode2,
  Wrench,
  Copy,
  Check,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ToolActivity } from "./types";

/* ── Helpers ─────────────────────────────────────────────────────── */

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function getToolIcon(name: string) {
  const lower = name.toLowerCase();
  if (
    lower.includes("sql") ||
    lower.includes("query") ||
    lower.includes("execute") ||
    lower.includes("exec") ||
    lower.includes("databricks") ||
    lower.includes("snowflake")
  )
    return <Database className="h-3 w-3" />;
  if (lower.includes("read") || lower.includes("write") || lower.includes("file"))
    return <FileCode2 className="h-3 w-3" />;
  return <Wrench className="h-3 w-3" />;
}

function getStatusIcon(phase: string) {
  if (phase === "running")
    return <Loader2 className="h-3 w-3 animate-spin text-blue-500" />;
  if (phase === "error")
    return <AlertCircle className="h-3 w-3 text-red-500" />;
  return <CheckCircle2 className="h-3 w-3 text-emerald-500" />;
}

/** Concise summary of the tool's arguments (skip SQL — shown separately). */
function summariseArgs(activity: ToolActivity): string | null {
  if (activity.sql) return null;
  const args = activity.args;
  if (!args || Object.keys(args).length === 0) return null;

  const parts: string[] = [];
  for (const [key, val] of Object.entries(args)) {
    if (val === null || val === undefined) continue;
    const str = typeof val === "string" ? val : JSON.stringify(val);
    parts.push(str.length > 200 ? `${key}: ${str.slice(0, 180)}…` : `${key}: ${str}`);
  }
  return parts.length > 0 ? parts.join("\n") : null;
}

/** Concise summary of the tool's result. */
function summariseResult(activity: ToolActivity): string | null {
  if (!activity.result) return null;
  if (activity.resultData && activity.resultData.length > 0) {
    const keys = Object.keys(activity.resultData[0]);
    return `${activity.resultData.length} rows × ${keys.length} columns (${keys.join(", ")})`;
  }
  const r = activity.result;
  return r.length > 400 ? r.slice(0, 380) + "…" : r;
}

/* ── Main component ──────────────────────────────────────────────── */

interface ThinkingProcessProps {
  activities: ToolActivity[];
}

export function ThinkingProcess({ activities }: ThinkingProcessProps) {
  const [expanded, setExpanded] = useState(false);
  const [expandedTool, setExpandedTool] = useState<number | null>(null);

  const totalDuration = useMemo(
    () => activities.reduce((sum, a) => sum + (a.durationMs || 0), 0),
    [activities],
  );

  const allDone = activities.every((a) => a.phase !== "running");
  const hasErrors = activities.some((a) => a.phase === "error");
  const runningCount = activities.filter((a) => a.phase === "running").length;

  return (
    <div className="my-1.5 ml-8 max-w-[75%]">
      {/* ── Collapsed bar ─────────────────────────────────────────── */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-all",
          "border border-border/40 bg-muted/20 hover:bg-muted/50",
          expanded && "rounded-b-none border-b-transparent",
        )}
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}

        {runningCount > 0 ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500 shrink-0" />
        ) : hasErrors ? (
          <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
        )}

        <span className="text-xs text-muted-foreground">
          {runningCount > 0 ? (
            <>
              Working&hellip;{" "}
              <span className="font-medium text-foreground">
                {runningCount} tool{runningCount !== 1 && "s"} running
              </span>
            </>
          ) : (
            <>
              Analyzed using{" "}
              <span className="font-medium text-foreground">
                {activities.length} step{activities.length !== 1 && "s"}
              </span>
            </>
          )}
        </span>

        {/* Compact badges when collapsed */}
        {!expanded && (
          <div className="ml-1 flex items-center gap-1 overflow-hidden">
            {activities.slice(0, 4).map((a, i) => (
              <Badge
                key={i}
                variant="outline"
                className="h-[18px] shrink-0 gap-0.5 px-1 text-[9px] font-normal"
              >
                {getToolIcon(a.name)}
                {a.label || a.name}
              </Badge>
            ))}
            {activities.length > 4 && (
              <span className="shrink-0 text-[9px] text-muted-foreground">
                +{activities.length - 4}
              </span>
            )}
          </div>
        )}

        {allDone && totalDuration > 0 && (
          <Badge
            variant="secondary"
            className="ml-auto h-[18px] gap-0.5 px-1.5 text-[9px] shrink-0"
          >
            <Clock className="h-2.5 w-2.5" />
            {formatDuration(totalDuration)}
          </Badge>
        )}
      </button>

      {/* ── Expanded detail ───────────────────────────────────────── */}
      {expanded && (
        <div className="rounded-b-lg border border-t-0 border-border/40 bg-card/50">
          {activities.map((activity, i) => (
            <ToolStepRow
              key={i}
              activity={activity}
              isLast={i === activities.length - 1}
              expanded={expandedTool === i}
              onToggle={() => setExpandedTool(expandedTool === i ? null : i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Individual tool step row ────────────────────────────────────── */

function ToolStepRow({
  activity,
  isLast,
  expanded,
  onToggle,
}: {
  activity: ToolActivity;
  isLast: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [copiedSql, setCopiedSql] = useState(false);
  const argsSummary = useMemo(() => summariseArgs(activity), [activity]);
  const resultSummary = useMemo(() => summariseResult(activity), [activity]);
  const hasSql = Boolean(activity.sql);
  const hasDetail = hasSql || argsSummary || resultSummary || activity.error;

  return (
    <div className={cn(!isLast && "border-b border-border/30")}>
      {/* Row header */}
      <button
        onClick={hasDetail ? onToggle : undefined}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-2 text-left transition-colors",
          hasDetail && "hover:bg-muted/30 cursor-pointer",
          !hasDetail && "cursor-default",
        )}
      >
        {/* Timeline dot */}
        <div
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            activity.phase === "running" && "bg-blue-500",
            activity.phase === "completed" && "bg-emerald-500",
            activity.phase === "error" && "bg-red-500",
          )}
        />

        <span className="text-muted-foreground shrink-0">{getToolIcon(activity.name)}</span>
        <span className="text-[11px] font-medium">{activity.label || activity.name}</span>

        {getStatusIcon(activity.phase)}

        {/* Row count badge */}
        {activity.resultData && activity.resultData.length > 0 && (
          <Badge variant="outline" className="h-[16px] px-1 text-[8px] font-normal gap-0.5">
            {activity.resultData.length} rows
          </Badge>
        )}

        {/* Duration */}
        {activity.durationMs != null && activity.durationMs > 0 && (
          <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
            {formatDuration(activity.durationMs)}
          </span>
        )}

        {/* Expand chevron */}
        {hasDetail && (
          <span className="text-muted-foreground">
            {expanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </span>
        )}
      </button>

      {/* Expanded detail panel */}
      {expanded && hasDetail && (
        <div className="mx-3 mb-2.5 mt-0.5 space-y-2 rounded-md border border-border/30 bg-muted/10 p-2.5">
          {/* SQL */}
          {hasSql && activity.sql && (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                  SQL Query
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(activity.sql!);
                    setCopiedSql(true);
                    setTimeout(() => setCopiedSql(false), 2000);
                  }}
                  className="flex items-center gap-0.5 text-[9px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  {copiedSql ? (
                    <>
                      <Check className="h-2.5 w-2.5" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-2.5 w-2.5" /> Copy
                    </>
                  )}
                </button>
              </div>
              <div className="rounded-md overflow-hidden">
                <SyntaxHighlighter
                  style={oneDark}
                  language="sql"
                  PreTag="div"
                  customStyle={{
                    margin: 0,
                    padding: "0.5rem 0.75rem",
                    background: "#282c34",
                    fontSize: "0.65rem",
                    maxHeight: "150px",
                    overflow: "auto",
                    borderRadius: "0.375rem",
                  }}
                >
                  {activity.sql}
                </SyntaxHighlighter>
              </div>
            </div>
          )}

          {/* Arguments */}
          {argsSummary && (
            <div>
              <span className="mb-1 block text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                Input
              </span>
              <pre className="whitespace-pre-wrap rounded-md bg-muted/50 px-2.5 py-1.5 text-[10px] font-mono text-muted-foreground leading-relaxed max-h-[120px] overflow-auto">
                {argsSummary}
              </pre>
            </div>
          )}

          {/* Result */}
          {resultSummary && (
            <div>
              <span className="mb-1 block text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                Output
              </span>
              <pre className="whitespace-pre-wrap rounded-md bg-muted/50 px-2.5 py-1.5 text-[10px] font-mono text-foreground/70 leading-relaxed max-h-[120px] overflow-auto">
                {resultSummary}
              </pre>
            </div>
          )}

          {/* Error */}
          {activity.error && (
            <div className="flex items-start gap-1.5 rounded-md bg-red-50 px-2.5 py-1.5 dark:bg-red-950/30">
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-red-500" />
              <pre className="whitespace-pre-wrap text-[10px] text-red-700 dark:text-red-400 leading-relaxed">
                {activity.error}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
