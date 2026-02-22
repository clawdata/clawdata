#!/usr/bin/env node

/**
 * CLI entry point for clawdata.
 * Focused on Mission Control and OpenClaw skill setup.
 *
 * Usage:  clawdata <command> [args...] [--json]
 */

import { DatabaseManager } from "./lib/database.js";
import { TaskTracker } from "./lib/tasks.js";
import { DataIngestor } from "./lib/ingestor.js";
import { jsonMode, output, die } from "./lib/output.js";
import { doctorCommand } from "./commands/doctor.js";
import { runInteractive, runNonInteractive } from "./tui/skills.js";
import * as path from "path";

const VERSION = "1.0.0";

// ── paths ────────────────────────────────────────────────────────────

const ROOT = path.resolve(
  process.env.CLAWDATA_ROOT || path.dirname(new URL(import.meta.url).pathname) + "/.."
);

if (!process.env.DB_PATH) process.env.DB_PATH = path.join(ROOT, "userdata/warehouse.duckdb");
if (!process.env.DBT_PROJECT_DIR) process.env.DBT_PROJECT_DIR = path.join(ROOT, "templates/dbt");
if (!process.env.DBT_PROFILES_DIR) process.env.DBT_PROFILES_DIR = path.join(ROOT, "templates/dbt");
if (!process.env.DATA_FOLDER) process.env.DATA_FOLDER = path.join(ROOT, "templates/sampledata");
if (!process.env.AIRFLOW_DAGS_FOLDER) process.env.AIRFLOW_DAGS_FOLDER = path.join(ROOT, "templates/airflow/dags");

// ── services (needed by doctor) ──────────────────────────────────────

const dbManager = new DatabaseManager();
const taskTracker = new TaskTracker();
const dataIngestor = new DataIngestor(dbManager, taskTracker);

// ── arg parsing ──────────────────────────────────────────────────────

const argv = process.argv.filter((a) => a !== "--json" && a !== "--verbose" && a !== "-V");
const fmtIdx = argv.indexOf("--format");
if (fmtIdx !== -1) argv.splice(fmtIdx, 2);
const [, , cmd, sub, ...rest] = argv;

// ── dispatch ─────────────────────────────────────────────────────────

async function main(): Promise<void> {
  switch (cmd) {
    case "setup": {
      if (sub === "--yes" || sub === "-y" || process.argv.includes("--yes")) {
        runNonInteractive(ROOT);
      } else {
        await runInteractive(ROOT);
      }
      console.log("");
      await doctorCommand(dataIngestor);
      return;
    }

    case "skills": {
      if (sub === "--yes" || sub === "-y" || process.argv.includes("--yes")) {
        runNonInteractive(ROOT);
      } else {
        await runInteractive(ROOT);
      }
      return;
    }

    case "mission-control":
    case "mc": {
      const { missionControlCommand } = await import("./mission-control/server.js");
      return missionControlCommand(rest, ROOT);
    }

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
clawdata — data skills for OpenClaw  (v${VERSION})

Usage: clawdata <command> [args...] [--json]

Getting started:
  1. clawdata setup            Configure skills and verify prerequisites
  2. clawdata mc               Launch Mission Control dashboard

Mission Control:
  mission-control [--port N]   Launch the Mission Control dashboard
  mc                           Alias for mission-control

Setup & skills:
  setup                        Interactive first-run wizard — picks skills,
                               installs dependencies, links to OpenClaw
  setup --yes                  Non-interactive: enable all detected skills
  skills                       Add or remove skill packs (dbt, Airflow, etc.)
  doctor                       Verify prerequisites & config

Other:
  version                      Print version
  help                         This message

Flags:
  --json                       Machine-readable JSON output

Environment variables (all auto-detected, override if needed):
  CLAWDATA_ROOT                Project root
  DB_PATH                      DuckDB file path (userdata/warehouse.duckdb)
  DBT_PROJECT_DIR              dbt project directory (templates/dbt)
  DBT_PROFILES_DIR             dbt profiles directory (templates/dbt)
  DATA_FOLDER                  Sample data folder (templates/sampledata)
  AIRFLOW_DAGS_FOLDER          Airflow DAGs directory (templates/airflow/dags)
`);
}

// ── run ──────────────────────────────────────────────────────────────

main()
  .catch((err) => {
    console.error(`Fatal: ${err.message || err}`);
    process.exit(1);
  })
  .finally(() => dbManager.close());
