import { DuckDBInstance, DuckDBConnection } from "@duckdb/node-api";
import * as fs from "fs/promises";
import * as path from "path";

export type DatabaseType = "duckdb" | "snowflake" | "postgres" | "bigquery";

export interface DatabaseConfig {
  type: DatabaseType;
  path?: string;
  connectionString?: string;
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

  async query(sql: string): Promise<any[]> {
    if (this.config.type === "duckdb") {
      return this.queryDuckDB(sql);
    }
    throw new Error(`Query not implemented for ${this.config.type}`);
  }

  private async queryDuckDB(sql: string): Promise<any[]> {
    const conn = await this.getConnection();
    const reader = await conn.runAndReadAll(sql);
    return reader.getRowObjectsJson() as any[];
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

  async getInfo(): Promise<any> {
    if (this.config.type === "duckdb") {
      const tables = await this.query(`
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
    return { type: this.config.type, status: "connected" };
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
}
