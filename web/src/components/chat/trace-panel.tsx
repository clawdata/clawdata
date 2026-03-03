"use client";

import { useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  ChevronDown,
  ChevronRight,
  Database,
  FileCode2,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Copy,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TraceEvent } from "./types";

/* ── Colour & label maps ── */

const streamColor: Record<string, string> = {
  ack: "text-gray-400",
  assistant: "text-emerald-500",
  tool: "text-amber-500",
  lifecycle: "text-purple-500",
  delegation: "text-blue-500",
  context: "text-cyan-500",
  summary: "text-rose-500",
};

const streamBgColor: Record<string, string> = {
  tool: "bg-amber-500/5",
  context: "bg-cyan-500/5",
  summary: "bg-rose-500/5",
};

const phaseLabel: Record<string, string> = {
  ack: "ACK",
  primary: "RUN",
  announce: "SUB",
  gap: "GAP",
  subagent: "SUB",
  context: "CTX",
  summary: "END",
};

/* ── Helpers ── */

function extractSqlFromArgs(args: Record<string, unknown>): string | null {
  const candidates = ["query", "sql", "statement", "code", "script"];
  for (const key of candidates) {
    if (typeof args[key] === "string" && args[key]) return args[key] as string;
  }
  for (const val of Object.values(args)) {
    if (
      typeof val === "string" &&
      val.length > 20 &&
      /\b(SELECT|INSERT|UPDATE|DELETE|CREATE|WITH|DROP|ALTER)\b/i.test(val)
    ) {
      return val;
    }
  }
  return null;
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

function getToolIcon(name: string) {
  if (isSqlTool(name)) return <Database className="h-3 w-3" />;
  return <FileCode2 className="h-3 w-3" />;
}

/* ── Component ── */

interface TracePanelProps {
  events: TraceEvent[];
}

export function TracePanel({ events }: TracePanelProps) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState<"all" | "tools" | "context">("all");

  function toggle(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filtered = events.filter((evt) => {
    if (filter === "tools") return evt.stream === "tool";
    if (filter === "context") return evt.stream === "context" || evt.stream === "summary";
    return true;
  });

  const toolCount = events.filter((e) => e.stream === "tool").length;

  return (
    <div className="flex w-[40%] flex-col overflow-hidden rounded-lg border bg-card">
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <Activity className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Event Trace</span>
        <Badge variant="secondary" className="ml-auto text-[10px]">
          {events.length} events
        </Badge>
      </div>

      {/* Filter bar */}
      {events.length > 0 && (
        <div className="flex gap-1 border-b px-3 py-1.5">
          {(
            [
              { key: "all" as const, label: "All", count: events.length },
              { key: "tools" as const, label: "Tools", count: toolCount },
              { key: "context" as const, label: "Context", count: events.length - toolCount },
            ]
          ).map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors",
                filter === f.key
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {f.label}
              <span className="ml-1 opacity-60">{f.count}</span>
            </button>
          ))}
        </div>
      )}

      <ScrollArea className="h-full">
        {events.length === 0 ? (
          <div className="flex h-full min-h-32 items-center justify-center text-xs text-muted-foreground">
            Send a message to see events
          </div>
        ) : (
          <div className="divide-y text-xs">
            {filtered.map((evt) => (
              <TraceRow
                key={evt.id}
                event={evt}
                isExpanded={expanded.has(evt.id)}
                onToggle={() => toggle(evt.id)}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

/* ── Single trace row ── */

function TraceRow({
  event: evt,
  isExpanded,
  onToggle,
}: {
  event: TraceEvent;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const sColor = streamColor[evt.stream] || "text-muted-foreground";
  const sBg = streamBgColor[evt.stream] || "";
  const pLabel = phaseLabel[evt.phase] || evt.phase.toUpperCase();
  const time = evt.ts
    ? new Date(evt.ts).toLocaleTimeString("en-US", {
        hour12: false,
        fractionalSecondDigits: 3,
      })
    : "—";

  const preview = buildPreview(evt);
  const isTool = evt.stream === "tool";
  const toolName = isTool ? (evt.data.name || evt.data.tool || "") : "";
  const toolPhase = isTool ? (evt.data.phase || "") : "";

  return (
    <button
      onClick={onToggle}
      className={cn(
        "flex w-full flex-col gap-1 px-3 py-2 text-left transition-colors hover:bg-muted/50",
        isExpanded && sBg,
      )}
    >
      <div className="flex items-center gap-2">
        {isExpanded ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
        )}

        {/* Tool icon for tool events */}
        {isTool && toolName && (
          <span className={cn("shrink-0", sColor)}>
            {getToolIcon(toolName)}
          </span>
        )}

        <Badge variant="outline" className="h-4 px-1 text-[9px] font-mono">
          {pLabel}
        </Badge>
        <span className={cn("font-mono font-semibold", sColor)}>
          {isTool && toolName ? toolName : evt.stream || "?"}
        </span>

        {/* Phase badge for tools */}
        {isTool && toolPhase && (
          <Badge
            variant={
              toolPhase === "start"
                ? "secondary"
                : toolPhase === "result" || toolPhase === "end" || toolPhase === "complete"
                  ? "default"
                  : "outline"
            }
            className="h-3.5 px-1 text-[8px]"
          >
            {toolPhase}
          </Badge>
        )}

        <span className="truncate text-muted-foreground">{preview}</span>
        <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
          {time}
        </span>
      </div>

      {/* Inline SQL preview for tool start events (before expanding) */}
      {!isExpanded && isTool && toolPhase === "start" && toolName && (() => {
        const args = evt.data.args || evt.data.input || {};
        const sql = extractSqlFromArgs(args);
        if (!sql) return null;
        return (
          <div className="ml-6 mt-0.5 truncate font-mono text-[9px] text-amber-600/70 dark:text-amber-400/60">
            {sql.replace(/\s+/g, " ").slice(0, 80)}…
          </div>
        );
      })()}

      {isExpanded && <TraceDetail event={evt} />}
    </button>
  );
}

/* ── Preview text builder ── */

function buildPreview(evt: TraceEvent): string {
  const toolName = evt.data.name || evt.data.tool || "";
  const toolPhase = evt.data.phase || "";
  const delta = evt.data.delta;
  const tokens = evt.data.tokens as number | undefined;
  const delegationEvent = evt.data.event as string | undefined;
  const delegationMsg = evt.data.message as string | undefined;

  if (evt.stream === "context" && evt.data.event === "pre_send") {
    const model = evt.data.model || "?";
    const enabled = (evt.data.skills_enabled as string[]) || [];
    const disabled = (evt.data.skills_disabled as string[]) || [];
    const core = (evt.data.core_skills as string[]) || [];
    const mem = evt.data.memory_injected ? "memory \u2713" : "no memory";
    const corePart = core.length > 0 ? `, ${core.length} core` : "";
    return `model: ${model}, ${mem}, ${enabled.length} skill(s) on${corePart}, ${disabled.length} off`;
  }

  if (evt.stream === "summary" && evt.data.event === "run_complete") {
    const src = evt.data.inference_source as string;
    const dur = evt.data.duration_ms as number;
    const tools = (evt.data.tools_used as string[]) || [];
    if (src === "tools") return `${formatDuration(dur)} — used ${tools.join(", ")}`;
    if (src === "model_direct")
      return `${formatDuration(dur)} — model answered directly (no tools)`;
    return `${formatDuration(dur)} — ${src}`;
  }

  if (delegationEvent)
    return `${delegationEvent}${delegationMsg ? ` — ${delegationMsg}` : ""}`;
  if (toolName) {
    const args = evt.data.args || evt.data.input || {};
    const sql = extractSqlFromArgs(args);
    if (sql && toolPhase === "start") {
      // Show first meaningful SQL keyword
      const firstLine = sql.trim().split("\n")[0].slice(0, 50);
      return firstLine;
    }
    // Show file path for read/write tools
    const filePath = args.file_path || args.filePath || args.path || args.file || "";
    const shortPath = typeof filePath === "string" && filePath
      ? filePath.split("/").slice(-2).join("/")
      : "";
    const detail = shortPath || (toolPhase ? `(${toolPhase})` : "");
    return `${detail}${toolPhase && shortPath ? ` (${toolPhase})` : ""}`;
  }
  if (delta != null)
    return `"${delta.slice(0, 50)}${delta.length > 50 ? "…" : ""}"${tokens && tokens > 1 ? ` (${tokens} tokens)` : ""}`;

  return (
    Object.keys(evt.data)
      .filter((k) => k !== "tokens")
      .join(", ") || "—"
  );
}

/* ── Expanded detail view ── */

function TraceDetail({ event: evt }: { event: TraceEvent }) {
  if (evt.stream === "context" && evt.data.event === "pre_send") {
    return <ContextDetail data={evt.data} />;
  }
  if (evt.stream === "summary" && evt.data.event === "run_complete") {
    return <SummaryDetail data={evt.data} />;
  }
  if (evt.stream === "tool") {
    return <ToolDetail data={evt.data} />;
  }
  return (
    <div className="mt-1 max-h-64 overflow-auto rounded bg-muted p-2 font-mono text-[10px] leading-relaxed">
      <pre className="whitespace-pre-wrap">
        {JSON.stringify(
          {
            phase: evt.phase,
            runId: evt.runId,
            stream: evt.stream,
            ...evt.data,
          },
          null,
          2,
        )}
      </pre>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ContextDetail({ data }: { data: Record<string, any> }) {
  return (
    <div className="mt-1 max-h-64 overflow-auto rounded bg-muted p-2 font-mono text-[10px] leading-relaxed">
      <div className="space-y-1.5 font-sans">
        <div className="flex gap-4">
          <span className="text-muted-foreground">Model:</span>
          <span className="font-semibold">{data.model || "?"}</span>
        </div>
        <div className="flex gap-4">
          <span className="text-muted-foreground">Memory:</span>
          <span>
            {data.memory_injected
              ? `✓ injected (${data.memory_length} chars)`
              : "✗ none"}
          </span>
        </div>
        <div className="flex gap-4">
          <span className="text-muted-foreground">Message:</span>
          <span className="truncate">{data.user_message}</span>
        </div>
        {((data.skills_enabled as string[]) || []).length > 0 && (
          <div>
            <span className="text-muted-foreground">Skills enabled:</span>
            <div className="mt-0.5 flex flex-wrap gap-1">
              {(data.skills_enabled as string[]).map((s: string) => (
                <Badge
                  key={s}
                  variant="default"
                  className="h-4 px-1.5 text-[9px]"
                >
                  {s}
                </Badge>
              ))}
            </div>
          </div>
        )}
        {((data.skills_disabled as string[]) || []).length > 0 && (
          <div>
            <span className="text-muted-foreground">Skills disabled:</span>
            <div className="mt-0.5 flex flex-wrap gap-1">
              {(data.skills_disabled as string[]).map((s: string) => (
                <Badge
                  key={s}
                  variant="secondary"
                  className="h-4 px-1.5 text-[9px] line-through opacity-60"
                >
                  {s}
                </Badge>
              ))}
            </div>
          </div>
        )}
        {((data.core_skills as string[]) || []).length > 0 && (
          <div>
            <span className="text-muted-foreground">Core skills (SKILL.md):</span>
            <div className="mt-0.5 flex flex-wrap gap-1">
              {(data.core_skills as string[]).map((s: string) => (
                <Badge
                  key={s}
                  variant="outline"
                  className="h-4 px-1.5 text-[9px]"
                >
                  {s}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SummaryDetail({ data }: { data: Record<string, any> }) {
  const toolsDetail = (data.tools_detail || []) as Array<Record<string, unknown>>;

  return (
    <div className="mt-1 max-h-80 overflow-auto rounded bg-muted p-2.5 text-[10px] leading-relaxed">
      <div className="space-y-2 font-sans">
        {/* Timing row */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="font-semibold">{formatDuration(data.duration_ms)}</span>
          </div>
          <Badge
            variant={data.inference_source === "tools" ? "default" : "secondary"}
            className="h-4 px-1.5 text-[9px]"
          >
            {data.inference_source}
          </Badge>
          <span className="text-muted-foreground">
            {data.assistant_length} chars response
          </span>
        </div>

        {/* Inference detail */}
        <p className="text-[10px] leading-snug text-muted-foreground">
          {data.inference_detail}
        </p>

        {/* Tools breakdown */}
        {toolsDetail.length > 0 && (
          <div className="space-y-1">
            <span className="text-muted-foreground font-medium">Tool Calls:</span>
            {toolsDetail.map((t, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded bg-background/50 px-2 py-1"
              >
                {getToolIcon(String(t.name || ""))}
                <span className="font-semibold">{String(t.name)}</span>
                {typeof t.duration_ms === "number" && (
                  <Badge variant="outline" className="h-3.5 px-1 text-[8px]">
                    {formatDuration(t.duration_ms)}
                  </Badge>
                )}
                {typeof t.result_preview === "string" && t.result_preview && (
                  <span className="truncate text-muted-foreground">
                    {t.result_preview.slice(0, 60)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Tools list fallback */}
        {toolsDetail.length === 0 && ((data.tools_used as string[]) || []).length > 0 && (
          <div>
            <span className="text-muted-foreground">Tools:</span>
            <div className="mt-0.5 flex flex-wrap gap-1">
              {(data.tools_used as string[]).map((t: string, i: number) => (
                <Badge key={i} variant="outline" className="h-4 px-1.5 text-[9px]">
                  {t}
                </Badge>
              ))}
            </div>
          </div>
        )}
        <div className="flex gap-4">
          <span className="text-muted-foreground">Response:</span>
          <span>{data.assistant_length} chars</span>
        </div>
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ToolDetail({ data }: { data: Record<string, any> }) {
  const [copied, setCopied] = useState(false);
  const [showFullResult, setShowFullResult] = useState(false);

  const name = data.name || data.tool || "?";
  const phase = data.phase || "?";
  const args = data.args || data.input || {};
  const result = data.result || data.output || data.partialResult;
  const error = data.error;
  const sql = extractSqlFromArgs(args);
  const hasSql = Boolean(sql) && isSqlTool(name);

  function handleCopySql() {
    if (sql) {
      navigator.clipboard.writeText(sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="mt-1 max-h-96 overflow-auto rounded bg-muted text-[10px] leading-relaxed">
      {/* Header */}
      <div className="flex items-center gap-2 p-2 pb-1 font-sans">
        {getToolIcon(name)}
        <span className="font-semibold">{name}</span>
        <Badge
          variant={
            phase === "start"
              ? "secondary"
              : error
                ? "destructive"
                : "default"
          }
          className="h-4 px-1.5 text-[9px]"
        >
          {phase === "start" && <Loader2 className="mr-0.5 h-2 w-2 animate-spin" />}
          {(phase === "end" || phase === "result" || phase === "complete") && !error && (
            <CheckCircle2 className="mr-0.5 h-2 w-2" />
          )}
          {error && <AlertCircle className="mr-0.5 h-2 w-2" />}
          {phase}
        </Badge>
      </div>

      {/* SQL code with syntax highlighting */}
      {hasSql && (
        <div className="mx-2 mb-1 overflow-hidden rounded border border-white/10">
          <div className="flex items-center justify-between bg-[#282c34] px-2 py-0.5">
            <span className="font-mono text-[9px] text-white/50">SQL</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleCopySql();
              }}
              className="flex items-center gap-0.5 text-[9px] text-white/40 hover:text-white/80"
            >
              {copied ? (
                <><Check className="h-2.5 w-2.5" /> Copied</>
              ) : (
                <><Copy className="h-2.5 w-2.5" /> Copy</>
              )}
            </button>
          </div>
          <SyntaxHighlighter
            style={oneDark}
            language="sql"
            PreTag="div"
            customStyle={{
              margin: 0,
              padding: "0.5rem",
              background: "#282c34",
              fontSize: "0.65rem",
              maxHeight: "150px",
              overflow: "auto",
            }}
          >
            {sql!}
          </SyntaxHighlighter>
        </div>
      )}

      {/* Non-SQL args */}
      {!hasSql && Object.keys(args).length > 0 && (
        <div className="mx-2 mb-1 space-y-0.5 font-sans">
          <span className="text-muted-foreground">Args:</span>
          {Object.entries(args).map(([k, v]) => (
            <div key={k} className="flex gap-2 pl-2">
              <span className="shrink-0 text-muted-foreground">{k}:</span>
              <span className="truncate">{String(v)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mx-2 mb-1 rounded bg-red-500/10 p-1.5 font-sans text-red-500">
          <AlertCircle className="mr-1 inline h-3 w-3" />
          {String(error)}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="mx-2 mb-2 font-sans">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowFullResult((v) => !v);
            }}
            className="mb-0.5 flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            {showFullResult ? (
              <ChevronDown className="h-2.5 w-2.5" />
            ) : (
              <ChevronRight className="h-2.5 w-2.5" />
            )}
            Result
            <span className="text-[8px] opacity-60">
              ({String(result).length} chars)
            </span>
          </button>
          {showFullResult ? (
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-background/50 p-1.5 font-mono text-[9px]">
              {String(result).slice(0, 2000)}
              {String(result).length > 2000 && "…"}
            </pre>
          ) : (
            <p className="truncate pl-4 text-muted-foreground">
              {String(result).slice(0, 150)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
