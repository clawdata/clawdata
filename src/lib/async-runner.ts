/**
 * Async task execution — run long-running work in the background
 * while allowing the user to poll for status.
 *
 * Built on top of TaskTracker for persistence.
 *
 * Usage:
 *   const runner = new AsyncRunner(taskTracker);
 *   const id = runner.submit("my-job", async (report) => {
 *     report(10, "Starting ...");
 *     await heavyWork();
 *     report(100, "Done");
 *     return { rows: 42 };
 *   });
 *   const status = runner.poll(id); // { status, progress, message, result? }
 */

import { TaskTracker, type Task } from "./tasks.js";

export type ProgressCallback = (progress: number, message?: string) => void;
export type AsyncFn<T = unknown> = (report: ProgressCallback) => Promise<T>;

export interface AsyncJob<T = unknown> {
  taskId: string;
  promise: Promise<T>;
}

export interface PollResult {
  taskId: string;
  status: Task["status"];
  progress?: number;
  message?: string;
  error?: string;
  result?: unknown;
  durationMs?: number;
}

export class AsyncRunner {
  private tracker: TaskTracker;
  private results = new Map<string, unknown>();

  constructor(tracker: TaskTracker) {
    this.tracker = tracker;
  }

  /**
   * Submit a function for async execution.
   * Returns a job handle with the task ID and the underlying promise.
   */
  submit<T>(name: string, fn: AsyncFn<T>): AsyncJob<T> {
    const taskId = this.tracker.createTask(name);
    this.tracker.startTask(taskId, "Starting…");

    const report: ProgressCallback = (progress, message) => {
      this.tracker.updateTask(taskId, progress, message);
    };

    const promise = fn(report)
      .then((result) => {
        this.tracker.completeTask(taskId, "Completed successfully");
        this.results.set(taskId, result);
        return result;
      })
      .catch((err) => {
        const errMsg = err instanceof Error ? err.message : String(err);
        this.tracker.failTask(taskId, errMsg);
        throw err;
      });

    return { taskId, promise };
  }

  /**
   * Poll for the current status of a submitted job.
   */
  poll(taskId: string): PollResult {
    const task = this.tracker.getTask(taskId);
    if (!task) {
      return { taskId, status: "failed", error: "Task not found" };
    }

    const durationMs =
      task.startTime && task.endTime
        ? task.endTime.getTime() - task.startTime.getTime()
        : task.startTime
          ? Date.now() - task.startTime.getTime()
          : undefined;

    return {
      taskId,
      status: task.status,
      progress: task.progress,
      message: task.message,
      error: task.error,
      result: this.results.get(taskId),
      durationMs,
    };
  }

  /**
   * Wait for a job to finish and return its result.
   */
  async wait<T>(job: AsyncJob<T>): Promise<T> {
    return job.promise;
  }

  /**
   * List all active (running) job IDs.
   */
  active(): string[] {
    const status = this.tracker.getStatus();
    return status.active.map((t) => t.id);
  }
}
