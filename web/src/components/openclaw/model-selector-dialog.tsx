"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  lifecycleApi,
  type ModelCatalogEntry,
  type ModelCatalogResponse,
  type ModelsStatusResponse,
} from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

import {
  Brain,
  CheckCircle2,
  Globe,
  Loader2,
  Monitor,
  Save,
  Search,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ModelSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** If provided, sets the model for a specific agent instead of globally */
  agentId?: string;
  agentName?: string;
}

/** Group models by provider prefix (everything before the first '/') */
function groupByProvider(
  models: ModelCatalogEntry[]
): { provider: string; models: ModelCatalogEntry[] }[] {
  const map = new Map<string, ModelCatalogEntry[]>();
  for (const m of models) {
    const slash = m.key.indexOf("/");
    const provider = slash > 0 ? m.key.slice(0, slash) : "other";
    if (!map.has(provider)) map.set(provider, []);
    map.get(provider)!.push(m);
  }
  return Array.from(map.entries())
    .map(([provider, models]) => ({ provider, models }))
    .sort((a, b) => {
      // Available providers first, then alphabetical
      const aAvail = a.models.some((m) => m.available);
      const bAvail = b.models.some((m) => m.available);
      if (aAvail !== bAvail) return aAvail ? -1 : 1;
      return a.provider.localeCompare(b.provider);
    });
}

/** Human-friendly provider names */
const PROVIDER_LABELS: Record<string, string> = {
  "openai": "OpenAI",
  "anthropic": "Anthropic",
  "google": "Google Gemini",
  "google-vertex": "Google Vertex",
  "google-gemini-cli": "Gemini CLI",
  "google-antigravity": "Google Antigravity",
  "mistral": "Mistral",
  "xai": "xAI",
  "groq": "Groq",
  "openrouter": "OpenRouter",
  "huggingface": "Hugging Face",
  "github-copilot": "GitHub Copilot",
  "amazon-bedrock": "Amazon Bedrock",
  "azure-openai-responses": "Azure OpenAI",
  "cerebras": "Cerebras",
  "together": "Together AI",
  "kimi-coding": "Kimi Coding",
  "minimax": "MiniMax",
  "minimax-cn": "MiniMax CN",
  "openai-codex": "OpenAI Codex",
  "opencode": "OpenCode",
  "vercel-ai-gateway": "Vercel AI",
  "zai": "ZAI",
};

function formatContext(ctx: number): string {
  if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(0)}M`;
  if (ctx >= 1_000) return `${(ctx / 1_000).toFixed(0)}K`;
  return String(ctx);
}

export function ModelSelectorDialog({
  open,
  onOpenChange,
  agentId,
  agentName,
}: ModelSelectorDialogProps) {
  const {
    data: status,
    isLoading: statusLoading,
    mutate: mutateStatus,
  } = useSWR<ModelsStatusResponse>(open ? "dialog:models" : null, () =>
    lifecycleApi.modelsStatus()
  );
  const { data: catalog, isLoading: catalogLoading } =
    useSWR<ModelCatalogResponse>(open ? "dialog:catalog" : null, () =>
      lifecycleApi.modelsCatalog()
    );

  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [customModel, setCustomModel] = useState("");
  const [showAll, setShowAll] = useState(false);

  const allModels = catalog?.models ?? [];

  /** Filter models by search term */
  const filtered = useMemo(() => {
    if (!search.trim()) {
      // No search: show available models, or all if showAll toggled
      return showAll ? allModels : allModels.filter((m) => m.available);
    }
    const q = search.toLowerCase();
    return allModels.filter(
      (m) =>
        m.key.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q)
    );
  }, [allModels, search, showAll]);

  const groups = useMemo(() => groupByProvider(filtered), [filtered]);
  const totalFiltered = filtered.length;
  const availableCount = allModels.filter((m) => m.available).length;

  async function selectModel(model: string) {
    setSaving(true);
    try {
      if (agentId) {
        await lifecycleApi.updateAgent(agentId, { model });
        toast.success(`Model for ${agentName || agentId} set to ${model}`);
      } else {
        const res = await lifecycleApi.setModel(model);
        if (res.success) {
          toast.success(`Default model set to ${model}`);
        } else {
          toast.error(res.message);
          return;
        }
      }
      mutateStatus();
      onOpenChange(false);
    } catch (e) {
      toast.error(`Failed: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleCustomSubmit() {
    if (!customModel.trim()) return;
    await selectModel(customModel.trim());
    setCustomModel("");
  }

  const isLoading = statusLoading || catalogLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] !flex flex-col overflow-hidden gap-0 p-0">
        {/* Sticky header */}
        <div className="shrink-0 border-b px-6 pt-6 pb-4 space-y-3">
          <DialogHeader className="p-0">
            <DialogTitle className="flex items-center gap-2">
              <Brain className="h-4 w-4 shrink-0" />
              <span className="truncate">
                {agentId ? `Model for ${agentName || agentId}` : "Select Model"}
              </span>
            </DialogTitle>
            {status?.current_model && (
              <div className="flex items-center gap-2 pt-1 min-w-0">
                <span className="text-[10px] text-muted-foreground shrink-0">
                  Current:
                </span>
                <Badge
                  variant="outline"
                  className="text-xs font-mono truncate max-w-[80%]"
                  title={status.current_model}
                >
                  {status.current_model}
                </Badge>
              </div>
            )}
          </DialogHeader>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${allModels.length || 700}+ models\u2026`}
              className="h-9 pl-8 text-sm"
              autoFocus
            />
          </div>

          {/* Filter chips */}
          <div className="flex items-center gap-2 text-[10px]">
            {!search && (
              <>
                <button
                  onClick={() => setShowAll(false)}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 transition-colors",
                    !showAll
                      ? "bg-primary text-primary-foreground border-primary"
                      : "hover:bg-muted"
                  )}
                >
                  Available ({availableCount})
                </button>
                <button
                  onClick={() => setShowAll(true)}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 transition-colors",
                    showAll
                      ? "bg-primary text-primary-foreground border-primary"
                      : "hover:bg-muted"
                  )}
                >
                  All Providers ({allModels.length})
                </button>
              </>
            )}
            {search && (
              <span className="text-muted-foreground">
                {totalFiltered} result{totalFiltered !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        {/* Scrollable model list */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="px-6 py-3 space-y-4">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : totalFiltered === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
                <Search className="h-6 w-6 opacity-30" />
                <p className="text-xs">No models match &ldquo;{search}&rdquo;</p>
                <p className="text-[10px]">
                  Try a different search term or use the custom input below
                </p>
              </div>
            ) : (
              <>
                {groups.map(({ provider, models: provModels }) => {
                  const anyAvailable = provModels.some((m) => m.available);
                  return (
                    <div key={provider} className="space-y-1.5">
                      {/* Provider header */}
                      <div className="flex items-center gap-2 sticky top-0 bg-background/95 backdrop-blur-sm py-1 -mx-1 px-1 z-10">
                        {anyAvailable ? (
                          <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                        ) : (
                          <Globe className="h-3 w-3 text-muted-foreground shrink-0" />
                        )}
                        <p className="text-xs font-semibold">
                          {PROVIDER_LABELS[provider] ?? provider}
                        </p>
                        <span className="text-[10px] text-muted-foreground">
                          {provModels.length}
                        </span>
                      </div>

                      {/* Model rows */}
                      <div className="grid gap-0.5">
                        {provModels.map((m) => {
                          const isCurrent = m.key === status?.current_model;
                          return (
                            <button
                              key={m.key}
                              onClick={() => !isCurrent && selectModel(m.key)}
                              disabled={saving || isCurrent}
                              className={cn(
                                "group flex items-center gap-2 rounded-md border px-3 py-1.5 text-left text-xs transition-colors min-w-0",
                                isCurrent
                                  ? "border-primary bg-primary/5 text-primary"
                                  : "border-transparent hover:bg-muted hover:border-border"
                              )}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono truncate text-xs">
                                    {m.key}
                                  </span>
                                  {isCurrent && (
                                    <Badge
                                      variant="secondary"
                                      className="text-[9px] shrink-0 px-1 py-0"
                                    >
                                      current
                                    </Badge>
                                  )}
                                </div>
                                {m.name && m.name !== m.key && (
                                  <p className="text-[10px] text-muted-foreground truncate">
                                    {m.name}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {m.local && (
                                  <span title="Local model">
                                    <Monitor className="h-3 w-3 text-muted-foreground" />
                                  </span>
                                )}
                                {m.context_window > 0 && (
                                  <span className="text-[9px] text-muted-foreground tabular-nums">
                                    {formatContext(m.context_window)}
                                  </span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {/* Fallbacks section */}
                {status?.fallbacks &&
                  status.fallbacks.length > 0 &&
                  !search && (
                    <>
                      <Separator />
                      <div className="space-y-2">
                        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                          Fallback Models
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {status.fallbacks.map((m) => (
                            <button
                              key={m}
                              onClick={() => selectModel(m)}
                              disabled={saving || m === status.current_model}
                              className={cn(
                                "rounded-full border px-2.5 py-1 text-[10px] font-mono transition-colors max-w-full truncate",
                                m === status.current_model
                                  ? "border-primary bg-primary/5 text-primary"
                                  : "hover:bg-muted"
                              )}
                              title={m}
                            >
                              {m}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
              </>
            )}
          </div>
        </div>

        {/* Sticky footer: custom model input */}
        <div className="shrink-0 border-t px-6 py-3">
          <p className="text-[10px] font-medium flex items-center gap-1.5 mb-2 text-muted-foreground">
            <Sparkles className="h-3 w-3" /> Custom Model
          </p>
          <div className="flex gap-2">
            <Input
              value={customModel}
              onChange={(e) => setCustomModel(e.target.value)}
              placeholder="provider/model-name"
              className="h-8 text-xs font-mono"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCustomSubmit();
              }}
            />
            <Button
              size="sm"
              className="h-8"
              onClick={handleCustomSubmit}
              disabled={!customModel.trim() || saving}
            >
              {saving ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Save className="h-3 w-3" />
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
