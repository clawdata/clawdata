/**
 * Unit tests for TaskTracker.
 * Feature: Testing & CI → Unit tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { TaskTracker, Task } from "../../src/lib/tasks.js";

describe("TaskTracker", () => {
  let tracker: TaskTracker;

  beforeEach(() => {
    tracker = new TaskTracker();
  });

  // ── createTask ───────────────────────────────────────────────────

  describe("createTask", () => {
    it("returns a unique task id", () => {
      const id1 = tracker.createTask("task-a");
      const id2 = tracker.createTask("task-b");
      expect(id1).toBeTruthy();
      expect(id2).toBeTruthy();
      expect(id1).not.toBe(id2);
    });

    it("creates a task in pending status", () => {
      const id = tracker.createTask("ingest file");
      const task = tracker.getTask(id);
      expect(task).toBeDefined();
      expect(task!.status).toBe("pending");
      expect(task!.name).toBe("ingest file");
    });

    it("increments counters for each task", () => {
      tracker.createTask("a");
      tracker.createTask("b");
      tracker.createTask("c");
      const status = tracker.getStatus();
      expect(status.summary.total).toBe(3);
    });
  });

  // ── startTask ────────────────────────────────────────────────────

  describe("startTask", () => {
    it("transitions task to running", () => {
      const id = tracker.createTask("load");
      tracker.startTask(id, "loading data");
      const task = tracker.getTask(id);
      expect(task!.status).toBe("running");
      expect(task!.message).toBe("loading data");
      expect(task!.startTime).toBeInstanceOf(Date);
    });

    it("does nothing for a non-existent id", () => {
      // should not throw
      tracker.startTask("nonexistent");
    });
  });

  // ── updateTask ───────────────────────────────────────────────────

  describe("updateTask", () => {
    it("updates progress and message", () => {
      const id = tracker.createTask("ingest");
      tracker.startTask(id);
      tracker.updateTask(id, 50, "halfway");
      const task = tracker.getTask(id);
      expect(task!.progress).toBe(50);
      expect(task!.message).toBe("halfway");
    });
  });

  // ── completeTask ─────────────────────────────────────────────────

  describe("completeTask", () => {
    it("transitions to completed with 100% progress", () => {
      const id = tracker.createTask("build");
      tracker.startTask(id);
      tracker.completeTask(id, "all done");
      const task = tracker.getTask(id);
      expect(task!.status).toBe("completed");
      expect(task!.progress).toBe(100);
      expect(task!.message).toBe("all done");
      expect(task!.endTime).toBeInstanceOf(Date);
    });
  });

  // ── failTask ─────────────────────────────────────────────────────

  describe("failTask", () => {
    it("transitions to failed with error", () => {
      const id = tracker.createTask("query");
      tracker.startTask(id);
      tracker.failTask(id, "connection refused");
      const task = tracker.getTask(id);
      expect(task!.status).toBe("failed");
      expect(task!.error).toBe("connection refused");
      expect(task!.endTime).toBeInstanceOf(Date);
    });
  });

  // ── getStatus ────────────────────────────────────────────────────

  describe("getStatus", () => {
    it("returns empty buckets for a fresh tracker", () => {
      const status = tracker.getStatus();
      expect(status.active).toHaveLength(0);
      expect(status.completed).toHaveLength(0);
      expect(status.failed).toHaveLength(0);
      expect(status.summary).toEqual({
        total: 0,
        running: 0,
        completed: 0,
        failed: 0,
      });
    });

    it("categorises tasks into correct buckets", () => {
      const a = tracker.createTask("a");
      const b = tracker.createTask("b");
      const c = tracker.createTask("c");
      tracker.startTask(a);
      tracker.completeTask(a, "ok");
      tracker.startTask(b);
      tracker.failTask(b, "err");
      tracker.startTask(c);

      const status = tracker.getStatus();
      expect(status.completed).toHaveLength(1);
      expect(status.failed).toHaveLength(1);
      expect(status.active).toHaveLength(1);
      expect(status.summary.running).toBe(1);
    });

    it("includes pending tasks in active", () => {
      tracker.createTask("pending-task");
      const status = tracker.getStatus();
      expect(status.active).toHaveLength(1);
      expect(status.active[0].status).toBe("pending");
    });

    it("limits completed and failed to 10", () => {
      for (let i = 0; i < 15; i++) {
        const id = tracker.createTask(`done-${i}`);
        tracker.startTask(id);
        tracker.completeTask(id);
      }
      const status = tracker.getStatus();
      expect(status.completed).toHaveLength(10);
      expect(status.summary.completed).toBe(15);
    });
  });

  // ── clearOldTasks ────────────────────────────────────────────────

  describe("clearOldTasks", () => {
    it("removes completed tasks older than maxAge", () => {
      const id = tracker.createTask("old");
      tracker.startTask(id);
      tracker.completeTask(id);
      // Manually set endTime to the past
      const task = tracker.getTask(id)!;
      task.endTime = new Date(Date.now() - 7200000); // 2 hours ago

      tracker.clearOldTasks(3600000); // 1 hour
      expect(tracker.getTask(id)).toBeUndefined();
    });

    it("keeps running tasks even if old", () => {
      const id = tracker.createTask("running");
      tracker.startTask(id);
      const task = tracker.getTask(id)!;
      task.startTime = new Date(Date.now() - 7200000);

      tracker.clearOldTasks(3600000);
      expect(tracker.getTask(id)).toBeDefined();
    });

    it("keeps recent completed tasks", () => {
      const id = tracker.createTask("recent");
      tracker.startTask(id);
      tracker.completeTask(id);

      tracker.clearOldTasks(3600000);
      expect(tracker.getTask(id)).toBeDefined();
    });
  });
});
