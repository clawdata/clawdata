import { describe, it, expect } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";

const DAGS_DIR = path.resolve("apps/airflow/dags");

describe("Airflow DAG with TaskGroups", () => {
  it("clawdata_etl.py should exist", async () => {
    const exists = await fs
      .access(path.join(DAGS_DIR, "clawdata_etl.py"))
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);
  });

  it("should import TaskGroup", async () => {
    const content = await fs.readFile(
      path.join(DAGS_DIR, "clawdata_etl.py"),
      "utf-8"
    );
    expect(content).toContain("from airflow.utils.task_group import TaskGroup");
  });

  it("should define ingest TaskGroup", async () => {
    const content = await fs.readFile(
      path.join(DAGS_DIR, "clawdata_etl.py"),
      "utf-8"
    );
    expect(content).toContain('TaskGroup("ingest"');
  });

  it("should define dbt_transform TaskGroup", async () => {
    const content = await fs.readFile(
      path.join(DAGS_DIR, "clawdata_etl.py"),
      "utf-8"
    );
    expect(content).toContain('TaskGroup("dbt_transform"');
  });

  it("should define dbt_quality TaskGroup", async () => {
    const content = await fs.readFile(
      path.join(DAGS_DIR, "clawdata_etl.py"),
      "utf-8"
    );
    expect(content).toContain('TaskGroup("dbt_quality"');
  });

  it("should run bronze → silver → gold in order", async () => {
    const content = await fs.readFile(
      path.join(DAGS_DIR, "clawdata_etl.py"),
      "utf-8"
    );
    expect(content).toContain("dbt_run_bronze");
    expect(content).toContain("dbt_run_silver");
    expect(content).toContain("dbt_run_gold");
    expect(content).toContain(
      "dbt_seed >> dbt_run_bronze >> dbt_run_silver >> dbt_run_gold"
    );
  });

  it("should chain group dependencies: ingest → transform → quality", async () => {
    const content = await fs.readFile(
      path.join(DAGS_DIR, "clawdata_etl.py"),
      "utf-8"
    );
    expect(content).toContain(
      "ingest_group >> transform_group >> quality_group"
    );
  });

  it("should include dbt seed step", async () => {
    const content = await fs.readFile(
      path.join(DAGS_DIR, "clawdata_etl.py"),
      "utf-8"
    );
    expect(content).toContain("clawdata dbt seed");
  });
});
