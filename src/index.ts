/**
 * Programmatic API — re-exports the core modules.
 *
 * OpenClaw calls the skill via `exec` through the CLI (cli.ts).
 * This file is kept for anyone importing the library directly.
 */

export { DatabaseManager } from "./lib/database.js";
export { DbtManager } from "./lib/dbt.js";
export { DataIngestor } from "./lib/ingestor.js";
export { TaskTracker } from "./lib/tasks.js";
