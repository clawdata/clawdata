import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const DAG_PATH = path.resolve("apps/airflow/dags/clawdata_docker_etl.py");

describe("Airflow Docker-based operator DAG", () => {
  const content = fs.readFileSync(DAG_PATH, "utf-8");

  it("DAG file exists", () => {
    expect(fs.existsSync(DAG_PATH)).toBe(true);
  });

  it("imports DockerOperator with graceful fallback", () => {
    expect(content).toContain("from airflow.providers.docker.operators.docker import DockerOperator");
    expect(content).toContain("HAS_DOCKER_PROVIDER");
    expect(content).toContain("except ImportError");
  });

  it("defines the docker DAG ID", () => {
    expect(content).toContain('dag_id="clawdata_docker_etl"');
  });

  it("uses CLAWDATA_DOCKER_IMAGE env var with default", () => {
    expect(content).toContain("CLAWDATA_DOCKER_IMAGE");
    expect(content).toContain('clawdata:latest');
  });

  it("uses CLAWDATA_DOCKER_NETWORK env var", () => {
    expect(content).toContain("CLAWDATA_DOCKER_NETWORK");
  });

  it("defines a _make_docker_task helper", () => {
    expect(content).toContain("def _make_docker_task");
  });

  it("has DockerOperator branch with auto_remove", () => {
    expect(content).toContain("auto_remove=True");
    expect(content).toContain('docker_url="unix://var/run/docker.sock"');
  });

  it("has BashOperator fallback with docker run", () => {
    expect(content).toContain("docker run --rm");
  });

  it("creates ingest, transform, and quality task groups", () => {
    expect(content).toContain('TaskGroup("ingest"');
    expect(content).toContain('TaskGroup(\n        "dbt_transform"');
    expect(content).toContain('TaskGroup(\n        "dbt_quality"');
  });

  it("wires DAG dependencies correctly", () => {
    expect(content).toContain("ingest_group >> transform_group >> quality_group");
  });

  it("mounts data volume into container", () => {
    expect(content).toContain("volumes=");
    expect(content).toContain(":/app/data");
  });

  it("passes DB_PATH and DATA_FOLDER env to container", () => {
    expect(content).toContain('"DB_PATH"');
    expect(content).toContain('"DATA_FOLDER"');
  });

  it("has docker tag", () => {
    expect(content).toContain('"docker"');
  });

  it("includes dbt seed and dbt run steps", () => {
    expect(content).toContain("clawdata dbt seed");
    expect(content).toContain("clawdata dbt run");
    expect(content).toContain("clawdata dbt test");
    expect(content).toContain("clawdata data ingest-all");
  });
});
