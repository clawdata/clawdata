"use client";

import { useCallback, useEffect, useState } from "react";
import useSWR from "swr";
import {
  fetcher,
  lifecycleApi,
  type FullStatus,
  type ProvidersResponse,
  type EnvListResponse,
  type ModelsStatusResponse,
} from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2,
  Play,
  Download,
  Terminal,
  Key,
  Eye,
  EyeOff,
  ChevronRight,
  ChevronLeft,
  Zap,
  Shield,
} from "lucide-react";
import { Check, Spin, StateBadge } from "@/components/openclaw/helpers";

/* ═══════════════════════════════════════════════════════
   Setup Wizard Dialog — reusable from anywhere
   ═══════════════════════════════════════════════════════ */

interface SetupWizardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional starting step (0–4) */
  initialStep?: number;
}

export function SetupWizardDialog({
  open,
  onOpenChange,
  initialStep,
}: SetupWizardDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>OpenClaw Setup</DialogTitle>
          <DialogDescription>
            Configure OpenClaw in a few steps — install, initialise, add API
            keys, pick a model, and start the gateway.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <SetupWizardContent
            onComplete={() => onOpenChange(false)}
            initialStep={initialStep}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ── Wizard content (also usable standalone) ── */

interface SetupWizardContentProps {
  onComplete: () => void;
  initialStep?: number;
}

export function SetupWizardContent({
  onComplete,
  initialStep,
}: SetupWizardContentProps) {
  const { data: status } = useSWR<FullStatus>(
    "/api/openclaw/status",
    fetcher,
    { refreshInterval: 5000 },
  );
  const { data: providers, mutate: refreshProviders } =
    useSWR<ProvidersResponse>("/api/openclaw/providers", fetcher);
  const { data: envKeys, mutate: refreshEnv } = useSWR<EnvListResponse>(
    "/api/openclaw/env",
    fetcher,
  );
  const { data: modelsStatus, mutate: refreshModels } =
    useSWR<ModelsStatusResponse>("/api/openclaw/models/status", fetcher);

  const [step, setStep] = useState(initialStep ?? 0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [output, setOutput] = useState("");

  // API key form
  const [selectedProvider, setSelectedProvider] = useState("");
  const [apiKeyValue, setApiKeyValue] = useState("");
  const [showKey, setShowKey] = useState(false);

  // Model selection
  const [selectedModel, setSelectedModel] = useState("");

  const prereqs = status?.prerequisites;
  const isInstalled = prereqs?.openclaw?.installed ?? false;
  const isRunning = status?.gateway?.state === "running";

  /* Auto-advance to the first incomplete step — only on first load */
  const [autoAdvanced, setAutoAdvanced] = useState(false);
  useEffect(() => {
    if (!status || !providers || initialStep !== undefined || autoAdvanced)
      return;
    setAutoAdvanced(true);
    const configured = providers?.providers.filter((p) => p.configured) ?? [];
    if (!prereqs?.openclaw?.installed) {
      setStep(0);
    } else if (!status.config_path) {
      setStep(1);
    } else if (configured.length === 0) {
      setStep(2);
    } else if (!modelsStatus?.current_model) {
      setStep(3);
    } else if (status.gateway?.state !== "running") {
      setStep(4);
    } else {
      // Everything is done — show the Model step so user can review / change
      setStep(3);
    }
  }, [status, prereqs, providers, modelsStatus, initialStep, autoAdvanced]);

  const log = useCallback((text: string) => {
    setOutput((prev) => (prev ? prev + "\n" + text : text));
  }, []);

  /* ── Step actions ── */

  async function doInstall() {
    setBusy(true);
    setMsg(null);
    log("Installing OpenClaw...");
    try {
      const r = await lifecycleApi.install();
      log(r.output || r.message);
      setMsg({ text: r.message, ok: r.success });
      if (r.success) setTimeout(() => setStep(1), 500);
    } catch (e) {
      log(`Error: ${e}`);
      setMsg({ text: `Install failed: ${e}`, ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function doSetup() {
    setBusy(true);
    setMsg(null);
    log("Running setup...");
    try {
      const r = await lifecycleApi.setup({
        mode: "local",
        start_gateway: false,
      });
      log(r.output || r.message);
      setMsg({ text: r.message, ok: r.success });
      if (r.success) setTimeout(() => setStep(2), 500);
    } catch (e) {
      log(`Error: ${e}`);
      setMsg({ text: `Setup failed: ${e}`, ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function saveApiKey() {
    if (!selectedProvider || !apiKeyValue) return;
    const prov = providers?.providers.find((p) => p.id === selectedProvider);
    if (!prov?.env_var) return;

    setBusy(true);
    setMsg(null);
    try {
      const r = await lifecycleApi.setEnv(prov.env_var, apiKeyValue);
      setMsg({ text: r.message, ok: r.success });
      if (r.success) {
        log(`Saved ${prov.env_var}`);
        setApiKeyValue("");
        setShowKey(false);
        await refreshProviders();
        await refreshEnv();
      }
    } catch (e) {
      setMsg({ text: `Error: ${e}`, ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function removeEnvKey(key: string) {
    setBusy(true);
    try {
      await lifecycleApi.deleteEnv(key);
      await refreshProviders();
      await refreshEnv();
    } catch (e) {
      setMsg({ text: `Error: ${e}`, ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function doSetModel() {
    if (!selectedModel) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await lifecycleApi.setModel(selectedModel);
      setMsg({ text: r.message, ok: r.success });
      log(r.output || r.message);
      await refreshModels();
    } catch (e) {
      setMsg({ text: `Error: ${e}`, ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function doStartGateway() {
    setBusy(true);
    setMsg(null);
    log("Starting gateway...");
    try {
      const r = await lifecycleApi.start();
      log(r.output || r.message);
      setMsg({ text: r.message, ok: r.success });
      if (r.success) {
        setTimeout(onComplete, 1000);
      }
    } catch (e) {
      log(`Error: ${e}`);
      setMsg({ text: `Start failed: ${e}`, ok: false });
    } finally {
      setBusy(false);
    }
  }

  const configuredProviders =
    providers?.providers.filter((p) => p.configured) ?? [];
  const allModels =
    providers?.providers.flatMap((p) => p.popular_models) ?? [];

  const hasApiKey = configuredProviders.length > 0;

  const STEPS = [
    { label: "Install", done: isInstalled },
    { label: "Init", done: !!status?.config_path },
    { label: "API Keys", done: hasApiKey },
    { label: "Model", done: hasApiKey && !!modelsStatus?.current_model },
    { label: "Start", done: isRunning },
  ];

  // Find the first incomplete step — user can navigate to any step up to this
  const firstIncomplete = STEPS.findIndex((s) => !s.done);
  const maxReachable = firstIncomplete === -1 ? STEPS.length - 1 : firstIncomplete;

  return (
    <div className="space-y-4">
      {/* Step indicator */}
      <div className="flex items-center gap-1 flex-wrap">
        {STEPS.map((s, i) => {
          const reachable = i <= maxReachable || s.done;
          return (
          <div key={s.label} className="flex items-center gap-1">
            <button
              onClick={() => reachable && setStep(i)}
              disabled={!reachable}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                i === step
                  ? "bg-primary text-primary-foreground"
                  : s.done
                    ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                    : reachable
                      ? "bg-muted text-muted-foreground"
                      : "bg-muted text-muted-foreground/50 cursor-not-allowed"
              }`}
            >
              {s.done && <CheckCircle2 className="h-3 w-3" />}
              {s.label}
            </button>
            {i < STEPS.length - 1 && (
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            )}
          </div>
          );
        })}
      </div>

      {msg && (
        <Alert variant={msg.ok ? "default" : "destructive"}>
          <AlertDescription>{msg.text}</AlertDescription>
        </Alert>
      )}

      {/* Step 0: Install */}
      {step === 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Download className="h-4 w-4" /> Install OpenClaw
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Check ok={prereqs?.node?.meets_minimum ?? false} />
                <span>
                  Node.js ≥22{" "}
                  {prereqs?.node?.version && (
                    <span className="text-muted-foreground">
                      (found {prereqs.node.version})
                    </span>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Check ok={prereqs?.npm?.installed ?? false} />
                <span>
                  npm{" "}
                  {prereqs?.npm?.version && (
                    <span className="text-muted-foreground">
                      (found {prereqs.npm.version})
                    </span>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Check ok={isInstalled} />
                <span>
                  OpenClaw{" "}
                  {prereqs?.openclaw?.version && (
                    <span className="text-muted-foreground">
                      (v{prereqs.openclaw.version})
                    </span>
                  )}
                </span>
              </div>
            </div>
            {isInstalled ? (
              <Button size="sm" onClick={() => setStep(1)}>
                Already installed — Next{" "}
                <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={doInstall}
                disabled={busy || !prereqs?.node?.meets_minimum}
              >
                {busy ? (
                  <Spin />
                ) : (
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                )}
                Install OpenClaw
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 1: Init/Setup */}
      {step === 1 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="h-4 w-4" /> Initialize Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Creates{" "}
              <code className="bg-muted px-1 rounded">
                ~/.openclaw/openclaw.json
              </code>{" "}
              and the agent workspace directory.
            </p>
            {status?.config_path ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Check ok /> Config exists
                </div>
                <Button size="sm" onClick={() => setStep(2)}>
                  Next <ChevronRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                onClick={doSetup}
                disabled={busy || !isInstalled}
              >
                {busy ? <Spin /> : <Zap className="mr-1.5 h-3.5 w-3.5" />}
                Run Setup
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2: API Keys */}
      {step === 2 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Key className="h-4 w-4" /> API Keys
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Configure at least one LLM provider. Keys are stored in{" "}
              <code className="bg-muted px-1 rounded">~/.openclaw/.env</code>.
            </p>

            {/* Configured keys */}
            {envKeys && envKeys.entries.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Configured keys
                </Label>
                {envKeys.entries.map((e) => (
                  <div
                    key={e.key}
                    className="flex items-center justify-between rounded border px-3 py-1.5 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <Shield className="h-3.5 w-3.5 text-green-600" />
                      <span className="font-mono text-xs">{e.key}</span>
                      <span className="text-xs text-muted-foreground">
                        {e.masked_value}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs text-red-500 hover:text-red-700"
                      onClick={() => removeEnvKey(e.key)}
                      disabled={busy}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Add new key */}
            <div className="space-y-3 rounded border p-3">
              <Label className="text-xs">Add API key</Label>
              <div className="flex gap-2">
                <Select
                  value={selectedProvider}
                  onValueChange={(v) => {
                    setSelectedProvider(v);
                    setApiKeyValue("");
                    setShowKey(false);
                  }}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {providers?.providers
                      .filter((p) => p.env_var)
                      .map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          <span className="flex items-center gap-1.5">
                            {p.configured && (
                              <CheckCircle2 className="h-3 w-3 text-green-600" />
                            )}
                            {p.name}
                          </span>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <div className="relative flex-1">
                  <Input
                    type={showKey ? "text" : "password"}
                    placeholder={
                      selectedProvider
                        ? `Paste ${providers?.providers.find((p) => p.id === selectedProvider)?.env_var ?? "key"}`
                        : "Select a provider first"
                    }
                    value={apiKeyValue}
                    onChange={(e) => setApiKeyValue(e.target.value)}
                    disabled={!selectedProvider}
                    className="pr-9 font-mono text-xs"
                  />
                  {selectedProvider && (
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowKey(!showKey)}
                    >
                      {showKey ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                  )}
                </div>
                <Button
                  size="sm"
                  onClick={saveApiKey}
                  disabled={busy || !apiKeyValue || !selectedProvider}
                >
                  {busy ? <Spin /> : "Save"}
                </Button>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep(1)}
              >
                <ChevronLeft className="mr-1 h-3.5 w-3.5" /> Back
              </Button>
              <Button
                size="sm"
                onClick={() => setStep(3)}
                disabled={configuredProviders.length === 0}
              >
                Next <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Model */}
      {step === 3 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="h-4 w-4" /> Default Model
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <p className="text-sm text-muted-foreground">
              Choose the primary model used by all agents unless overridden
              per-agent.
            </p>

            {/* Current model badge */}
            {modelsStatus?.current_model && (
              <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm dark:border-green-800 dark:bg-green-950">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
                <span className="text-green-800 dark:text-green-200">
                  Active:
                </span>
                <code className="font-mono font-medium text-green-900 dark:text-green-100">
                  {modelsStatus.current_model}
                </code>
              </div>
            )}

            {/* Model selection */}
            <div className="space-y-3">
              <Label className="text-xs font-medium text-muted-foreground">
                Select a popular model
              </Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {providers?.providers
                  .filter(
                    (p) => p.configured && p.popular_models.length > 0,
                  )
                  .flatMap((p) =>
                    p.popular_models.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setSelectedModel(m)}
                        className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                          selectedModel === m
                            ? "border-primary bg-primary/5 ring-1 ring-primary"
                            : "hover:border-primary/50 hover:bg-muted/50"
                        }`}
                      >
                        <Zap className={`h-3.5 w-3.5 shrink-0 ${selectedModel === m ? "text-primary" : "text-muted-foreground"}`} />
                        <span className="font-mono text-xs">{m}</span>
                        {modelsStatus?.current_model === m && (
                          <CheckCircle2 className="ml-auto h-3.5 w-3.5 shrink-0 text-green-600" />
                        )}
                      </button>
                    )),
                  )}
                {configuredProviders.every(
                  (p) => p.popular_models.length === 0,
                ) &&
                  allModels.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setSelectedModel(m)}
                      className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                        selectedModel === m
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "hover:border-primary/50 hover:bg-muted/50"
                      }`}
                    >
                      <Zap className={`h-3.5 w-3.5 shrink-0 ${selectedModel === m ? "text-primary" : "text-muted-foreground"}`} />
                      <span className="font-mono text-xs">{m}</span>
                    </button>
                  ))}
              </div>
            </div>

            {/* Custom model input */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">
                Or enter a custom model ID
              </Label>
              <Input
                placeholder="e.g. openai/gpt-4.1"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="font-mono text-xs"
              />
            </div>

            {/* Apply button */}
            {selectedModel && selectedModel !== modelsStatus?.current_model && (
              <Button
                size="sm"
                variant="outline"
                onClick={doSetModel}
                disabled={busy || !selectedModel}
              >
                {busy ? <Spin /> : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
                Apply Model
              </Button>
            )}

            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep(2)}
              >
                <ChevronLeft className="mr-1 h-3.5 w-3.5" /> Back
              </Button>
              {isRunning ? (
                <Button size="sm" onClick={onComplete}>
                  Done <ChevronRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => setStep(4)}
                  disabled={!modelsStatus?.current_model && !selectedModel}
                >
                  Next <ChevronRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Start */}
      {step === 4 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Play className="h-4 w-4" /> Start Gateway
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2 text-sm">
              <span>Gateway:</span>
              <StateBadge state={status?.gateway?.state ?? "unknown"} />
            </div>
            {isRunning ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle2 className="h-4 w-4" /> Gateway is running!
                </div>
                <Button size="sm" onClick={onComplete}>
                  Done — Close{" "}
                  <ChevronRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <Button
                  size="sm"
                  onClick={doStartGateway}
                  disabled={busy}
                >
                  {busy ? (
                    <Spin />
                  ) : (
                    <Play className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Start Gateway
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setStep(3)}
                >
                  <ChevronLeft className="mr-1 h-3.5 w-3.5" /> Back
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Log output */}
      {output && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-1.5">
              <Terminal className="h-3.5 w-3.5" /> Output
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() => setOutput("")}
            >
              Clear
            </Button>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[150px] rounded bg-zinc-950 p-3 overflow-hidden">
              <pre className="whitespace-pre-wrap break-all text-xs font-mono text-green-400">
                {output}
              </pre>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
