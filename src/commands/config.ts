/**
 * `clawdata config` — view and edit environment configuration.
 *
 * Lists all ClawData-relevant env vars and their current values.
 * Optionally set a value: `clawdata config set DB_PATH /tmp/test.duckdb`
 */

import * as fs from "fs/promises";
import * as path from "path";
import { jsonMode, output, table as outputTable, die } from "../lib/output.js";

/** Config keys that ClawData understands. */
export const CONFIG_KEYS = [
  "CLAWDATA_ROOT",
  "DB_PATH",
  "DATA_FOLDER",
  "DBT_PROJECT_DIR",
  "DBT_PROFILES_DIR",
  "AIRFLOW_DAGS_FOLDER",
] as const;

export type ConfigKey = (typeof CONFIG_KEYS)[number];

export interface ConfigEntry {
  key: ConfigKey;
  value: string;
  source: "env" | "default" | "dotfile";
}

/**
 * Path to `.clawdata` dotfile in the project root (sibling of package.json).
 */
function dotfilePath(): string {
  const root =
    process.env.CLAWDATA_ROOT ||
    path.resolve(path.dirname(new URL(import.meta.url).pathname) + "/../..");
  return path.join(root, ".clawdata");
}

/**
 * Read key=value pairs from `.clawdata` file (if it exists).
 */
async function readDotfile(): Promise<Record<string, string>> {
  try {
    const raw = await fs.readFile(dotfilePath(), "utf-8");
    const entries: Record<string, string> = {};
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      entries[key] = val;
    }
    return entries;
  } catch {
    return {};
  }
}

/**
 * Write key=value pairs to `.clawdata` file.
 */
async function writeDotfile(entries: Record<string, string>): Promise<void> {
  const lines = Object.entries(entries).map(([k, v]) => `${k}=${v}`);
  await fs.writeFile(dotfilePath(), lines.join("\n") + "\n", "utf-8");
}

/**
 * Resolve all config values, merging env > dotfile > defaults.
 */
export async function resolveConfig(): Promise<ConfigEntry[]> {
  const dotVals = await readDotfile();
  const result: ConfigEntry[] = [];

  for (const key of CONFIG_KEYS) {
    if (process.env[key]) {
      result.push({ key, value: process.env[key]!, source: "env" });
    } else if (dotVals[key]) {
      result.push({ key, value: dotVals[key], source: "dotfile" });
    } else {
      result.push({ key, value: "(not set)", source: "default" });
    }
  }

  return result;
}

export async function configCommand(
  sub: string | undefined,
  rest: string[]
): Promise<void> {
  switch (sub) {
    case "set": {
      const key = rest[0] as ConfigKey | undefined;
      const val = rest[1];
      if (!key || !val) {
        die("Usage: clawdata config set <KEY> <VALUE>");
      }
      if (!CONFIG_KEYS.includes(key)) {
        die(`Unknown config key: ${key}\nValid keys: ${CONFIG_KEYS.join(", ")}`);
      }
      const existing = await readDotfile();
      existing[key] = val;
      await writeDotfile(existing);
      if (jsonMode) {
        output({ key, value: val, saved: true });
      } else {
        console.log(`✓ ${key}=${val}  (saved to .clawdata)`);
      }
      return;
    }

    case "get": {
      const key = rest[0] as ConfigKey | undefined;
      if (!key) die("Usage: clawdata config get <KEY>");
      const entries = await resolveConfig();
      const entry = entries.find((e) => e.key === key);
      if (!entry) die(`Unknown config key: ${key}`);
      if (jsonMode) {
        output(entry);
      } else {
        console.log(entry.value);
      }
      return;
    }

    case "path": {
      if (jsonMode) {
        output({ path: dotfilePath() });
      } else {
        console.log(dotfilePath());
      }
      return;
    }

    case "help":
    case "--help":
    case "-h":
      printConfigHelp();
      return;

    case undefined:
    default: {
      // Default: show all config
      if (sub && sub !== "list") {
        console.error(`Unknown config command: ${sub}\n`);
      }
      const entries = await resolveConfig();
      if (jsonMode) {
        output(entries);
      } else {
        outputTable(entries as unknown as Record<string, unknown>[]);
      }
      return;
    }
  }
}

function printConfigHelp(): void {
  console.log("Usage: clawdata config [subcommand]\n");
  console.log("Subcommands:");
  console.log("  (none)             Show all configuration values");
  console.log("  get <KEY>          Print a single value");
  console.log("  set <KEY> <VALUE>  Set a value (saved to .clawdata file)");
  console.log("  path               Print path to .clawdata dotfile");
  console.log("\nConfig keys:");
  CONFIG_KEYS.forEach((k) => console.log(`  ${k}`));
}
