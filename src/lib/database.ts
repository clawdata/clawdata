import { DuckDBInstance, DuckDBConnection } from "@duckdb/node-api";
import * as fs from "fs/promises";
import * as path from "path";

export type DatabaseType = "duckdb" | "snowflake" | "postgres" | "bigquery";

export interface DatabaseConfig {
  type: DatabaseType;
  path?: string;
  connectionString?: string;
}

export interface TableInfo {
  table_name: string;
  table_type: string;
}

export interface DatabaseInfo {
  type: DatabaseType;
  path?: string;
  tables: number;
  tableList: TableInfo[];
  status?: string;
}

export interface ColumnInfo {
  column_name: string;
  data_type: string;
  is_nullable: string;
}

export interface ColumnProfile {
  column_name: string;
  data_type: string;
  null_count: number;
  distinct_count: number;
  min_value: string | null;
  max_value: string | null;
}

export interface TableSnapshot {
  table_name: string;
  row_count: number;
  columns: ColumnInfo[];
  captured_at: string;
}

export interface TableDiff {
  table_name: string;
  before: { row_count: number; column_count: number };
  after: { row_count: number; column_count: number };
  row_delta: number;
  added_columns: string[];
  removed_columns: string[];
}

export class DatabaseManager {
  private instance: DuckDBInstance | null = null;
  private connection: DuckDBConnection | null = null;
  private config: DatabaseConfig = {
    type: "duckdb",
    path: process.env.DB_PATH || "./data/warehouse.duckdb",
  };

  async initialize(): Promise<void> {
    if (this.config.type === "duckdb") {
      await this.initializeDuckDB();
    }
  }

  private async initializeDuckDB(): Promise<void> {
    const dbPath = this.config.path!;
    const dbDir = path.dirname(dbPath);
    await fs.mkdir(dbDir, { recursive: true });
    this.instance = await DuckDBInstance.create(dbPath);
    this.connection = await this.instance.connect();
  }

  private async getConnection(): Promise<DuckDBConnection> {
    if (!this.connection) {
      await this.initialize();
    }
    return this.connection!;
  }

  async query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
    if (this.config.type === "duckdb") {
      return this.queryDuckDB<T>(sql);
    }
    throw new Error(`Query not implemented for ${this.config.type}`);
  }

  private async queryDuckDB<T>(sql: string): Promise<T[]> {
    const conn = await this.getConnection();
    const reader = await conn.runAndReadAll(sql);
    return reader.getRowObjectsJson() as T[];
  }

  async execute(sql: string): Promise<void> {
    if (this.config.type === "duckdb") {
      return this.executeDuckDB(sql);
    }
    throw new Error(`Execute not implemented for ${this.config.type}`);
  }

  private async executeDuckDB(sql: string): Promise<void> {
    const conn = await this.getConnection();
    await conn.run(sql);
  }

  async getInfo(): Promise<DatabaseInfo> {
    if (this.config.type === "duckdb") {
      const tables = await this.query<TableInfo>(`
        SELECT table_name, table_type 
        FROM information_schema.tables 
        WHERE table_schema = 'main'
        ORDER BY table_name
      `);
      return {
        type: this.config.type,
        path: this.config.path,
        tables: tables.length,
        tableList: tables,
      };
    }
    return { type: this.config.type, tables: 0, tableList: [], status: "connected" };
  }

  async sampleTable(tableName: string, limit: number = 5): Promise<Record<string, unknown>[]> {
    return this.query(`SELECT * FROM "${tableName}" LIMIT ${limit}`);
  }

  async profileTable(tableName: string): Promise<ColumnProfile[]> {
    const columns = await this.query<ColumnInfo>(
      `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = '${tableName}' AND table_schema = 'main' ORDER BY ordinal_position`
    );
    if (!columns.length) throw new Error(`Table '${tableName}' not found or has no columns.`);

    const profiles: ColumnProfile[] = [];
    for (const col of columns) {
      const stats = await this.query<{
        null_count: number;
        distinct_count: number;
        min_value: string | null;
        max_value: string | null;
      }>(
        `SELECT
           COUNT(*) FILTER (WHERE "${col.column_name}" IS NULL)::INTEGER AS null_count,
           COUNT(DISTINCT "${col.column_name}")::INTEGER AS distinct_count,
           MIN("${col.column_name}")::VARCHAR AS min_value,
           MAX("${col.column_name}")::VARCHAR AS max_value
         FROM "${tableName}"`
      );
      profiles.push({
        column_name: col.column_name,
        data_type: col.data_type,
        ...stats[0],
      });
    }
    return profiles;
  }

  async exportQuery(sql: string, filePath: string, format: "csv" | "json" | "parquet"): Promise<string> {
    switch (format) {
      case "csv":
        await this.execute(`COPY (${sql}) TO '${filePath}' (FORMAT CSV, HEADER)`);
        break;
      case "json":
        await this.execute(`COPY (${sql}) TO '${filePath}' (FORMAT JSON)`);
        break;
      case "parquet":
        await this.execute(`COPY (${sql}) TO '${filePath}' (FORMAT PARQUET)`);
        break;
    }
    return `Exported to ${filePath} (${format})`;
  }

  async loadCSV(tableName: string, filePath: string): Promise<void> {
    if (this.config.type !== "duckdb") throw new Error(`CSV loading not implemented for ${this.config.type}`);
    await this.execute(`CREATE OR REPLACE TABLE ${tableName} AS SELECT * FROM read_csv_auto('${filePath}', header=true)`);
  }

  async loadParquet(tableName: string, filePath: string): Promise<void> {
    if (this.config.type !== "duckdb") throw new Error(`Parquet loading not implemented for ${this.config.type}`);
    await this.execute(`CREATE OR REPLACE TABLE ${tableName} AS SELECT * FROM read_parquet('${filePath}')`);
  }

  async loadJSON(tableName: string, filePath: string): Promise<void> {
    if (this.config.type !== "duckdb") throw new Error(`JSON loading not implemented for ${this.config.type}`);
    await this.execute(`CREATE OR REPLACE TABLE ${tableName} AS SELECT * FROM read_json_auto('${filePath}')`);
  }

  async loadExcel(tableName: string, filePath: string, sheet?: string): Promise<void> {
    if (this.config.type !== "duckdb") throw new Error(`Excel loading not implemented for ${this.config.type}`);
    await this.execute("INSTALL spatial; LOAD spatial;");
    const layer = sheet ? `, layer='${sheet}'` : "";
    await this.execute(`CREATE OR REPLACE TABLE ${tableName} AS SELECT * FROM st_read('${filePath}'${layer})`);
  }

  /**
   * Load data from a remote URL. DuckDB's httpfs extension handles
   * http://, https://, and s3:// paths natively.
   * Format is auto-detected from the URL extension.
   */
  async loadURL(tableName: string, url: string): Promise<void> {
    if (this.config.type !== "duckdb") throw new Error(`URL loading not implemented for ${this.config.type}`);
    await this.execute("INSTALL httpfs; LOAD httpfs;");
    const lower = url.toLowerCase();
    let readFn: string;
    if (lower.endsWith(".parquet")) {
      readFn = `read_parquet('${url}')`;
    } else if (lower.endsWith(".json") || lower.endsWith(".jsonl") || lower.endsWith(".ndjson")) {
      readFn = `read_json_auto('${url}')`;
    } else {
      // Default to CSV for .csv or unknown extensions
      readFn = `read_csv_auto('${url}', header=true)`;
    }
    await this.execute(`CREATE OR REPLACE TABLE ${tableName} AS SELECT * FROM ${readFn}`);
  }

  /**
   * Infer the schema of a file without fully loading it.
   * Returns column names and detected types.
   */
  async inferSchema(filePath: string): Promise<{ column_name: string; data_type: string }[]> {
    if (this.config.type !== "duckdb") throw new Error(`Schema inference not implemented for ${this.config.type}`);
    const ext = filePath.toLowerCase();
    let readFn: string;
    if (ext.endsWith(".parquet")) {
      readFn = `read_parquet('${filePath}')`;
    } else if (ext.endsWith(".json") || ext.endsWith(".jsonl") || ext.endsWith(".ndjson")) {
      readFn = `read_json_auto('${filePath}')`;
    } else {
      readFn = `read_csv_auto('${filePath}', header=true)`;
    }
    return this.query<{ column_name: string; data_type: string }>(
      `SELECT column_name, column_type AS data_type FROM (DESCRIBE SELECT * FROM ${readFn})`
    );
  }

  async reset(): Promise<string> {
    const dbPath = this.config.path!;
    await this.close();
    const removed: string[] = [];
    for (const suffix of ["", ".wal"]) {
      try {
        await fs.unlink(dbPath + suffix);
        removed.push(dbPath + suffix);
      } catch {
        // file may not exist
      }
    }
    return removed.length
      ? `Removed: ${removed.join(", ")}`
      : "No database files found to remove.";
  }

  async close(): Promise<void> {
    if (this.connection && this.config.type === "duckdb") {
      this.connection.closeSync();
      this.connection = null;
    }
    if (this.instance && this.config.type === "duckdb") {
      this.instance.closeSync();
      this.instance = null;
    }
  }

  async snapshotTable(tableName: string): Promise<TableSnapshot> {
    const rows = await this.query<{ cnt: number }>(
      `SELECT COUNT(*)::INTEGER AS cnt FROM "${tableName}"`
    );
    const columns = await this.query<ColumnInfo>(
      `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = '${tableName}' AND table_schema = 'main' ORDER BY ordinal_position`
    );
    return {
      table_name: tableName,
      row_count: rows[0]?.cnt ?? 0,
      columns,
      captured_at: new Date().toISOString(),
    };
  }

  diffSnapshots(before: TableSnapshot, after: TableSnapshot): TableDiff {
    const beforeCols = new Set(before.columns.map((c) => c.column_name));
    const afterCols = new Set(after.columns.map((c) => c.column_name));
    const added = [...afterCols].filter((c) => !beforeCols.has(c));
    const removed = [...beforeCols].filter((c) => !afterCols.has(c));
    return {
      table_name: after.table_name,
      before: { row_count: before.row_count, column_count: before.columns.length },
      after: { row_count: after.row_count, column_count: after.columns.length },
      row_delta: after.row_count - before.row_count,
      added_columns: added,
      removed_columns: removed,
    };
  }

  /**
   * Generate a Markdown data dictionary for all tables in the warehouse.
   * Returns the markdown string.
   */
  async generateDictionary(): Promise<string> {
    const info = await this.getInfo();
    const lines: string[] = [
      "# Data Dictionary",
      "",
      `> Auto-generated on ${new Date().toISOString().slice(0, 10)}`,
      "",
      `**Database:** ${info.type}  `,
      `**Tables:** ${info.tables}`,
      "",
    ];

    for (const tbl of info.tableList) {
      const columns = await this.query<ColumnInfo>(
        `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = '${tbl.table_name}' AND table_schema = 'main' ORDER BY ordinal_position`
      );
      const rowCount = await this.query<{ cnt: number }>(
        `SELECT COUNT(*)::INTEGER AS cnt FROM "${tbl.table_name}"`
      );

      lines.push(`## ${tbl.table_name}`);
      lines.push("");
      lines.push(`**Type:** ${tbl.table_type} | **Rows:** ${rowCount[0]?.cnt ?? 0}`);
      lines.push("");
      lines.push("| Column | Type | Nullable |");
      lines.push("|--------|------|----------|");
      for (const col of columns) {
        lines.push(`| ${col.column_name} | ${col.data_type} | ${col.is_nullable} |`);
      }
      lines.push("");
    }
    return lines.join("\n");
  }
}
