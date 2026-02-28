"use client";

import { useState, useMemo, useCallback } from "react";
import useSWR from "swr";
import {
  fetcher,
  templateApi,
  type Template,
  type TemplateCreate,
  type TemplateUpdate,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  FileCode2,
  Play,
  Copy,
  Check,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  FolderOpen,
  Folder,
  File,
  Database,
  Wind,
  Code2,
  Braces,
  Search,
  X,
} from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { CodeEditor } from "@/components/code-editor";
import { cn } from "@/lib/utils";

/* ── Constants ──────────────────────────────────────────────────── */

const CATEGORIES = ["dbt", "airflow", "sql", "custom"] as const;
type Category = (typeof CATEGORIES)[number];

const CATEGORY_META: Record<string, { label: string; icon: typeof FileCode2; color: string }> = {
  dbt: { label: "dbt", icon: Database, color: "text-orange-500" },
  airflow: { label: "Airflow", icon: Wind, color: "text-sky-500" },
  sql: { label: "SQL", icon: Code2, color: "text-emerald-500" },
  custom: { label: "Custom", icon: Braces, color: "text-purple-500" },
};

/* ── Helpers ────────────────────────────────────────────────────── */

function langForCategory(cat: string): string {
  const c = cat.toLowerCase();
  if (c.includes("sql") || c.includes("dbt")) return "sql";
  if (c.includes("airflow") || c.includes("python")) return "python";
  if (c.includes("yaml") || c.includes("yml")) return "yaml";
  return "text";
}

function editorLangForCategory(cat: string): "markdown" | "yaml" | "json" | "text" {
  const c = cat.toLowerCase();
  if (c.includes("yaml") || c.includes("yml")) return "yaml";
  if (c.includes("json")) return "json";
  return "text";
}

function fileIcon(filePath: string) {
  if (filePath.endsWith(".sql.j2")) return "sql";
  if (filePath.endsWith(".py.j2")) return "py";
  if (filePath.endsWith(".yml.j2")) return "yml";
  return "j2";
}

/* ── Page ───────────────────────────────────────────────────────── */

export default function TemplatesPage() {
  const { data: templates, mutate } = useSWR<Template[]>("/api/templates/", fetcher, {
    revalidateOnFocus: false,
  });

  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<Template | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const [search, setSearch] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(["dbt", "airflow", "sql", "custom"])
  );

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    content: "",
    variablesStr: "",
  });
  const [saving, setSaving] = useState(false);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    id: "",
    name: "",
    category: "dbt" as Category,
    description: "",
    content: "",
    variablesStr: "",
  });

  // Render
  const [renderOpen, setRenderOpen] = useState(false);
  const [vars, setVars] = useState<Record<string, string>>({});
  const [rendered, setRendered] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);
  const [deleting, setDeleting] = useState(false);

  /* ── Tree data ────────────────────────────────────────────────── */

  const grouped = useMemo(() => {
    const g: Record<string, Template[]> = {};
    for (const t of templates ?? []) {
      (g[t.category] ??= []).push(t);
    }
    for (const k of Object.keys(g)) {
      g[k].sort((a, b) => a.name.localeCompare(b.name));
    }
    return g;
  }, [templates]);

  const filteredGrouped = useMemo(() => {
    if (!search.trim()) return grouped;
    const q = search.toLowerCase();
    const result: Record<string, Template[]> = {};
    for (const [cat, temps] of Object.entries(grouped)) {
      const matched = temps.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.id.toLowerCase().includes(q) ||
          t.variables.some((v) => v.toLowerCase().includes(q))
      );
      if (matched.length) result[cat] = matched;
    }
    return result;
  }, [grouped, search]);

  /* ── Actions ──────────────────────────────────────────────────── */

  const selectTemplate = useCallback(
    async (t: Template) => {
      if (editing) return;
      setActiveId(t.id);
      setLoadingContent(true);
      setEditing(false);
      try {
        const full = await templateApi.get(t.id);
        setActiveTemplate(full);
      } catch {
        toast.error("Failed to load template");
      } finally {
        setLoadingContent(false);
      }
    },
    [editing]
  );

  function toggleFolder(cat: string) {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const result = await templateApi.sync();
      if (result.created.length || result.updated.length) {
        toast.success(result.message);
      } else {
        toast.info("Templates already up to date");
      }
      mutate();
    } catch (err) {
      toast.error(
        `Sync failed: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setSyncing(false);
    }
  }

  /* ── Edit ──────────────────────────────────────────────────────── */

  function startEdit() {
    if (!activeTemplate) return;
    setEditForm({
      name: activeTemplate.name,
      description: activeTemplate.description,
      content: activeTemplate.content ?? "",
      variablesStr: activeTemplate.variables.join(", "),
    });
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
  }

  async function saveEdit() {
    if (!activeTemplate) return;
    setSaving(true);
    try {
      const variables = editForm.variablesStr
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
      const patch: TemplateUpdate = {
        name: editForm.name,
        description: editForm.description,
        content: editForm.content,
        variables,
      };
      await templateApi.update(activeTemplate.id, patch);
      toast.success("Template saved");
      setEditing(false);
      mutate();
      const full = await templateApi.get(activeTemplate.id);
      setActiveTemplate(full);
    } catch (err) {
      toast.error(
        `Save failed: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setSaving(false);
    }
  }

  /* ── Create ────────────────────────────────────────────────────── */

  function openCreate() {
    setCreateForm({
      id: "",
      name: "",
      category: "dbt",
      description: "",
      content: "",
      variablesStr: "",
    });
    setCreateOpen(true);
  }

  async function handleCreate() {
    setSaving(true);
    try {
      const variables = createForm.variablesStr
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
      const payload: TemplateCreate = {
        id: createForm.id,
        name: createForm.name,
        category: createForm.category,
        description: createForm.description,
        content: createForm.content,
        variables,
      };
      const created = await templateApi.create(payload);
      toast.success("Template created");
      setCreateOpen(false);
      mutate();
      setExpandedFolders((prev) => new Set([...prev, created.category]));
      selectTemplate(created);
    } catch (err) {
      toast.error(
        `Create failed: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setSaving(false);
    }
  }

  /* ── Render ────────────────────────────────────────────────────── */

  function openRender() {
    if (!activeTemplate) return;
    setVars(
      Object.fromEntries(activeTemplate.variables.map((v) => [v, ""]))
    );
    setRendered(null);
    setRenderOpen(true);
  }

  async function handleRender() {
    if (!activeTemplate) return;
    setRendering(true);
    try {
      const res = await templateApi.render(activeTemplate.id, vars);
      setRendered(res.rendered);
    } catch (err) {
      toast.error(
        `Render failed: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setRendering(false);
    }
  }

  /* ── Delete ────────────────────────────────────────────────────── */

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await templateApi.delete(deleteTarget.id);
      toast.success("Template deleted");
      if (activeId === deleteTarget.id) {
        setActiveId(null);
        setActiveTemplate(null);
      }
      mutate();
    } catch (err) {
      toast.error(
        `Delete failed: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  /* ── JSX ───────────────────────────────────────────────────────── */

  const totalCount = (templates ?? []).length;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-[calc(100vh-6rem)] flex-col gap-0">
        {/* Two-panel layout */}
        <div className="flex flex-1 overflow-hidden rounded-lg border bg-card">
          {/* ── LEFT: File Tree ──────────────────────────────────── */}
          <div className="flex w-64 shrink-0 flex-col border-r bg-muted/30">
            {/* Tree header */}
            <div className="flex items-center justify-between border-b px-3 py-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Templates
              </span>
              <div className="flex items-center gap-0.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={handleSync}
                      disabled={syncing}
                    >
                      <RefreshCw
                        className={cn("h-3 w-3", syncing && "animate-spin")}
                      />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Sync from disk</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={openCreate}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">New template</TooltipContent>
                </Tooltip>
              </div>
            </div>

            {/* Search */}
            <div className="px-2 py-1.5">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Filter…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-7 pl-7 pr-7 text-xs bg-background"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Tree */}
            <ScrollArea className="flex-1">
              <div className="px-1 pb-2">
                {!templates ? (
                  <div className="space-y-2 px-2 pt-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-4 rounded bg-muted animate-pulse"
                      />
                    ))}
                  </div>
                ) : Object.keys(filteredGrouped).length === 0 ? (
                  <div className="px-3 py-8 text-center">
                    <FileCode2 className="mx-auto h-6 w-6 text-muted-foreground/40" />
                    <p className="mt-2 text-xs text-muted-foreground">
                      {search ? "No matches" : "No templates"}
                    </p>
                  </div>
                ) : (
                  Object.entries(filteredGrouped).map(([cat, temps]) => {
                    const expanded = expandedFolders.has(cat);
                    const meta = CATEGORY_META[cat] ?? CATEGORY_META.custom;
                    const CatIcon = meta.icon;

                    return (
                      <div key={cat}>
                        {/* Folder row */}
                        <button
                          onClick={() => toggleFolder(cat)}
                          className="flex w-full items-center gap-1 rounded-md px-2 py-1 text-xs font-medium hover:bg-accent/50 transition-colors"
                        >
                          {expanded ? (
                            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                          )}
                          {expanded ? (
                            <FolderOpen
                              className={cn("h-3.5 w-3.5 shrink-0", meta.color)}
                            />
                          ) : (
                            <Folder
                              className={cn("h-3.5 w-3.5 shrink-0", meta.color)}
                            />
                          )}
                          <span className="truncate">{meta.label}</span>
                          <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
                            {temps.length}
                          </span>
                        </button>

                        {/* Files */}
                        {expanded && (
                          <div className="ml-3 border-l border-border/50 pl-1">
                            {temps.map((t) => {
                              const ext = fileIcon(t.file_path);
                              const isActive = activeId === t.id;
                              return (
                                <button
                                  key={t.id}
                                  onClick={() => selectTemplate(t)}
                                  className={cn(
                                    "group/file flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
                                    isActive
                                      ? "bg-accent text-accent-foreground font-medium"
                                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                                  )}
                                >
                                  <File className="h-3 w-3 shrink-0" />
                                  <span className="truncate flex-1 text-left">
                                    {t.name}
                                  </span>
                                  <span className="text-[9px] text-muted-foreground/60 font-mono shrink-0">
                                    .{ext}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>

            {/* Tree footer */}
            <div className="border-t px-3 py-1.5">
              <p className="text-[10px] text-muted-foreground">
                {totalCount} template{totalCount !== 1 ? "s" : ""}
              </p>
            </div>
          </div>

          {/* ── RIGHT: Content ───────────────────────────────────── */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {!activeTemplate && !loadingContent ? (
              <div className="flex flex-1 items-center justify-center">
                <div className="text-center">
                  <FileCode2 className="mx-auto h-12 w-12 text-muted-foreground/20" />
                  <p className="mt-3 text-sm text-muted-foreground">
                    Select a template from the sidebar
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground/60">
                    or create a new one with{" "}
                    <kbd className="rounded border bg-muted px-1 py-0.5 text-[10px] font-mono">
                      +
                    </kbd>
                  </p>
                </div>
              </div>
            ) : loadingContent ? (
              <div className="flex flex-1 items-center justify-center">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : activeTemplate ? (
              <>
                {/* Content header */}
                <div className="flex items-center justify-between border-b px-4 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <CategoryBadge category={activeTemplate.category} />
                    {editing ? (
                      <Input
                        value={editForm.name}
                        onChange={(e) =>
                          setEditForm({ ...editForm, name: e.target.value })
                        }
                        className="h-7 text-sm font-semibold w-56"
                      />
                    ) : (
                      <div className="min-w-0">
                        <h2 className="text-sm font-semibold truncate">
                          {activeTemplate.name}
                        </h2>
                        <p className="text-[11px] font-mono text-muted-foreground truncate">
                          {activeTemplate.file_path}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {editing ? (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={cancelEdit}
                          disabled={saving}
                        >
                          Cancel
                        </Button>
                        <Button size="sm" onClick={saveEdit} disabled={saving}>
                          {saving ? "Saving…" : "Save"}
                        </Button>
                      </>
                    ) : (
                      <>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={openRender}
                            >
                              <Play className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Render</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={startEdit}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Edit</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => setDeleteTarget(activeTemplate)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Delete</TooltipContent>
                        </Tooltip>
                      </>
                    )}
                  </div>
                </div>

                {/* Metadata bar */}
                {editing ? (
                  <div className="border-b px-4 py-2 space-y-2 bg-muted/20">
                    <div className="grid gap-1">
                      <Label className="text-[11px] text-muted-foreground">
                        Description
                      </Label>
                      <Textarea
                        value={editForm.description}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            description: e.target.value,
                          })
                        }
                        className="h-14 text-xs resize-none"
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-[11px] text-muted-foreground">
                        Variables (comma-separated)
                      </Label>
                      <Input
                        value={editForm.variablesStr}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            variablesStr: e.target.value,
                          })
                        }
                        className="h-7 text-xs font-mono"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-4 border-b px-4 py-2 bg-muted/20">
                    <p className="flex-1 text-xs text-muted-foreground line-clamp-2">
                      {activeTemplate.description || "No description"}
                    </p>
                    {activeTemplate.variables.length > 0 && (
                      <div className="flex flex-wrap gap-1 shrink-0">
                        {activeTemplate.variables.map((v) => (
                          <Badge
                            key={v}
                            variant="outline"
                            className="text-[10px] font-mono px-1.5 py-0"
                          >
                            {v}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Content area */}
                <div className="flex-1 overflow-hidden">
                  {editing ? (
                    <CodeEditor
                      value={editForm.content}
                      onChange={(v) =>
                        setEditForm({ ...editForm, content: v })
                      }
                      language={editorLangForCategory(activeTemplate.category)}
                      minHeight="100%"
                      maxHeight="100%"
                    />
                  ) : (
                    <ContentViewer
                      code={activeTemplate.content ?? ""}
                      language={langForCategory(activeTemplate.category)}
                    />
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>

        {/* ── Render Dialog ──────────────────────────────────────── */}
        <Dialog open={renderOpen} onOpenChange={(o) => !o && setRenderOpen(false)}>
          <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Render: {activeTemplate?.name}</DialogTitle>
              <p className="text-xs text-muted-foreground">
                {activeTemplate?.description}
              </p>
            </DialogHeader>

            {activeTemplate && activeTemplate.variables.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {activeTemplate.variables.map((v) => (
                  <div key={v} className="grid gap-1">
                    <Label className="text-xs font-mono">{v}</Label>
                    <Input
                      value={vars[v] ?? ""}
                      onChange={(e) =>
                        setVars({ ...vars, [v]: e.target.value })
                      }
                      placeholder={v}
                      className="h-8 text-sm"
                    />
                  </div>
                ))}
              </div>
            )}

            <DialogFooter>
              <Button size="sm" onClick={handleRender} disabled={rendering}>
                <Play className="mr-1.5 h-3.5 w-3.5" />
                {rendering ? "Rendering…" : "Render"}
              </Button>
            </DialogFooter>

            {rendered && (
              <CopyableCode
                code={rendered}
                language={langForCategory(activeTemplate?.category ?? "")}
              />
            )}
          </DialogContent>
        </Dialog>

        {/* ── Create Dialog ──────────────────────────────────────── */}
        <Dialog
          open={createOpen}
          onOpenChange={(o) => !o && setCreateOpen(false)}
        >
          <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>New Template</DialogTitle>
            </DialogHeader>

            <div className="space-y-3 overflow-y-auto flex-1 pr-1">
              <div className="grid gap-1">
                <Label className="text-xs">
                  ID{" "}
                  <span className="text-muted-foreground">
                    (e.g. dbt/staging_model)
                  </span>
                </Label>
                <Input
                  value={createForm.id}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, id: e.target.value })
                  }
                  placeholder="category/template-name"
                  className="h-8 text-sm font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1">
                  <Label className="text-xs">Name</Label>
                  <Input
                    value={createForm.name}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, name: e.target.value })
                    }
                    placeholder="Staging Model"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Category</Label>
                  <Select
                    value={createForm.category}
                    onValueChange={(v) =>
                      setCreateForm({
                        ...createForm,
                        category: v as Category,
                      })
                    }
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => {
                        const meta = CATEGORY_META[c];
                        const Icon = meta.icon;
                        return (
                          <SelectItem key={c} value={c}>
                            <div className="flex items-center gap-2">
                              <Icon
                                className={cn("h-3.5 w-3.5", meta.color)}
                              />
                              <span className="capitalize">{meta.label}</span>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-1">
                <Label className="text-xs">Description</Label>
                <Textarea
                  value={createForm.description}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      description: e.target.value,
                    })
                  }
                  placeholder="What this template generates…"
                  className="h-16 text-sm resize-none"
                />
              </div>

              <div className="grid gap-1">
                <Label className="text-xs">
                  Variables{" "}
                  <span className="text-muted-foreground">
                    (comma-separated)
                  </span>
                </Label>
                <Input
                  value={createForm.variablesStr}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      variablesStr: e.target.value,
                    })
                  }
                  placeholder="model_name, schema, source_table"
                  className="h-8 text-sm font-mono"
                />
              </div>

              <div className="grid gap-1">
                <Label className="text-xs">Content (Jinja2)</Label>
                <div className="border rounded-md overflow-hidden">
                  <CodeEditor
                    value={createForm.content}
                    onChange={(v) =>
                      setCreateForm({ ...createForm, content: v })
                    }
                    language={editorLangForCategory(createForm.category)}
                    minHeight="250px"
                    maxHeight="300px"
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={
                  saving ||
                  !createForm.name.trim() ||
                  !createForm.content.trim() ||
                  !createForm.id.trim()
                }
              >
                {saving ? "Creating…" : "Create Template"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Delete Confirmation ────────────────────────────────── */}
        <AlertDialog
          open={!!deleteTarget}
          onOpenChange={(o) => !o && setDeleteTarget(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Template</AlertDialogTitle>
              <AlertDialogDescription>
                Delete &ldquo;{deleteTarget?.name}&rdquo;? This removes the
                template file from disk.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? "Deleting…" : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}

/* ── Sub-components ─────────────────────────────────────────────── */

function CategoryBadge({ category }: { category: string }) {
  const meta = CATEGORY_META[category] ?? CATEGORY_META.custom;
  const Icon = meta.icon;
  return (
    <div
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md bg-muted shrink-0",
        meta.color
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </div>
  );
}

function ContentViewer({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);
  const { resolvedTheme } = useTheme();

  function handleCopy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="relative h-full">
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-3 top-3 z-10 h-7 w-7 bg-background/60 backdrop-blur-sm"
        onClick={handleCopy}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-green-500" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </Button>
      <ScrollArea className="h-full">
        <SyntaxHighlighter
          language={language}
          style={resolvedTheme === "dark" ? oneDark : undefined}
          customStyle={{
            margin: 0,
            padding: "1rem",
            fontSize: "0.8rem",
            lineHeight: "1.6",
            background: resolvedTheme === "dark" ? undefined : "transparent",
            borderRadius: 0,
            minHeight: "100%",
          }}
          showLineNumbers
          lineNumberStyle={{
            minWidth: "2.5em",
            opacity: 0.3,
            fontSize: "0.7rem",
          }}
          wrapLongLines
        >
          {code}
        </SyntaxHighlighter>
      </ScrollArea>
    </div>
  );
}

function CopyableCode({
  code,
  language,
}: {
  code: string;
  language: string;
}) {
  const [copied, setCopied] = useState(false);
  const { resolvedTheme } = useTheme();

  function handleCopy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="relative flex-1 max-h-87.5 rounded border overflow-hidden">
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-2 top-2 z-10 h-7 w-7 bg-background/60 backdrop-blur-sm"
        onClick={handleCopy}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-green-500" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </Button>
      <ScrollArea className="h-full max-h-87.5">
        <SyntaxHighlighter
          language={language}
          style={resolvedTheme === "dark" ? oneDark : undefined}
          customStyle={{
            margin: 0,
            fontSize: "0.75rem",
            background:
              resolvedTheme === "dark"
                ? undefined
                : "var(--color-muted)",
            borderRadius: 0,
          }}
          wrapLongLines
        >
          {code}
        </SyntaxHighlighter>
      </ScrollArea>
    </div>
  );
}
