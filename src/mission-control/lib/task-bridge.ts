/**
 * Bridge to the ClawData TaskTracker.
 *
 * Reads task state from userdata/config/tasks.json and exposes it
 * for the Mission Control dashboard.
 *
 * Also manages user-created queue items in userdata/config/queue.json.
 */

import * as fs from "fs/promises";
import * as path from "path";

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

export interface QueueItem {
  id: string;
  title: string;
  description?: string;
  status: "inbox" | "assigned" | "in_progress" | "review" | "done";
  priority: "low" | "medium" | "high" | "critical";
  source: "user";
  assignee?: string;
  riskLevel?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
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
  }): Promise<QueueItem> {
    const now = new Date().toISOString();
    const hasAssignee = !!opts.assignee?.trim();
    const item: QueueItem = {
      id: `q_${++this.queueCounter}_${Date.now()}`,
      title: opts.title,
      description: opts.description || "",
      status: hasAssignee ? "assigned" : "inbox",
      priority: opts.priority || "medium",
      source: "user",
      assignee: opts.assignee || undefined,
      tags: opts.tags || [],
      createdAt: now,
      updatedAt: now,
    };
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
    item.assignee = assignee;
    // When assigned to an agent, auto-move to "assigned" (actioned)
    if (item.status === "inbox") {
      item.status = "assigned";
    }
    item.updatedAt = new Date().toISOString();
    await this.saveQueue();
    return item;
  }

  /**
   * Update a queue item's fields (status, priority, description, etc.).
   */
  async updateQueueItem(id: string, updates: Partial<Pick<QueueItem, "title" | "description" | "status" | "priority" | "assignee" | "tags">>): Promise<QueueItem | null> {
    const item = this.queue.find((q) => q.id === id);
    if (!item) return null;
    if (updates.title !== undefined) item.title = updates.title;
    if (updates.description !== undefined) item.description = updates.description;
    if (updates.status !== undefined) item.status = updates.status;
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
}
