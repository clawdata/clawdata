"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import useSWR from "swr";
import {
  fetcher,
  taskApi,
  lifecycleApi,
  type Task,
  type TaskCreate,
  type TaskUpdate,
  type TaskTemplate,
  type TaskStatus,
  type TaskDetail,
  type TaskRun,
  type OpenClawAgentsList,
  type OpenClawAgent,
} from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Clock,
  Plus,
  Timer,
  CalendarClock,
  MoreVertical,
  Trash2,
  Pencil,
  CheckCircle2,
  Bot,
  Megaphone,
  Zap,
  Mail,
  Database,
  Sun,
  Calendar,
  BarChart3,
  Terminal,
  HeartPulse,
  ShieldCheck,
  MessageCircle,
  HardDrive,
  ArrowRight,
  XCircle,
  AlertTriangle,
  SkipForward,
  Loader2,
  Hash,
  Cpu,
  Globe,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/* ── Icon map for templates ──────────────────────────────────────── */

const TEMPLATE_ICONS: Record<string, React.ElementType> = {
  mail: Mail,
  database: Database,
  sun: Sun,
  calendar: Calendar,
  "bar-chart": BarChart3,
  terminal: Terminal,
  "heart-pulse": HeartPulse,
  "shield-check": ShieldCheck,
  "message-circle": MessageCircle,
  "hard-drive": HardDrive,
};

/* ── Category colours ────────────────────────────────────────────── */

const CATEGORY_COLORS: Record<string, string> = {
  communication: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  "data-engineering": "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  productivity: "bg-green-500/10 text-green-600 dark:text-green-400",
  analysis: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  monitoring: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  general: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
};

/* ── Human-readable cron helper ──────────────────────────────────── */

function cronToHuman(expr: string | null): string {
  if (!expr) return "No schedule";
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5) return expr;
  const [min, hour, dom, , dow] = parts;

  // Daily at HH:MM
  if (dom === "*" && dow === "*" && hour !== "*" && min !== "*") {
    const h = parseInt(hour, 10);
    const m = parseInt(min, 10);
    const period = h >= 12 ? "PM" : "AM";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `Daily at ${h12}:${m.toString().padStart(2, "0")} ${period}`;
  }

  // Weekly (specific dow)
  if (dom === "*" && dow !== "*" && hour !== "*") {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const d = parseInt(dow, 10);
    const dayName = days[d] || `day ${dow}`;
    const h = parseInt(hour, 10);
    const period = h >= 12 ? "PM" : "AM";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${dayName} at ${h12}:${min.padStart(2, "0")} ${period}`;
  }

  // Every N minutes
  if (min.startsWith("*/") && hour === "*") {
    return `Every ${min.slice(2)} min`;
  }

  // Hourly
  if (hour === "*" && min !== "*" && dom === "*") {
    return `Hourly at :${min.padStart(2, "0")}`;
  }

  return expr;
}

/* ── Swim lane definitions ───────────────────────────────────────── */

const LANES: { status: TaskStatus; label: string; dot: string }[] = [
  { status: "backlog", label: "Backlog", dot: "bg-slate-400" },
  { status: "active", label: "Active", dot: "bg-green-500" },
  { status: "paused", label: "Paused", dot: "bg-amber-500" },
  { status: "completed", label: "Completed", dot: "bg-blue-500" },
];

/* ── Category label helper ───────────────────────────────────────── */

const CATEGORY_LABELS: Record<string, string> = {
  communication: "Communication",
  "data-engineering": "Data Engineering",
  productivity: "Productivity",
  analysis: "Analysis",
  monitoring: "Monitoring",
  general: "General",
};

/* ── Schedule label helper ───────────────────────────────────────── */

function scheduleLabel(task: Task) {
  if (task.schedule_type === "heartbeat") {
    return `Every ${task.heartbeat_interval || "30m"}`;
  }
  return task.cron_expression || "No schedule";
}

/* ── slugify ─────────────────────────────────────────────────────── */

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

/* ── Task Card ───────────────────────────────────────────────────── */

function TaskCard({
  task,
  agents,
  onEdit,
  onDelete,
  onToggle,
  onMove,
  onSelect,
  onExecute,
}: {
  task: Task;
  agents: OpenClawAgent[];
  onEdit: (t: Task) => void;
  onDelete: (t: Task) => void;
  onToggle: (t: Task) => void;
  onMove: (t: Task, status: TaskStatus) => void;
  onSelect: (t: Task) => void;
  onExecute: (t: Task) => void;
}) {
  const agent = agents.find((a) => a.id === task.agent_id);

  return (
    <div
      className={cn(
        "group relative rounded-lg border bg-card p-3 cursor-pointer transition-colors hover:bg-accent/50",
        !task.enabled && "opacity-50"
      )}
      onClick={() => onSelect(task)}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium truncate">{task.name}</p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={() => onExecute(task)}>
              <Zap className="h-3.5 w-3.5 mr-2" /> Run Now
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit(task)}>
              <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {LANES.filter((l) => l.status !== task.status).map((l) => (
              <DropdownMenuItem key={l.status} onClick={() => onMove(task, l.status)}>
                <ArrowRight className="h-3.5 w-3.5 mr-2" /> Move to {l.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => onDelete(task)}
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {task.description && (
        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{task.description}</p>
      )}

      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          {task.schedule_type === "cron" ? (
            <CalendarClock className="h-3 w-3" />
          ) : (
            <Timer className="h-3 w-3" />
          )}
          {scheduleLabel(task)}
        </span>
        <span>·</span>
        <span>
          {agent?.emoji ? `${agent.emoji} ` : ""}
          {agent?.name || task.agent_id}
        </span>
        {task.session_mode === "isolated" && (
          <>
            <span>·</span>
            <span>Isolated</span>
          </>
        )}
      </div>

      <div className="flex items-center justify-between mt-2">
        <span className="text-[11px] text-muted-foreground">{task.timezone}</span>
        <Switch
          checked={task.enabled}
          onCheckedChange={(e) => { onToggle(task); }}
          onClick={(e) => e.stopPropagation()}
          className="scale-75"
        />
      </div>
    </div>
  );
}

/* ── Swim Lane Column ────────────────────────────────────────────── */

function SwimLane({
  lane,
  tasks,
  agents,
  onEdit,
  onDelete,
  onToggle,
  onMove,
  onSelect,
  onExecute,
}: {
  lane: (typeof LANES)[number];
  tasks: Task[];
  agents: OpenClawAgent[];
  onEdit: (t: Task) => void;
  onDelete: (t: Task) => void;
  onToggle: (t: Task) => void;
  onMove: (t: Task, status: TaskStatus) => void;
  onSelect: (t: Task) => void;
  onExecute: (t: Task) => void;
}) {
  return (
    <div className="flex flex-col min-w-[260px] flex-1">
      <div className="flex items-center gap-2 mb-2 px-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {lane.label}
        </span>
        <span className="text-xs text-muted-foreground/60">{tasks.length}</span>
      </div>
      <div className="flex flex-col gap-2 min-h-[120px]">
        {tasks.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">
            No tasks
          </p>
        )}
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            agents={agents}
            onEdit={onEdit}
            onDelete={onDelete}
            onToggle={onToggle}
            onMove={onMove}
            onSelect={onSelect}
            onExecute={onExecute}
          />
        ))}
      </div>
    </div>
  );
}

/* ── Template Card ───────────────────────────────────────────────── */

function TemplateCard({
  template,
  onSelect,
}: {
  template: TaskTemplate;
  onSelect: (t: TaskTemplate) => void;
}) {
  const Icon = TEMPLATE_ICONS[template.icon] || Zap;
  const catColor = CATEGORY_COLORS[template.category] || CATEGORY_COLORS.general;

  return (
    <button
      type="button"
      className="text-left rounded-lg border bg-card p-3 cursor-pointer transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      onClick={() => onSelect(template)}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <p className="text-xs font-medium leading-snug truncate">{template.name}</p>
      </div>
      <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed mb-2">
        {template.description}
      </p>
      <span className={cn("inline-block text-[10px] font-medium px-1.5 py-px rounded-full truncate max-w-full", catColor)}>
        {CATEGORY_LABELS[template.category] || template.category}
      </span>
    </button>
  );
}

/* ── Create/Edit Dialog ──────────────────────────────────────────── */

interface TaskFormData {
  id: string;
  name: string;
  description: string;
  schedule_type: "cron" | "heartbeat";
  cron_expression: string;
  heartbeat_interval: string;
  timezone: string;
  session_mode: "main" | "isolated";
  message: string;
  agent_id: string;
  status: TaskStatus;
  enabled: boolean;
  model_override: string;
  announce: boolean;
  delete_after_run: boolean;
}

const EMPTY_FORM: TaskFormData = {
  id: "",
  name: "",
  description: "",
  schedule_type: "cron",
  cron_expression: "0 * * * *",
  heartbeat_interval: "30m",
  timezone: "UTC",
  session_mode: "isolated",
  message: "",
  agent_id: "main",
  status: "active",
  enabled: true,
  model_override: "",
  announce: false,
  delete_after_run: false,
};

function TaskFormDialog({
  open,
  editingTask,
  agents,
  defaultAgentId,
  onClose,
  onSave,
}: {
  open: boolean;
  editingTask: Task | null;
  agents: OpenClawAgent[];
  defaultAgentId: string;
  onClose: () => void;
  onSave: (data: TaskCreate | TaskUpdate, isEdit: boolean) => void;
}) {
  const [form, setForm] = useState<TaskFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const prevOpenRef = useRef(false);

  // Sync form when dialog opens
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      if (editingTask) {
        setForm({
          id: editingTask.id,
          name: editingTask.name,
          description: editingTask.description,
          schedule_type: editingTask.schedule_type as "cron" | "heartbeat",
          cron_expression: editingTask.cron_expression || "0 * * * *",
          heartbeat_interval: editingTask.heartbeat_interval || "30m",
          timezone: editingTask.timezone,
          session_mode: editingTask.session_mode as "main" | "isolated",
          message: editingTask.message,
          agent_id: editingTask.agent_id,
          status: editingTask.status as TaskStatus,
          enabled: editingTask.enabled,
          model_override: editingTask.model_override || "",
          announce: editingTask.announce,
          delete_after_run: editingTask.delete_after_run,
        });
      } else {
        setForm({ ...EMPTY_FORM, agent_id: defaultAgentId });
      }
    }
    prevOpenRef.current = open;
  }, [open, editingTask, defaultAgentId]);

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      if (editingTask) {
        const update: TaskUpdate & { id?: string } = {
          name: form.name,
          description: form.description,
          schedule_type: form.schedule_type,
          cron_expression: form.schedule_type === "cron" ? form.cron_expression : null,
          heartbeat_interval: form.schedule_type === "heartbeat" ? form.heartbeat_interval : null,
          timezone: form.timezone,
          session_mode: form.session_mode,
          message: form.message,
          agent_id: form.agent_id,
          status: form.status,
          enabled: form.enabled,
          model_override: form.model_override || null,
          announce: form.announce,
          delete_after_run: form.delete_after_run,
          // Include id for pseudo template creates (user may have edited it)
          ...(!editingTask.created_at ? { id: form.id || slugify(form.name) } : {}),
        };
        onSave(update, true);
      } else {
        const id = form.id || slugify(form.name);
        const create: TaskCreate = {
          id,
          name: form.name,
          description: form.description,
          schedule_type: form.schedule_type,
          cron_expression: form.schedule_type === "cron" ? form.cron_expression : null,
          heartbeat_interval: form.schedule_type === "heartbeat" ? form.heartbeat_interval : null,
          timezone: form.timezone,
          session_mode: form.session_mode,
          message: form.message,
          agent_id: form.agent_id,
          status: form.status,
          enabled: form.enabled,
          model_override: form.model_override || null,
          announce: form.announce,
          delete_after_run: form.delete_after_run,
        };
        onSave(create, false);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingTask ? "Edit Task" : "Create Task"}</DialogTitle>
          <DialogDescription>
            {editingTask
              ? "Update task configuration and schedule."
              : "Configure a new scheduled task with cron or heartbeat timing."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name & ID */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="task-name">Name</Label>
              <Input
                id="task-name"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    name: e.target.value,
                    ...(editingTask ? {} : { id: slugify(e.target.value) }),
                  }))
                }
                placeholder="Morning briefing"
              />
            </div>
            <div>
              <Label htmlFor="task-id">ID</Label>
              <Input
                id="task-id"
                value={form.id}
                onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))}
                placeholder="morning-briefing"
                disabled={!!editingTask?.created_at}
                className="font-mono text-xs"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="task-desc">Description</Label>
            <Input
              id="task-desc"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Brief description of what this task does"
            />
          </div>

          {/* Schedule Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Schedule Type</Label>
              <Select
                value={form.schedule_type}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, schedule_type: v as "cron" | "heartbeat" }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cron">
                    <span className="flex items-center gap-2">
                      <CalendarClock className="h-3.5 w-3.5" /> Cron
                    </span>
                  </SelectItem>
                  <SelectItem value="heartbeat">
                    <span className="flex items-center gap-2">
                      <Timer className="h-3.5 w-3.5" /> Heartbeat
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.schedule_type === "cron" ? (
              <div>
                <Label htmlFor="cron-expr">Cron Expression</Label>
                <Input
                  id="cron-expr"
                  value={form.cron_expression}
                  onChange={(e) => setForm((f) => ({ ...f, cron_expression: e.target.value }))}
                  placeholder="0 7 * * *"
                  className="font-mono text-xs"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  min hour day month weekday
                </p>
              </div>
            ) : (
              <div>
                <Label htmlFor="hb-interval">Interval</Label>
                <Select
                  value={form.heartbeat_interval}
                  onValueChange={(v) => setForm((f) => ({ ...f, heartbeat_interval: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5m">Every 5 minutes</SelectItem>
                    <SelectItem value="15m">Every 15 minutes</SelectItem>
                    <SelectItem value="30m">Every 30 minutes</SelectItem>
                    <SelectItem value="1h">Every hour</SelectItem>
                    <SelectItem value="2h">Every 2 hours</SelectItem>
                    <SelectItem value="4h">Every 4 hours</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Schedule info box */}
          <div className="rounded-md bg-muted/50 border p-3 text-xs text-muted-foreground">
            {form.schedule_type === "cron" ? (
              <>
                <strong className="text-foreground">Cron</strong> — runs at precise times in
                isolated sessions. Ideal for exact-timing tasks like daily reports, weekly
                reviews, or one-shot reminders. Supports model overrides and announce mode.
              </>
            ) : (
              <>
                <strong className="text-foreground">Heartbeat</strong> — runs in the main
                session at regular intervals. Batches multiple checks together with full
                conversational context. Best for inbox monitoring, calendar checks, and
                background awareness tasks.
              </>
            )}
          </div>

          {/* Session & Agent */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Session Mode</Label>
              <Select
                value={form.session_mode}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, session_mode: v as "main" | "isolated" }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="main">Main Session</SelectItem>
                  <SelectItem value="isolated">Isolated Session</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Assign to Agent</Label>
              <Select
                value={form.agent_id}
                onValueChange={(v) => setForm((f) => ({ ...f, agent_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select agent…" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.emoji ? `${a.emoji} ` : ""}{a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Timezone */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="task-tz">Timezone</Label>
              <Select
                value={form.timezone}
                onValueChange={(v) => setForm((f) => ({ ...f, timezone: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UTC">UTC</SelectItem>
                  <SelectItem value="America/New_York">America/New_York</SelectItem>
                  <SelectItem value="America/Chicago">America/Chicago</SelectItem>
                  <SelectItem value="America/Los_Angeles">America/Los_Angeles</SelectItem>
                  <SelectItem value="Europe/London">Europe/London</SelectItem>
                  <SelectItem value="Europe/Berlin">Europe/Berlin</SelectItem>
                  <SelectItem value="Asia/Tokyo">Asia/Tokyo</SelectItem>
                  <SelectItem value="Asia/Shanghai">Asia/Shanghai</SelectItem>
                  <SelectItem value="Australia/Sydney">Australia/Sydney</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="task-model">Model Override</Label>
              <Input
                id="task-model"
                value={form.model_override}
                onChange={(e) => setForm((f) => ({ ...f, model_override: e.target.value }))}
                placeholder="Leave blank for default"
                className="font-mono text-xs"
              />
            </div>
          </div>

          {/* Message */}
          <div>
            <Label htmlFor="task-msg">Message / Prompt</Label>
            <Textarea
              id="task-msg"
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              placeholder="The prompt sent to the agent when this task runs..."
              rows={4}
              className="text-sm"
            />
          </div>

          {/* Toggles */}
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={form.enabled}
                onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
              />
              Enabled
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={form.announce}
                onCheckedChange={(v) => setForm((f) => ({ ...f, announce: v }))}
              />
              Announce
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={form.delete_after_run}
                onCheckedChange={(v) => setForm((f) => ({ ...f, delete_after_run: v }))}
              />
              One-shot (delete after run)
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving…" : editingTask ? "Update Task" : "Create Task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Templates Browser Dialog ────────────────────────────────────── */

function TemplatesBrowser({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (t: TaskTemplate) => void;
}) {
  const { data: templates } = useSWR<TaskTemplate[]>(
    open ? "/api/tasks/templates" : null,
    fetcher
  );
  const [filter, setFilter] = useState("all");
  const categories = useMemo(() => {
    if (!templates) return [];
    const cats = new Set(templates.map((t) => t.category));
    return ["all", ...Array.from(cats)];
  }, [templates]);

  const filtered = useMemo(() => {
    if (!templates) return [];
    if (filter === "all") return templates;
    return templates.filter((t) => t.category === filter);
  }, [templates, filter]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Task Templates</DialogTitle>
          <DialogDescription>
            Choose a pre-configured template to quickly set up common automation tasks.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1.5 flex-wrap">
          {categories.map((cat) => (
            <Button
              key={cat}
              variant={filter === cat ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(cat)}
              className="text-xs h-7 px-2.5"
            >
              {CATEGORY_LABELS[cat] || cat.charAt(0).toUpperCase() + cat.slice(1)}
            </Button>
          ))}
        </div>

        <ScrollArea className="flex-1 -mx-6 px-6 overflow-y-auto">
          {!templates ? (
            <div className="grid grid-cols-3 gap-2 pb-2">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-24 rounded-lg" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No templates in this category.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 pb-2">
              {filtered.map((t) => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  onSelect={() => {
                    onSelect(t);
                    onClose();
                  }}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

/* ── List View ───────────────────────────────────────────────────── */

function ListView({
  tasks,
  agents,
  onEdit,
  onDelete,
  onToggle,
  onMove,
  onSelect,
  onExecute,
}: {
  tasks: Task[];
  agents: OpenClawAgent[];
  onEdit: (t: Task) => void;
  onDelete: (t: Task) => void;
  onToggle: (t: Task) => void;
  onMove: (t: Task, status: TaskStatus) => void;
  onSelect: (t: Task) => void;
  onExecute: (t: Task) => void;
}) {
  if (tasks.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p className="text-sm">No tasks yet.</p>
        <p className="text-xs mt-1">Create one or start from a template.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {tasks.map((task) => {
        const agent = agents.find((a) => a.id === task.agent_id);
        const laneDef = LANES.find((l) => l.status === task.status);
        return (
          <div
            key={task.id}
            className={cn(
              "flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/50 cursor-pointer",
              !task.enabled && "opacity-50"
            )}
            onClick={() => onSelect(task)}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", laneDef?.dot || "bg-slate-400")} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{task.name}</p>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  {task.schedule_type === "cron" ? (
                    <CalendarClock className="h-3 w-3" />
                  ) : (
                    <Timer className="h-3 w-3" />
                  )}
                  {scheduleLabel(task)}
                </span>
                <span>·</span>
                <span>
                  {agent?.emoji ? `${agent.emoji} ` : ""}{agent?.name || task.agent_id}
                </span>
                <span>·</span>
                <span>{laneDef?.label || task.status}</span>
              </div>
            </div>
            <Switch
              checked={task.enabled}
              onCheckedChange={() => onToggle(task)}
              className="scale-75"
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem onClick={() => onExecute(task)}>
                  <Zap className="h-3.5 w-3.5 mr-2" /> Run Now
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onEdit(task)}>
                  <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {LANES.filter((l) => l.status !== task.status).map((l) => (
                  <DropdownMenuItem key={l.status} onClick={() => onMove(task, l.status)}>
                    <ArrowRight className="h-3.5 w-3.5 mr-2" /> Move to {l.label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => onDelete(task)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      })}
    </div>
  );
}

/* ── Run result helpers ───────────────────────────────────────────── */

const RUN_RESULT_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  running: { icon: Loader2, color: "text-blue-500", bg: "bg-blue-500/10", label: "Running" },
  success: { icon: CheckCircle2, color: "text-green-500", bg: "bg-green-500/10", label: "Success" },
  failed: { icon: XCircle, color: "text-red-500", bg: "bg-red-500/10", label: "Failed" },
  skipped: { icon: SkipForward, color: "text-slate-500", bg: "bg-slate-500/10", label: "Skipped" },
  timeout: { icon: AlertTriangle, color: "text-amber-500", bg: "bg-amber-500/10", label: "Timeout" },
};

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return "—";
  if (seconds < 1) return `${Math.round(seconds * 1000)}ms`;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/* ── Run Row (expandable) ────────────────────────────────────────── */

function RunRow({ run, agents }: { run: TaskRun; agents: OpenClawAgent[] }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = RUN_RESULT_CONFIG[run.result] || RUN_RESULT_CONFIG.running;
  const Icon = cfg.icon;
  const agent = agents.find((a) => a.id === run.agent_id);

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-accent/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <Icon className={cn("h-4 w-4 shrink-0", cfg.color, run.result === "running" && "animate-spin")} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{cfg.label}</span>
            <span className="text-xs text-muted-foreground">#{run.id}</span>
            <span className="text-xs text-muted-foreground">{run.trigger}</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
            <span>{formatTime(run.started_at)}</span>
            {run.duration_s !== null && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDuration(run.duration_s)}
              </span>
            )}
            {run.tokens_used !== null && run.tokens_used > 0 && (
              <span className="flex items-center gap-1">
                <Cpu className="h-3 w-3" />
                {run.tokens_used.toLocaleString()} tokens
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {agent && (
            <span className="text-xs text-muted-foreground">
              {agent.emoji || ""} {agent.name}
            </span>
          )}
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t bg-muted/20 p-3 space-y-3">
          {run.summary && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Summary</p>
              <p className="text-sm">{run.summary}</p>
            </div>
          )}
          {run.output && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Output</p>
              <pre className="text-xs bg-background rounded-md border p-2 overflow-x-auto whitespace-pre-wrap max-h-48">
                {run.output}
              </pre>
            </div>
          )}
          {run.error && (
            <div>
              <p className="text-xs font-medium mb-1 text-red-500">Error</p>
              <pre className="text-xs bg-red-500/5 border border-red-500/20 rounded-md p-2 overflow-x-auto whitespace-pre-wrap max-h-48 text-red-600 dark:text-red-400">
                {run.error}
              </pre>
            </div>
          )}
          <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            {run.session_key && (
              <span className="flex items-center gap-1">
                <Hash className="h-3 w-3" /> Session: {run.session_key}
              </span>
            )}
            {run.finished_at && (
              <span>Finished: {formatTime(run.finished_at)}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Task Detail Dialog ───────────────────────────────────────────── */

function TaskDetailDialog({
  task,
  agents,
  open,
  onClose,
  onEdit,
  onExecute,
}: {
  task: Task | null;
  agents: OpenClawAgent[];
  open: boolean;
  onClose: () => void;
  onEdit: (t: Task) => void;
  onExecute: (t: Task) => void;
}) {
  const { data: detail, isLoading, mutate: mutateDetail } = useSWR<TaskDetail>(
    open && task ? `/api/tasks/${task.id}/detail` : null,
    fetcher,
    { refreshInterval: 15000 }
  );

  const agent = agents.find((a) => a.id === task?.agent_id);
  const laneDef = LANES.find((l) => l.status === task?.status);

  const successRate =
    detail && detail.total_runs > 0
      ? Math.round((detail.success_count / detail.total_runs) * 100)
      : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] p-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-lg">{task?.name || "Task Detail"}</DialogTitle>
              <DialogDescription className="text-sm mt-1">
                {task?.description || "Task configuration and execution history"}
              </DialogDescription>
            </div>
            {task && (
              <div className="flex gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onExecute(task);
                    // Refresh detail data after a delay to show the new run
                    setTimeout(() => mutateDetail(), 2000);
                  }}
                >
                  <Zap className="h-3.5 w-3.5 mr-1.5" />
                  Run Now
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onClose();
                    // Small delay to let dialog close before opening edit
                    setTimeout(() => onEdit(task), 150);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  Edit
                </Button>
              </div>
            )}
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6 overflow-y-auto">
          {!task ? null : isLoading ? (
            <div className="space-y-4 py-4">
              <Skeleton className="h-20 rounded-lg" />
              <Skeleton className="h-32 rounded-lg" />
              <Skeleton className="h-24 rounded-lg" />
            </div>
          ) : (
            <div className="space-y-5 py-4 pb-8">
              {/* Quick stats */}
              {detail && detail.total_runs > 0 && (
                <div className="flex items-center gap-4 text-sm">
                  <span>{detail.total_runs} run{detail.total_runs !== 1 ? "s" : ""}</span>
                  <span className="text-green-600 dark:text-green-400">{detail.success_count} passed</span>
                  {detail.fail_count > 0 && (
                    <span className="text-red-500">{detail.fail_count} failed</span>
                  )}
                  {successRate !== null && (
                    <span className="text-muted-foreground">{successRate}%</span>
                  )}
                </div>
              )}

              {/* Last run */}
              {detail?.last_run && (
                <div className="rounded-md border p-3">
                  <div className="flex items-center gap-2">
                    {(() => {
                      const cfg = RUN_RESULT_CONFIG[detail.last_run.result] || RUN_RESULT_CONFIG.running;
                      const LRIcon = cfg.icon;
                      return (
                        <>
                          <LRIcon className={cn("h-4 w-4", cfg.color, detail.last_run.result === "running" && "animate-spin")} />
                          <span className="text-sm font-medium">{cfg.label}</span>
                        </>
                      );
                    })()}
                    <span className="text-xs text-muted-foreground ml-auto">
                      {relativeTime(detail.last_run.started_at)}
                    </span>
                  </div>
                  {detail.last_run.summary && (
                    <p className="text-xs text-muted-foreground mt-1.5">{detail.last_run.summary}</p>
                  )}
                </div>
              )}

              <Separator />

              {/* Task configuration */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-3">
                  Configuration
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div>
                    <p className="text-[11px] text-muted-foreground">Status</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={cn("h-2 w-2 rounded-full", laneDef?.dot || "bg-slate-400")} />
                      <span className="font-medium">{laneDef?.label || task.status}</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">Enabled</p>
                    <p className="font-medium mt-0.5">{task.enabled ? "Yes" : "No"}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">Schedule</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {task.schedule_type === "cron" ? (
                        <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <Timer className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      <span className="font-medium font-mono text-xs">{scheduleLabel(task)}</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">Agent</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium">
                        {agent?.emoji ? `${agent.emoji} ` : ""}{agent?.name || task.agent_id}
                      </span>
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">Session Mode</p>
                    <p className="font-medium mt-0.5 capitalize">{task.session_mode}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">Timezone</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium">{task.timezone}</span>
                    </div>
                  </div>
                  {task.model_override && (
                    <div className="col-span-2">
                      <p className="text-[11px] text-muted-foreground">Model Override</p>
                      <p className="font-medium font-mono text-xs mt-0.5">{task.model_override}</p>
                    </div>
                  )}
                  <div className="col-span-2 flex gap-3">
                    {task.announce && (
                      <Badge variant="secondary" className="text-[10px] gap-1 px-1.5 py-0">
                        <Megaphone className="h-3 w-3" /> Announce
                      </Badge>
                    )}
                    {task.delete_after_run && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        One-shot
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Prompt */}
              {task.message && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      Prompt
                    </p>
                    <div className="rounded-md bg-muted/50 border p-3 text-sm whitespace-pre-wrap">
                      {task.message}
                    </div>
                  </div>
                </>
              )}

              <Separator />

              {/* Run history */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    Run History
                  </p>
                  {detail && detail.total_runs > 0 && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {detail.runs.length} of {detail.total_runs}
                    </Badge>
                  )}
                </div>

                {!detail?.runs.length ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">
                    No runs yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {detail.runs.map((run) => (
                      <RunRow key={run.id} run={run} agents={agents} />
                    ))}
                  </div>
                )}
              </div>

              {/* Metadata */}
              <Separator />
              <div className="text-[11px] text-muted-foreground space-y-1">
                <p>ID: <span className="font-mono">{task.id}</span></p>
                <p>Created: {formatTime(task.created_at)}</p>
                <p>Updated: {formatTime(task.updated_at)}</p>
                {task.template_id && <p>Template: <span className="font-mono">{task.template_id}</span></p>}
              </div>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

/* ── Page ─────────────────────────────────────────────────────────── */

export default function TasksPage() {
  const { data: tasks, mutate } = useSWR<Task[]>("/api/tasks/", fetcher, {
    refreshInterval: 10000,
  });
  const { data: agentsData } = useSWR<OpenClawAgentsList>("/api/connection/agents", fetcher);

  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const agentList = agentsData?.agents || [];
  const defaultAgentId =
    agentList.find((a) => a.is_default)?.id ||
    agentList.find((a) => a.id === "main")?.id ||
    agentList[0]?.id ||
    "main";

  // Open create dialog pre-filled from template
  const openFromTemplate = useCallback(
    (tmpl: TaskTemplate) => {
      const pseudo: Task = {
        id: tmpl.id,
        name: tmpl.name,
        description: tmpl.description,
        schedule_type: tmpl.schedule_type,
        cron_expression: tmpl.cron_expression,
        heartbeat_interval: tmpl.heartbeat_interval,
        timezone: "UTC",
        session_mode: tmpl.session_mode,
        message: tmpl.message,
        agent_id: defaultAgentId,
        status: "active",
        enabled: true,
        model_override: null,
        announce: tmpl.announce,
        template_id: tmpl.id,
        active_hours: null,
        delete_after_run: false,
        created_at: "",
        updated_at: "",
      };
      setEditingTask(pseudo);
      setFormOpen(true);
    },
    [defaultAgentId]
  );

  const handleSave = useCallback(
    async (data: TaskCreate | TaskUpdate, isEdit: boolean) => {
      try {
        if (isEdit && editingTask) {
          // Check if this is a "pseudo" task from template (no created_at)
          if (!editingTask.created_at) {
            // Actually create – use data.id (form) with fallback to editingTask.id
            const createData: TaskCreate = {
              id: (data as any).id || editingTask.id,
              ...(data as TaskUpdate),
              name: (data as TaskUpdate).name || editingTask.name,
            };
            await taskApi.create(createData);
            toast.success(`Task "${createData.name}" created`);
          } else {
            await taskApi.update(editingTask.id, data as TaskUpdate);
            toast.success(`Task "${editingTask.name}" updated`);
          }
        } else {
          await taskApi.create(data as TaskCreate);
          toast.success(`Task "${(data as TaskCreate).name}" created`);
        }
        mutate();
        setFormOpen(false);
        setEditingTask(null);
      } catch (e) {
        toast.error(String(e));
      }
    },
    [editingTask, mutate]
  );

  const handleDelete = useCallback(
    async (task: Task) => {
      try {
        await taskApi.delete(task.id);
        toast.success(`Deleted "${task.name}"`);
        mutate();
        setDeleteTarget(null);
      } catch (e) {
        toast.error(String(e));
      }
    },
    [mutate]
  );

  const handleToggle = useCallback(
    async (task: Task) => {
      try {
        await taskApi.update(task.id, { enabled: !task.enabled });
        mutate();
      } catch (e) {
        toast.error(String(e));
      }
    },
    [mutate]
  );

  const handleMove = useCallback(
    async (task: Task, status: TaskStatus) => {
      try {
        await taskApi.update(task.id, { status });
        mutate();
      } catch (e) {
        toast.error(String(e));
      }
    },
    [mutate]
  );

  const handleExecute = useCallback(
    async (task: Task) => {
      try {
        toast.info(`Running "${task.name}"…`);
        await taskApi.execute(task.id);
        toast.success(`Task "${task.name}" executed`);
        mutate();
      } catch (e) {
        toast.error(`Execute failed: ${String(e)}`);
      }
    },
    [mutate]
  );

  const openEdit = useCallback((task: Task) => {
    setEditingTask(task);
    setFormOpen(true);
  }, []);

  // Stats
  const totalCount = tasks?.length ?? 0;
  const enabledCount = tasks?.filter((t) => t.enabled).length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tasks"
        description={
          tasks
            ? `${totalCount} task${totalCount !== 1 ? "s" : ""}, ${enabledCount} enabled`
            : "Manage scheduled tasks"
        }
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setTemplatesOpen(true)}>
              <Zap className="h-4 w-4 mr-1.5" />
              Templates
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setEditingTask(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              New Task
            </Button>
          </div>
        }
      />

      {/* Main content - Board or List view */}
      <Tabs defaultValue="board" className="space-y-4">
        <TabsList>
          <TabsTrigger value="board">Board</TabsTrigger>
          <TabsTrigger value="list">List</TabsTrigger>
        </TabsList>

        <TabsContent value="board">
          {!tasks ? (
            <div className="flex gap-4 overflow-x-auto pb-4">
              {LANES.map((l) => (
                <div key={l.status} className="min-w-[280px] flex-1 space-y-2">
                  <Skeleton className="h-6 w-20" />
                  <Skeleton className="h-32 rounded-lg" />
                  <Skeleton className="h-32 rounded-lg" />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-4">
              {LANES.map((lane) => (
                <SwimLane
                  key={lane.status}
                  lane={lane}
                  tasks={tasks.filter((t) => t.status === lane.status)}
                  agents={agentList}
                  onEdit={openEdit}
                  onDelete={(t) => { setSelectedTask(null); setDeleteTarget(t); }}
                  onToggle={handleToggle}
                  onMove={handleMove}
                  onSelect={setSelectedTask}
                  onExecute={handleExecute}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="list">
          {!tasks ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          ) : (
            <ListView
              tasks={tasks}
              agents={agentList}
              onEdit={openEdit}
              onDelete={(t) => { setSelectedTask(null); setDeleteTarget(t); }}
              onToggle={handleToggle}
              onMove={handleMove}
              onSelect={setSelectedTask}
              onExecute={handleExecute}
            />
          )}
        </TabsContent>
      </Tabs>

      {/* Create/Edit dialog */}
      <TaskFormDialog
        open={formOpen}
        editingTask={editingTask}
        agents={agentList}
        defaultAgentId={defaultAgentId}
        onClose={() => {
          setFormOpen(false);
          setEditingTask(null);
        }}
        onSave={handleSave}
      />

      {/* Templates browser */}
      <TemplatesBrowser
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        onSelect={openFromTemplate}
      />

      {/* Task detail dialog */}
      <TaskDetailDialog
        task={selectedTask}
        agents={agentList}
        open={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        onEdit={openEdit}
        onExecute={handleExecute}
      />

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Task</DialogTitle>
            <DialogDescription>
              Permanently delete &ldquo;{deleteTarget?.name}&rdquo;? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
