/**
 * `clawdata db` subcommands — query, exec, info, tables, schema, sample, profile, export.
 */

import { DatabaseManager, TableInfo, ColumnInfo, TableSnapshot } from "../lib/database.js";
import { jsonMode, output, table, die } from "../lib/output.js";
import * as fs from "fs/promises";
import * as path from "path";

export async function dbCommand(
  sub: string | undefined,
  rest: string[],
  dbManager: DatabaseManager
): Promise<void> {
  switch (sub) {
    case "query": {
      const sql = rest[0];
      if (!sql) die("Usage: db query \"<sql>\"");
      const rows = await dbManager.query(sql);
      table(rows as Record<string, unknown>[]);
      return;
    }
    case "exec": {
      const sql = rest[0];
      if (!sql) die("Usage: db exec \"<sql>\"");
      await dbManager.execute(sql);
      if (jsonMode) {
        output({ success: true, message: "Statement executed successfully." });
      } else {
        console.log("✓ Statement executed successfully.");
      }
      return;
    }
    case "info": {
      const info = await dbManager.getInfo();
      if (jsonMode) {
        output(info);
      } else {
        console.log(`Database: ${info.type}`);
        console.log(`Path:     ${info.path}`);
        console.log(`Tables:   ${info.tables}`);
        if (info.tableList?.length) {
          info.tableList.forEach((t: TableInfo) =>
            console.log(`  • ${t.table_name} (${t.table_type})`)
          );
        }
      }
      return;
    }
    case "tables": {
      const info = await dbManager.getInfo();
      if (!info.tableList?.length) {
        console.log("No tables. Ingest data first: data ingest-all");
      } else if (jsonMode) {
        output(info.tableList);
      } else {
        info.tableList.forEach((t: TableInfo) => console.log(t.table_name));
      }
      return;
    }
    case "schema": {
      const tbl = rest[0];
      if (!tbl) die("Usage: db schema <table_name>");
      const cols = await dbManager.query<ColumnInfo>(
        `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = '${tbl}' AND table_schema = 'main' ORDER BY ordinal_position`
      );
      if (!cols.length) die(`Table '${tbl}' not found or has no columns.`);
      table(cols as unknown as Record<string, unknown>[]);
      return;
    }
    case "sample": {
      const tbl = rest[0];
      if (!tbl) die("Usage: db sample <table_name> [limit]");
      const limit = rest[1] ? parseInt(rest[1], 10) : 5;
      if (isNaN(limit) || limit < 1) die("Limit must be a positive number.");
      const rows = await dbManager.sampleTable(tbl, limit);
      if (!rows.length) die(`Table '${tbl}' is empty or does not exist.`);
      table(rows as Record<string, unknown>[]);
      return;
    }
    case "profile": {
      const tbl = rest[0];
      if (!tbl) die("Usage: db profile <table_name>");
      const profiles = await dbManager.profileTable(tbl);
      table(profiles as unknown as Record<string, unknown>[]);
      return;
    }
    case "export": {
      const sql = rest[0];
      if (!sql) die("Usage: db export \"<sql>\" --format csv|json|parquet -o <file>");
      const fmtIdx = rest.indexOf("--format");
      const format = fmtIdx !== -1 ? rest[fmtIdx + 1] : "csv";
      if (!["csv", "json", "parquet"].includes(format)) {
        die("Supported formats: csv, json, parquet");
      }
      const outIdx = rest.indexOf("-o");
      const outFile = outIdx !== -1
        ? rest[outIdx + 1]
        : `export_${Date.now()}.${format}`;
      const absPath = path.resolve(outFile);
      const result = await dbManager.exportQuery(sql, absPath, format as "csv" | "json" | "parquet");
      if (jsonMode) {
        output({ success: true, file: absPath, format, message: result });
      } else {
        console.log(`✓ ${result}`);
      }
      return;
    }
    case "dictionary": {
      const md = await dbManager.generateDictionary();
      const outFile = rest[0] || "DATA_DICTIONARY.md";
      const absPath = path.resolve(outFile);
      await fs.writeFile(absPath, md, "utf-8");
      if (jsonMode) {
        output({ success: true, file: absPath, tables: md.match(/^## /gm)?.length ?? 0 });
      } else {
        console.log(`✓ Data dictionary written to ${outFile}`);
      }
      return;
    }
    case "diff": {
      const tbl = rest[0];
      if (!tbl) die("Usage: db diff <table_name> [--before <snapshot.json>]");
      const beforeIdx = rest.indexOf("--before");
      if (beforeIdx !== -1 && rest[beforeIdx + 1]) {
        // Compare against a saved snapshot file
        const snapshotFile = rest[beforeIdx + 1];
        let before: TableSnapshot;
        try {
          const raw = await fs.readFile(path.resolve(snapshotFile), "utf-8");
          before = JSON.parse(raw) as TableSnapshot;
        } catch {
          die(`Cannot read snapshot file: ${snapshotFile}`);
        }
        const after = await dbManager.snapshotTable(tbl);
        const diff = dbManager.diffSnapshots(before, after);
        if (jsonMode) {
          output(diff);
        } else {
          console.log(`Diff for ${diff.table_name}:`);
          console.log(`  Rows:    ${diff.before.row_count} → ${diff.after.row_count} (${diff.row_delta >= 0 ? "+" : ""}${diff.row_delta})`);
          console.log(`  Columns: ${diff.before.column_count} → ${diff.after.column_count}`);
          if (diff.added_columns.length) console.log(`  Added:   ${diff.added_columns.join(", ")}`);
          if (diff.removed_columns.length) console.log(`  Removed: ${diff.removed_columns.join(", ")}`);
          if (!diff.row_delta && !diff.added_columns.length && !diff.removed_columns.length) {
            console.log("  No changes detected.");
          }
        }
      } else {
        // No --before: just capture a snapshot and save it
        const snapshot = await dbManager.snapshotTable(tbl);
        const outFile = `${tbl}_snapshot_${Date.now()}.json`;
        await fs.writeFile(outFile, JSON.stringify(snapshot, null, 2), "utf-8");
        if (jsonMode) {
          output({ snapshot, file: outFile });
        } else {
          console.log(`Snapshot saved to ${outFile}`);
          console.log(`  Table:   ${snapshot.table_name}`);
          console.log(`  Rows:    ${snapshot.row_count}`);
          console.log(`  Columns: ${snapshot.columns.length}`);
          console.log(`\nRe-run with --before ${outFile} after changes to see the diff.`);
        }
      }
      return;
    }
    default:
      if (sub) {
        console.error(`Error: Unknown db command: ${sub}\n`);
      }
      console.log("Usage: clawdata db <command>\n");
      console.log("Commands:");
      console.log('  query "<sql>"    Run a read query and display rows');
      console.log('  exec  "<sql>"    Execute a write statement (DDL/DML)');
      console.log("  info             Show connection info and table count");
      console.log("  tables           List all tables in the warehouse");
      console.log("  schema <table>   Show columns and types for a table");
      console.log("  sample <table> [n]  Show first N rows (default 5)");
      console.log("  profile <table>  Show column-level stats (nulls, distinct, min, max)");
      console.log('  export "<sql>" --format csv|json|parquet -o <file>');
      console.log("  dictionary [file]  Auto-generate DATA_DICTIONARY.md");
      console.log("  diff <table> [--before <snapshot.json>]");
      console.log("\nExamples:");
      console.log('  clawdata db query "SELECT * FROM slv_customers LIMIT 5"');
      console.log('  clawdata db exec  "DROP TABLE IF EXISTS tmp"');
      console.log("  clawdata db tables");
      console.log("  clawdata db schema dim_customers");
      console.log("  clawdata db sample fct_orders 10");
      console.log("  clawdata db profile slv_customers");
      console.log('  clawdata db export "SELECT * FROM dim_customers" --format parquet -o customers.parquet');
      if (sub) process.exit(1);
      return;
  }
}
