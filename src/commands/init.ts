/**
 * `clawdata init` — scaffold a new ClawData project from scratch.
 *
 * Creates:  data/, apps/dbt/ (models, profiles, sources), skills config.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { jsonMode, output } from "../lib/output.js";

interface InitResult {
  directory: string;
  created: string[];
  skipped: string[];
}

const DBI_PROJECT_YML = `name: 'openclaw_dbt'
version: '1.0.0'
config-version: 2

profile: 'openclaw_dbt'

model-paths: ["models"]
analysis-paths: ["analyses"]
test-paths: ["tests"]
seed-paths: ["seeds"]
macro-paths: ["macros"]
snapshot-paths: ["snapshots"]

clean-targets:
  - "target"
  - "dbt_packages"

models:
  openclaw_dbt:
    sample:
      bronze:
        +materialized: view
      silver:
        +materialized: table
      gold:
        +materialized: table
`;

const DBT_PROFILES_YML = `openclaw_dbt:
  target: dev
  outputs:
    dev:
      type: duckdb
      path: '../../data/warehouse.duckdb'
      threads: 4
      extensions:
        - httpfs
        - parquet
`;

const SOURCES_YML = `version: 2

sources:
  - name: raw
    description: "Raw data loaded from CSV files into DuckDB"
    schema: main
    tables:
      - name: sample_customers
        description: "Raw CRM customer export"
      - name: sample_products
        description: "Raw product catalogue export"
      - name: sample_orders
        description: "Raw denormalised order + line-item export"
      - name: sample_payments
        description: "Raw payment processor transactions"
`;

const SCHEMA_YML = `version: 2

models: []
`;

const SAMPLE_BRONZE = `-- Bronze: raw passthrough from source
SELECT * FROM {{ source('raw', 'sample_customers') }}
`;

const GITKEEP = "";

export async function initCommand(
  sub: string | undefined,
  rest: string[]
): Promise<void> {
  if (sub === "help" || sub === "--help" || sub === "-h") {
    console.log("Usage: clawdata init [directory]\n");
    console.log("Scaffold a new ClawData project.\n");
    console.log("If no directory is given, the current directory is used.");
    console.log("Creates: data/, apps/dbt/ (with starter models), skills/");
    return;
  }

  const targetDir = path.resolve(sub || rest[0] || ".");
  const result: InitResult = { directory: targetDir, created: [], skipped: [] };

  const dirs = [
    "data/sample",
    "apps/dbt/models/sample/bronze",
    "apps/dbt/models/sample/silver",
    "apps/dbt/models/sample/gold",
    "apps/dbt/macros",
    "apps/dbt/seeds",
    "apps/dbt/snapshots",
    "apps/dbt/tests",
    "apps/dbt/analyses",
    "apps/airflow/dags",
    "skills",
  ];

  const files: Record<string, string> = {
    "apps/dbt/dbt_project.yml": DBI_PROJECT_YML,
    "apps/dbt/profiles.yml": DBT_PROFILES_YML,
    "apps/dbt/models/sample/_sources.yml": SOURCES_YML,
    "apps/dbt/models/sample/schema.yml": SCHEMA_YML,
    "apps/dbt/models/sample/bronze/brz_customers.sql": SAMPLE_BRONZE,
    "apps/dbt/seeds/.gitkeep": GITKEEP,
    "apps/dbt/snapshots/.gitkeep": GITKEEP,
    "apps/airflow/dags/.gitkeep": GITKEEP,
    "data/sample/.gitkeep": GITKEEP,
  };

  // Create directories
  for (const dir of dirs) {
    const full = path.join(targetDir, dir);
    await fs.mkdir(full, { recursive: true });
  }

  // Write files (skip if they already exist)
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(targetDir, rel);
    try {
      await fs.access(full);
      result.skipped.push(rel);
    } catch {
      await fs.writeFile(full, content, "utf-8");
      result.created.push(rel);
    }
  }

  if (jsonMode) {
    output(result);
  } else {
    console.log(`Initialised ClawData project in ${targetDir}\n`);
    if (result.created.length) {
      console.log("Created:");
      result.created.forEach((f) => console.log(`  + ${f}`));
    }
    if (result.skipped.length) {
      console.log("Skipped (already exist):");
      result.skipped.forEach((f) => console.log(`  ○ ${f}`));
    }
    console.log("\nNext steps:");
    console.log("  1. Drop CSV files into data/sample/");
    console.log("  2. clawdata data ingest-all");
    console.log("  3. clawdata dbt run");
    console.log("  4. clawdata db tables");
  }
}
