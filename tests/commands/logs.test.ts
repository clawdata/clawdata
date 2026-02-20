/**
 * Tests for unified log viewer.
 * Feature: clawdata logs — tail, grep, sources across CLI, dbt, Airflow.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { LogManager } from "../../src/lib/logger.js";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

const TEST_DIR = path.join(os.tmpdir(), `clawdata_logs_${Date.now()}`);

describe("LogManager", () => {
  beforeAll(async () => {
    // Create fake log files
    await fs.mkdir(path.join(TEST_DIR, "apps/dbt/logs"), { recursive: true });
    await fs.mkdir(path.join(TEST_DIR, ".clawdata"), { recursive: true });
    await fs.mkdir(path.join(TEST_DIR, "apps/airflow/logs"), { recursive: true });

    await fs.writeFile(
      path.join(TEST_DIR, "apps/dbt/logs/dbt.log"),
      [
        "2026-01-10T10:00:00 [info] Running dbt run",
        "2026-01-10T10:00:02 [info] Model slv_customers OK",
        "2026-01-10T10:00:03 [error] Model fct_orders FAILED",
        "2026-01-10T10:00:04 [info] Finished with 1 error",
      ].join("\n") + "\n"
    );

    await fs.writeFile(
      path.join(TEST_DIR, ".clawdata/cli.log"),
      [
        "2026-01-10T09:59:00 clawdata data ingest-all",
        "2026-01-10T10:05:00 clawdata dbt run",
      ].join("\n") + "\n"
    );
  });

  afterAll(async () => {
    try { await fs.rm(TEST_DIR, { recursive: true }); } catch {}
  });

  it("getSources returns registered log sources", () => {
    const mgr = new LogManager(TEST_DIR);
    const sources = mgr.getSources();
    expect(sources.length).toBeGreaterThanOrEqual(3);
    const names = sources.map((s) => s.name);
    expect(names).toContain("dbt");
    expect(names).toContain("cli");
    expect(names).toContain("airflow");
  });

  it("tail reads last N lines from a source", async () => {
    const mgr = new LogManager(TEST_DIR);
    const entries = await mgr.tail("dbt", 2);
    expect(entries.length).toBe(2);
    expect(entries[0].source).toBe("dbt");
    expect(entries[1].line).toContain("Finished with 1 error");
  });

  it("tail returns empty array for missing file", async () => {
    const mgr = new LogManager(TEST_DIR);
    const entries = await mgr.tail("airflow");
    expect(entries).toEqual([]);
  });

  it("tail throws for unknown source", async () => {
    const mgr = new LogManager(TEST_DIR);
    await expect(mgr.tail("nonexistent")).rejects.toThrow("Unknown log source");
  });

  it("tailAll merges entries from all sources", async () => {
    const mgr = new LogManager(TEST_DIR);
    const entries = await mgr.tailAll(100);
    const sources = new Set(entries.map((e) => e.source));
    expect(sources.has("dbt")).toBe(true);
    expect(sources.has("cli")).toBe(true);
    expect(entries.length).toBeGreaterThan(0);
  });

  it("tailAll sorts by timestamp", async () => {
    const mgr = new LogManager(TEST_DIR);
    const entries = await mgr.tailAll(100);
    const timestamped = entries.filter((e) => e.timestamp);
    for (let i = 1; i < timestamped.length; i++) {
      expect(timestamped[i].timestamp >= timestamped[i - 1].timestamp).toBe(true);
    }
  });

  it("grep filters entries by pattern", async () => {
    const mgr = new LogManager(TEST_DIR);
    const errors = await mgr.grep("error");
    expect(errors.length).toBeGreaterThanOrEqual(1);
    for (const e of errors) {
      expect(e.line.toLowerCase()).toContain("error");
    }
  });

  it("grep returns empty for non-matching pattern", async () => {
    const mgr = new LogManager(TEST_DIR);
    const results = await mgr.grep("ZZZZUNIQUENOMATCH");
    expect(results.length).toBe(0);
  });

  it("log() appends to CLI log", async () => {
    const mgr = new LogManager(TEST_DIR);
    await mgr.log("test message from unit test");
    const content = await fs.readFile(path.join(TEST_DIR, ".clawdata/cli.log"), "utf-8");
    expect(content).toContain("test message from unit test");
  });

  it("addSource registers a custom source", () => {
    const mgr = new LogManager(TEST_DIR);
    mgr.addSource("custom", "/tmp/custom.log");
    const names = mgr.getSources().map((s) => s.name);
    expect(names).toContain("custom");
  });
});
