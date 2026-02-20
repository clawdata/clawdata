import { describe, it, expect } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";

const PREFECT_DIR = path.resolve(import.meta.dirname, "../../apps/prefect");

describe("Prefect alternative orchestrator", () => {
  it("flows.py exists", async () => {
    const stat = await fs.stat(path.join(PREFECT_DIR, "flows.py"));
    expect(stat.isFile()).toBe(true);
  });

  it("flows.py defines clawdata_etl flow", async () => {
    const content = await fs.readFile(path.join(PREFECT_DIR, "flows.py"), "utf-8");
    expect(content).toContain("def clawdata_etl");
    expect(content).toContain('@flow');
  });

  it("flows.py defines clawdata_dbt_only flow", async () => {
    const content = await fs.readFile(path.join(PREFECT_DIR, "flows.py"), "utf-8");
    expect(content).toContain("def clawdata_dbt_only");
  });

  it("flows.py defines individual tasks with @task", async () => {
    const content = await fs.readFile(path.join(PREFECT_DIR, "flows.py"), "utf-8");
    expect(content).toContain("@task");
    expect(content).toContain("def ingest_data");
    expect(content).toContain("def dbt_run");
    expect(content).toContain("def dbt_test");
    expect(content).toContain("def dbt_seed");
  });

  it("flows.py includes retry configuration", async () => {
    const content = await fs.readFile(path.join(PREFECT_DIR, "flows.py"), "utf-8");
    expect(content).toContain("retries=");
    expect(content).toContain("retry_delay_seconds=");
  });

  it("flows.py uses get_run_logger", async () => {
    const content = await fs.readFile(path.join(PREFECT_DIR, "flows.py"), "utf-8");
    expect(content).toContain("get_run_logger");
  });

  it("flows.py has data quality check task", async () => {
    const content = await fs.readFile(path.join(PREFECT_DIR, "flows.py"), "utf-8");
    expect(content).toContain("def data_quality_check");
  });

  it("flows.py has docs generation task", async () => {
    const content = await fs.readFile(path.join(PREFECT_DIR, "flows.py"), "utf-8");
    expect(content).toContain("def dbt_docs_generate");
  });

  it("flows.py gracefully handles missing prefect import", async () => {
    const content = await fs.readFile(path.join(PREFECT_DIR, "flows.py"), "utf-8");
    expect(content).toContain("except ImportError");
  });

  it("README.md exists with usage instructions", async () => {
    const content = await fs.readFile(path.join(PREFECT_DIR, "README.md"), "utf-8");
    expect(content).toContain("prefect");
    expect(content).toContain("clawdata_etl");
    expect(content).toContain("python apps/prefect/flows.py");
  });
});
