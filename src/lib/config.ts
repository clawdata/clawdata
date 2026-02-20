/**
 * clawdata.yml — project-level configuration file support.
 *
 * Provides a structured YAML config alternative to .clawdata env dotfile.
 * Settings in clawdata.yml are merged with env vars and .clawdata,
 * with env vars taking highest priority.
 *
 * Example clawdata.yml:
 *   project:
 *     name: my-project
 *     version: "1.0"
 *   paths:
 *     db_path: data/warehouse.duckdb
 *     data_folder: data/sample
 *     dbt_project_dir: apps/dbt
 *   skills:
 *     - dbt
 *     - duckdb
 *   dbt:
 *     target: dev
 *     threads: 4
 */

import * as fs from "fs/promises";
import * as path from "path";

export interface ClawdataConfig {
  project?: {
    name?: string;
    version?: string;
    description?: string;
  };
  paths?: {
    db_path?: string;
    data_folder?: string;
    dbt_project_dir?: string;
    dbt_profiles_dir?: string;
    airflow_dags_folder?: string;
  };
  skills?: string[];
  dbt?: {
    target?: string;
    threads?: number;
    models_dir?: string;
  };
  [key: string]: unknown;
}

/**
 * Resolve the path to clawdata.yml in the project root.
 */
export function configFilePath(root?: string): string {
  const base =
    root ||
    process.env.CLAWDATA_ROOT ||
    path.resolve(path.dirname(new URL(import.meta.url).pathname) + "/../..");
  return path.join(base, "clawdata.yml");
}

/**
 * Lightweight YAML parser — handles the subset we generate:
 * top-level keys, one level of nested keys, and arrays with `- ` prefix.
 * No external dependency needed.
 */
export function parseSimpleYaml(raw: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let currentSection: string | null = null;
  const lines = raw.split("\n");

  for (const line of lines) {
    // Skip blank lines and comments
    if (!line.trim() || line.trim().startsWith("#")) continue;

    // Top-level key (no indentation)
    const topMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)/);
    if (topMatch && !line.startsWith(" ") && !line.startsWith("\t")) {
      const key = topMatch[1];
      const val = topMatch[2].trim();
      if (val) {
        // Inline value — strip quotes
        result[key] = val.replace(/^["']|["']$/g, "");
        currentSection = null;
      } else {
        // Start of a section (nested keys or array)
        result[key] = {};
        currentSection = key;
      }
      continue;
    }

    // Nested key or array item (indented)
    if (currentSection) {
      const trimmed = line.trim();

      // Array item: - value
      if (trimmed.startsWith("- ")) {
        const val = trimmed.slice(2).trim().replace(/^["']|["']$/g, "");
        if (!Array.isArray(result[currentSection])) {
          result[currentSection] = [];
        }
        (result[currentSection] as unknown[]).push(val);
        continue;
      }

      // Nested key: key: value
      const nestedMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)/);
      if (nestedMatch) {
        const key = nestedMatch[1];
        let val: string | number = nestedMatch[2].trim().replace(/^["']|["']$/g, "");
        // Parse numeric values
        if (/^\d+$/.test(val)) {
          (result[currentSection] as Record<string, unknown>)[key] = parseInt(val, 10);
        } else {
          (result[currentSection] as Record<string, unknown>)[key] = val;
        }
      }
    }
  }

  return result;
}

/**
 * Serialize a config object to simple YAML.
 */
export function serializeSimpleYaml(config: Record<string, unknown>): string {
  const lines: string[] = [];

  for (const [key, value] of Object.entries(config)) {
    if (value === null || value === undefined) continue;

    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) {
        lines.push(`  - ${item}`);
      }
    } else if (typeof value === "object") {
      lines.push(`${key}:`);
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (v !== null && v !== undefined) {
          lines.push(`  ${k}: ${v}`);
        }
      }
    } else {
      lines.push(`${key}: ${value}`);
    }
  }

  return lines.join("\n") + "\n";
}

/**
 * Load and parse clawdata.yml. Returns null if the file doesn't exist.
 */
export async function loadConfig(root?: string): Promise<ClawdataConfig | null> {
  const cfgPath = configFilePath(root);
  try {
    const raw = await fs.readFile(cfgPath, "utf-8");
    return parseSimpleYaml(raw) as ClawdataConfig;
  } catch {
    return null;
  }
}

/**
 * Save a config object to clawdata.yml.
 */
export async function saveConfig(
  config: ClawdataConfig,
  root?: string
): Promise<string> {
  const cfgPath = configFilePath(root);
  const yaml = serializeSimpleYaml(config as Record<string, unknown>);
  await fs.writeFile(cfgPath, yaml, "utf-8");
  return cfgPath;
}

/**
 * Apply paths from clawdata.yml to process.env (only if not already set).
 * Returns the number of env vars populated.
 */
export function applyConfigToEnv(config: ClawdataConfig): number {
  if (!config.paths) return 0;

  const mapping: Record<string, string> = {
    db_path: "DB_PATH",
    data_folder: "DATA_FOLDER",
    dbt_project_dir: "DBT_PROJECT_DIR",
    dbt_profiles_dir: "DBT_PROFILES_DIR",
    airflow_dags_folder: "AIRFLOW_DAGS_FOLDER",
  };

  let count = 0;
  for (const [yamlKey, envKey] of Object.entries(mapping)) {
    const val = (config.paths as Record<string, string>)[yamlKey];
    if (val && !process.env[envKey]) {
      process.env[envKey] = val;
      count++;
    }
  }

  return count;
}
