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

export class TaskTracker {
  private tasks: Map<string, Task> = new Map();
  private taskCounter = 0;

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
