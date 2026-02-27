"use client";

import useSWR from "swr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  fetcher,
  lifecycleApi,
  type FullStatus,
  type AppHealth,
  type OpenClawAgentsList,
  type SkillsStatusResponse,
  type Template,
  type CostingSummary,
} from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Bot,
  MessageSquare,
  Puzzle,
  FileCode2,
  ArrowRight,
  DollarSign,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Helpers ──────────────────────────────────────────────────────── */

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={cn(
        "inline-block h-2 w-2 rounded-full",
        ok ? "bg-green-500" : "bg-amber-500 animate-pulse",
      )}
    />
  );
}

function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

/* ── Page ─────────────────────────────────────────────────────────── */

export default function DashboardPage() {
  const router = useRouter();

  const { data: status, isLoading: statusLoading } = useSWR<FullStatus>(
    "/api/openclaw/status",
    fetcher,
    { refreshInterval: 15_000 },
  );
  const { data: health } = useSWR<AppHealth>("/health", fetcher, {
    refreshInterval: 10_000,
  });
  const { data: agentsData, isLoading: agentsLoading } =
    useSWR<OpenClawAgentsList>("/api/openclaw/agents", fetcher);
  const { data: skillsData } = useSWR<SkillsStatusResponse>(
    "/api/openclaw/skills",
    fetcher,
  );
  const { data: templates } = useSWR<Template[]>("/api/templates/", fetcher);
  const { data: costing } = useSWR<CostingSummary>(
    "/api/openclaw/costing",
    () => lifecycleApi.costing(),
    { revalidateOnFocus: false },
  );

  const agents = agentsData?.agents ?? [];
  const gw = status?.gateway;
  const gwOk = gw?.state === "running";
  const apiOk = health?.status === "ok";
  const skillCount =
    skillsData?.skills?.filter((s) => !s.disabled).length ?? 0;
  const templateCount = templates?.length ?? 0;
  const openclawVersion = status?.prerequisites?.openclaw?.version;

  return (
    <div className="mx-auto max-w-5xl space-y-10 pb-12">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Welcome back
          </h1>
          <p className="text-sm text-muted-foreground">
            {gwOk
              ? "Your assistant is online and ready."
              : statusLoading
                ? "Checking system status…"
                : "Gateway is not running — start it from the OpenClaw page."}
          </p>
        </div>

        {/* Compact system indicators */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <StatusDot ok={gwOk} />
            Gateway
          </span>
          <span className="flex items-center gap-1.5">
            <StatusDot ok={apiOk} />
            API
          </span>
          {openclawVersion && (
            <span className="font-mono tabular-nums">{openclawVersion}</span>
          )}
        </div>
      </div>

      {/* ── Agents ──────────────────────────────────────────────── */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Your Agents
          </h2>
          <Link href="/agents">
            <Button variant="ghost" size="sm" className="h-7 text-xs">
              Manage <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </Link>
        </div>

        {agentsLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-22 rounded-lg" />
            ))}
          </div>
        ) : agents.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-10 text-center">
              <Bot className="mb-2 h-8 w-8 text-muted-foreground/60" />
              <p className="text-sm text-muted-foreground">
                No agents yet — create one to get started.
              </p>
              <Link href="/agents" className="mt-4">
                <Button size="sm">Create Agent</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {agents.map((agent) => (
              <Card
                key={agent.id}
                className="group cursor-pointer transition-colors hover:bg-accent/50"
                onClick={() => router.push(`/chat`)}
              >
                <CardContent className="flex items-start gap-3 p-4">
                  <span className="mt-0.5 shrink-0 text-2xl leading-none">
                    {agent.emoji || "🤖"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">
                        {agent.name}
                      </p>
                      {agent.is_default && (
                        <Badge
                          variant="secondary"
                          className="px-1.5 py-0 text-[10px]"
                        >
                          default
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {agent.model ?? "default model"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {agent.skills.length} skill
                      {agent.skills.length !== 1 && "s"}
                    </p>
                  </div>
                  <MessageSquare className="mt-1 h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* ── Quick Actions ───────────────────────────────────────── */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Quick Actions
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              {
                href: "/chat",
                icon: MessageSquare,
                label: "New Chat",
                detail: "Start a conversation",
              },
              {
                href: "/skills",
                icon: Puzzle,
                label: "Skills",
                detail: `${skillCount} active`,
              },
              {
                href: "/templates",
                icon: FileCode2,
                label: "Templates",
                detail: `${templateCount} available`,
              },
              {
                href: "/costing",
                icon: DollarSign,
                label: "Costing",
                detail: costing
                  ? `$${costing.total_estimated_cost_usd.toFixed(2)}`
                  : "View usage",
              },
            ] as const
          ).map(({ href, icon: Icon, label, detail }) => (
            <Link key={href} href={href}>
              <Card className="h-full cursor-pointer transition-colors hover:bg-accent/50">
                <CardContent className="flex flex-col gap-2 p-4">
                  <Icon className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{detail}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Usage (only when there's data) ──────────────────────── */}
      {costing && costing.session_count > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Usage
          </h2>
          <Card>
            <CardContent className="grid grid-cols-3 divide-x p-0">
              {[
                {
                  value: String(costing.session_count),
                  label: "Sessions",
                },
                {
                  value: formatTokens(costing.total_tokens),
                  label: "Tokens",
                },
                {
                  value: `$${costing.total_estimated_cost_usd.toFixed(2)}`,
                  label: "Est. cost",
                },
              ].map(({ value, label }) => (
                <div key={label} className="px-6 py-5 text-center">
                  <p className="text-2xl font-bold tabular-nums">{value}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {label}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      )}

      {/* ── Getting Started tip (show when few agents) ──────────── */}
      {!agentsLoading && agents.length > 0 && agents.length <= 2 && (
        <section className="rounded-lg border border-dashed p-5">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-medium">Tip</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Add skills to your agents to give them access to databases,
                APIs, and data tools.{" "}
                <Link
                  href="/skills"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  Browse skills →
                </Link>
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
