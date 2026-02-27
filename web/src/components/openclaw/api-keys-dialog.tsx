"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  lifecycleApi,
  type EnvEntry,
  type EnvListResponse,
  type Provider,
  type ProvidersResponse,
} from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Key,
  Plus,
  Trash2,
  Loader2,
  Save,
  CheckCircle2,
  XCircle,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

interface ApiKeysDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ApiKeysDialog({ open, onOpenChange }: ApiKeysDialogProps) {
  const {
    data: envData,
    isLoading: envLoading,
    mutate: mutateEnv,
  } = useSWR<EnvListResponse>(open ? "dialog:env" : null, () =>
    lifecycleApi.listEnv()
  );
  const {
    data: provData,
    isLoading: provLoading,
  } = useSWR<ProvidersResponse>(open ? "dialog:providers" : null, () =>
    lifecycleApi.providers()
  );

  const entries = envData?.entries ?? [];
  const providers = provData?.providers ?? [];

  // Add form state
  const [addMode, setAddMode] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Edit state (for updating existing)
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  function resetAdd() {
    setAddMode(false);
    setNewKey("");
    setNewValue("");
  }

  function resetEdit() {
    setEditKey(null);
    setEditValue("");
  }

  async function handleAdd() {
    if (!newKey.trim() || !newValue.trim()) return;
    setSaving(true);
    try {
      const res = await lifecycleApi.setEnv(newKey, newValue);
      if (res.success) {
        toast.success(`${newKey} saved`);
        resetAdd();
        mutateEnv();
      } else {
        toast.error(res.message);
      }
    } catch (e) {
      toast.error(`Failed: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate() {
    if (!editKey || !editValue.trim()) return;
    setSaving(true);
    try {
      const res = await lifecycleApi.setEnv(editKey, editValue);
      if (res.success) {
        toast.success(`${editKey} updated`);
        resetEdit();
        mutateEnv();
      } else {
        toast.error(res.message);
      }
    } catch (e) {
      toast.error(`Failed: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(key: string) {
    setDeleting(key);
    try {
      const res = await lifecycleApi.deleteEnv(key);
      if (res.success) {
        toast.success(`${key} removed`);
        mutateEnv();
      } else {
        toast.error(res.message);
      }
    } catch (e) {
      toast.error(`Failed: ${String(e)}`);
    } finally {
      setDeleting(null);
    }
  }

  /** Quick-add a provider key by clicking the provider chip */
  function startProviderAdd(provider: Provider) {
    setAddMode(true);
    setNewKey(provider.env_var);
    setNewValue("");
  }

  const isLoading = envLoading || provLoading;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { resetAdd(); resetEdit(); } onOpenChange(o); }}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-4 w-4" /> API Keys & Environment
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Manage API keys stored in <code className="text-[10px] bg-muted px-1 rounded">~/.openclaw/.env</code>
          </p>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-4 pb-2">
            {/* Provider status chips */}
            {!provLoading && providers.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                  Providers
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {providers.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => !p.configured && startProviderAdd(p)}
                      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors hover:bg-muted"
                      title={p.configured ? `${p.name} configured` : `Click to add ${p.env_var}`}
                    >
                      {p.configured ? (
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                      ) : (
                        <XCircle className="h-3 w-3 text-muted-foreground" />
                      )}
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            {/* Current keys list */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                  Configured Keys ({entries.length})
                </p>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => mutateEnv()}
                    title="Refresh"
                  >
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] px-2"
                    onClick={() => { resetEdit(); setAddMode(true); }}
                  >
                    <Plus className="mr-1 h-2.5 w-2.5" /> Add
                  </Button>
                </div>
              </div>

              {isLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : entries.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
                  <Key className="h-6 w-6 opacity-30" />
                  <p className="text-xs">No API keys configured</p>
                  <p className="text-[10px]">
                    Click a provider above or use Add to set a key
                  </p>
                </div>
              ) : (
                <div className="divide-y rounded-lg border">
                  {entries.map((entry) => (
                    <div key={entry.key} className="group">
                      {editKey === entry.key ? (
                        /* Edit mode */
                        <div className="flex items-center gap-2 px-3 py-2">
                          <code className="text-xs font-mono font-medium shrink-0">
                            {entry.key}
                          </code>
                          <Input
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            placeholder="New value…"
                            type="password"
                            className="h-7 text-xs font-mono flex-1"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleUpdate();
                              if (e.key === "Escape") resetEdit();
                            }}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={handleUpdate}
                            disabled={!editValue.trim() || saving}
                          >
                            {saving ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Save className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                      ) : (
                        /* View mode */
                        <div className="flex items-center gap-3 px-3 py-2">
                          <code className="text-xs font-mono font-medium shrink-0">
                            {entry.key}
                          </code>
                          <code className="flex-1 truncate text-xs text-muted-foreground font-mono">
                            {entry.masked_value}
                          </code>
                          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => {
                                resetAdd();
                                setEditKey(entry.key);
                                setEditValue("");
                              }}
                              title="Update value"
                            >
                              <RefreshCw className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => handleDelete(entry.key)}
                              disabled={deleting === entry.key}
                              title="Delete"
                            >
                              {deleting === entry.key ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Trash2 className="h-3 w-3 text-destructive" />
                              )}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Inline add form */}
            {addMode && (
              <>
                <Separator />
                <div className="space-y-3">
                  <p className="text-xs font-medium">Add New Key</p>
                  <div className="grid gap-2">
                    <div className="grid gap-1">
                      <Label className="text-xs">Key Name</Label>
                      <Input
                        value={newKey}
                        onChange={(e) => setNewKey(e.target.value.toUpperCase())}
                        placeholder="OPENAI_API_KEY"
                        className="h-8 text-xs font-mono"
                        autoFocus={!newKey}
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-xs">Value</Label>
                      <Input
                        value={newValue}
                        onChange={(e) => setNewValue(e.target.value)}
                        placeholder="sk-…"
                        type="password"
                        className="h-8 text-xs font-mono"
                        autoFocus={!!newKey}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleAdd();
                          if (e.key === "Escape") resetAdd();
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={resetAdd}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      onClick={handleAdd}
                      disabled={!newKey.trim() || !newValue.trim() || saving}
                    >
                      {saving ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : (
                        <Save className="mr-1 h-3 w-3" />
                      )}
                      Save
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
