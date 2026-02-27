"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import useSWR from "swr";
import {
  fetcher,
  lifecycleApi,
  type AgentDetail,
  type AgentFile,
  type SessionEntry,
  type OpenClawAgentsList,
  type ActionResult,
  type WorkspaceSkill,
  type WorkspaceSkillsList,
} from "@/lib/api";
import { agentApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { CodeEditor } from "@/components/code-editor";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Bot,
  FileText,
  Puzzle,
  MessageSquare,
  Save,
  RotateCcw,
  Trash2,
  Star,
  CheckCircle2,
  Loader2,
  Brain,
  Heart,
  Users,
  User,
  Clock,
  Wrench,
  Plus,
  Pencil,
  Eye,
  PencilLine,
  Link2,
  Unlink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useConfirm } from "@/hooks/use-confirm";
import { AgentEmoji } from "@/components/agent-emoji";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// ── File metadata for display ──────────────────────────────────────

const FILE_META: Record<string, { label: string; icon: typeof FileText; desc: string }> = {
  "IDENTITY.md": { label: "Identity", icon: Bot, desc: "Agent name, emoji, and avatar" },
  "SOUL.md": { label: "Soul", icon: Heart, desc: "Personality and core instructions" },
  "TOOLS.md": { label: "Tools", icon: Wrench, desc: "Tool usage instructions" },
  "AGENTS.md": { label: "Agents", icon: Users, desc: "Multi-agent configuration" },
  "USER.md": { label: "User", icon: User, desc: "User profile information" },
  "HEARTBEAT.md": { label: "Heartbeat", icon: Clock, desc: "Scheduled tasks & cron" },
  "MEMORY.md": { label: "Memory", icon: Brain, desc: "Agent memory & context" },
};

// ── Main component ─────────────────────────────────────────────────

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.id as string;

  const { data: detail, mutate: mutateDetail } = useSWR<AgentDetail>(
    agentId ? `/api/openclaw/agents/${agentId}/detail` : null,
    fetcher
  );

  const { data: wsSkillsData, mutate: mutateWsSkills } = useSWR<WorkspaceSkillsList>(
    agentId ? `/api/openclaw/agents/${agentId}/workspace-skills` : null,
    (url: string) => lifecycleApi.workspaceSkills(agentId)
  );

  const { data: allAgentsData } = useSWR<OpenClawAgentsList>(
    "/api/openclaw/agents",
    fetcher
  );

  const [tab, setTab] = useState("overview");

  if (!detail) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push("/agents")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        {detail.emoji && <AgentEmoji emoji={detail.emoji} className="text-3xl" iconClassName="h-8 w-8" />}
        <div>
          <h1 className="text-2xl font-bold">{detail.name}</h1>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono">{detail.id}</span>
            {detail.is_default && (
              <Badge className="text-[10px]">
                <Star className="mr-0.5 h-2.5 w-2.5" /> default
              </Badge>
            )}
            {detail.model && (
              <Badge variant="outline" className="text-[10px] font-mono">
                {detail.model}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">
            <Bot className="mr-1.5 h-3.5 w-3.5" /> Overview
          </TabsTrigger>
          <TabsTrigger value="files">
            <FileText className="mr-1.5 h-3.5 w-3.5" /> Files
          </TabsTrigger>
          <TabsTrigger value="skills">
            <Puzzle className="mr-1.5 h-3.5 w-3.5" /> Skills
          </TabsTrigger>
          <TabsTrigger value="sessions">
            <MessageSquare className="mr-1.5 h-3.5 w-3.5" /> Sessions
            {detail.sessions.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-[10px]">
                {detail.sessions.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab
            detail={detail}
            allAgents={allAgentsData?.agents ?? []}
            wsSkills={wsSkillsData?.workspace_skills ?? []}
            onUpdate={() => mutateDetail()}
          />
        </TabsContent>
        <TabsContent value="files">
          <FilesTab agentId={agentId} files={detail.files} onUpdate={() => mutateDetail()} />
        </TabsContent>
        <TabsContent value="skills">
          <SkillsTab
            agentId={agentId}
            wsSkills={wsSkillsData ?? { workspace_skills: [], project_skills: [], managed_skills: [] }}
            onWsMutate={() => mutateWsSkills()}
          />
        </TabsContent>
        <TabsContent value="sessions">
          <SessionsTab sessions={detail.sessions} onUpdate={() => mutateDetail()} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Overview Tab ───────────────────────────────────────────────────

function OverviewTab({
  detail,
  allAgents,
  wsSkills,
  onUpdate,
}: {
  detail: AgentDetail;
  allAgents: { id: string; name: string; emoji: string }[];
  wsSkills: WorkspaceSkill[];
  onUpdate: () => void;
}) {
  const [name, setName] = useState(detail.name);
  const [model, setModel] = useState(detail.model ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setName(detail.name);
    setModel(detail.model ?? "");
  }, [detail]);

  async function handleSave() {
    setSaving(true);
    setMsg("");
    try {
      const payload: Record<string, string> = {};
      if (name !== detail.name) payload.name = name;
      if (model !== (detail.model ?? "")) payload.model = model;
      if (Object.keys(payload).length === 0) {
        setMsg("No changes");
        return;
      }
      const res = await lifecycleApi.updateAgent(detail.id, payload);
      setMsg(res.success ? "Saved" : res.message);
      if (res.success) onUpdate();
    } catch (e) {
      setMsg(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-1.5">
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Model</Label>
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="openai/gpt-4o"
              className="font-mono text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />}
              Save
            </Button>
            {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Workspace</span>
            <button
              onClick={() => agentApi.openFolder(detail.id)}
              className="font-mono text-xs truncate max-w-[300px] text-blue-500 hover:underline cursor-pointer text-right"
              title={`Open ${detail.workspace}`}
            >
              {detail.workspace}
            </button>
          </div>
          <Separator />
          <div className="flex justify-between">
            <span className="text-muted-foreground">Source</span>
            <Badge variant="outline" className="text-[10px]">{detail.source ?? "openclaw"}</Badge>
          </div>
          <Separator />
          <div className="flex justify-between">
            <span className="text-muted-foreground">Files</span>
            <span>{detail.files.length}</span>
          </div>
          <Separator />
          <div className="flex justify-between">
            <span className="text-muted-foreground">Sessions</span>
            <span>{detail.sessions.length}</span>
          </div>
          <Separator />
          <div className="flex justify-between">
            <span className="text-muted-foreground">Skills</span>
            <div className="flex flex-wrap gap-1 justify-end max-w-[280px]">
              {wsSkills.length > 0
                ? wsSkills.map((s) => {
                    const emoji = (s.metadata as Record<string, unknown>)?.["openclaw.emoji"] as string;
                    return (
                      <Badge key={s.slug} variant="secondary" className="text-[10px]">
                        {emoji ? `${emoji} ` : ""}{s.name}
                      </Badge>
                    );
                  })
                : <span className="text-muted-foreground text-xs">none</span>
              }
            </div>
          </div>
        </CardContent>
      </Card>

      <LinkedAgentsCard agentId={detail.id} allAgents={allAgents} />
    </div>
  );
}

// ── Linked Agents Card ─────────────────────────────────────────────

function LinkedAgentsCard({
  agentId,
  allAgents,
}: {
  agentId: string;
  allAgents: { id: string; name: string; emoji: string }[];
}) {
  const otherAgents = allAgents.filter((a) => a.id !== agentId);
  const [linked, setLinked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Load current AGENTS.md to determine which agents are linked
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const file = await lifecycleApi.agentFile(agentId, "AGENTS.md");
        const content = file.content ?? "";
        const ids = new Set<string>();
        for (const a of otherAgents) {
          if (content.includes(`@${a.id}`) || content.includes(`agent_id: ${a.id}`)) {
            ids.add(a.id);
          }
        }
        if (!cancelled) {
          setLinked(ids);
          setLoaded(true);
        }
      } catch {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [agentId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleAgent(id: string) {
    const next = new Set(linked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setLinked(next);

    // Generate AGENTS.md and update gateway config
    setSaving(true);
    try {
      const linkedAgents = otherAgents.filter((a) => next.has(a.id));
      const linkedIds = linkedAgents.map((a) => a.id);
      const md = generateAgentsMd(linkedAgents);
      await Promise.all([
        lifecycleApi.setAgentFile(agentId, "AGENTS.md", md),
        lifecycleApi.updateLinkedAgents(agentId, linkedIds),
      ]);
    } catch (e) {
      console.error(e);
      // Revert
      const revert = new Set(linked);
      if (revert.has(id)) revert.delete(id);
      else revert.add(id);
      setLinked(revert);
    } finally {
      setSaving(false);
    }
  }

  if (otherAgents.length === 0) return null;

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle className="text-sm">Linked Agents</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-3">
          Toggle agents this agent can delegate tasks to. This updates AGENTS.md in the workspace.
        </p>
        <div className="space-y-2">
          {otherAgents.map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded-md border px-3 py-2">
              <div className="flex items-center gap-2">
                {a.emoji && <AgentEmoji emoji={a.emoji} className="text-lg" iconClassName="h-5 w-5" />}
                <div>
                  <span className="text-sm font-medium">{a.name || a.id}</span>
                  <span className="ml-2 text-xs text-muted-foreground font-mono">{a.id}</span>
                </div>
              </div>
              <Switch
                checked={linked.has(a.id)}
                onCheckedChange={() => toggleAgent(a.id)}
                disabled={!loaded || saving}
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function generateAgentsMd(agents: { id: string; name: string; emoji: string }[]): string {
  let md = `# AGENTS.md — Your Workspace\n\n`;
  md += `## Every Session\n\n`;
  md += `Before doing anything else:\n\n`;
  md += `1. Read \`SOUL.md\` — this is who you are.\n`;
  md += `2. Read \`USER.md\` — this is who you're helping.\n`;
  md += `3. Read \`memory/\` files (today + yesterday) for recent context.\n`;
  md += `4. If \`MEMORY.md\` exists, read it for long-term context.\n\n`;
  md += `Don't ask permission. Just do it.\n\n`;
  md += `## Memory\n\n`;
  md += `You wake up fresh each session. These files ARE your continuity:\n\n`;
  md += `- **Daily notes:** \`memory/YYYY-MM-DD.md\` — raw logs of what happened.\n`;
  md += `- **Long-term:** \`MEMORY.md\` — your curated memories.\n\n`;
  md += `### 📝 Write It Down — No "Mental Notes"!\n\n`;
  md += `- **Memory is limited** — if you want to remember something, WRITE IT TO A FILE.\n`;
  md += `- When someone tells you their name → update \`USER.md\` immediately.\n`;
  md += `- When someone says "remember this" → update \`memory/YYYY-MM-DD.md\`.\n`;
  md += `- When you learn a personal preference → update \`USER.md\`.\n`;
  md += `- **Text > Brain** 📝\n\n`;

  if (agents.length === 0) {
    md += `## Linked Agents\n\nNo linked agents. This agent operates independently.\n`;
  } else {
    md += `## Linked Agents\n\nThis agent can delegate tasks to the following agents:\n\n`;
    for (const a of agents) {
      const label = a.emoji ? `${a.emoji} ${a.name}` : a.name;
      md += `### ${label}\n`;
      md += `- agent_id: ${a.id}\n`;
      md += `- Use @${a.id} to delegate tasks to this agent\n\n`;
    }
    md += `### Delegation Guidelines\n\n`;
    md += `- Delegate specialised tasks to the appropriate agent\n`;
    md += `- Provide clear context when delegating\n`;
    md += `- Review delegated work before presenting to the user\n`;
  }
  return md;
}

// ── Files Tab ──────────────────────────────────────────────────────

function FilesTab({
  agentId,
  files,
  onUpdate,
}: {
  agentId: string;
  files: AgentFile[];
  onUpdate: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [preview, setPreview] = useState(false);

  const loadFile = useCallback(
    async (name: string) => {
      setSelected(name);
      setLoading(true);
      setMsg("");
      try {
        const f = await lifecycleApi.agentFile(agentId, name);
        setContent(f.content ?? "");
      } catch (e) {
        setContent("");
        setMsg(String(e));
      } finally {
        setLoading(false);
      }
    },
    [agentId]
  );

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    setMsg("");
    try {
      const res = await lifecycleApi.setAgentFile(agentId, selected, content);
      setMsg(res.success ? "Saved" : res.message);
      if (res.success) onUpdate();
    } catch (e) {
      setMsg(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-3 md:grid-cols-[220px_1fr]">
      {/* File list */}
      <Card className="h-fit">
        <CardContent className="p-2">
          <div className="space-y-0.5">
            {files.map((f) => {
              const meta = FILE_META[f.name];
              const Icon = meta?.icon ?? FileText;
              return (
                <button
                  key={f.name}
                  onClick={() => loadFile(f.name)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                    selected === f.name
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-muted"
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-xs">
                      {meta?.label ?? f.name}
                    </p>
                    {f.missing && (
                      <p className="text-[10px] text-muted-foreground">missing</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Editor */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="text-sm">
              {selected ? (FILE_META[selected]?.label ?? selected) : "Select a file"}
            </CardTitle>
            {selected && FILE_META[selected] && (
              <p className="text-xs text-muted-foreground">{FILE_META[selected].desc}</p>
            )}
          </div>
          {selected && (
            <div className="flex items-center gap-2">
              {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
              <div className="flex items-center rounded-md border bg-muted p-0.5">
                <button
                  onClick={() => setPreview(false)}
                  className={cn(
                    "rounded px-2 py-0.5 text-xs font-medium transition-colors",
                    !preview
                      ? "bg-background shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <PencilLine className="mr-1 inline h-3 w-3" />
                  Edit
                </button>
                <button
                  onClick={() => setPreview(true)}
                  className={cn(
                    "rounded px-2 py-0.5 text-xs font-medium transition-colors",
                    preview
                      ? "bg-background shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Eye className="mr-1 inline h-3 w-3" />
                  Preview
                </button>
              </div>
              <Button size="sm" onClick={handleSave} disabled={saving || !selected}>
                {saving ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Save className="mr-1 h-3 w-3" />
                )}
                Save
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : selected ? (
            preview ? (
              <ScrollArea className="h-[400px] rounded border bg-muted/30 p-4">
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {content || "*Empty file*"}
                  </ReactMarkdown>
                </div>
              </ScrollArea>
            ) : (
              <CodeEditor
                value={content}
                onChange={setContent}
                language="markdown"
                placeholder="File is empty…"
                minHeight="400px"
              />
            )
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <FileText className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">Select a file to view and edit</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Skills Tab ─────────────────────────────────────────────────────

function SkillsTab({
  agentId,
  wsSkills,
  onWsMutate,
}: {
  agentId: string;
  wsSkills: WorkspaceSkillsList;
  onWsMutate: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [ConfirmDialog, confirm] = useConfirm();

  // Create dialog
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newInstructions, setNewInstructions] = useState("");

  // Edit dialog
  const [editSkill, setEditSkill] = useState<WorkspaceSkill | null>(null);
  const [editContent, setEditContent] = useState("");



  // All skills in this agent's workspace
  const agentSkills = wsSkills.workspace_skills;

  // Project skills not yet linked to this agent (available to add)
  const availableShared = wsSkills.project_skills.filter(
    (ps) => !agentSkills.some((ws) => ws.slug === ps.slug)
  );

  // ── Actions ──
  async function handleCreateSkill() {
    if (!newName.trim()) return;
    setBusy("create");
    try {
      await lifecycleApi.createWorkspaceSkill(agentId, {
        name: newName.trim(),
        description: newDesc.trim() || undefined,
        instructions: newInstructions.trim() || undefined,
      });
      onWsMutate();
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
      setNewInstructions("");
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(null);
    }
  }

  async function handleSaveEdit() {
    if (!editSkill) return;
    setBusy(editSkill.slug);
    try {
      await lifecycleApi.updateWorkspaceSkill(agentId, editSkill.slug, editContent);
      onWsMutate();
      setEditSkill(null);
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(null);
    }
  }

  async function handleDeleteWsSkill(slug: string) {
    const ok = await confirm({
      title: "Delete this skill?",
      description: "The SKILL.md file will be permanently removed from the agent workspace.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    setBusy(slug);
    try {
      await lifecycleApi.deleteWorkspaceSkill(agentId, slug);
      toast.success("Skill deleted");
      onWsMutate();
    } catch (e) {
      console.error(e);
      toast.error("Failed to delete skill");
    } finally {
      setBusy(null);
    }
  }

  async function handleAddShared(slug: string) {
    setBusy(`deploy-${slug}`);
    try {
      await lifecycleApi.deployProjectSkill(agentId, slug);
      toast.success(`Skill "${slug}" added`);
      onWsMutate();
    } catch (e) {
      console.error(e);
      toast.error("Failed to add skill");
    } finally {
      setBusy(null);
    }
  }

  async function handleRemoveShared(slug: string) {
    setBusy(`unlink-${slug}`);
    try {
      await lifecycleApi.unlinkProjectSkill(agentId, slug);
      toast.success(`Skill "${slug}" removed`);
      onWsMutate();
    } catch (e) {
      console.error(e);
      toast.error("Failed to remove skill");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Puzzle className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Agent Skills</h3>
          <Badge variant="secondary" className="text-[10px]">{agentSkills.length}</Badge>
        </div>
        <Button size="sm" className="h-7 text-xs" onClick={() => setShowCreate(true)}>
          <Plus className="mr-1 h-3 w-3" /> New Skill
        </Button>
      </div>

      {/* Skills list */}
      {agentSkills.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {agentSkills.map((skill) => {
            const isLinked = skill.is_symlink;
            const isBusy = busy === skill.slug || busy === `unlink-${skill.slug}`;
            return (
              <Card key={skill.slug}>
                <CardContent className="flex items-start gap-3 py-3 px-4">
                  <span className="text-xl leading-none mt-0.5">
                    {(skill.metadata as Record<string, unknown>)?.["openclaw.emoji"] as string || "📄"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{skill.name}</span>
                      <Badge variant={isLinked ? "secondary" : "outline"} className="text-[10px]">
                        {isLinked ? "shared" : "custom"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                      {skill.description || "No description"}
                    </p>
                    <div className="flex gap-1 mt-1.5">
                      {!isLinked && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 text-[10px]"
                            onClick={() => { setEditSkill(skill); setEditContent(skill.content); }}
                          >
                            <Pencil className="mr-1 h-2.5 w-2.5" /> Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 text-[10px] text-destructive hover:text-destructive"
                            onClick={() => handleDeleteWsSkill(skill.slug)}
                            disabled={isBusy}
                          >
                            {isBusy ? <Loader2 className="mr-1 h-2.5 w-2.5 animate-spin" /> : <Trash2 className="mr-1 h-2.5 w-2.5" />}
                            Delete
                          </Button>
                        </>
                      )}
                      {isLinked && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-[10px] text-destructive hover:text-destructive"
                          onClick={() => handleRemoveShared(skill.slug)}
                          disabled={isBusy}
                        >
                          {isBusy ? <Loader2 className="mr-1 h-2.5 w-2.5 animate-spin" /> : <Unlink className="mr-1 h-2.5 w-2.5" />}
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-1.5 py-8">
            <Puzzle className="h-7 w-7 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">No skills for this agent</p>
            <p className="text-[11px] text-muted-foreground/60">Create a custom skill or add a shared one below</p>
          </CardContent>
        </Card>
      )}

      {/* ── Available shared skills (inline) ── */}
      {availableShared.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
            <h4 className="text-xs font-semibold text-muted-foreground uppercase">Available Shared Skills</h4>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {availableShared.map((s) => (
              <Card key={s.slug} className="border-dashed">
                <CardContent className="flex items-center gap-3 py-2.5 px-4">
                  <span className="text-lg leading-none">
                    {(s.metadata as Record<string, unknown>)?.["openclaw.emoji"] as string || "📄"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium truncate block">{s.name}</span>
                    <p className="text-[10px] text-muted-foreground truncate">{s.description || s.slug}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs shrink-0"
                    onClick={() => handleAddShared(s.slug)}
                    disabled={busy === `deploy-${s.slug}`}
                  >
                    {busy === `deploy-${s.slug}` ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <Plus className="mr-1 h-3 w-3" />
                    )}
                    Add
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ── Create skill dialog ── */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Custom Skill</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Name</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="my-custom-skill"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="What this skill does..."
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Instructions (markdown)</Label>
              <div className="mt-1">
                <CodeEditor
                  value={newInstructions}
                  onChange={setNewInstructions}
                  language="markdown"
                  placeholder="# My Skill\n\n## Instructions\n\nDescribe what the agent should do..."
                  minHeight="160px"
                  maxHeight="300px"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreateSkill} disabled={!newName.trim() || busy === "create"}>
              {busy === "create" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Plus className="mr-1 h-3 w-3" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit skill dialog ── */}
      <Dialog open={!!editSkill} onOpenChange={(o) => !o && setEditSkill(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Edit SKILL.md — {editSkill?.name}
            </DialogTitle>
          </DialogHeader>
          <CodeEditor
            value={editContent}
            onChange={setEditContent}
            language="markdown"
            minHeight="400px"
          />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditSkill(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSaveEdit}
              disabled={busy === editSkill?.slug}
            >
              {busy === editSkill?.slug ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Save className="mr-1 h-3 w-3" />
              )}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog />
    </div>
  );
}

// ── Sessions Tab ───────────────────────────────────────────────────

function SessionsTab({
  sessions,
  onUpdate,
}: {
  sessions: SessionEntry[];
  onUpdate: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [ConfirmDialog, confirm] = useConfirm();

  const allSelected = sessions.length > 0 && selected.size === sessions.length;

  function toggleSelect(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(sessions.map((s) => s.key)));
    }
  }

  async function handleReset(key: string) {
    const ok = await confirm({
      title: "Reset this session?",
      description: "All conversation history for this session will be cleared. This cannot be undone.",
      confirmLabel: "Reset",
      destructive: true,
    });
    if (!ok) return;
    setBusy(key);
    try {
      await lifecycleApi.resetSession(key);
      toast.success("Session reset");
      onUpdate();
    } catch (e) {
      console.error(e);
      toast.error("Failed to reset session");
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(key: string) {
    const ok = await confirm({
      title: "Delete this session?",
      description: "This session and all its history will be permanently removed.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    setBusy(key);
    try {
      await lifecycleApi.deleteSession(key);
      toast.success("Session deleted");
      setSelected((prev) => { const n = new Set(prev); n.delete(key); return n; });
      onUpdate();
    } catch (e) {
      console.error(e);
      toast.error("Failed to delete session");
    } finally {
      setBusy(null);
    }
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return;
    const ok = await confirm({
      title: `Delete ${selected.size} session${selected.size > 1 ? "s" : ""}?`,
      description: "All selected sessions and their history will be permanently removed.",
      confirmLabel: `Delete ${selected.size}`,
      destructive: true,
    });
    if (!ok) return;
    setBusy("bulk");
    let succeeded = 0;
    for (const key of selected) {
      try {
        await lifecycleApi.deleteSession(key);
        succeeded++;
      } catch {
        // continue with others
      }
    }
    toast.success(`Deleted ${succeeded} of ${selected.size} sessions`);
    setSelected(new Set());
    setBusy(null);
    onUpdate();
  }

  async function handleBulkReset() {
    if (selected.size === 0) return;
    const ok = await confirm({
      title: `Reset ${selected.size} session${selected.size > 1 ? "s" : ""}?`,
      description: "All conversation history for the selected sessions will be cleared.",
      confirmLabel: `Reset ${selected.size}`,
      destructive: true,
    });
    if (!ok) return;
    setBusy("bulk");
    let succeeded = 0;
    for (const key of selected) {
      try {
        await lifecycleApi.resetSession(key);
        succeeded++;
      } catch {
        // continue with others
      }
    }
    toast.success(`Reset ${succeeded} of ${selected.size} sessions`);
    setSelected(new Set());
    setBusy(null);
    onUpdate();
  }

  if (sessions.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12">
          <MessageSquare className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No sessions</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
    <ConfirmDialog />
    <div className="space-y-3">
      {/* Bulk actions bar */}
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            className="rounded border-muted-foreground/40"
          />
          {selected.size > 0 ? `${selected.size} selected` : "Select all"}
        </label>
        {selected.size > 0 && (
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={handleBulkReset}
              disabled={busy === "bulk"}
            >
              {busy === "bulk" ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <RotateCcw className="mr-1 h-3 w-3" />
              )}
              Reset Selected
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs text-destructive hover:text-destructive"
              onClick={handleBulkDelete}
              disabled={busy === "bulk"}
            >
              {busy === "bulk" ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="mr-1 h-3 w-3" />
              )}
              Delete Selected
            </Button>
          </div>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {sessions.length} session{sessions.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Session list */}
      <div className="space-y-2">
      {sessions.map((s) => {
        const isBusy = busy === s.key || busy === "bulk";
        const isSelected = selected.has(s.key);
        return (
          <Card key={s.key} className={cn(isSelected && "ring-1 ring-primary/40")}>
            <CardContent className="flex items-center gap-3 py-3 px-4">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleSelect(s.key)}
                className="rounded border-muted-foreground/40 shrink-0"
              />
              <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">
                  {s.derived_title || s.display_name || s.session_id}
                </p>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                  {s.model && <span className="font-mono">{s.model}</span>}
                  {s.channel && <span>{s.channel}</span>}
                  {s.total_tokens > 0 && (
                    <span>{s.total_tokens.toLocaleString()} tokens</span>
                  )}
                  {s.updated_at && (
                    <span>{new Date(s.updated_at).toLocaleDateString()}</span>
                  )}
                </div>
                {s.last_message_preview && (
                  <p className="text-xs text-muted-foreground/70 truncate mt-0.5">
                    {s.last_message_preview}
                  </p>
                )}
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => handleReset(s.key)}
                  disabled={isBusy}
                  title="Reset session"
                >
                  {busy === s.key ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3.5 w-3.5" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => handleDelete(s.key)}
                  disabled={isBusy}
                  title="Delete session"
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
      </div>
    </div>
    </>
  );
}
