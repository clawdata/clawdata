#!/usr/bin/env node

/**
 * CLI entry point for clawdata.
 * Thin dispatcher — each subcommand lives in commands/.
 *
 * Usage:  clawdata <command> [subcommand] [args...] [--json]
 */

import { DatabaseManager } from "./lib/database.js";
import { DbtManager } from "./lib/dbt.js";
import { DataIngestor } from "./lib/ingestor.js";
import { TaskTracker } from "./lib/tasks.js";
import { jsonMode, output, die, verbose } from "./lib/output.js";
import { dataCommand } from "./commands/data.js";
import { dbCommand } from "./commands/db.js";
import { dbtCommand } from "./commands/dbt.js";
import { doctorCommand } from "./commands/doctor.js";
import { runCommand } from "./commands/run.js";
import { initCommand } from "./commands/init.js";
import { configCommand } from "./commands/config.js";
import { completionsCommand } from "./commands/completions.js";
import { watchCommand } from "./commands/watch.js";
import { logsCommand } from "./commands/logs.js";
import { runInteractive, runNonInteractive } from "./tui/skills.js";
import { skillCommand } from "./commands/skill.js";
import { connectCommand } from "./commands/connect.js";
import { updateCommand } from "./commands/update.js";
import { serveCommand } from "./commands/serve.js";
import * as path from "path";

const VERSION = "1.0.0";

// ── paths ────────────────────────────────────────────────────────────

const ROOT = path.resolve(
  process.env.CLAWDATA_ROOT || path.dirname(new URL(import.meta.url).pathname) + "/.."
);

if (!process.env.DB_PATH) process.env.DB_PATH = path.join(ROOT, "data/warehouse.duckdb");
if (!process.env.DBT_PROJECT_DIR) process.env.DBT_PROJECT_DIR = path.join(ROOT, "apps/dbt");
if (!process.env.DBT_PROFILES_DIR) process.env.DBT_PROFILES_DIR = path.join(ROOT, "apps/dbt");
if (!process.env.DATA_FOLDER) process.env.DATA_FOLDER = path.join(ROOT, "data/sample");
if (!process.env.AIRFLOW_DAGS_FOLDER) process.env.AIRFLOW_DAGS_FOLDER = path.join(ROOT, "apps/airflow/dags");

// ── services ─────────────────────────────────────────────────────────

const dbManager = new DatabaseManager();
const dbtManager = new DbtManager();
const taskTracker = new TaskTracker();
const dataIngestor = new DataIngestor(dbManager, taskTracker);

// ── arg parsing ──────────────────────────────────────────────────────

const argv = process.argv.filter((a) => a !== "--json" && a !== "--verbose" && a !== "-V");
// Strip --format <val> pair
const fmtIdx = argv.indexOf("--format");
if (fmtIdx !== -1) argv.splice(fmtIdx, 2);
const [, , cmd, sub, ...rest] = argv;

// ── dispatch ─────────────────────────────────────────────────────────

async function main(): Promise<void> {
  switch (cmd) {
    case "data":
      return dataCommand(sub, rest, dataIngestor, dbManager);

    case "db":
      return dbCommand(sub, rest, dbManager);

    case "dbt":
      return dbtCommand(sub, rest, dbtManager);

    case "run":
      return runCommand(sub, rest, dataIngestor, dbtManager, dbManager);

    case "init":
      return initCommand(sub, rest);

    case "config":
      return configCommand(sub, rest);

    case "completions":
      return completionsCommand(sub, rest);

    case "watch":
      return watchCommand([sub, ...rest].filter(Boolean));

    case "logs":
      return logsCommand(sub, rest);

    case "status": {
      const status = taskTracker.getStatus();
      if (jsonMode) {
        output(status);
      } else {
        console.log(`Tasks — running: ${status.summary.running}, completed: ${status.summary.completed}, failed: ${status.summary.failed}`);
        if (status.active.length) {
          console.log("\nActive:");
          status.active.forEach((t) => console.log(`  ⏳ ${t.name} — ${t.message || t.status}`));
        }
        if (status.completed.length) {
          console.log("\nRecently completed:");
          status.completed.slice(0, 5).forEach((t) => console.log(`  ✓ ${t.name} — ${t.message || "done"}`));
        }
        if (status.failed.length) {
          console.log("\nFailed:");
          status.failed.slice(0, 5).forEach((t) => console.log(`  ✗ ${t.name} — ${t.error}`));
        }
      }
      return;
    }

    case "setup": {
      // Pick skills first, then run doctor for only the enabled ones
      if (sub === "--yes" || sub === "-y" || process.argv.includes("--yes")) {
        runNonInteractive(ROOT);
      } else {
        await runInteractive(ROOT);
      }
      console.log("");
      await doctorCommand(dataIngestor);
      return;
    }

    case "skill":
      return skillCommand(sub, rest);

    case "connect":
      return connectCommand(sub, rest);

    case "skills":
    case "tui": {
      if (sub === "--yes" || sub === "-y" || process.argv.includes("--yes")) {
        runNonInteractive(ROOT);
      } else {
        await runInteractive(ROOT);
      }
      return;
    }

    case "update":
      return updateCommand(sub, rest, VERSION);

    case "serve":
      return serveCommand(rest, dbManager);

    case "doctor":
      return doctorCommand(dataIngestor);

    case "version":
    case "--version":
    case "-v":
      output(jsonMode ? { version: VERSION, root: ROOT } : `clawdata ${VERSION}`);
      return;

    case "help":
    case "--help":
    case "-h":
    case undefined:
      printHelp();
      return;

    default:
      die(`Unknown command: ${cmd}\nRun with --help for usage.`);
  }
}

// ── help ─────────────────────────────────────────────────────────────

function printHelp(): void {
  console.log(`
clawdata — data engineering toolkit for OpenClaw  (v${VERSION})

Usage: clawdata <command> [subcommand] [args...] [--json]

Getting started:
  1. clawdata setup          Configure skills and verify prerequisites
  2. clawdata data ingest-all Load sample CSV data into DuckDB
  3. clawdata dbt run         Build silver & gold tables
  4. clawdata db tables       See what was created

Data — load and manage files in the local DuckDB warehouse:
  data list                    Show CSV/JSON/Parquet files in data/sample/
  data ingest <file> [table]   Load a single file into DuckDB
  data ingest-all              Load every file in data/sample/
  data reset                   Delete the warehouse and start fresh

Database — query DuckDB directly:
  db query "<sql>"             Run a read query (returns rows)
  db exec  "<sql>"             Execute a write statement (DDL/DML)
  db info                      Show connection info and table count
  db tables                    List all tables
  db schema <table>            Show columns for a table
  db sample <table> [n]        Show first N rows (default 5)
  db profile <table>           Column-level stats (nulls, distinct, min, max)
  db export "<sql>" [options]   Export results to CSV/JSON/Parquet
  db diff <table>              Snapshot table or diff against previous snapshot
  db dictionary [file]         Auto-generate a data dictionary (Markdown)

dbt — run data transformations (silver → gold):
  dbt run   [--models m1 m2]   Materialise dbt models
  dbt test  [--models m1 m2]   Run schema & data tests
  dbt compile                  Compile models to raw SQL
  dbt seed                     Load seed CSVs into DuckDB
  dbt docs                     Generate dbt documentation site
  dbt debug                    Verify dbt connection & config
  dbt models                   List available models
  dbt lineage                  Show model dependency graph

Pipeline:
  run                          Full pipeline: ingest → dbt run → dbt test
  watch [dir] [--ext sql,py]   Watch dbt model files for changes
  logs tail [source] [n]       View recent logs (dbt, cli, airflow)
  logs grep <pattern>          Search across all log sources

Project:
  init [dir]                   Scaffold a new ClawData project
  config                       View all environment configuration
  config get <KEY>             Print a single config value
  config set <KEY> <VALUE>     Set a config value (saved to .clawdata)
  completions <shell>          Generate shell completions (bash, zsh, fish)

Setup & skills:
  setup                        Interactive first-run wizard — picks skills,
                               installs dependencies, links to OpenClaw
  setup --yes                  Non-interactive: enable all detected skills
  skills                       Add or remove skill packs (dbt, Airflow, etc.)
  skill create <name>          Scaffold a new skill folder with SKILL.md
  skill list                   List available skills
  doctor                       Verify prerequisites & config

Other:
  status                       Show recent task history
  version                      Print version
  help                         This message

Flags:
  --json                       Machine-readable JSON output
  --format <fmt>               Output format: table, csv, json, markdown
  --verbose, -V                Show detailed execution info

Environment variables (all auto-detected, override if needed):
  CLAWDATA_ROOT                Project root
  DB_PATH                      DuckDB file path
  DATA_FOLDER                  Incoming data folder
  DBT_PROJECT_DIR              dbt project directory
  DBT_PROFILES_DIR             dbt profiles directory
  AIRFLOW_DAGS_FOLDER          Airflow DAGs directory
`);
}

// ── run ──────────────────────────────────────────────────────────────

main()
  .catch((err) => {
    console.error(`Fatal: ${err.message || err}`);
    process.exit(1);
  })
  .finally(() => dbManager.close());
