/**
 * `clawdata db` subcommands — query, exec, info, tables, schema.
 */

import { DatabaseManager } from "../lib/database.js";
import { jsonMode, output, table, die } from "../lib/output.js";

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
          info.tableList.forEach((t: any) =>
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
        info.tableList.forEach((t: any) => console.log(t.table_name));
      }
      return;
    }
    case "schema": {
      const tbl = rest[0];
      if (!tbl) die("Usage: db schema <table_name>");
      const cols = await dbManager.query(
        `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = '${tbl}' AND table_schema = 'main' ORDER BY ordinal_position`
      );
      if (!cols.length) die(`Table '${tbl}' not found or has no columns.`);
      table(cols as Record<string, unknown>[]);
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
      console.log("\nExamples:");
      console.log('  clawdata db query "SELECT * FROM slv_customers LIMIT 5"');
      console.log('  clawdata db exec  "DROP TABLE IF EXISTS tmp"');
      console.log("  clawdata db tables");
      console.log("  clawdata db schema dim_customers");
      if (sub) process.exit(1);
      return;
  }
}
