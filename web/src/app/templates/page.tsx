"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  fetcher,
  templateApi,
  type Template,
  type TemplateCreate,
  type TemplateUpdate,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  FileCode2,
  Play,
  Copy,
  Check,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useTheme } from "next-themes";
import { PageHeader } from "@/components/page-header";
import { toast } from "sonner";
import { CodeEditor } from "@/components/code-editor";

const CATEGORIES = ["dbt", "airflow", "sql", "custom"] as const;
type Category = (typeof CATEGORIES)[number];

/** Map template category → syntax highlighter language */
function langForCategory(category: string): string {
  const c = category.toLowerCase();
  if (c.includes("sql") || c.includes("dbt")) return "sql";
  if (c.includes("airflow") || c.includes("python") || c.includes("py"))
    return "python";
  if (c.includes("yaml") || c.includes("yml")) return "yaml";
  if (c.includes("json")) return "json";
  if (c.includes("shell") || c.includes("bash") || c.includes("sh"))
    return "bash";
  return "text";
}

/** Map category → CodeEditor language */
function editorLangForCategory(category: string): "markdown" | "yaml" | "json" | "text" {
  const c = category.toLowerCase();
  if (c.includes("yaml") || c.includes("yml")) return "yaml";
  if (c.includes("json")) return "json";
  return "text";
}

interface EditorForm {
  id: string;
  name: string;
  category: Category;
  description: string;
  content: string;
  variablesStr: string; // comma-separated
}

const emptyForm: EditorForm = {
  id: "",
  name: "",
  category: "custom",
  description: "",
  content: "",
  variablesStr: "",
};

export default function TemplatesPage() {
  const { data: templates, mutate } = useSWR<Template[]>(
    "/api/templates/",
    fetcher
  );

  // Render dialog state
  const [selected, setSelected] = useState<Template | null>(null);
  const [vars, setVars] = useState<Record<string, string>>({});
  const [rendered, setRendered] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);

  // Create / edit dialog state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null); // null = create mode
  const [form, setForm] = useState<EditorForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);
  const [deleting, setDeleting] = useState(false);

  /* ---- Render ---- */
  function openRender(t: Template) {
    setSelected(t);
    setVars(Object.fromEntries(t.variables.map((v) => [v, ""])));
    setRendered(null);
  }

  async function handleRender() {
    if (!selected) return;
    setRendering(true);
    try {
      const res = await templateApi.render(selected.id, vars);
      setRendered(res.rendered);
    } catch {
      setRendered("Error rendering template");
    } finally {
      setRendering(false);
    }
  }

  /* ---- Create / Edit ---- */
  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setEditorOpen(true);
  }

  function openEdit(t: Template, e: React.MouseEvent) {
    e.stopPropagation();
    setEditing(t);
    setForm({
      id: t.id,
      name: t.name,
      category: CATEGORIES.includes(t.category as Category)
        ? (t.category as Category)
        : "custom",
      description: t.description,
      content: t.content ?? "",
      variablesStr: t.variables.join(", "),
    });
    setEditorOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    const variables = form.variablesStr
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);

    try {
      if (editing) {
        const patch: TemplateUpdate = {
          name: form.name,
          description: form.description,
          content: form.content,
          variables,
        };
        await templateApi.update(editing.id, patch);
        toast.success("Template updated");
      } else {
        const payload: TemplateCreate = {
          id: form.id,
          name: form.name,
          category: form.category,
          description: form.description,
          content: form.content,
          variables,
        };
        await templateApi.create(payload);
        toast.success("Template created");
      }
      mutate();
      setEditorOpen(false);
    } catch (err) {
      toast.error(
        `Failed to ${editing ? "update" : "create"} template: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setSaving(false);
    }
  }

  /* ---- Delete ---- */
  function confirmDelete(t: Template, e: React.MouseEvent) {
    e.stopPropagation();
    setDeleteTarget(t);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await templateApi.delete(deleteTarget.id);
      toast.success("Template deleted");
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

  const grouped = (templates ?? []).reduce<Record<string, Template[]>>(
    (acc, t) => {
      (acc[t.category] ??= []).push(t);
      return acc;
    },
    {}
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Templates"
        description={
          <>
            {(templates ?? []).length} template
            {(templates ?? []).length !== 1 ? "s" : ""}
            {Object.keys(grouped).length > 0 && (
              <>
                {" "}
                across {Object.keys(grouped).length} categor
                {Object.keys(grouped).length !== 1 ? "ies" : "y"}
              </>
            )}
          </>
        }
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> New Template
          </Button>
        }
      />

      {!templates ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-full" />
              </CardHeader>
              <CardContent>
                <div className="flex gap-1">
                  <Skeleton className="h-4 w-16 rounded-full" />
                  <Skeleton className="h-4 w-20 rounded-full" />
                  <Skeleton className="h-4 w-14 rounded-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16">
            <div className="rounded-full bg-muted p-4">
              <FileCode2 className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">No templates found</p>
              <p className="text-xs text-muted-foreground">
                Create your first Jinja2 template to get started
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={openCreate}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Create Template
            </Button>
          </CardContent>
        </Card>
      ) : (
        Object.entries(grouped).map(([cat, temps]) => (
          <div key={cat} className="space-y-2">
            <h2 className="text-lg font-semibold capitalize">{cat}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {temps.map((t) => (
                <Card
                  key={t.id}
                  className="group cursor-pointer transition-all hover:border-primary/30 hover:shadow-md hover:shadow-primary/5"
                  onClick={() => openRender(t)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-sm">{t.name}</CardTitle>
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => openEdit(t, e)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive hover:text-destructive"
                          onClick={(e) => confirmDelete(t, e)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {t.description}
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-1">
                      {t.variables.map((v) => (
                        <Badge
                          key={v}
                          variant="secondary"
                          className="text-[10px] font-mono"
                        >
                          {v}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))
      )}

      {/* Render dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{selected?.name}</DialogTitle>
            <p className="text-xs text-muted-foreground">
              {selected?.description}
            </p>
          </DialogHeader>

          {selected && selected.variables.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {selected.variables.map((v) => (
                <div key={v} className="grid gap-1">
                  <Label className="text-xs font-mono">{v}</Label>
                  <Input
                    value={vars[v] ?? ""}
                    onChange={(e) => setVars({ ...vars, [v]: e.target.value })}
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
              {rendering ? "Rendering\u2026" : "Render"}
            </Button>
          </DialogFooter>

          {rendered && (
            <RenderedOutput
              code={rendered}
              language={langForCategory(selected?.category ?? "")}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Create / edit dialog */}
      <Dialog open={editorOpen} onOpenChange={(o) => !o && setEditorOpen(false)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit Template" : "New Template"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 overflow-y-auto flex-1 pr-1">
            {/* ID (only for create) */}
            {!editing && (
              <div className="grid gap-1">
                <Label className="text-xs">
                  ID <span className="text-muted-foreground">(e.g. dbt/staging_model)</span>
                </Label>
                <Input
                  value={form.id}
                  onChange={(e) => setForm({ ...form, id: e.target.value })}
                  placeholder="category/template-name"
                  className="h-8 text-sm font-mono"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label className="text-xs">Name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Staging Model"
                  className="h-8 text-sm"
                />
              </div>
              {!editing && (
                <div className="grid gap-1">
                  <Label className="text-xs">Category</Label>
                  <Select
                    value={form.category}
                    onValueChange={(v) =>
                      setForm({ ...form, category: v as Category })
                    }
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c} className="capitalize">
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="grid gap-1">
              <Label className="text-xs">Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                placeholder="What this template generates…"
                className="h-16 text-sm resize-none"
              />
            </div>

            <div className="grid gap-1">
              <Label className="text-xs">
                Variables{" "}
                <span className="text-muted-foreground">(comma-separated)</span>
              </Label>
              <Input
                value={form.variablesStr}
                onChange={(e) =>
                  setForm({ ...form, variablesStr: e.target.value })
                }
                placeholder="model_name, schema, source_table"
                className="h-8 text-sm font-mono"
              />
            </div>

            <div className="grid gap-1">
              <Label className="text-xs">Content (Jinja2)</Label>
              <div className="border rounded-md overflow-hidden">
                <CodeEditor
                  value={form.content}
                  onChange={(v) => setForm({ ...form, content: v })}
                  language={editorLangForCategory(form.category)}
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
              onClick={() => setEditorOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={
                saving ||
                !form.name.trim() ||
                !form.content.trim() ||
                (!editing && !form.id.trim())
              }
            >
              {saving
                ? "Saving\u2026"
                : editing
                  ? "Update Template"
                  : "Create Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{deleteTarget?.name}
              &rdquo;? This will also remove the template file from disk.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting\u2026" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RenderedOutput({
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
    <div className="relative flex-1 max-h-[350px] rounded border overflow-hidden">
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
      <ScrollArea className="h-full max-h-[350px]">
        <SyntaxHighlighter
          language={language}
          style={resolvedTheme === "dark" ? oneDark : undefined}
          customStyle={{
            margin: 0,
            fontSize: "0.75rem",
            background:
              resolvedTheme === "dark" ? undefined : "var(--color-muted)",
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
