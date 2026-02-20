/**
 * `clawdata doctor` — verify prerequisites and config.
 * Only checks tools for skills that are currently enabled.
 */

import { DataIngestor } from "../lib/ingestor.js";
import { jsonMode, output } from "../lib/output.js";
import { getEnabledSkills } from "../tui/skills.js";
import { execSync } from "child_process";
import * as fs from "fs/promises";
import * as fss from "fs";
import * as path from "path";
import * as os from "os";

export async function doctorCommand(ingestor: DataIngestor): Promise<void> {
  const ROOT = process.env.CLAWDATA_ROOT || path.resolve(path.dirname(new URL(import.meta.url).pathname) + "/../..");
  const enabledSkills = getEnabledSkills(ROOT);
  const checks: { name: string; ok: boolean; detail: string }[] = [];

  // Node.js — always checked
  const nodeVer = process.version;
  const nodeMajor = parseInt(nodeVer.slice(1), 10);
  checks.push({
    name: "Node.js",
    ok: nodeMajor >= 18,
    detail: nodeMajor >= 18 ? nodeVer : `${nodeVer} (need 18+)`,
  });

  // Python — needed by dbt and airflow
  if (enabledSkills.some((s) => ["dbt", "airflow"].includes(s))) {
    try {
      const py = execSync("python3 --version 2>&1", { encoding: "utf-8" }).trim();
      checks.push({ name: "Python", ok: true, detail: py });
    } catch {
      checks.push({ name: "Python", ok: false, detail: "not found — install Python 3.8+" });
    }
  }

  // dbt
  if (enabledSkills.includes("dbt")) {
    try {
      const dbtVer = execSync("dbt --version 2>&1", { encoding: "utf-8" }).split("\n")[0].trim();
      checks.push({ name: "dbt", ok: true, detail: dbtVer });
    } catch {
      checks.push({ name: "dbt", ok: false, detail: "not found — pip install dbt-core dbt-duckdb" });
    }
  }

  // Data folder — always checked (core to duckdb skill)
  try {
    await fs.access(process.env.DATA_FOLDER!);
    const files = await ingestor.listFiles();
    checks.push({ name: "Data folder", ok: true, detail: `${files.length} file(s) in ${process.env.DATA_FOLDER}` });
  } catch {
    checks.push({ name: "Data folder", ok: false, detail: `missing: ${process.env.DATA_FOLDER}` });
  }

  // dbt project
  if (enabledSkills.includes("dbt")) {
    try {
      await fs.access(path.join(process.env.DBT_PROJECT_DIR!, "dbt_project.yml"));
      checks.push({ name: "dbt project", ok: true, detail: process.env.DBT_PROJECT_DIR! });
    } catch {
      checks.push({ name: "dbt project", ok: false, detail: `dbt_project.yml not found in ${process.env.DBT_PROJECT_DIR}` });
    }
  }

  // Airflow
  if (enabledSkills.includes("airflow")) {
    try {
      const afVer = execSync("airflow version 2>/dev/null", { encoding: "utf-8" }).trim().split("\n").pop()!.trim();
      checks.push({ name: "Airflow", ok: true, detail: `v${afVer}` });
    } catch {
      checks.push({ name: "Airflow", ok: false, detail: "not found — pip install apache-airflow" });
    }
  }

  // Airflow DAGs folder
  if (enabledSkills.includes("airflow")) {
    try {
      await fs.access(process.env.AIRFLOW_DAGS_FOLDER!);
      const dags = (await fs.readdir(process.env.AIRFLOW_DAGS_FOLDER!)).filter(f => f.endsWith('.py'));
      checks.push({ name: "Airflow DAGs", ok: true, detail: `${dags.length} DAG file(s) in ${process.env.AIRFLOW_DAGS_FOLDER}` });
    } catch {
      checks.push({ name: "Airflow DAGs", ok: false, detail: `missing: ${process.env.AIRFLOW_DAGS_FOLDER}` });
    }
  }

  // ── Binary checks for additional skills ──
  const skillBinChecks: { skill: string; label: string; bin: string; hint: string; pythonImport?: boolean }[] = [
    { skill: "postgres", label: "PostgreSQL", bin: "psql", hint: "brew install postgresql" },
    { skill: "bigquery", label: "BigQuery", bin: "bq", hint: "brew install google-cloud-sdk" },
    { skill: "databricks", label: "Databricks", bin: "databricks", hint: "pip install databricks-cli" },
    { skill: "spark", label: "Spark", bin: "spark-submit", hint: "brew install apache-spark" },
    { skill: "s3", label: "AWS CLI", bin: "aws", hint: "brew install awscli" },
    { skill: "kafka", label: "Kafka", bin: "kafka-topics", hint: "brew install kafka" },
    { skill: "dlt", label: "dlt", bin: "dlt", hint: "pip install dlt" },
    { skill: "dagster", label: "Dagster", bin: "dagster", hint: "pip install dagster" },
    { skill: "great-expectations", label: "Great Expectations", bin: "great_expectations", hint: "pip install great-expectations", pythonImport: true },
    { skill: "snowflake", label: "SnowSQL", bin: "snowsql", hint: "brew install --cask snowflake-snowsql" },
  ];

  /** Well-known alternate install paths for tools that live outside PATH */
  const altPaths: Record<string, string[]> = {
    snowsql: ["~/bin/snowsql", "/Applications/SnowSQL.app/Contents/MacOS/snowsql"],
    great_expectations: ["~/.local/bin/great_expectations"],
  };

  function findBin(bin: string, pythonImport?: boolean): boolean {
    // For Python libraries, check importability rather than PATH
    if (pythonImport) {
      try {
        execSync(`python3 -c "import ${bin}" 2>/dev/null`, { stdio: "pipe" });
        return true;
      } catch {
        return false;
      }
    }
    try {
      execSync(`command -v ${bin} 2>/dev/null`, { stdio: "pipe" });
      return true;
    } catch {
      return altPaths[bin]?.some((p) => {
        const resolved = p.replace(/^~/, os.homedir());
        return fss.existsSync(resolved);
      }) ?? false;
    }
  }

  for (const { skill, label, bin, hint, pythonImport } of skillBinChecks) {
    if (enabledSkills.includes(skill)) {
      if (findBin(bin, pythonImport)) {
        checks.push({ name: label, ok: true, detail: `${bin} found` });
      } else {
        checks.push({ name: label, ok: false, detail: `${bin} not found — ${hint}` });
      }
    }
  }

  // DuckDB file — always checked
  try {
    await fs.access(process.env.DB_PATH!);
    checks.push({ name: "DuckDB file", ok: true, detail: process.env.DB_PATH! });
  } catch {
    checks.push({ name: "DuckDB file", ok: false, detail: `will be created at ${process.env.DB_PATH}` });
  }

  if (jsonMode) {
    output({ enabledSkills, checks });
  } else {
    console.log("clawdata doctor\n");
    console.log(`  Skills: ${enabledSkills.length ? enabledSkills.join(", ") : "none"}\n`);
    for (const c of checks) {
      const icon = c.ok ? "✓" : "✗";
      console.log(`  ${icon} ${c.name.padEnd(14)} ${c.detail}`);
    }
    const allOk = checks.every((c) => c.ok);
    console.log(allOk ? "\nAll checks passed." : "\nSome checks failed — see above.");
  }
}
