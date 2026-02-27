"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import {
  lifecycleApi,
  type ConfigResponse,
  type ModelsStatusResponse,
  type EnvListResponse,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Server,
  Palette,
  Key,
  Brain,
  Save,
  Loader2,
  Plus,
  Trash2,
  Info,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { ApiKeysDialog } from "@/components/openclaw/api-keys-dialog";
import { ModelSelectorDialog } from "@/components/openclaw/model-selector-dialog";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Settings"
        description="Configure your ClawData workspace"
      />

      <AppearanceSection />
      <Separator />
      <ConnectionSection />
      <Separator />
      <ModelSection />
      <Separator />
      <ApiKeysSection />
    </div>
  );
}

/* ── Appearance ──────────────────────────────────────────────────── */

function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const themes = [
    { value: "light", label: "Light", desc: "Clean light interface" },
    { value: "dark", label: "Dark", desc: "Easier on the eyes" },
    { value: "system", label: "System", desc: "Follows your OS setting" },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm">Appearance</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {themes.map((t) => (
            <button
              key={t.value}
              onClick={() => setTheme(t.value)}
              className={cn(
                "rounded-lg border px-3 py-2.5 text-left transition-colors",
                mounted && theme === t.value
                  ? "border-primary bg-primary/5"
                  : "hover:bg-muted"
              )}
            >
              <p className="text-xs font-medium">{t.label}</p>
              <p className="text-[10px] text-muted-foreground">{t.desc}</p>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Connection ──────────────────────────────────────────────────── */

function ConnectionSection() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm">Connection</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-1">
          <Label className="text-xs">API URL</Label>
          <div className="flex items-center gap-2">
            <Input
              value={apiUrl}
              readOnly
              className="h-8 text-xs font-mono bg-muted"
            />
            <Badge variant="outline" className="text-[10px] shrink-0">
              environment
            </Badge>
          </div>
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Info className="h-3 w-3" />
            Set via <code className="text-[9px] bg-muted px-1 rounded">NEXT_PUBLIC_API_URL</code> environment variable
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Model ───────────────────────────────────────────────────────── */

function ModelSection() {
  const {
    data: models,
    isLoading,
  } = useSWR("settings:models", () => lifecycleApi.modelsStatus());

  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm">Default Model</CardTitle>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => setDialogOpen(true)}
          >
            <ExternalLink className="mr-1 h-3 w-3" /> Browse Models
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : (
            <>
              {models?.current_model ? (
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant="outline" className="text-xs font-mono truncate max-w-full">
                    {models.current_model}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    current
                  </span>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No model set — click Browse Models to choose one
                </p>
              )}
              {models?.fallbacks && models.fallbacks.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                    Fallbacks
                  </p>
                  <div className="flex flex-wrap gap-1 min-w-0">
                    {models.fallbacks.map((m) => (
                      <Badge
                        key={m}
                        variant="secondary"
                        className="text-[10px] font-mono truncate max-w-full"
                        title={m}
                      >
                        {m}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
      <ModelSelectorDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}

/* ── API Keys ────────────────────────────────────────────────────── */

function ApiKeysSection() {
  const {
    data: envData,
    isLoading,
  } = useSWR("settings:env", () => lifecycleApi.listEnv());

  const [dialogOpen, setDialogOpen] = useState(false);

  const entries = envData?.entries ?? [];

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div className="flex items-center gap-2">
            <Key className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm">API Keys & Environment</CardTitle>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => setDialogOpen(true)}
          >
            <ExternalLink className="mr-1 h-3 w-3" /> Manage Keys
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : entries.length > 0 ? (
            <div className="divide-y rounded-lg border">
              {entries.map((entry) => (
                <div
                  key={entry.key}
                  className="flex items-center gap-3 px-3 py-2 min-w-0"
                >
                  <code className="text-xs font-mono font-medium shrink-0">
                    {entry.key}
                  </code>
                  <code className="flex-1 truncate text-xs text-muted-foreground font-mono min-w-0">
                    {entry.masked_value}
                  </code>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
              <Key className="h-6 w-6 opacity-30" />
              <p className="text-xs">No API keys configured</p>
              <p className="text-[10px]">
                Add keys for providers like OpenAI, Anthropic, etc.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-1"
                onClick={() => setDialogOpen(true)}
              >
                <Plus className="mr-1 h-3 w-3" /> Add Key
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      <ApiKeysDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
