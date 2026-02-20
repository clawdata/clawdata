/**
 * Connection profiles — manage named database connections.
 *
 * Profiles are stored in `.clawdata/connections.json` in the project root.
 * Each profile has: name, type (duckdb|snowflake|postgres), and type-specific settings.
 *
 * Usage:
 *   clawdata connect add <name> --type duckdb --path data/warehouse.duckdb
 *   clawdata connect add <name> --type snowflake --account xxx --user yyy --database zzz
 *   clawdata connect list
 *   clawdata connect remove <name>
 *   clawdata connect use <name>
 *   clawdata connect show <name>
 */

import * as fs from "fs/promises";
import * as path from "path";
import { jsonMode, output, die } from "../lib/output.js";

export type ConnectionType = "duckdb" | "snowflake" | "postgres";

export interface ConnectionProfile {
  name: string;
  type: ConnectionType;
  [key: string]: unknown;
}

export interface ConnectionStore {
  active?: string;
  profiles: ConnectionProfile[];
}

function storePath(): string {
  const root =
    process.env.CLAWDATA_ROOT ||
    path.resolve(path.dirname(new URL(import.meta.url).pathname) + "/../..");
  return path.join(root, ".clawdata", "connections.json");
}

async function loadStore(): Promise<ConnectionStore> {
  try {
    const raw = await fs.readFile(storePath(), "utf-8");
    return JSON.parse(raw) as ConnectionStore;
  } catch {
    return { profiles: [] };
  }
}

async function saveStore(store: ConnectionStore): Promise<void> {
  const dir = path.dirname(storePath());
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(storePath(), JSON.stringify(store, null, 2) + "\n", "utf-8");
}

function parseFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--") && i + 1 < args.length) {
      flags[args[i].slice(2)] = args[i + 1];
      i++;
    }
  }
  return flags;
}

export async function connectCommand(
  sub: string | undefined,
  rest: string[]
): Promise<void> {
  switch (sub) {
    case "add": {
      const name = rest[0];
      if (!name || name.startsWith("--")) {
        die("Usage: clawdata connect add <name> --type <type> [options]");
      }
      const flags = parseFlags(rest.slice(1));
      const connType = flags.type as ConnectionType | undefined;
      if (!connType || !["duckdb", "snowflake", "postgres"].includes(connType)) {
        die("--type is required. Valid types: duckdb, snowflake, postgres");
      }

      const store = await loadStore();
      if (store.profiles.find((p) => p.name === name)) {
        die(`Connection profile "${name}" already exists. Remove it first.`);
      }

      const profile: ConnectionProfile = { name, type: connType, ...flags };
      delete (profile as Record<string, unknown>)["type"]; // avoid duplication
      profile.type = connType;

      store.profiles.push(profile);
      if (!store.active) store.active = name;
      await saveStore(store);

      if (jsonMode) {
        output({ added: true, name, type: connType });
      } else {
        console.log(`✓ Added connection: ${name} (${connType})`);
      }
      return;
    }

    case "list": {
      const store = await loadStore();
      if (jsonMode) {
        output({ active: store.active, profiles: store.profiles });
      } else if (!store.profiles.length) {
        console.log("No connection profiles. Add one with: clawdata connect add <name> --type <type>");
      } else {
        console.log("Connection profiles:");
        for (const p of store.profiles) {
          const marker = p.name === store.active ? " (active)" : "";
          console.log(`  • ${p.name} [${p.type}]${marker}`);
        }
      }
      return;
    }

    case "remove": {
      const name = rest[0];
      if (!name) die("Usage: clawdata connect remove <name>");

      const store = await loadStore();
      const idx = store.profiles.findIndex((p) => p.name === name);
      if (idx === -1) die(`Connection profile "${name}" not found.`);

      store.profiles.splice(idx, 1);
      if (store.active === name) {
        store.active = store.profiles[0]?.name;
      }
      await saveStore(store);

      if (jsonMode) {
        output({ removed: true, name });
      } else {
        console.log(`✓ Removed connection: ${name}`);
      }
      return;
    }

    case "use": {
      const name = rest[0];
      if (!name) die("Usage: clawdata connect use <name>");

      const store = await loadStore();
      const profile = store.profiles.find((p) => p.name === name);
      if (!profile) die(`Connection profile "${name}" not found.`);

      store.active = name;
      await saveStore(store);

      if (jsonMode) {
        output({ active: name });
      } else {
        console.log(`✓ Active connection: ${name}`);
      }
      return;
    }

    case "show": {
      const name = rest[0];
      if (!name) die("Usage: clawdata connect show <name>");

      const store = await loadStore();
      const profile = store.profiles.find((p) => p.name === name);
      if (!profile) die(`Connection profile "${name}" not found.`);

      if (jsonMode) {
        output(profile);
      } else {
        console.log(`Connection: ${profile.name}`);
        for (const [k, v] of Object.entries(profile)) {
          if (k === "name") continue;
          console.log(`  ${k}: ${v}`);
        }
      }
      return;
    }

    default:
      if (sub && sub !== "help" && sub !== "--help") {
        console.error(`Unknown connect command: ${sub}\n`);
      }
      console.log("Usage: clawdata connect <command>\n");
      console.log("Commands:");
      console.log("  add <name> --type <type>   Add a connection profile");
      console.log("  list                       List all profiles");
      console.log("  remove <name>              Remove a profile");
      console.log("  use <name>                 Set active connection");
      console.log("  show <name>                Show profile details");
      console.log("\nTypes: duckdb, snowflake, postgres");
      if (sub && sub !== "help" && sub !== "--help") process.exit(1);
      return;
  }
}
