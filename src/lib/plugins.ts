/**
 * Plugin architecture — discover, load, and register third-party skill plugins.
 *
 * Plugins are npm packages that follow the naming convention `clawdata-skill-<name>`.
 * They export a `register(ctx)` function and an optional `PluginManifest` object.
 *
 * Discovery order:
 *   1. Packages listed in `clawdata.yml` → `plugins` key
 *   2. Packages matching `clawdata-skill-*` found in node_modules
 *
 * Usage:
 *   clawdata plugin list          — show discovered plugins
 *   clawdata plugin install <pkg> — npm install + register
 */

import * as fs from "fs/promises";
import * as path from "path";

export interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  commands?: string[];
}

export interface PluginContext {
  root: string;
  version: string;
  registerCommand: (name: string, handler: PluginCommandHandler) => void;
}

export type PluginCommandHandler = (args: string[]) => Promise<void>;
export type PluginRegisterFn = (ctx: PluginContext) => void | Promise<void>;

export interface PluginEntry {
  name: string;
  packageName: string;
  manifest?: PluginManifest;
  loaded: boolean;
  error?: string;
}

export class PluginManager {
  private plugins: Map<string, PluginEntry> = new Map();
  private commands: Map<string, PluginCommandHandler> = new Map();
  private root: string;
  private version: string;

  constructor(root: string, version: string = "1.0.0") {
    this.root = root;
    this.version = version;
  }

  /**
   * Discover plugins from node_modules matching `clawdata-skill-*`.
   */
  async discover(): Promise<string[]> {
    const nodeModules = path.join(this.root, "node_modules");
    const discovered: string[] = [];

    try {
      const entries = await fs.readdir(nodeModules);
      for (const entry of entries) {
        if (entry.startsWith("clawdata-skill-")) {
          discovered.push(entry);
        }
        // Also check scoped packages: @org/clawdata-skill-*
        if (entry.startsWith("@")) {
          try {
            const scopedEntries = await fs.readdir(path.join(nodeModules, entry));
            for (const scoped of scopedEntries) {
              if (scoped.startsWith("clawdata-skill-")) {
                discovered.push(`${entry}/${scoped}`);
              }
            }
          } catch {
            // Skip unreadable scoped dirs
          }
        }
      }
    } catch {
      // No node_modules — that's fine
    }

    return discovered;
  }

  /**
   * Load a plugin from a config array (package names).
   */
  async loadFromConfig(pluginNames: string[]): Promise<void> {
    for (const pkg of pluginNames) {
      await this.loadPlugin(pkg);
    }
  }

  /**
   * Load a single plugin by package name.
   */
  async loadPlugin(packageName: string): Promise<PluginEntry> {
    const shortName = packageName.replace(/^(@[^/]+\/)?clawdata-skill-/, "");
    const entry: PluginEntry = {
      name: shortName,
      packageName,
      loaded: false,
    };

    try {
      // Try to read the package's manifest (package.json → clawdata field)
      const pkgJsonPath = path.join(this.root, "node_modules", packageName, "package.json");
      const pkgJson = JSON.parse(await fs.readFile(pkgJsonPath, "utf-8"));

      entry.manifest = {
        name: pkgJson.clawdata?.name || shortName,
        version: pkgJson.version || "0.0.0",
        description: pkgJson.description,
        commands: pkgJson.clawdata?.commands,
      };

      // Dynamically import the plugin
      const modulePath = path.join(this.root, "node_modules", packageName);
      const mod = await import(modulePath);

      if (typeof mod.register === "function") {
        const ctx = this.createContext();
        await mod.register(ctx);
        entry.loaded = true;
      } else {
        entry.error = "Plugin does not export a register() function";
      }
    } catch (err) {
      entry.error = err instanceof Error ? err.message : String(err);
    }

    this.plugins.set(entry.name, entry);
    return entry;
  }

  /**
   * Create the context object passed to plugin register functions.
   */
  private createContext(): PluginContext {
    return {
      root: this.root,
      version: this.version,
      registerCommand: (name: string, handler: PluginCommandHandler) => {
        this.commands.set(name, handler);
      },
    };
  }

  /**
   * Check if a plugin-registered command exists.
   */
  hasCommand(name: string): boolean {
    return this.commands.has(name);
  }

  /**
   * Execute a plugin-registered command.
   */
  async runCommand(name: string, args: string[]): Promise<void> {
    const handler = this.commands.get(name);
    if (!handler) throw new Error(`Unknown plugin command: ${name}`);
    await handler(args);
  }

  /**
   * List all discovered/loaded plugins.
   */
  list(): PluginEntry[] {
    return [...this.plugins.values()];
  }

  /**
   * Get registered command names from all plugins.
   */
  registeredCommands(): string[] {
    return [...this.commands.keys()];
  }
}
