"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  fetcher,
  lifecycleApi,
  type FullStatus,
  type OnboardingStatus,
  type ConfigResponse,
  type ProvidersResponse,
  type EnvListResponse,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Play,
  Square,
  RotateCw,
  Download,
  ArrowUpCircle,
  Trash2,
  Stethoscope,
  Terminal,
  FileText,
  Key,
  Shield,
  Settings2,
  Activity,
} from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { StateBadge, Check, Spin } from "@/components/openclaw/helpers";
import { SetupWizardDialog } from "@/components/openclaw/setup-wizard-dialog";
import { useConfirm } from "@/hooks/use-confirm";
import { CodeEditor } from "@/components/code-editor";
import { PageHeader } from "@/components/page-header";
import { ApiKeysDialog } from "@/components/openclaw/api-keys-dialog";

/* ═══════════════════════════════════════════════════════
   Controls Panel (shown after setup)
   ═══════════════════════════════════════════════════════ */

function ControlsPanel({
  onShowSetup,
}: {
  onShowSetup: () => void;
}) {
  const {
    data: status,
    mutate: refreshStatus,
    isLoading,
  } = useSWR<FullStatus>("/api/openclaw/status", fetcher, {
    refreshInterval: 10000,
  });
  const { data: onboarding } = useSWR<OnboardingStatus>(
    "/api/openclaw/onboarding",
    fetcher
  );
  const { data: config, mutate: refreshConfig } = useSWR<ConfigResponse>(
    "/api/openclaw/config",
    fetcher
  );
  const { data: providers } = useSWR<ProvidersResponse>(
    "/api/openclaw/providers",
    fetcher,
  );
  const { data: envKeys } = useSWR<EnvListResponse>(
    "/api/openclaw/env",
    fetcher,
  );

  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [output, setOutput] = useState<string | null>(null);
  const [configText, setConfigText] = useState("");
  const [configDirty, setConfigDirty] = useState(false);
  const [ConfirmDialog, confirmAction] = useConfirm();

  if (config?.config && !configDirty && configText === "") {
    setConfigText(JSON.stringify(config.config, null, 2));
  }

  const gw = status?.gateway;
  const prereqs = status?.prerequisites;
  const isRunning = gw?.state === "running";

  async function run(
    label: string,
    fn: () => Promise<{ success: boolean; message: string; output?: string }>
  ) {
    setBusy(label);
    setMsg(null);
    setOutput(null);
    try {
      const r = await fn();
      setMsg({ text: `${label}: ${r.message}`, ok: r.success });
      if (r.output) setOutput(r.output);
      if (r.success) toast.success(`${label}: ${r.message}`);
      else toast.error(`${label}: ${r.message}`);
      await refreshStatus();
    } catch (e) {
      setMsg({ text: `${label} failed: ${e}`, ok: false });
      toast.error(`${label} failed`);
    } finally {
      setBusy(null);
    }
  }

  async function loadLogs() {
    setBusy("Logs");
    try {
      const r = await lifecycleApi.logs(200);
      setOutput(r.output);
    } catch (e) {
      setOutput(`Error: ${e}`);
    } finally {
      setBusy(null);
    }
  }

  async function runDoctor(fix = false) {
    setBusy("Doctor");
    setOutput(null);
    try {
      const r = await lifecycleApi.doctor(fix);
      setMsg({
        text: r.success ? "Doctor: OK" : "Doctor: issues found",
        ok: r.success,
      });
      setOutput(r.output);
    } catch (e) {
      setMsg({ text: `Doctor failed: ${e}`, ok: false });
    } finally {
      setBusy(null);
    }
  }

  async function saveConfig() {
    setBusy("Config");
    try {
      const parsed = JSON.parse(configText);
      const r = await lifecycleApi.setConfig(parsed);
      setMsg({ text: "Config saved", ok: r.success });
      setConfigDirty(false);
      await refreshConfig();
    } catch (e) {
      setMsg({ text: `Config error: ${e}`, ok: false });
    } finally {
      setBusy(null);
    }
  }

  const [keysDialogOpen, setKeysDialogOpen] = useState(false);

  const configuredCount =
    providers?.providers.filter((p) => p.configured).length ?? 0;

  return (
    <div className="space-y-5">
      <ConfirmDialog />
      <PageHeader
        title="OpenClaw"
        actions={
          <Button variant="outline" size="sm" onClick={onShowSetup}>
            <Key className="mr-1.5 h-3.5 w-3.5" /> Setup / Keys
          </Button>
        }
      />

      {msg && (
        <Alert variant={msg.ok ? "default" : "destructive"}>
          <AlertDescription>{msg.text}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="status" className="space-y-4">
        <TabsList>
          <TabsTrigger value="status" className="gap-1.5">
            <Activity className="h-3.5 w-3.5" />
            Status
          </TabsTrigger>
          <TabsTrigger value="controls" className="gap-1.5">
            <Settings2 className="h-3.5 w-3.5" />
            Controls
          </TabsTrigger>
          <TabsTrigger value="config" className="gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            Configuration
          </TabsTrigger>
        </TabsList>

        {/* ── Status Tab ──────────────────────────────────────────── */}
        <TabsContent value="status" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Gateway</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ) : gw ? (
              <>
                <div className="flex items-center justify-between">
                  <span>State</span>
                  <StateBadge state={gw.state} />
                </div>
                <div className="flex items-center justify-between">
                  <span>Port</span>
                  <span className="font-mono">{gw.port}</span>
                </div>
                {gw.pid && (
                  <div className="flex items-center justify-between">
                    <span>PID</span>
                    <span className="font-mono">{gw.pid}</span>
                  </div>
                )}
                {gw.version && (
                  <div className="flex items-center justify-between">
                    <span>Version</span>
                    <span>{gw.version}</span>
                  </div>
                )}
                {gw.uptime_seconds != null && (
                  <div className="flex items-center justify-between">
                    <span>Uptime</span>
                    <span>
                      {Math.floor(gw.uptime_seconds / 60)}m{" "}
                      {Math.floor(gw.uptime_seconds % 60)}s
                    </span>
                  </div>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">Unavailable</span>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Onboarding</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {onboarding ? (
              <>
                {[
                  { l: "Config exists", ok: onboarding.config_exists },
                  { l: "Workspace exists", ok: onboarding.workspace_exists },
                  { l: "Gateway token", ok: onboarding.gateway_token_set },
                  { l: "API key configured", ok: onboarding.any_api_key_configured },
                ].map(({ l, ok }) => (
                  <div key={l} className="flex items-center gap-2">
                    <Check ok={ok} />
                    <span>{l}</span>
                  </div>
                ))}
                <Separator />
                <Badge
                  variant={onboarding.onboarded ? "default" : "destructive"}
                  className="text-xs"
                >
                  {onboarding.onboarded ? "Onboarded" : "Not onboarded"}
                </Badge>
              </>
            ) : (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-5 w-24 rounded-full" />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">API Keys</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span>Providers configured</span>
              <Badge variant={configuredCount > 0 ? "default" : "secondary"}>
                {configuredCount}
              </Badge>
            </div>
            {envKeys?.entries.map((e) => (
              <div key={e.key} className="flex items-center gap-2 text-xs">
                <Shield className="h-3 w-3 text-green-600" />
                <span className="font-mono">{e.key}</span>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="mt-1"
              onClick={() => setKeysDialogOpen(true)}
            >
              {configuredCount === 0 ? "Configure keys" : "Manage keys"}
            </Button>
          </CardContent>
        </Card>
        <ApiKeysDialog open={keysDialogOpen} onOpenChange={setKeysDialogOpen} />
      </div>
        </TabsContent>

        {/* ── Controls Tab ────────────────────────────────────────── */}
        <TabsContent value="controls" className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Gateway Controls</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => run("Start", () => lifecycleApi.start())}
              disabled={!!busy || isRunning}
            >
              {busy === "Start" ? (
                <Spin />
              ) : (
                <Play className="mr-1.5 h-3.5 w-3.5" />
              )}
              Start
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => run("Stop", () => lifecycleApi.stop())}
              disabled={!!busy || !isRunning}
            >
              {busy === "Stop" ? (
                <Spin />
              ) : (
                <Square className="mr-1.5 h-3.5 w-3.5" />
              )}
              Stop
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => run("Restart", () => lifecycleApi.restart())}
              disabled={!!busy || !isRunning}
            >
              {busy === "Restart" ? (
                <Spin />
              ) : (
                <RotateCw className="mr-1.5 h-3.5 w-3.5" />
              )}
              Restart
            </Button>

            <Separator orientation="vertical" className="h-8" />

            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                run("Install", async () => {
                  const r = await lifecycleApi.install();
                  return {
                    success: r.success,
                    message: r.message,
                    output: r.output,
                  };
                })
              }
              disabled={!!busy}
            >
              {busy === "Install" ? (
                <Spin />
              ) : (
                <Download className="mr-1.5 h-3.5 w-3.5" />
              )}
              Install
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => run("Update", () => lifecycleApi.update())}
              disabled={!!busy}
            >
              {busy === "Update" ? (
                <Spin />
              ) : (
                <ArrowUpCircle className="mr-1.5 h-3.5 w-3.5" />
              )}
              Update
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={async () => {
                const ok = await confirmAction({
                  title: "Uninstall OpenClaw?",
                  description: "This will stop the gateway first, then remove the OpenClaw installation. Your configuration and workspace files will remain.",
                  confirmLabel: "Uninstall",
                  destructive: true,
                });
                if (!ok) return;
                run("Uninstall", () => lifecycleApi.uninstall());
              }}
              disabled={!!busy}
            >
              {busy === "Uninstall" ? (
                <Spin />
              ) : (
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              )}
              Uninstall
            </Button>

            <Separator orientation="vertical" className="h-8" />

            <Button
              size="sm"
              variant="outline"
              onClick={() => runDoctor(false)}
              disabled={!!busy}
            >
              {busy === "Doctor" ? (
                <Spin />
              ) : (
                <Stethoscope className="mr-1.5 h-3.5 w-3.5" />
              )}
              Doctor
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => runDoctor(true)}
              disabled={!!busy}
            >
              Doctor + Fix
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                run("Health", async () => {
                  const h = await lifecycleApi.health();
                  return {
                    success: h.healthy,
                    message: h.healthy ? "Healthy" : (h.error ?? "Unhealthy"),
                    output: JSON.stringify(h.raw, null, 2),
                  };
                })
              }
              disabled={!!busy}
            >
              Health
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={loadLogs}
              disabled={!!busy}
            >
              {busy === "Logs" ? (
                <Spin />
              ) : (
                <Terminal className="mr-1.5 h-3.5 w-3.5" />
              )}
              Logs
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Output pane */}
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
              onClick={() => setOutput(null)}
            >
              Clear
            </Button>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-[300px] rounded bg-zinc-950 p-3">
              <pre className="whitespace-pre-wrap text-xs font-mono text-green-400">
                {output}
              </pre>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
        </TabsContent>

        {/* ── Configuration Tab ───────────────────────────────────── */}
        <TabsContent value="config" className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Configuration
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {config?.path ?? "~/.openclaw/openclaw.json"}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <CodeEditor
            value={configText}
            onChange={(val) => {
              setConfigText(val);
              setConfigDirty(true);
            }}
            language="json"
            placeholder="Loading configuration…"
            minHeight="300px"
            maxHeight="500px"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={saveConfig}
              disabled={!configDirty || busy === "Config"}
            >
              {busy === "Config" ? <Spin /> : null} Save
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (config?.config) {
                  setConfigText(JSON.stringify(config.config, null, 2));
                  setConfigDirty(false);
                }
              }}
            >
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Install Banner — shown when gateway is not installed
   ═══════════════════════════════════════════════════════ */

function InstallBanner({ onSetup }: { onSetup: () => void }) {
  return (
    <div className="space-y-5">
      <PageHeader title="OpenClaw" />
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-6 rounded-full bg-muted p-5">
          <Download className="h-10 w-10 text-muted-foreground" />
        </div>
        <h2 className="text-2xl font-semibold tracking-tight">
          OpenClaw is not installed
        </h2>
        <p className="mt-2 max-w-md text-muted-foreground">
          Install the OpenClaw gateway to enable AI-powered agents, chat, and
          skill execution.
        </p>
        <div className="mt-8">
          <Button size="lg" onClick={onSetup}>
            <Download className="mr-2 h-4 w-4" />
            Install OpenClaw
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Main Page — switches between Install, Wizard and Controls
   ═══════════════════════════════════════════════════════ */

export default function OpenClawPage() {
  const { data: onboarding } = useSWR<OnboardingStatus>(
    "/api/openclaw/onboarding",
    fetcher,
  );
  const { data: status, mutate: refreshStatus } = useSWR<FullStatus>(
    "/api/openclaw/status",
    fetcher,
    { refreshInterval: 10_000 },
  );

  const [wizardOpen, setWizardOpen] = useState(false);

  const gatewayState = status?.gateway?.state;
  const isNotInstalled = gatewayState === "not_installed";

  // Auto-open the wizard if not onboarded (and installed)
  const autoOpened =
    onboarding !== undefined && !onboarding.onboarded && !isNotInstalled;

  if (isNotInstalled && !wizardOpen) {
    return (
      <>
        <SetupWizardDialog
          open={wizardOpen}
          onOpenChange={setWizardOpen}
          initialStep={0}
        />
        <InstallBanner onSetup={() => setWizardOpen(true)} />
      </>
    );
  }

  return (
    <>
      <SetupWizardDialog
        open={wizardOpen || autoOpened}
        onOpenChange={(open) => {
          setWizardOpen(open);
        }}
      />
      <ControlsPanel onShowSetup={() => setWizardOpen(true)} />
    </>
  );
}
