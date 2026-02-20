import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";

const execAsync = promisify(exec);

export interface DbtRunResult {
  success: boolean;
  output: string;
  results?: Record<string, unknown>;
}

export interface DbtModelNode {
  name: string;
  resource_type: string;
  depends_on?: { nodes?: string[] };
  fqn?: string[];
  path?: string;
}

export class DbtManager {
  private projectDir: string;
  private profilesDir: string;

  constructor() {
    this.projectDir = process.env.DBT_PROJECT_DIR || "./apps/dbt";
    this.profilesDir = process.env.DBT_PROFILES_DIR || "./apps/dbt";
  }

  private async runCommand(command: string): Promise<DbtRunResult> {
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: this.projectDir,
        env: { ...process.env, DBT_PROFILES_DIR: this.profilesDir },
      });
      return { success: true, output: stdout + (stderr || "") };
    } catch (error: any) {
      return { success: false, output: error.stdout + error.stderr };
    }
  }

  async run(models?: string[]): Promise<DbtRunResult> {
    const modelArg = models?.length ? ` --select ${models.join(" ")}` : "";
    return this.runCommand(`dbt run${modelArg}`);
  }

  async test(models?: string[]): Promise<DbtRunResult> {
    const modelArg = models?.length ? ` --select ${models.join(" ")}` : "";
    return this.runCommand(`dbt test${modelArg}`);
  }

  async compile(): Promise<DbtRunResult> {
    return this.runCommand("dbt compile");
  }

  async debug(): Promise<DbtRunResult> {
    return this.runCommand("dbt debug");
  }

  async docs(): Promise<DbtRunResult> {
    return this.runCommand("dbt docs generate");
  }

  async seed(): Promise<DbtRunResult> {
    return this.runCommand("dbt seed");
  }

  async snapshot(): Promise<DbtRunResult> {
    return this.runCommand("dbt snapshot");
  }

  async getManifest(): Promise<{ nodes?: Record<string, DbtModelNode>; error?: string }> {
    try {
      const manifestPath = path.join(this.projectDir, "target", "manifest.json");
      const content = await fs.readFile(manifestPath, "utf-8");
      return JSON.parse(content);
    } catch {
      return { error: "Manifest not found. Run 'dbt compile' or 'dbt run' first." };
    }
  }

  async listModels(): Promise<string[]> {
    const manifest = await this.getManifest();
    if (manifest.error) return [];
    return Object.entries(manifest.nodes || {})
      .filter(([key]) => key.startsWith("model."))
      .map(([, node]) => node.name);
  }

  async listTests(): Promise<string[]> {
    const manifest = await this.getManifest();
    if (manifest.error) return [];
    return Object.entries(manifest.nodes || {})
      .filter(([key]) => key.startsWith("test."))
      .map(([, node]) => node.name);
  }

  async getLineage(): Promise<{ nodes: { name: string; key: string }[]; edges: { from: string; to: string }[] }> {
    const manifest = await this.getManifest();
    if (manifest.error) return { nodes: [], edges: [] };

    const modelNodes = Object.entries(manifest.nodes || {})
      .filter(([key]) => key.startsWith("model."));

    const nodes = modelNodes.map(([key, node]) => ({ name: node.name, key }));
    const edges: { from: string; to: string }[] = [];

    for (const [key, node] of modelNodes) {
      for (const dep of node.depends_on?.nodes || []) {
        if (dep.startsWith("model.")) {
          edges.push({ from: dep, to: key });
        }
      }
    }

    return { nodes, edges };
  }
}
