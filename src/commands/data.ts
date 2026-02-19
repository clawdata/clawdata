/**
 * `clawdata data` subcommands — list, ingest, ingest-all.
 */

import { DatabaseManager } from "../lib/database.js";
import { DataIngestor } from "../lib/ingestor.js";
import { jsonMode, output } from "../lib/output.js";

export async function dataCommand(
  sub: string | undefined,
  rest: string[],
  ingestor: DataIngestor,
  dbManager?: DatabaseManager
): Promise<void> {
  switch (sub) {
    case "list": {
      const files = await ingestor.listFiles();
      if (jsonMode) {
        output({ files, count: files.length });
      } else if (!files.length) {
        console.log("No data files found in data/ folder.");
        console.log("Drop CSV, JSON, or Parquet files into data/ to get started.");
      } else {
        console.log("Data files ready for ingestion:");
        files.forEach((f) => console.log(`  • ${f}`));
      }
      return;
    }
    case "ingest": {
      const fileName = rest[0];
      if (!fileName) {
        console.error("Error: Usage: data ingest <filename> [tablename]");
        process.exit(1);
      }
      const result = await ingestor.ingestFile(fileName, rest[1]);
      if (jsonMode) {
        output({ success: true, message: result });
      } else {
        console.log(`✓ ${result}`);
      }
      return;
    }
    case "ingest-all": {
      const result = await ingestor.ingestAll();
      if (jsonMode) {
        output({ success: true, message: result || "No files to ingest." });
      } else {
        console.log(result || "No files to ingest.");
      }
      return;
    }
    case "reset": {
      if (!dbManager) {
        console.error("Error: Database manager not available.");
        process.exit(1);
      }
      const result = await dbManager.reset();
      if (jsonMode) {
        output({ success: true, message: result });
      } else {
        console.log(`✓ ${result}`);
        console.log("Run 'clawdata data ingest-all' to reload data.");
      }
      return;
    }
    default:
      if (sub) {
        console.error(`Error: Unknown data command: ${sub}\n`);
      }
      console.log("Usage: clawdata data <command>\n");
      console.log("Commands:");
      console.log("  list          List data files available for ingestion");
      console.log("  ingest <file> Load a single file into DuckDB [tablename]");
      console.log("  ingest-all    Load all data files into DuckDB");
      console.log("  reset         Delete the DuckDB warehouse and start fresh");
      console.log("\nExamples:");
      console.log("  clawdata data list");
      console.log("  clawdata data ingest sample_customers.csv");
      console.log("  clawdata data ingest sample_orders.csv orders");
      console.log("  clawdata data ingest-all");
      console.log("  clawdata data reset");
      if (sub) process.exit(1);
      return;
  }
}
