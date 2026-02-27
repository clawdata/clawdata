"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  fetcher,
  type CostingSummary,
  type CostingSessionDetail,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PageHeader } from "@/components/page-header";
import {
  RefreshCw,
  DollarSign,
  Cpu,
  ArrowUpRight,
  ArrowDownLeft,
  BarChart3,
  Bot,
  Layers,
  Info,
} from "lucide-react";

/* ── Helpers ─────────────────────────────────────────────────────── */

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function formatDate(ms: number | null): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncateTitle(title: string | null, maxLen = 60): string {
  if (!title) return "Untitled session";
  // Strip leading timestamp patterns like [Fri 2026-02-27 10:16 GMT+11]
  const cleaned = title.replace(/^\[.*?\]\s*/, "");
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen) + "…";
}

/* ── Page ────────────────────────────────────────────────────────── */

export default function CostingPage() {
  const { data, isLoading, mutate } = useSWR<CostingSummary>(
    "/api/openclaw/costing",
    fetcher,
    { refreshInterval: 30000 }
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Costing"
        description="Token usage and estimated costs from OpenClaw gateway sessions"
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => mutate()}
            disabled={isLoading}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Refresh
          </Button>
        }
      />

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Estimated Cost"
          icon={DollarSign}
          loading={isLoading}
          value={data ? formatCost(data.total_estimated_cost_usd) : undefined}
          sub={data ? `${data.session_count} sessions` : undefined}
        />
        <SummaryCard
          title="Total Tokens"
          icon={Cpu}
          loading={isLoading}
          value={data ? formatTokens(data.total_tokens) : undefined}
          sub="input + output"
        />
        <SummaryCard
          title="Input Tokens"
          icon={ArrowUpRight}
          loading={isLoading}
          value={data ? formatTokens(data.total_input_tokens) : undefined}
          sub="prompts sent"
        />
        <SummaryCard
          title="Output Tokens"
          icon={ArrowDownLeft}
          loading={isLoading}
          value={data ? formatTokens(data.total_output_tokens) : undefined}
          sub="completions received"
        />
      </div>

      {/* Breakdowns */}
      <Tabs defaultValue="models" className="space-y-4">
        <TabsList>
          <TabsTrigger value="models">
            <Layers className="mr-1.5 h-3.5 w-3.5" />
            By Model
          </TabsTrigger>
          <TabsTrigger value="agents">
            <Bot className="mr-1.5 h-3.5 w-3.5" />
            By Agent
          </TabsTrigger>
          <TabsTrigger value="sessions">
            <BarChart3 className="mr-1.5 h-3.5 w-3.5" />
            Sessions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="models">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Cost by Model</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <TableSkeleton rows={3} cols={6} />
              ) : data?.by_model.length ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Model</TableHead>
                        <TableHead>Provider</TableHead>
                        <TableHead className="text-right">Input</TableHead>
                        <TableHead className="text-right">Output</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Sessions</TableHead>
                        <TableHead className="text-right">Est. Cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.by_model.map((m) => (
                        <TableRow key={`${m.provider}/${m.model}`}>
                          <TableCell className="font-mono text-xs">
                            {m.model}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-xs">
                              {m.provider}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {formatTokens(m.input_tokens)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {formatTokens(m.output_tokens)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {formatTokens(m.total_tokens)}
                          </TableCell>
                          <TableCell className="text-right">
                            {m.session_count}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs font-medium">
                            {formatCost(m.estimated_cost_usd)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <EmptyState message="No model usage data yet" />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="agents">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Cost by Agent</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <TableSkeleton rows={3} cols={5} />
              ) : data?.by_agent.length ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Agent</TableHead>
                        <TableHead className="text-right">Input</TableHead>
                        <TableHead className="text-right">Output</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Sessions</TableHead>
                        <TableHead className="text-right">Est. Cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.by_agent.map((a) => (
                        <TableRow key={a.agent_id}>
                          <TableCell className="font-medium">
                            {a.agent_id}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {formatTokens(a.input_tokens)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {formatTokens(a.output_tokens)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {formatTokens(a.total_tokens)}
                          </TableCell>
                          <TableCell className="text-right">
                            {a.session_count}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs font-medium">
                            {formatCost(a.estimated_cost_usd)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <EmptyState message="No agent usage data yet" />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sessions">
          <SessionsTable
            sessions={data?.sessions ?? []}
            loading={isLoading}
          />
        </TabsContent>
      </Tabs>

      {/* Pricing disclaimer */}
      <div className="flex items-start gap-2 rounded-lg border border-muted bg-muted/30 p-3 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p>
          Cost estimates are based on published API pricing and may not reflect
          your actual bill. Cached tokens, batching discounts, and billing tiers
          are not accounted for. Refer to your provider dashboard for precise
          charges.
        </p>
      </div>
    </div>
  );
}

/* ── Summary Card ────────────────────────────────────────────────── */

function SummaryCard({
  title,
  icon: Icon,
  loading,
  value,
  sub,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  loading: boolean;
  value?: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-1">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-7 w-24" />
        ) : (
          <>
            <p className="text-2xl font-bold">{value ?? "—"}</p>
            {sub && (
              <p className="text-xs text-muted-foreground">{sub}</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Sessions Table ──────────────────────────────────────────────── */

function SessionsTable({
  sessions,
  loading,
}: {
  sessions: CostingSessionDetail[];
  loading: boolean;
}) {
  const [page, setPage] = useState(0);
  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(sessions.length / pageSize));
  const slice = sessions.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-sm">Session Details</CardTitle>
        {!loading && sessions.length > pageSize && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Button
              variant="ghost"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              ← Prev
            </Button>
            <span>
              {page + 1} / {totalPages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Next →
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <TableSkeleton rows={5} cols={7} />
        ) : sessions.length ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-50">Session</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead className="text-right">Input</TableHead>
                  <TableHead className="text-right">Output</TableHead>
                  <TableHead className="text-right">Est. Cost</TableHead>
                  <TableHead className="text-right">Last Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {slice.map((s) => (
                  <TableRow key={s.session_key}>
                    <TableCell>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="block max-w-60 truncate text-xs">
                              {truncateTitle(s.title)}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="max-w-sm text-xs">
                            {s.title || "No title"}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {s.agent_id}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {s.model || "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {formatTokens(s.input_tokens)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {formatTokens(s.output_tokens)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs font-medium">
                      {formatCost(s.estimated_cost_usd)}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {formatDate(s.updated_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyState message="No session data yet" />
        )}
      </CardContent>
    </Card>
  );
}

/* ── Shared ──────────────────────────────────────────────────────── */

function TableSkeleton({ rows, cols }: { rows: number; cols: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center text-sm text-muted-foreground">
      <BarChart3 className="mb-2 h-8 w-8 opacity-40" />
      <p>{message}</p>
      <p className="text-xs">Start a chat session to generate usage data</p>
    </div>
  );
}
