/**
 * `clawdata logs` — unified log viewer across CLI, dbt, and Airflow.
 */

import { LogManager } from "../lib/logger.js";
import { jsonMode, output } from "../lib/output.js";

export async function logsCommand(
  sub: string | undefined,
  rest: string[]
): Promise<void> {
  const logManager = new LogManager();

  switch (sub) {
    case "tail": {
      const source = rest[0];
      const lines = rest[1] ? parseInt(rest[1], 10) : 50;
      if (source) {
        const entries = await logManager.tail(source, lines);
        if (jsonMode) {
          output(entries);
        } else if (!entries.length) {
          console.log(`No logs found for source: ${source}`);
        } else {
          entries.forEach((e) => console.log(`[${e.source}] ${e.line}`));
        }
      } else {
        const entries = await logManager.tailAll(lines);
        if (jsonMode) {
          output(entries);
        } else if (!entries.length) {
          console.log("No log entries found.");
        } else {
          entries.forEach((e) => console.log(`[${e.source}] ${e.line}`));
        }
      }
      return;
    }
    case "grep": {
      const pattern = rest[0];
      if (!pattern) {
        console.error("Error: Usage: logs grep <pattern>");
        process.exit(1);
      }
      const entries = await logManager.grep(pattern);
      if (jsonMode) {
        output(entries);
      } else if (!entries.length) {
        console.log("No matching log entries.");
      } else {
        entries.forEach((e) => console.log(`[${e.source}] ${e.line}`));
      }
      return;
    }
    case "sources": {
      const sources = logManager.getSources();
      if (jsonMode) {
        output(sources);
      } else {
        console.log("Log sources:");
        sources.forEach((s) => console.log(`  ${s.name.padEnd(10)} ${s.path}`));
      }
      return;
    }
    default:
      if (sub && sub !== "help") {
        console.error(`Error: Unknown logs command: ${sub}\n`);
      }
      console.log("Usage: clawdata logs <command>\n");
      console.log("Commands:");
      console.log("  tail [source] [n]  Show last N lines (default 50) from a source or all");
      console.log("  grep <pattern>     Search all logs for a pattern");
      console.log("  sources            List registered log sources");
      console.log("\nSources: dbt, cli, airflow");
      console.log("\nExamples:");
      console.log("  clawdata logs tail");
      console.log("  clawdata logs tail dbt 100");
      console.log('  clawdata logs grep "ERROR"');
      if (sub && sub !== "help") process.exit(1);
      return;
  }
}
