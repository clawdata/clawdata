"use client";

import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Activity, ChevronDown, ChevronRight } from "lucide-react";
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

const phaseLabel: Record<string, string> = {
  ack: "ACK",
  primary: "RUN",
  announce: "SUB",
  gap: "GAP",
  subagent: "SUB",
  context: "CTX",
  summary: "END",
};

/* ── Component ── */

interface TracePanelProps {
  events: TraceEvent[];
}

export function TracePanel({ events }: TracePanelProps) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  function toggle(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex w-[40%] flex-col overflow-hidden rounded-lg border bg-card">
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <Activity className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Event Trace</span>
        <Badge variant="secondary" className="ml-auto text-[10px]">
          {events.length} events
        </Badge>
      </div>
      <ScrollArea className="h-full">
        {events.length === 0 ? (
          <div className="flex h-full min-h-32 items-center justify-center text-xs text-muted-foreground">
            Send a message to see events
          </div>
        ) : (
          <div className="divide-y text-xs">
            {events.map((evt) => (
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
  const pLabel = phaseLabel[evt.phase] || evt.phase.toUpperCase();
  const time = evt.ts
    ? new Date(evt.ts).toLocaleTimeString("en-US", {
        hour12: false,
        fractionalSecondDigits: 3,
      })
    : "—";

  const preview = buildPreview(evt);

  return (
    <button
      onClick={onToggle}
      className="flex w-full flex-col gap-1 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
    >
      <div className="flex items-center gap-2">
        {isExpanded ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
        )}
        <Badge variant="outline" className="h-4 px-1 text-[9px] font-mono">
          {pLabel}
        </Badge>
        <span className={cn("font-mono font-semibold", sColor)}>
          {evt.stream || "?"}
        </span>
        <span className="truncate text-muted-foreground">{preview}</span>
        <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
          {time}
        </span>
      </div>
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
    if (src === "tools") return `${dur}ms — used ${tools.join(", ")}`;
    if (src === "model_direct")
      return `${dur}ms — model answered directly (no tools)`;
    return `${dur}ms — ${src}`;
  }

  if (delegationEvent)
    return `${delegationEvent}${delegationMsg ? ` — ${delegationMsg}` : ""}`;
  if (toolName) return `${toolName}${toolPhase ? ` (${toolPhase})` : ""}`;
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
  return (
    <div className="mt-1 max-h-64 overflow-auto rounded bg-muted p-2 font-mono text-[10px] leading-relaxed">
      <div className="space-y-1.5 font-sans">
        <div className="flex gap-4">
          <span className="text-muted-foreground">Duration:</span>
          <span className="font-semibold">{data.duration_ms}ms</span>
        </div>
        <div className="flex gap-4">
          <span className="text-muted-foreground">Source:</span>
          <Badge
            variant={
              data.inference_source === "tools" ? "default" : "secondary"
            }
            className="h-4 px-1.5 text-[9px]"
          >
            {data.inference_source}
          </Badge>
        </div>
        <div>
          <span className="text-muted-foreground">Detail:</span>
          <p className="mt-0.5 text-[10px] leading-snug">
            {data.inference_detail}
          </p>
        </div>
        {((data.tools_used as string[]) || []).length > 0 && (
          <div>
            <span className="text-muted-foreground">Tools:</span>
            <div className="mt-0.5 flex flex-wrap gap-1">
              {(data.tools_used as string[]).map((t: string, i: number) => (
                <Badge
                  key={i}
                  variant="outline"
                  className="h-4 px-1.5 text-[9px]"
                >
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
  const name = data.name || data.tool || "?";
  const phase = data.phase || "?";
  const args = data.args || data.input || {};
  const result = data.result || data.output || data.partialResult;
  const error = data.error;

  return (
    <div className="mt-1 max-h-64 overflow-auto rounded bg-muted p-2 font-mono text-[10px] leading-relaxed">
      <div className="space-y-1.5 font-sans">
        <div className="flex gap-4">
          <span className="text-muted-foreground">Tool:</span>
          <span className="font-semibold">{name}</span>
          <Badge
            variant={phase === "start" ? "secondary" : error ? "destructive" : "default"}
            className="h-4 px-1.5 text-[9px]"
          >
            {phase}
          </Badge>
        </div>
        {Object.keys(args).length > 0 && (
          <div>
            <span className="text-muted-foreground">Args:</span>
            <div className="mt-0.5 space-y-0.5">
              {Object.entries(args).map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <span className="text-muted-foreground shrink-0">{k}:</span>
                  <span className="truncate">{String(v)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {error && (
          <div className="flex gap-4">
            <span className="text-muted-foreground">Error:</span>
            <span className="text-red-500">{String(error)}</span>
          </div>
        )}
        {result && (
          <div>
            <span className="text-muted-foreground">Result:</span>
            <p className="mt-0.5 truncate">{String(result).slice(0, 200)}</p>
          </div>
        )}
      </div>
    </div>
  );
}
