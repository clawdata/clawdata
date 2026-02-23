/**
 * Bridge to the ClawData TaskTracker.
 *
 * Reads task state from userdata/config/tasks.json and exposes it
 * for the Mission Control dashboard.
 *
 * Manages user-created queue items in userdata/config/queue.json.
 *
 * Owns the agent task lifecycle:
 *   - TASKS.md workspace sync (agents see their tasks in context)
 *   - Dispatch via `openclaw agent --message` (agents get notified)
 *   - Activity log per-task tracking
 */

import * as fs from "fs/promises";
import * as path from "path";
import { execFile } from "child_process";

export interface TaskItem {
  id: string;
  name: string;
  status: "pending" | "running" | "completed" | "failed";
  startTime?: string;
  endTime?: string;
  progress?: number;
  message?: string;
  error?: string;
}

export interface TaskActivity {
  timestamp: string;
  actor: string;        // agent name or "human"
  action: string;       // e.g. "created", "assigned", "dispatched", "started", "completed"
  detail?: string;
}

export interface QueueItem {
  id: string;
  title: string;
  description?: string;
  status: "inbox" | "assigned" | "in_progress" | "review" | "done";
  priority: "low" | "medium" | "high" | "critical";
  source: "user" | "chat";
  assignee?: string;
  riskLevel?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  dispatchedAt?: string;
  completedAt?: string;
  activity?: TaskActivity[];
}

export class TaskBridge {
  private tasksFile: string;
  private queueFile: string;
  private tasks: TaskItem[] = [];
  private queue: QueueItem[] = [];
  private queueCounter = 0;

  constructor(private root: string) {
    this.tasksFile = path.join(root, "userdata", "config", "tasks.json");
    this.queueFile = path.join(root, "userdata", "config", "queue.json");
  }

  /**
   * Reload tasks and queue from disk.
   */
  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.tasksFile, "utf-8");
      this.tasks = JSON.parse(raw);
    } catch {
      this.tasks = [];
    }
    try {
      const raw = await fs.readFile(this.queueFile, "utf-8");
      this.queue = JSON.parse(raw);
      // Restore counter from existing IDs
      for (const q of this.queue) {
        const m = q.id.match(/^q_(\d+)_/);
        if (m) this.queueCounter = Math.max(this.queueCounter, parseInt(m[1], 10));
      }
    } catch {
      this.queue = [];
    }
  }

  /** Persist queue items to disk. */
  private async saveQueue(): Promise<void> {
    const dir = path.dirname(this.queueFile);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.queueFile, JSON.stringify(this.queue, null, 2), "utf-8");
  }

  /**
   * Get all tasks.
   */
  getTasks(): TaskItem[] {
    return this.tasks;
  }

  /**
   * Get all user-created queue items.
   */
  getQueue(): QueueItem[] {
    return this.queue;
  }

  /**
   * Get tasks by status.
   */
  getByStatus(status: string): TaskItem[] {
    return this.tasks.filter((t) => t.status === status);
  }

  /**
   * Get a summary of task counts.
   */
  getSummary(): { total: number; running: number; completed: number; failed: number; pending: number } {
    return {
      total: this.tasks.length,
      running: this.tasks.filter((t) => t.status === "running").length,
      completed: this.tasks.filter((t) => t.status === "completed").length,
      failed: this.tasks.filter((t) => t.status === "failed").length,
      pending: this.tasks.filter((t) => t.status === "pending").length,
    };
  }

  // ── Queue CRUD ─────────────────────────────────────────────────────

  /**
   * Create a new queue item (user-created task).
   */
  async addQueueItem(opts: {
    title: string;
    description?: string;
    priority?: QueueItem["priority"];
    assignee?: string;
    tags?: string[];
    source?: "user" | "chat";
  }): Promise<QueueItem> {
    const now = new Date().toISOString();
    const hasAssignee = !!opts.assignee?.trim();
    const item: QueueItem = {
      id: `q_${++this.queueCounter}_${Date.now()}`,
      title: opts.title,
      description: opts.description || "",
      status: hasAssignee ? "assigned" : "inbox",
      priority: opts.priority || "medium",
      source: opts.source || "user",
      assignee: opts.assignee || undefined,
      tags: opts.tags || [],
      createdAt: now,
      updatedAt: now,
      activity: [{
        timestamp: now,
        actor: "human",
        action: "created",
        detail: hasAssignee ? `Created and assigned to ${opts.assignee}` : "Created in inbox",
      }],
    };
    if (hasAssignee) {
      item.activity!.push({
        timestamp: now,
        actor: "human",
        action: "assigned",
        detail: `Assigned to ${opts.assignee}`,
      });
    }
    this.queue.push(item);
    await this.saveQueue();
    return item;
  }

  /**
   * Assign a queue item to an agent. Moves status to "assigned".
   */
  async assignQueueItem(id: string, assignee: string): Promise<QueueItem | null> {
    const item = this.queue.find((q) => q.id === id);
    if (!item) return null;
    const prevAssignee = item.assignee;
    item.assignee = assignee;
    // When assigned to an agent, auto-move to "assigned" (actioned)
    if (item.status === "inbox") {
      item.status = "assigned";
    }
    item.updatedAt = new Date().toISOString();
    if (!item.activity) item.activity = [];
    item.activity.push({
      timestamp: item.updatedAt,
      actor: "human",
      action: prevAssignee ? "reassigned" : "assigned",
      detail: prevAssignee
        ? `Reassigned from ${prevAssignee} to ${assignee}`
        : `Assigned to ${assignee}`,
    });
    await this.saveQueue();
    return item;
  }

  /**
   * Update a queue item's fields (status, priority, description, etc.).
   */
  async updateQueueItem(id: string, updates: Partial<Pick<QueueItem, "title" | "description" | "status" | "priority" | "assignee" | "tags">>, actor = "human"): Promise<QueueItem | null> {
    const item = this.queue.find((q) => q.id === id);
    if (!item) return null;
    if (updates.title !== undefined) item.title = updates.title;
    if (updates.description !== undefined) item.description = updates.description;
    if (updates.status !== undefined) {
      const prevStatus = item.status;
      item.status = updates.status;
      if (!item.activity) item.activity = [];
      item.activity.push({
        timestamp: new Date().toISOString(),
        actor,
        action: updates.status === "done" ? "completed" : updates.status === "in_progress" ? "started" : updates.status,
        detail: `${prevStatus} → ${updates.status}`,
      });
      if (updates.status === "done") item.completedAt = new Date().toISOString();
    }
    if (updates.priority !== undefined) item.priority = updates.priority;
    if (updates.tags !== undefined) item.tags = updates.tags;
    if (updates.assignee !== undefined) {
      item.assignee = updates.assignee || undefined;
      // Auto-transition: assigning moves inbox → assigned
      if (updates.assignee && item.status === "inbox") {
        item.status = "assigned";
      }
    }
    item.updatedAt = new Date().toISOString();
    await this.saveQueue();
    return item;
  }

  /**
   * Delete a queue item.
   */
  async deleteQueueItem(id: string): Promise<boolean> {
    const idx = this.queue.findIndex((q) => q.id === id);
    if (idx === -1) return false;
    this.queue.splice(idx, 1);
    await this.saveQueue();
    return true;
  }

  /**
   * Clear the activity log for a queue item.
   */
  async clearActivity(id: string): Promise<QueueItem | null> {
    const item = this.queue.find((q) => q.id === id);
    if (!item) return null;
    item.activity = [];
    item.updatedAt = new Date().toISOString();
    await this.saveQueue();
    return item;
  }

  /**
   * Delete all queue items and reset counter.
   * Returns the number of items deleted.
   */
  async clearAllQueueItems(): Promise<number> {
    const count = this.queue.length;
    this.queue = [];
    this.queueCounter = 0;
    await this.saveQueue();
    return count;
  }

  /**
   * Repair tasks assigned to agents that don't exist.
   * Moves them back to inbox and clears broken dispatch data.
   */
  async repairBrokenTasks(validAgentNames: string[]): Promise<number> {
    const lower = validAgentNames.map((n) => n.toLowerCase());
    let fixed = 0;
    for (const item of this.queue) {
      if (!item.assignee) continue;
      if (item.status === "done") continue;
      if (lower.includes(item.assignee.toLowerCase())) continue;
      // Assignee doesn't match any known agent — reset
      const oldAssignee = item.assignee;
      item.assignee = undefined;
      item.status = "inbox";
      item.dispatchedAt = undefined;
      if (!item.activity) item.activity = [];
      item.activity.push({
        timestamp: new Date().toISOString(),
        actor: "system",
        action: "reassigned",
        detail: `Agent "${oldAssignee}" not found — moved back to inbox`,
      });
      item.updatedAt = new Date().toISOString();
      fixed++;
    }
    if (fixed) await this.saveQueue();
    return fixed;
  }

  // ── Agent task getters ─────────────────────────────────────────────

  /**
   * Get all tasks assigned to a specific agent.
   */
  getAgentTasks(agentName: string): QueueItem[] {
    return this.queue.filter(
      (q) => q.assignee === agentName && q.status !== "done"
    );
  }

  /**
   * Get all currently dispatched (in_progress with dispatchedAt) tasks.
   */
  getDispatchedTasks(): QueueItem[] {
    return this.queue.filter(
      (q) => q.status === "in_progress" && q.dispatchedAt
    );
  }

  /**
   * Get queue item by ID.
   */
  getQueueItem(id: string): QueueItem | undefined {
    return this.queue.find((q) => q.id === id);
  }

  // ── TASKS.md sync ──────────────────────────────────────────────────

  /**
   * Generate TASKS.md content for an agent's workspace.
   * This gives the agent standing context about their work.
   */
  generateTasksMd(agentName: string): string {
    const myTasks = this.queue.filter((q) => q.assignee === agentName);
    const open = myTasks.filter((q) => q.status !== "done");
    const recent = myTasks
      .filter((q) => q.status === "done")
      .sort((a, b) => (b.completedAt || b.updatedAt).localeCompare(a.completedAt || a.updatedAt))
      .slice(0, 5);

    const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    open.sort((a, b) => (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2));

    let md = `# TASKS.md — ${agentName}\n\n`;
    md += `_Last synced: ${new Date().toISOString()}_\n\n`;
    md += `You are responsible for the tasks listed below. Work through them in priority order.\n\n`;
    md += `## How to Work Tasks\n\n`;
    md += `1. **Review** — Read the task title and description. Understand what's needed.\n`;
    md += `2. **Work** — Use your tools to accomplish the task. Search, code, analyze.\n`;
    md += `3. **Report** — Summarize what you did and any findings.\n`;
    md += `4. **Complete** — When finished, your work is done. The system tracks progress.\n\n`;

    if (open.length === 0) {
      md += `## Open Tasks\n\n_No open tasks assigned to you._\n\n`;
    } else {
      md += `## Open Tasks (${open.length})\n\n`;
      for (const t of open) {
        const pri = t.priority === "critical" ? "🔴" : t.priority === "high" ? "🟠" : t.priority === "medium" ? "🟡" : "🟢";
        const status = t.status === "in_progress" ? "⏳ In Progress" : t.status === "review" ? "👀 Review" : "📋 Assigned";
        md += `### ${pri} ${t.title}\n`;
        md += `- **ID:** ${t.id}\n`;
        md += `- **Status:** ${status}\n`;
        md += `- **Priority:** ${t.priority}\n`;
        if (t.description) md += `- **Details:** ${t.description}\n`;
        if (t.tags?.length) md += `- **Tags:** ${t.tags.join(", ")}\n`;
        md += `\n`;
      }
    }

    if (recent.length) {
      md += `## Recently Completed\n\n`;
      for (const t of recent) {
        md += `- ~~${t.title}~~ — completed ${t.completedAt || t.updatedAt}\n`;
      }
      md += `\n`;
    }

    return md;
  }

  /**
   * Write TASKS.md to an agent's workspace directory.
   */
  async syncAgentTasksMd(agentName: string): Promise<void> {
    const content = this.generateTasksMd(agentName);
    const workspace = path.join(this.root, "userdata", "agents", agentName);
    try {
      await fs.mkdir(workspace, { recursive: true });
      await fs.writeFile(path.join(workspace, "TASKS.md"), content, "utf-8");
    } catch {
      // Workspace may not exist yet — that's ok
    }
  }

  /**
   * Sync TASKS.md for all agents that have assigned tasks.
   */
  async syncAllAgentTasks(): Promise<void> {
    const agents = new Set<string>();
    for (const q of this.queue) {
      if (q.assignee) agents.add(q.assignee);
    }
    await Promise.all([...agents].map((a) => this.syncAgentTasksMd(a)));
  }

  // ── Agent dispatch ─────────────────────────────────────────────────

  /**
   * Dispatch a task to an agent via `openclaw agent --message`.
   * This sends the task as a message into the agent's session.
   * Returns true if dispatch succeeded.
   */
  async dispatchToAgent(id: string, agentId?: string): Promise<{ ok: boolean; error?: string; response?: string }> {
    const item = this.queue.find((q) => q.id === id);
    if (!item) return { ok: false, error: "Task not found" };
    if (!item.assignee) return { ok: false, error: "Task has no assignee" };

    // Use explicit agentId (gateway ID) or fall back to assignee display name
    const cliAgent = agentId || item.assignee;

    // Build the dispatch message
    const pri = item.priority === "critical" ? "CRITICAL" : item.priority === "high" ? "HIGH" : item.priority;
    const msg = [
      `📋 **New Task Assigned** [${item.id}]`,
      ``,
      `**${item.title}**`,
      item.description ? `${item.description}` : "",
      ``,
      `Priority: ${pri}`,
      ``,
      `Please review this task, determine what needs to be done, and work through it.`,
      `When you've completed the work, summarize your findings and actions.`,
    ].filter(Boolean).join("\n");

    // Move to in_progress before dispatch
    item.status = "in_progress";
    item.dispatchedAt = new Date().toISOString();
    item.updatedAt = item.dispatchedAt;
    if (!item.activity) item.activity = [];
    item.activity.push({
      timestamp: item.dispatchedAt,
      actor: "system",
      action: "dispatched",
      detail: `Sent to ${item.assignee} via OpenClaw`,
    });
    await this.saveQueue();

    // Sync TASKS.md so the agent has full context
    await this.syncAgentTasksMd(item.assignee);

    // Send to agent via OpenClaw CLI — use task ID as session ID so each task
    // gets its own fresh session (prevents reusing stale TUI sessions).
    try {
      const sessionId = `task-${item.id}`;
      const agentResponse = await new Promise<string>((resolve, reject) => {
        execFile(
          "openclaw",
          ["agent", "--message", msg, "--agent", cliAgent, "--session-id", sessionId, "--json"],
          { timeout: 120000, maxBuffer: 4 * 1024 * 1024 },
          (err, stdout, stderr) => {
            if (err) {
              const errMsg = stderr?.trim() || err.message;
              return reject(new Error(errMsg));
            }
            resolve(stdout || "");
          }
        );
      });

      // Parse the agent's response text from the JSON output
      let responseText = "";
      try {
        // stdout may contain multiple JSON lines; the last one with "result" has the response
        const lines = agentResponse.split("\n").filter(l => l.trim());
        for (const line of lines.reverse()) {
          try {
            const parsed = JSON.parse(line);
            // Direct result format: { runId, status, result: { payloads: [{ text }] } }
            if (parsed.result?.payloads) {
              responseText = parsed.result.payloads
                .map((p: any) => p.text)
                .filter(Boolean)
                .join("\n");
              break;
            }
            // Log entry format: message field contains JSON with result
            if (parsed.message && typeof parsed.message === "string") {
              try {
                const inner = JSON.parse(parsed.message);
                if (inner.result?.payloads) {
                  responseText = inner.result.payloads
                    .map((p: any) => p.text)
                    .filter(Boolean)
                    .join("\n");
                  break;
                }
              } catch { /* not nested JSON */ }
              // Plain text response in the log message
              if (!parsed.message.trim().startsWith("{") && parsed.level === "info" && !parsed.subsystem) {
                responseText = parsed.message;
              }
            }
          } catch { /* not valid JSON line */ }
        }
      } catch { /* parsing failed — still ok, dispatch succeeded */ }

      // Record the agent's response in the activity log
      if (responseText) {
        item.activity!.push({
          timestamp: new Date().toISOString(),
          actor: item.assignee!,
          action: "responded",
          detail: responseText.slice(0, 500),
        });
        await this.saveQueue();
      }

      return { ok: true, response: responseText || undefined };
    } catch (err: any) {
      // Dispatch failed — record but keep status
      item.activity.push({
        timestamp: new Date().toISOString(),
        actor: "system",
        action: "dispatch_error",
        detail: err.message,
      });
      await this.saveQueue();
      return { ok: false, error: err.message };
    }
  }

  /**
   * Record agent activity on a task (called from log monitoring).
   */
  async recordAgentActivity(id: string, agentName: string, action: string, detail?: string): Promise<QueueItem | null> {
    const item = this.queue.find((q) => q.id === id);
    if (!item) return null;
    if (!item.activity) item.activity = [];
    item.activity.push({
      timestamp: new Date().toISOString(),
      actor: agentName,
      action,
      detail,
    });
    item.updatedAt = new Date().toISOString();
    await this.saveQueue();
    return item;
  }
}
