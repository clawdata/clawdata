/**
 * Unified log viewer — aggregates logs from dbt, CLI, and Airflow.
 */

import * as fs from "fs/promises";
import * as path from "path";

export interface LogEntry {
  source: string;
  timestamp: string;
  line: string;
}

export interface LogSource {
  name: string;
  path: string;
}

export class LogManager {
  private sources: LogSource[] = [];

  constructor(rootDir?: string) {
    const root = rootDir || process.env.CLAWDATA_ROOT || ".";
    // Register known log sources
    this.sources = [
      { name: "dbt", path: path.join(root, "templates/dbt/logs/dbt.log") },
      { name: "cli", path: path.join(root, "userdata/config/cli.log") },
      { name: "airflow", path: path.join(root, "templates/airflow/logs/scheduler.log") },
    ];
  }

  /** Add a custom log source. */
  addSource(name: string, logPath: string): void {
    this.sources.push({ name, path: logPath });
  }

  /** Get all registered log sources. */
  getSources(): LogSource[] {
    return [...this.sources];
  }

  /**
   * Read the last N lines from a log source.
   * Returns an empty array if the file doesn't exist.
   */
  async tail(sourceName: string, lines: number = 50): Promise<LogEntry[]> {
    const source = this.sources.find((s) => s.name === sourceName);
    if (!source) throw new Error(`Unknown log source: ${sourceName}`);

    try {
      const content = await fs.readFile(source.path, "utf-8");
      const allLines = content.split("\n").filter((l) => l.trim().length > 0);
      const tailLines = allLines.slice(-lines);
      return tailLines.map((line) => {
        // Attempt to extract timestamp from common log formats
        const tsMatch = line.match(/^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})/);
        return {
          source: source.name,
          timestamp: tsMatch ? tsMatch[1] : "",
          line,
        };
      });
    } catch {
      return [];
    }
  }

  /**
   * Read the last N lines from all available log sources, merged and sorted.
   */
  async tailAll(lines: number = 50): Promise<LogEntry[]> {
    const all: LogEntry[] = [];
    for (const source of this.sources) {
      const entries = await this.tail(source.name, lines);
      all.push(...entries);
    }
    // Sort by timestamp (entries without timestamps go to the end)
    return all.sort((a, b) => {
      if (!a.timestamp && !b.timestamp) return 0;
      if (!a.timestamp) return 1;
      if (!b.timestamp) return -1;
      return a.timestamp.localeCompare(b.timestamp);
    });
  }

  /**
   * Search all log sources for lines matching a pattern.
   */
  async grep(pattern: string, lines: number = 200): Promise<LogEntry[]> {
    const regex = new RegExp(pattern, "i");
    const all = await this.tailAll(lines);
    return all.filter((e) => regex.test(e.line));
  }

  /** Write to the CLI log. */
  async log(message: string): Promise<void> {
    const cliSource = this.sources.find((s) => s.name === "cli");
    if (!cliSource) return;
    const dir = path.dirname(cliSource.path);
    await fs.mkdir(dir, { recursive: true });
    const ts = new Date().toISOString();
    await fs.appendFile(cliSource.path, `${ts} ${message}\n`, "utf-8");
  }
}
