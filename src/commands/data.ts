/**
 * `clawdata data` subcommands — list, ingest, ingest-all.
 */

import { DatabaseManager } from "../lib/database.js";
import { DataIngestor } from "../lib/ingestor.js";
import { jsonMode, output, table } from "../lib/output.js";
import { generateSampleData } from "../lib/generator.js";
import { downloadDataset, marketplaceCommand } from "../lib/marketplace.js";

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
        console.log("No data files found in data/sample/ folder.");
        console.log("Drop CSV, JSON, or Parquet files into data/sample/ to get started.");
      } else {
        console.log("Data files ready for ingestion:");
        files.forEach((f) => console.log(`  • ${f}`));
      }
      return;
    }
    case "ingest": {
      const fileName = rest[0];
      if (!fileName) {
        console.error("Error: Usage: data ingest <filename|glob|url> [tablename]");
        process.exit(1);
      }
      // Detect URLs
      if (DataIngestor.isURL(fileName)) {
        const result = await ingestor.ingestURL(fileName, rest[1]);
        if (jsonMode) {
          output({ success: true, message: result });
        } else {
          console.log(`✓ ${result}`);
        }
        return;
      }
      // Detect glob patterns
      if (fileName.includes("*") || fileName.includes("?")) {
        const result = await ingestor.ingestGlob(fileName);
        if (jsonMode) {
          output({ success: true, message: result });
        } else {
          console.log(result || "No matching files.");
        }
        return;
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
    case "preview": {
      const fileName = rest[0];
      if (!fileName) {
        console.error("Error: Usage: data preview <filename>");
        process.exit(1);
      }
      const schema = await ingestor.previewSchema(fileName);
      if (jsonMode) {
        output({ file: fileName, columns: schema });
      } else {
        console.log(`Inferred schema for ${fileName}:\n`);
        table(schema as unknown as Record<string, unknown>[]);
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
    case "generate": {
      const rows = parseInt(rest[0] || "100", 10);
      const dir = rest[1] || "data/sample";
      if (isNaN(rows) || rows < 1) {
        console.error("Error: --rows must be a positive integer.");
        process.exit(1);
      }
      const { files } = generateSampleData({ rows, outputDir: dir });
      if (jsonMode) {
        output({ rows, outputDir: dir, files });
      } else {
        console.log(`✓ Generated ${rows} rows of sample data:`);
        files.forEach(f => console.log(`  • ${f}`));
      }
      return;
    }
    case "add": {
      const datasetId = rest[0];
      if (!datasetId) {
        console.error("Error: Usage: clawdata data add <dataset-id>");
        console.error("Run 'clawdata data marketplace' to see available datasets.");
        process.exit(1);
      }
      const targetDir = rest[1] || "data/sample";
      const result = await downloadDataset(datasetId, targetDir);
      if (jsonMode) {
        output({ dataset: datasetId, ...result });
      } else {
        console.log(`✓ Dataset '${datasetId}' added to ${targetDir}/`);
        result.files.forEach(f => console.log(`  • ${f}`));
      }
      return;
    }
    case "marketplace": {
      const marketplaceSub = rest[0];
      const marketplaceRest = rest.slice(1);
      await marketplaceCommand(marketplaceSub, marketplaceRest);
      return;
    }
    default:
      if (sub) {
        console.error(`Error: Unknown data command: ${sub}\n`);
      }
      console.log("Usage: clawdata data <command>\n");
      console.log("Commands:");
      console.log("  list               List data files available for ingestion");
      console.log("  ingest <file>      Load a single file into DuckDB [tablename]");
      console.log("  ingest-all         Load all data files into DuckDB");
      console.log("  preview <file>     Infer schema without loading");
      console.log("  generate [rows]    Generate synthetic e-commerce data");
      console.log("  add <dataset>      Download a dataset from the marketplace");
      console.log("  marketplace        Browse available datasets");
      console.log("  reset              Delete the DuckDB warehouse and start fresh");
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
