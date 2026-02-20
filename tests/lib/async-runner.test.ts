import { describe, it, expect } from "vitest";
import { AsyncRunner } from "../../src/lib/async-runner.js";
import { TaskTracker } from "../../src/lib/tasks.js";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("AsyncRunner", () => {
  it("submits a job and returns a task ID", () => {
    const tracker = new TaskTracker();
    const runner = new AsyncRunner(tracker);

    const job = runner.submit("test-job", async () => 42);
    expect(job.taskId).toBeTruthy();
    expect(job.taskId).toContain("task_");
  });

  it("job resolves with the function result", async () => {
    const tracker = new TaskTracker();
    const runner = new AsyncRunner(tracker);

    const job = runner.submit("add", async () => 1 + 1);
    const result = await runner.wait(job);
    expect(result).toBe(2);
  });

  it("tracks progress via report callback", async () => {
    const tracker = new TaskTracker();
    const runner = new AsyncRunner(tracker);

    const job = runner.submit("progress-job", async (report) => {
      report(25, "quarter done");
      await delay(10);
      report(50, "half done");
      await delay(10);
      report(100, "complete");
      return "ok";
    });

    await runner.wait(job);

    const status = runner.poll(job.taskId);
    expect(status.status).toBe("completed");
    expect(status.progress).toBe(100);
    expect(status.result).toBe("ok");
  });

  it("marks job as failed on error", async () => {
    const tracker = new TaskTracker();
    const runner = new AsyncRunner(tracker);

    const job = runner.submit("fail-job", async () => {
      throw new Error("something broke");
    });

    await expect(runner.wait(job)).rejects.toThrow("something broke");

    const status = runner.poll(job.taskId);
    expect(status.status).toBe("failed");
    expect(status.error).toBe("something broke");
    expect(status.result).toBeUndefined();
  });

  it("poll returns 'running' before completion", async () => {
    const tracker = new TaskTracker();
    const runner = new AsyncRunner(tracker);

    let resolveJob!: () => void;
    const blocker = new Promise<void>((r) => {
      resolveJob = r;
    });

    const job = runner.submit("slow-job", async (report) => {
      report(10, "starting");
      await blocker;
      return "done";
    });

    // Let microtask queue flush so the fn starts
    await delay(5);

    const status = runner.poll(job.taskId);
    expect(status.status).toBe("running");
    expect(status.progress).toBe(10);
    expect(status.message).toBe("starting");

    resolveJob();
    await runner.wait(job);

    const final = runner.poll(job.taskId);
    expect(final.status).toBe("completed");
    expect(final.result).toBe("done");
  });

  it("poll returns task not found for unknown ID", () => {
    const tracker = new TaskTracker();
    const runner = new AsyncRunner(tracker);

    const result = runner.poll("nonexistent");
    expect(result.status).toBe("failed");
    expect(result.error).toBe("Task not found");
  });

  it("active lists running jobs", async () => {
    const tracker = new TaskTracker();
    const runner = new AsyncRunner(tracker);

    let resolveJob!: () => void;
    const blocker = new Promise<void>((r) => {
      resolveJob = r;
    });

    const job = runner.submit("active-job", async () => {
      await blocker;
      return "x";
    });

    await delay(5);

    const activeIds = runner.active();
    expect(activeIds).toContain(job.taskId);

    resolveJob();
    await runner.wait(job);

    const afterIds = runner.active();
    expect(afterIds).not.toContain(job.taskId);
  });

  it("tracks duration in milliseconds", async () => {
    const tracker = new TaskTracker();
    const runner = new AsyncRunner(tracker);

    const job = runner.submit("timed-job", async () => {
      await delay(20);
      return "done";
    });

    await runner.wait(job);

    const status = runner.poll(job.taskId);
    expect(status.durationMs).toBeGreaterThanOrEqual(15);
    expect(status.durationMs).toBeLessThan(5000);
  });

  it("supports multiple concurrent jobs", async () => {
    const tracker = new TaskTracker();
    const runner = new AsyncRunner(tracker);

    const job1 = runner.submit("j1", async () => {
      await delay(10);
      return "one";
    });
    const job2 = runner.submit("j2", async () => {
      await delay(10);
      return "two";
    });

    const [r1, r2] = await Promise.all([runner.wait(job1), runner.wait(job2)]);
    expect(r1).toBe("one");
    expect(r2).toBe("two");

    expect(runner.poll(job1.taskId).status).toBe("completed");
    expect(runner.poll(job2.taskId).status).toBe("completed");
  });
});
