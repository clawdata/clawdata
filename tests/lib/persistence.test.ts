import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TaskTracker } from "../../src/lib/tasks.js";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

describe("TaskTracker persistence", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "clawdata-tasks-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("save should create .clawdata/tasks.json", async () => {
    const tracker = new TaskTracker();
    tracker.enablePersistence(tmpDir);

    const id = tracker.createTask("test-save");
    tracker.startTask(id);
    tracker.completeTask(id, "done");

    await tracker.save();

    const filePath = path.join(tmpDir, ".clawdata", "tasks.json");
    const exists = await fs
      .access(filePath)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);

    const content = JSON.parse(await fs.readFile(filePath, "utf-8"));
    expect(content).toHaveLength(1);
    expect(content[0].name).toBe("test-save");
    expect(content[0].status).toBe("completed");
  });

  it("load should restore tasks from disk", async () => {
    // Save some tasks
    const tracker1 = new TaskTracker();
    tracker1.enablePersistence(tmpDir);
    const id1 = tracker1.createTask("task-a");
    tracker1.startTask(id1);
    tracker1.completeTask(id1, "done-a");
    const id2 = tracker1.createTask("task-b");
    tracker1.startTask(id2);
    tracker1.failTask(id2, "oops");
    await tracker1.save();

    // Load in a new tracker
    const tracker2 = new TaskTracker();
    tracker2.enablePersistence(tmpDir);
    await tracker2.load();

    const task1 = tracker2.getTask(id1);
    expect(task1).toBeDefined();
    expect(task1!.name).toBe("task-a");
    expect(task1!.status).toBe("completed");

    const task2 = tracker2.getTask(id2);
    expect(task2).toBeDefined();
    expect(task2!.status).toBe("failed");
    expect(task2!.error).toBe("oops");
  });

  it("load should handle missing file gracefully", async () => {
    const tracker = new TaskTracker();
    tracker.enablePersistence(tmpDir);
    // Should not throw
    await tracker.load();
    const status = tracker.getStatus();
    expect(status.summary.total).toBe(0);
  });

  it("load should restore Date objects correctly", async () => {
    const tracker1 = new TaskTracker();
    tracker1.enablePersistence(tmpDir);
    const id = tracker1.createTask("dated");
    tracker1.startTask(id);
    tracker1.completeTask(id);
    await tracker1.save();

    const tracker2 = new TaskTracker();
    tracker2.enablePersistence(tmpDir);
    await tracker2.load();

    const task = tracker2.getTask(id);
    expect(task!.startTime).toBeInstanceOf(Date);
    expect(task!.endTime).toBeInstanceOf(Date);
  });

  it("counter should resume after load", async () => {
    const tracker1 = new TaskTracker();
    tracker1.enablePersistence(tmpDir);
    tracker1.createTask("a");
    tracker1.createTask("b");
    tracker1.createTask("c");
    await tracker1.save();

    const tracker2 = new TaskTracker();
    tracker2.enablePersistence(tmpDir);
    await tracker2.load();
    const newId = tracker2.createTask("d");
    // Counter should be at least 4
    expect(newId).toMatch(/^task_[4-9]\d*_/);
  });

  it("save without enablePersistence should be a no-op", async () => {
    const tracker = new TaskTracker();
    tracker.createTask("x");
    // Should not throw
    await tracker.save();

    // No file should have been created
    const exists = await fs
      .access(path.join(tmpDir, ".clawdata", "tasks.json"))
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(false);
  });
});
