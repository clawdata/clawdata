import * as fs from "fs/promises";
import * as path from "path";

export interface Task {
  id: string;
  name: string;
  status: "pending" | "running" | "completed" | "failed";
  startTime?: Date;
  endTime?: Date;
  progress?: number;
  message?: string;
  error?: string;
}

/** Serialisable form stored in JSON (Dates as ISO strings). */
interface SerializedTask {
  id: string;
  name: string;
  status: "pending" | "running" | "completed" | "failed";
  startTime?: string;
  endTime?: string;
  progress?: number;
  message?: string;
  error?: string;
}

export class TaskTracker {
  private tasks: Map<string, Task> = new Map();
  private taskCounter = 0;
  private persistPath: string | null = null;

  /**
   * Enable disk persistence.  Pass a directory (e.g. project root) and tasks
   * will be saved to `<dir>/.clawdata/tasks.json`.
   */
  enablePersistence(rootDir: string): void {
    this.persistPath = path.join(rootDir, ".clawdata", "tasks.json");
  }

  /** Load tasks from disk (if persistence is enabled and file exists). */
  async load(): Promise<void> {
    if (!this.persistPath) return;
    try {
      const raw = await fs.readFile(this.persistPath, "utf-8");
      const data: SerializedTask[] = JSON.parse(raw);
      for (const s of data) {
        const task: Task = {
          ...s,
          startTime: s.startTime ? new Date(s.startTime) : undefined,
          endTime: s.endTime ? new Date(s.endTime) : undefined,
        };
        this.tasks.set(task.id, task);
      }
      // Reset counter to max existing id
      for (const t of this.tasks.values()) {
        const m = t.id.match(/^task_(\d+)_/);
        if (m) this.taskCounter = Math.max(this.taskCounter, parseInt(m[1], 10));
      }
    } catch {
      // File doesn't exist or is invalid — start fresh
    }
  }

  /** Save current tasks to disk (if persistence is enabled). */
  async save(): Promise<void> {
    if (!this.persistPath) return;
    const dir = path.dirname(this.persistPath);
    await fs.mkdir(dir, { recursive: true });
    const data: SerializedTask[] = [];
    this.tasks.forEach((t) => {
      data.push({
        ...t,
        startTime: t.startTime?.toISOString(),
        endTime: t.endTime?.toISOString(),
      });
    });
    await fs.writeFile(this.persistPath, JSON.stringify(data, null, 2), "utf-8");
  }

  createTask(name: string): string {
    const id = `task_${++this.taskCounter}_${Date.now()}`;
    this.tasks.set(id, { id, name, status: "pending" });
    return id;
  }

  startTask(id: string, message?: string): void {
    const task = this.tasks.get(id);
    if (task) {
      task.status = "running";
      task.startTime = new Date();
      task.message = message;
    }
  }

  updateTask(id: string, progress: number, message?: string): void {
    const task = this.tasks.get(id);
    if (task) {
      task.progress = progress;
      task.message = message;
    }
  }

  completeTask(id: string, message?: string): void {
    const task = this.tasks.get(id);
    if (task) {
      task.status = "completed";
      task.endTime = new Date();
      task.message = message;
      task.progress = 100;
    }
  }

  failTask(id: string, error: string): void {
    const task = this.tasks.get(id);
    if (task) {
      task.status = "failed";
      task.endTime = new Date();
      task.error = error;
    }
  }

  getTask(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  getStatus(): {
    active: Task[];
    completed: Task[];
    failed: Task[];
    summary: { total: number; running: number; completed: number; failed: number };
  } {
    const active: Task[] = [];
    const completed: Task[] = [];
    const failed: Task[] = [];

    this.tasks.forEach((task) => {
      if (task.status === "running" || task.status === "pending") {
        active.push(task);
      } else if (task.status === "completed") {
        completed.push(task);
      } else if (task.status === "failed") {
        failed.push(task);
      }
    });

    return {
      active: active.sort((a, b) => (b.startTime?.getTime() || 0) - (a.startTime?.getTime() || 0)),
      completed: completed
        .sort((a, b) => (b.endTime?.getTime() || 0) - (a.endTime?.getTime() || 0))
        .slice(0, 10),
      failed: failed
        .sort((a, b) => (b.endTime?.getTime() || 0) - (a.endTime?.getTime() || 0))
        .slice(0, 10),
      summary: {
        total: this.tasks.size,
        running: active.filter((t) => t.status === "running").length,
        completed: completed.length,
        failed: failed.length,
      },
    };
  }

  clearOldTasks(maxAge: number = 3600000): void {
    const now = Date.now();
    this.tasks.forEach((task, id) => {
      if (task.endTime && now - task.endTime.getTime() > maxAge && task.status !== "running") {
        this.tasks.delete(id);
      }
    });
  }
}
