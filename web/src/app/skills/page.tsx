"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  fetcher,
  lifecycleApi,
  type SkillsStatusResponse,
  type OpenClawSkill,
  type WorkspaceSkill,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import {
  ScrollArea,
} from "@/components/ui/scroll-area";
import {
  Puzzle,
  Download,
  ExternalLink,
  Search,
  CheckCircle2,
  XCircle,
  Key,
  AlertTriangle,
  Terminal,
  Globe,
  Settings2,
  Package,
  ShieldCheck,
  ShieldX,
  ChevronDown,
  ChevronRight,
  Zap,
  CircleDot,
  FolderOpen,
} from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Filter = "all" | "eligible" | "disabled" | "missing";

/* ─── Skill Detail Sheet Content ─────────────────────────────────── */

function SkillDetailContent({
  skill,
  busy,
  onToggle,
  onInstall,
  onSetKey,
}: {
  skill: OpenClawSkill;
  busy: string | null;
  onToggle: (s: OpenClawSkill) => void;
  onInstall: (s: OpenClawSkill, id: string) => void;
  onSetKey: (s: OpenClawSkill) => void;
}) {
  const [reqOpen, setReqOpen] = useState(true);

  // Compute requirement fulfilment
  const totalReqs =
    skill.requirements.bins.length +
    skill.requirements.env.length +
    skill.requirements.config.length +
    (skill.requirements.any_bins?.length ? 1 : 0);
  const missingReqs =
    skill.missing.bins.length +
    skill.missing.env.length +
    skill.missing.config.length +
    (skill.missing.any_bins?.length ? 1 : 0);
  const metReqs = totalReqs - missingReqs;
  const pct = totalReqs > 0 ? Math.round((metReqs / totalReqs) * 100) : 100;
  const hasReqs = totalReqs > 0;

  const statusColor = skill.disabled
    ? "text-muted-foreground"
    : skill.eligible
    ? "text-green-500"
    : "text-orange-500";

  const statusLabel = skill.disabled
    ? "Disabled"
    : skill.eligible
    ? "Ready"
    : "Missing deps";

  const accentBg = skill.disabled
    ? "bg-muted/40"
    : skill.eligible
    ? "bg-green-500/5 dark:bg-green-500/10"
    : "bg-orange-500/5 dark:bg-orange-500/10";

  const accentBorder = skill.disabled
    ? "border-muted"
    : skill.eligible
    ? "border-green-500/20"
    : "border-orange-500/20";

  const hasActions =
    skill.install.length > 0 ||
    skill.missing.env.length > 0 ||
    !!skill.homepage;

  return (
    <>
      {/* Hero header */}
      <div className={`${accentBg} border-b ${accentBorder} px-6 pt-8 pb-5`}>
        <SheetHeader className="p-0">
          <div className="flex items-start gap-4">
            <div className="text-4xl leading-none shrink-0 rounded-xl bg-background/80 p-3 shadow-sm border">
              {skill.emoji || "🧩"}
            </div>
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-lg leading-snug">{skill.name}</SheetTitle>
              <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">
                {skill.skill_key}
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-2.5">
                <Badge
                  variant={skill.disabled ? "outline" : skill.eligible ? "default" : "destructive"}
                  className={`text-[10px] ${skill.eligible && !skill.disabled ? "bg-green-600 hover:bg-green-600" : ""}`}
                >
                  <CircleDot className="mr-0.5 h-2.5 w-2.5" />
                  {statusLabel}
                </Badge>
                {skill.bundled && (
                  <Badge variant="secondary" className="text-[10px]">
                    <Package className="mr-0.5 h-2.5 w-2.5" /> bundled
                  </Badge>
                )}
                {skill.always && (
                  <Badge variant="secondary" className="text-[10px]">
                    <Zap className="mr-0.5 h-2.5 w-2.5" /> always-on
                  </Badge>
                )}
                {skill.source && (
                  <Badge variant="outline" className="text-[10px]">
                    {skill.source}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </SheetHeader>

        {/* Enable/disable toggle */}
        {skill.eligible && (
          <div
            className="flex items-center justify-between mt-4 rounded-lg bg-background/60 border px-3 py-2 cursor-pointer"
            onClick={() => onToggle(skill)}
          >
            <div className="flex items-center gap-2">
              {skill.disabled ? (
                <ShieldX className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ShieldCheck className="h-4 w-4 text-green-500" />
              )}
              <span className="text-sm font-medium">
                {skill.disabled ? "Skill is disabled" : "Skill is enabled"}
              </span>
            </div>
            <Switch
              checked={!skill.disabled}
              disabled={busy === skill.skill_key}
              onCheckedChange={() => onToggle(skill)}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
      </div>

      {/* Scrollable body */}
      <ScrollArea className="flex-1">
        <div className="px-6 py-5 space-y-5">
          {/* Description */}
          <p className="text-sm text-muted-foreground leading-relaxed">
            {skill.description}
          </p>

          {/* Quick actions — promoted to top of body */}
          {hasActions && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Actions
              </h4>
              <div className="grid gap-2">
                {/* Install options */}
                {skill.install.map((opt) => (
                  <Button
                    key={opt.id}
                    variant="outline"
                    size="sm"
                    className="w-full justify-start h-9"
                    disabled={busy === skill.skill_key}
                    onClick={() => onInstall(skill, opt.id)}
                  >
                    <Download className="mr-2 h-3.5 w-3.5" />
                    {opt.label}
                  </Button>
                ))}

                {/* Set API key */}
                {skill.missing.env.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start h-9 border-orange-500/30 text-orange-600 dark:text-orange-400 hover:bg-orange-500/5"
                    onClick={() => onSetKey(skill)}
                  >
                    <Key className="mr-2 h-3.5 w-3.5" />
                    Set {skill.primary_env ?? skill.missing.env[0]}
                  </Button>
                )}

                {/* Homepage link */}
                {skill.homepage && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start h-9"
                    asChild
                  >
                    <a href={skill.homepage} target="_blank" rel="noopener noreferrer">
                      <Globe className="mr-2 h-3.5 w-3.5" />
                      View Documentation
                      <ExternalLink className="ml-auto h-3 w-3 text-muted-foreground" />
                    </a>
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Requirements section */}
          {hasReqs && (
            <Collapsible open={reqOpen} onOpenChange={setReqOpen}>
              <CollapsibleTrigger className="flex items-center justify-between w-full group">
                <div className="flex items-center gap-2">
                  <Settings2 className="h-4 w-4 text-muted-foreground" />
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Requirements
                  </h4>
                </div>
                <div className="flex items-center gap-2">
                  {/* Progress pill */}
                  <div className="flex items-center gap-1.5">
                    <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          pct === 100 ? "bg-green-500" : pct > 50 ? "bg-yellow-500" : "bg-orange-500"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className={`text-[10px] font-medium ${statusColor}`}>
                      {metReqs}/{totalReqs}
                    </span>
                  </div>
                  {reqOpen ? (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </div>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <div className="mt-3 space-y-3">
                  {/* Binaries */}
                  {skill.requirements.bins.length > 0 && (
                    <div className="rounded-lg border bg-card p-3 space-y-2">
                      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                        <Terminal className="h-3 w-3" /> Binaries
                      </p>
                      <div className="space-y-1">
                        {skill.requirements.bins.map((b) => {
                          const missing = skill.missing.bins.includes(b);
                          return (
                            <div key={b} className="flex items-center gap-2 text-xs">
                              {missing ? (
                                <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                              ) : (
                                <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                              )}
                              <code className="font-mono text-xs">{b}</code>
                              {missing && (
                                <span className="ml-auto text-[10px] text-destructive">not found</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Any bins */}
                  {(skill.requirements.any_bins?.length ?? 0) > 0 && (
                    <div className="rounded-lg border bg-card p-3 space-y-2">
                      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                        <Terminal className="h-3 w-3" /> Any of these binaries
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {skill.requirements.any_bins!.map((b) => (
                          <Badge key={b} variant="secondary" className="text-xs font-mono">
                            {b}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Environment variables */}
                  {skill.requirements.env.length > 0 && (
                    <div className="rounded-lg border bg-card p-3 space-y-2">
                      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                        <Key className="h-3 w-3" /> Environment Variables
                      </p>
                      <div className="space-y-1">
                        {skill.requirements.env.map((e) => {
                          const missing = skill.missing.env.includes(e);
                          return (
                            <div key={e} className="flex items-center gap-2 text-xs">
                              {missing ? (
                                <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                              ) : (
                                <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                              )}
                              <code className="font-mono text-xs">{e}</code>
                              {missing && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="ml-auto h-5 px-1.5 text-[10px] text-orange-600 dark:text-orange-400 hover:text-orange-700"
                                  onClick={() => onSetKey(skill)}
                                >
                                  <Key className="mr-0.5 h-2.5 w-2.5" /> Set key
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Config paths */}
                  {skill.requirements.config.length > 0 && (
                    <div className="rounded-lg border bg-card p-3 space-y-2">
                      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                        <Settings2 className="h-3 w-3" /> Config Paths
                      </p>
                      <div className="space-y-1">
                        {skill.requirements.config.map((c) => {
                          const missing = skill.missing.config.includes(c);
                          return (
                            <div key={c} className="flex items-center gap-2 text-xs">
                              {missing ? (
                                <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                              ) : (
                                <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                              )}
                              <code className="font-mono text-xs truncate">{c}</code>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Config checks */}
          {skill.config_checks.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Config Checks
              </h4>
              <div className="rounded-lg border bg-card p-3 space-y-1.5">
                {skill.config_checks.map((cc) => (
                  <div key={cc.path} className="flex items-center gap-2 text-xs">
                    {cc.satisfied ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                    )}
                    <span className="font-mono truncate">{cc.path}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Missing deps warning banner — only for ineligible, non-disabled */}
          {!skill.eligible && !skill.disabled && (
            <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-4 space-y-3">
              <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm font-semibold">Missing Dependencies</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                This skill cannot run until all requirements are met. Install
                missing binaries and set the required API keys above.
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </>
  );
}

export default function SkillsPage() {
  const [tab, setTab] = useState("project");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Skills"
        description="Manage project skills shared across agents, and gateway tool integrations."
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="project">
            <FolderOpen className="mr-1.5 h-3.5 w-3.5" /> Project Skills
          </TabsTrigger>
          <TabsTrigger value="gateway">
            <Package className="mr-1.5 h-3.5 w-3.5" /> Gateway Skills
          </TabsTrigger>
        </TabsList>

        <TabsContent value="project">
          <ProjectSkillsTab />
        </TabsContent>
        <TabsContent value="gateway">
          <GatewaySkillsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ─── Project Skills Tab ────────────────────────────────────────── */

function ProjectSkillsTab() {
  const { data: projectSkills } = useSWR<WorkspaceSkill[]>(
    "/api/openclaw/project-skills",
    () => lifecycleApi.projectSkills()
  );

  if (!projectSkills) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-start gap-3 pb-2">
              <Skeleton className="h-6 w-6 rounded" />
              <div className="space-y-1.5 flex-1">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-20" />
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>
    );
  }

  if (projectSkills.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16">
          <div className="rounded-full bg-muted p-4">
            <FolderOpen className="h-8 w-8 text-muted-foreground/50" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium">No project skills</p>
            <p className="text-xs text-muted-foreground">
              Add SKILL.md files to the <code className="text-[10px]">skills/</code> directory
              to share skills across all agents.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        These skills live in the project <code className="text-xs">skills/</code> directory and can be linked into any agent&apos;s workspace.
        Add or remove them per agent on the agent detail page.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {projectSkills.map((s) => (
          <Card key={s.slug}>
            <CardHeader className="flex flex-row items-start gap-3 pb-2">
              <span className="text-xl leading-none shrink-0">
                {(s.metadata as Record<string, unknown>)?.["openclaw.emoji"] as string || "📄"}
              </span>
              <div className="min-w-0">
                <CardTitle className="text-sm truncate">{s.name}</CardTitle>
                <p className="text-[10px] text-muted-foreground font-mono">{s.slug}</p>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground line-clamp-3">
                {s.description || "No description"}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ─── Gateway Skills Tab ─────────────────────────────────────────── */

function GatewaySkillsTab() {
  const { data, mutate } = useSWR<SkillsStatusResponse>(
    "/api/openclaw/skills",
    fetcher
  );
  const skills = data?.skills ?? [];

  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  // API key dialog state
  const [keySkill, setKeySkill] = useState<OpenClawSkill | null>(null);
  const [keyValue, setKeyValue] = useState("");

  // Skill detail sheet
  const [detailSkill, setDetailSkill] = useState<OpenClawSkill | null>(null);

  const filtered = skills.filter((s) => {
    if (search) {
      const q = search.toLowerCase();
      if (
        !s.name.toLowerCase().includes(q) &&
        !s.description.toLowerCase().includes(q) &&
        !s.skill_key.toLowerCase().includes(q)
      )
        return false;
    }
    switch (filter) {
      case "eligible":
        return s.eligible && !s.disabled;
      case "disabled":
        return s.disabled;
      case "missing":
        return !s.eligible && !s.disabled;
      default:
        return true;
    }
  });

  const counts = {
    all: skills.length,
    eligible: skills.filter((s) => s.eligible && !s.disabled).length,
    disabled: skills.filter((s) => s.disabled).length,
    missing: skills.filter((s) => !s.eligible && !s.disabled).length,
  };

  async function handleToggle(skill: OpenClawSkill) {
    setBusy(skill.skill_key);
    try {
      const result = await lifecycleApi.updateSkill(skill.skill_key, {
        enabled: skill.disabled ? true : undefined,
        // If currently enabled and eligible — disable by telling gateway
        ...(skill.eligible && !skill.disabled ? { enabled: false } : {}),
      });
      if (!result.success) console.error(result.message);
      await mutate();
    } finally {
      setBusy(null);
    }
  }

  async function handleInstall(skill: OpenClawSkill, installId: string) {
    setBusy(skill.skill_key);
    try {
      const result = await lifecycleApi.installSkill({
        name: skill.name,
        install_id: installId,
      });
      if (!result.success) toast.error(result.message);
      // Re-fetch after a brief delay for the install to take effect
      setTimeout(() => mutate(), 2000);
    } finally {
      setBusy(null);
    }
  }

  async function handleSetApiKey() {
    if (!keySkill || !keyValue.trim()) return;
    setBusy(keySkill.skill_key);
    try {
      // Set the API key as an env var via the lifecycle env endpoint
      const envKey = keySkill.primary_env ?? keySkill.missing.env[0];
      if (envKey) {
        await lifecycleApi.setEnv(envKey, keyValue.trim());
      }
      await mutate();
      setKeySkill(null);
      setKeyValue("");
    } finally {
      setBusy(null);
    }
  }

  function statusBadge(skill: OpenClawSkill) {
    if (skill.disabled)
      return (
        <Badge variant="outline" className="text-[10px]">
          disabled
        </Badge>
      );
    if (skill.eligible)
      return (
        <Badge className="text-[10px] bg-green-600">
          <CheckCircle2 className="mr-0.5 h-2.5 w-2.5" /> ready
        </Badge>
      );
    return (
      <Badge variant="destructive" className="text-[10px]">
        <XCircle className="mr-0.5 h-2.5 w-2.5" /> missing deps
      </Badge>
    );
  }

  function missingInfo(skill: OpenClawSkill) {
    const m = skill.missing;
    const parts: string[] = [];
    if (m.bins.length) parts.push(`bins: ${m.bins.join(", ")}`);
    if (m.any_bins.length) parts.push(`any of: ${m.any_bins.join(", ")}`);
    if (m.env.length) parts.push(`env: ${m.env.join(", ")}`);
    if (m.config.length) parts.push(`config: ${m.config.join(", ")}`);
    if (m.os.length) parts.push(`os: ${m.os.join(", ")}`);
    return parts.join(" · ");
  }

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: `All (${counts.all})` },
    { key: "eligible", label: `Ready (${counts.eligible})` },
    { key: "missing", label: `Missing (${counts.missing})` },
    { key: "disabled", label: `Disabled (${counts.disabled})` },
  ];

  return (
    <div className="space-y-4">
      {/* Search + filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search skills…"
            className="pl-8 h-9"
          />
        </div>
        <div className="flex gap-1">
          {filters.map((f) => (
            <Button
              key={f.key}
              variant={filter === f.key ? "default" : "outline"}
              size="sm"
              className="text-xs h-8"
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {!data ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-start gap-3 pb-2">
                <Skeleton className="h-6 w-6 rounded" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
                <div className="flex gap-1.5 pt-1">
                  <Skeleton className="h-4 w-12 rounded-full" />
                  <Skeleton className="h-4 w-16 rounded-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16">
            <div className="rounded-full bg-muted p-4">
              <Puzzle className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">
                {skills.length === 0 ? "No skills found" : "No matching skills"}
              </p>
              <p className="text-xs text-muted-foreground">
                {skills.length === 0
                  ? "Skills appear once the OpenClaw gateway is running. Check the OpenClaw page to start the gateway."
                  : "Try adjusting your search or filter criteria"}
              </p>
            </div>
            {skills.length === 0 && (
              <Button size="sm" variant="outline" asChild>
                <a href="/openclaw">
                  <Settings2 className="mr-1.5 h-3.5 w-3.5" /> Go to OpenClaw
                </a>
              </Button>
            )}
            {skills.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => { setFilter("all"); setSearch(""); }}>
                Clear Filters
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => (
            <Card key={s.skill_key} className="group flex flex-col cursor-pointer transition-all hover:border-primary/30 hover:shadow-md hover:shadow-primary/5" onClick={() => setDetailSkill(s)}>
              <CardHeader className="flex flex-row items-start justify-between pb-2">
                <div className="flex items-center gap-2 min-w-0">
                  {s.emoji && (
                    <span className="text-xl leading-none shrink-0">
                      {s.emoji}
                    </span>
                  )}
                  <div className="min-w-0">
                    <CardTitle className="text-sm truncate">
                      {s.name}
                    </CardTitle>
                    <p className="text-[10px] text-muted-foreground font-mono truncate">
                      {s.skill_key}
                    </p>
                  </div>
                </div>
                {/* Toggle switch for eligible skills */}
                {s.eligible && (
                  <Switch
                    checked={!s.disabled}
                    disabled={busy === s.skill_key}
                    onCheckedChange={(e) => {
                      e; // prevent card click
                      handleToggle(s);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
              </CardHeader>
              <CardContent className="flex-1 flex flex-col gap-2">
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {s.description}
                </p>

                <div className="flex flex-wrap gap-1.5 mt-auto">
                  {statusBadge(s)}
                  {s.bundled && (
                    <Badge variant="secondary" className="text-[10px]">
                      bundled
                    </Badge>
                  )}
                  {s.always && (
                    <Badge variant="secondary" className="text-[10px]">
                      always-on
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Skill detail sheet */}
      <Sheet open={!!detailSkill} onOpenChange={(o) => !o && setDetailSkill(null)}>
        <SheetContent className="sm:max-w-lg p-0 flex flex-col">
          {detailSkill && (
            <SkillDetailContent
              skill={detailSkill}
              busy={busy}
              onToggle={handleToggle}
              onInstall={handleInstall}
              onSetKey={(s) => { setKeySkill(s); setKeyValue(""); }}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* API key dialog */}
      <Dialog
        open={!!keySkill}
        onOpenChange={(open) => {
          if (!open) setKeySkill(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Set API Key for {keySkill?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <p className="text-sm text-muted-foreground">
              This will save the key to{" "}
              <code className="text-xs">~/.openclaw/.env</code> as{" "}
              <code className="text-xs font-bold">
                {keySkill?.primary_env ?? keySkill?.missing.env[0]}
              </code>
            </p>
            <Input
              type="password"
              value={keyValue}
              onChange={(e) => setKeyValue(e.target.value)}
              placeholder="sk-…"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              onClick={handleSetApiKey}
              disabled={!keyValue.trim() || busy === keySkill?.skill_key}
              size="sm"
            >
              {busy ? "Saving…" : "Save Key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
