"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  fetcher,
  lifecycleApi,
  type OpenClawAgentsList,
  type AgentCreatePayload,
  type ModelsStatusResponse,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Bot, Plus, RotateCw, Trash2, Star, Settings, Check, ArrowRight, ArrowLeft, Loader2, LayoutGrid, Network } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { AgentEmoji } from "@/components/agent-emoji";
import { AgentGraph } from "@/components/agent-graph";

export default function AgentsPage() {
  const router = useRouter();
  const { data, mutate } = useSWR<OpenClawAgentsList>(
    "/api/openclaw/agents",
    fetcher
  );
  const agents = data?.agents ?? [];

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", emoji: "", model: "" });
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [step, setStep] = useState(0);
  const [view, setView] = useState<"grid" | "graph">("grid");

  // Fetch models when wizard is open
  const { data: modelsData } = useSWR<ModelsStatusResponse>(
    open ? "/api/openclaw/models/status" : null,
    () => lifecycleApi.modelsStatus(),
  );

  function openWizard() {
    setForm({ name: "", emoji: "", model: "" });
    setStep(0);
    setOpen(true);
  }

  function closeWizard() {
    setOpen(false);
    setStep(0);
  }

  async function handleCreate() {
    setBusy(true);
    try {
      const result = await lifecycleApi.createAgent({
        name: form.name,
        emoji: form.emoji || undefined,
      });
      if (result.success) {
        const agentId = form.name.toLowerCase().replace(/\s+/g, "-");
        // If model selected, update agent with model
        if (form.model) {
          try {
            await lifecycleApi.updateAgent(agentId, { model: form.model });
          } catch {
            // Model set is best-effort
          }
        }
        // Optimistically add the new agent so it appears immediately.
        // Skip immediate revalidation — the gateway needs time to persist.
        await mutate(
          (current) => {
            if (!current) return current;
            const newAgent = {
              id: agentId,
              name: form.name,
              emoji: form.emoji || "",
              model: form.model || null,
              skills: [] as string[],
              is_default: false,
            };
            return {
              ...current,
              agents: [...current.agents, newAgent],
            };
          },
          { revalidate: false },
        );
        // Revalidate after a delay to sync with the actual gateway state
        setTimeout(() => mutate(), 2000);
        toast.success(`Agent "${form.name}" created`);
        closeWizard();
      } else {
        toast.error(result.message);
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to create agent");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    const result = await lifecycleApi.deleteAgent(id);
    if (result.success) {
      toast.success("Agent deleted");
      await mutate();
    } else {
      toast.error(result.message);
    }
  }

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agents"
        description={
          <>
            {data?.scope && <>Scope: {data.scope} &middot; </>}
            {agents.length} agent{agents.length !== 1 ? "s" : ""}
            {data?.default_id && <> &middot; Default: {data.default_id}</>}
          </>
        }
        actions={
          <>
        {/* View toggle */}
        <div className="flex rounded-md border">
          <Button
            size="sm"
            variant={view === "grid" ? "secondary" : "ghost"}
            className="h-8 rounded-r-none border-0 px-2.5"
            onClick={() => setView("grid")}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant={view === "graph" ? "secondary" : "ghost"}
            className="h-8 rounded-l-none border-0 px-2.5"
            onClick={() => setView("graph")}
          >
            <Network className="h-3.5 w-3.5" />
          </Button>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="outline" disabled={resetting}>
              <RotateCw className={`mr-1.5 h-3.5 w-3.5 ${resetting ? "animate-spin" : ""}`} />
              {resetting ? "Resetting…" : "Reset"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset all agents?</AlertDialogTitle>
              <AlertDialogDescription>
                This will delete all agents and their workspace files, then recreate the default main agent with fresh seed files. Non-main agents will also be removed from OpenClaw.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  setResetting(true);
                  try {
                    const res = await lifecycleApi.resetAgents();
                    if (!res.success) toast.error(res.message);
                    else toast.success("Agents reset successfully");
                    await mutate();
                  } catch (e) {
                    console.error(e);
                  } finally {
                    setResetting(false);
                  }
                }}
              >
                Reset Everything
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Dialog open={open} onOpenChange={(o) => !o && closeWizard()}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openWizard}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> New Agent
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create Agent</DialogTitle>
              {/* Step indicator */}
              <div className="flex items-center gap-2 pt-2">
                {["Identity", "Model"].map((label, i) => (
                  <div key={label} className="flex items-center gap-2">
                    {i > 0 && <div className="h-px w-6 bg-border" />}
                    <div className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-medium transition-colors",
                      i < step
                        ? "bg-primary text-primary-foreground"
                        : i === step
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                    )}>
                      {i < step ? <Check className="h-3 w-3" /> : i + 1}
                    </div>
                    <span className={cn(
                      "text-xs",
                      i === step ? "font-medium" : "text-muted-foreground"
                    )}>
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            </DialogHeader>

            {/* Step 0: Identity */}
            {step === 0 && (
              <div className="grid gap-3 py-2">
                <div className="grid grid-cols-4 gap-3">
                  <div className="col-span-3 grid gap-1">
                    <Label className="text-xs">Name</Label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="John"
                      autoFocus
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">Emoji</Label>
                    <Input
                      value={form.emoji ?? ""}
                      onChange={(e) => setForm({ ...form, emoji: e.target.value })}
                      placeholder="🤖"
                      className="text-center"
                    />
                  </div>
                </div>
                {form.name && (
                  <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-lg">
                      {form.emoji || "🤖"}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{form.name}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">
                        {form.name.toLowerCase().replace(/\s+/g, "-")}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 1: Model */}
            {step === 1 && (
              <div className="space-y-3 py-2">
                <p className="text-xs text-muted-foreground">
                  Choose a default model for this agent, or skip to use the global default.
                </p>
                {modelsData?.current_model && (
                  <button
                    onClick={() => setForm({ ...form, model: modelsData.current_model! })}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                      form.model === modelsData.current_model
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted"
                    )}
                  >
                    <div className="flex-1">
                      <p className="font-medium text-xs">{modelsData.current_model}</p>
                      <p className="text-[10px] text-muted-foreground">Current global default</p>
                    </div>
                    {form.model === modelsData.current_model && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </button>
                )}
                {modelsData?.fallbacks?.length ? (
                  modelsData.fallbacks
                    .filter((m) => m !== modelsData?.current_model)
                    .slice(0, 5)
                    .map((m) => (
                      <button
                        key={m}
                        onClick={() => setForm({ ...form, model: m })}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                          form.model === m
                            ? "border-primary bg-primary/5"
                            : "hover:bg-muted"
                        )}
                      >
                        <p className="flex-1 font-medium text-xs font-mono">{m}</p>
                        {form.model === m && <Check className="h-4 w-4 text-primary" />}
                      </button>
                    ))
                ) : null}
                <Input
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                  placeholder="Or type a model name…"
                  className="text-xs"
                />
              </div>
            )}

            <DialogFooter className="flex-row justify-between sm:justify-between">
              {step > 0 ? (
                <Button variant="ghost" size="sm" onClick={() => setStep(step - 1)}>
                  <ArrowLeft className="mr-1 h-3 w-3" /> Back
                </Button>
              ) : (
                <div />
              )}
              <div className="flex gap-2">
                {step < 1 ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCreate}
                      disabled={busy || !form.name.trim()}
                    >
                      {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                      Quick Create
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => setStep(1)}
                      disabled={!form.name.trim()}
                    >
                      Next <ArrowRight className="ml-1 h-3 w-3" />
                    </Button>
                  </>
                ) : (
                  <Button
                    onClick={handleCreate}
                    disabled={busy || !form.name.trim()}
                    size="sm"
                  >
                    {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Check className="mr-1 h-3 w-3" />}
                    Create Agent
                  </Button>
                )}
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
          </>
        }
      />

      {!data ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-start gap-3 pb-2">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex gap-1.5">
                  <Skeleton className="h-4 w-14 rounded-full" />
                  <Skeleton className="h-4 w-18 rounded-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : agents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16">
            <div className="rounded-full bg-muted p-4">
              <Bot className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">No agents yet</p>
              <p className="text-xs text-muted-foreground">
                Agents are AI assistants with memories, personalities, and tools.
                <br />
                Create one to get started.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={openWizard}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Create Your First Agent
            </Button>
          </CardContent>
        </Card>
      ) : view === "graph" ? (
        <AgentGraph
          agents={agents}
          mainKey={data?.main_key ?? ""}
          onAgentClick={(id) => router.push(`/agents/${id}`)}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((a) => (
            <Card
              key={a.id}
              className="group cursor-pointer transition-all hover:border-primary/30 hover:shadow-md hover:shadow-primary/5"
              onClick={() => router.push(`/agents/${a.id}`)}
            >
              <CardHeader className="flex flex-row items-start justify-between pb-2">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-xl transition-colors group-hover:bg-primary/10">
                    {a.emoji ? <AgentEmoji emoji={a.emoji} className="text-xl" iconClassName="h-5 w-5" /> : <Bot className="h-5 w-5 text-muted-foreground" />}
                  </div>
                  <div>
                    <CardTitle className="text-base leading-tight">
                      {a.name || a.id}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground font-mono">
                      {a.id}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={(e) => { e.stopPropagation(); router.push(`/agents/${a.id}`); }}
                  >
                    <Settings className="h-3.5 w-3.5" />
                  </Button>
                  {a.id !== data?.main_key && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(a.id); }}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {a.is_default && (
                    <Badge className="text-[10px]">
                      <Star className="mr-0.5 h-2.5 w-2.5" /> default
                    </Badge>
                  )}
                  {a.model && (
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {a.model}
                    </Badge>
                  )}
                  {a.skills.map((s) => (
                    <Badge
                      key={s}
                      variant="secondary"
                      className="text-[10px]"
                    >
                      {s}
                    </Badge>
                  ))}
                  {a.skills.length === 0 && !a.model && !a.is_default && (
                    <span className="text-[10px] text-muted-foreground italic">
                      No skills configured
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete agent &ldquo;{deleteTarget}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the agent and all its workspace files. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) handleDelete(deleteTarget);
                setDeleteTarget(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
