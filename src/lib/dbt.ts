import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import * as http from "http";

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
    this.projectDir = path.resolve(process.env.DBT_PROJECT_DIR || "./apps/dbt");
    this.profilesDir = path.resolve(process.env.DBT_PROFILES_DIR || "./apps/dbt");
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
    const gen = await this.runCommand("dbt docs generate");
    if (!gen.success) return gen;
    // Inline manifest + catalog into index.html so it works via file:// too
    await this.inlineDocsData();
    return gen;
  }

  /**
   * Replace placeholder strings in the generated index.html with actual JSON
   * from manifest.json and catalog.json.  This produces a self-contained HTML
   * file that works when opened directly (file://) without a server.
   */
  async inlineDocsData(): Promise<void> {
    const targetDir = path.join(this.projectDir, "target");
    const htmlPath = path.join(targetDir, "index.html");
    const manifestPath = path.join(targetDir, "manifest.json");
    const catalogPath = path.join(targetDir, "catalog.json");

    const [htmlRaw, manifestRaw, catalogRaw] = await Promise.all([
      fs.readFile(htmlPath, "utf-8"),
      fs.readFile(manifestPath, "utf-8").catch(() => "{}"),
      fs.readFile(catalogPath, "utf-8").catch(() => "{}"),
    ]);

    const html = htmlRaw
      .replace('"MANIFEST.JSON INLINE DATA"', () => manifestRaw.trim())
      .replace('"CATALOG.JSON INLINE DATA"', () => catalogRaw.trim());

    await fs.writeFile(htmlPath, html);
  }

  async docsServe(port = 8080): Promise<DbtRunResult> {
    const gen = await this.docs();
    if (!gen.success) return gen;

    const targetDir = path.join(this.projectDir, "target");

    return new Promise((resolve) => {
      const MIME: Record<string, string> = {
        ".html": "text/html",
        ".js": "application/javascript",
        ".json": "application/json",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".png": "image/png",
      };

      const server = http.createServer(async (req, res) => {
        const url = (req.url || "/").split("?")[0].split("#")[0];
        const filePath = path.join(targetDir, url === "/" ? "index.html" : url);
        try {
          const data = await fs.readFile(filePath);
          const ext = path.extname(filePath);
          res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
          res.end(data);
        } catch {
          res.writeHead(404);
          res.end("Not found");
        }
      });

      server.listen(port, () => {
        resolve({
          success: true,
          output: `dbt docs serving at http://localhost:${port}\n${gen.output}`,
        });
      });

      server.on("error", (err: Error) => {
        resolve({ success: false, output: `Failed to start server: ${err.message}` });
      });
    });
  }

  get docsDir(): string {
    return path.join(this.projectDir, "target");
  }

  async seed(): Promise<DbtRunResult> {
    return this.runCommand("dbt seed");
  }

  async snapshot(): Promise<DbtRunResult> {
    return this.runCommand("dbt snapshot");
  }

  async sourceFreshness(): Promise<DbtRunResult> {
    return this.runCommand("dbt source freshness");
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
