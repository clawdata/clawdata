/**
 * Multi-database adapter pattern.
 *
 * Provides a common DatabaseAdapter interface that abstracts away the
 * engine-specific details. Concrete adapters implement the contract for
 * DuckDB, Postgres, Snowflake, BigQuery, etc.
 *
 * Usage:
 *   const adapter = createAdapter({ type: "duckdb", path: "./data/warehouse.duckdb" });
 *   await adapter.connect();
 *   const rows = await adapter.query("SELECT 1 AS n");
 *   await adapter.disconnect();
 */

import { DatabaseType, DatabaseConfig, ColumnInfo } from "./database.js";

/* ─────────────── Shared types ─────────────── */

export interface AdapterQueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
}

export interface AdapterTableInfo {
  table_name: string;
  table_type: string;
}

export interface AdapterInfo {
  type: DatabaseType;
  connected: boolean;
  tables: number;
  meta?: Record<string, unknown>;
}

/* ─────────────── Abstract adapter ─────────────── */

export interface DatabaseAdapter {
  readonly type: DatabaseType;

  /** Establish the connection. */
  connect(): Promise<void>;

  /** Gracefully close. */
  disconnect(): Promise<void>;

  /** Execute a read query. */
  query<T = Record<string, unknown>>(sql: string): Promise<AdapterQueryResult<T>>;

  /** Execute a write / DDL statement (no result set). */
  execute(sql: string): Promise<void>;

  /** List tables visible in the default schema. */
  listTables(): Promise<AdapterTableInfo[]>;

  /** Return adapter metadata (type, connected, table count, etc.). */
  info(): Promise<AdapterInfo>;

  /** Whether the adapter is currently connected. */
  isConnected(): boolean;
}

/* ─────────────── DuckDB adapter ─────────────── */

export class DuckDBAdapter implements DatabaseAdapter {
  readonly type: DatabaseType = "duckdb";
  private instance: import("@duckdb/node-api").DuckDBInstance | null = null;
  private connection: import("@duckdb/node-api").DuckDBConnection | null = null;
  private config: DatabaseConfig;

  constructor(config: DatabaseConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    const { DuckDBInstance } = await import("@duckdb/node-api");
    const fsModule = await import("fs/promises");
    const pathModule = await import("path");
    const dbPath = this.config.path || ":memory:";
    if (dbPath !== ":memory:") {
      await fsModule.mkdir(pathModule.dirname(dbPath), { recursive: true });
    }
    this.instance = await DuckDBInstance.create(dbPath);
    this.connection = await this.instance.connect();
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      this.connection.closeSync();
      this.connection = null;
    }
    if (this.instance) {
      this.instance.closeSync();
      this.instance = null;
    }
  }

  isConnected(): boolean {
    return this.connection !== null;
  }

  async query<T = Record<string, unknown>>(sql: string): Promise<AdapterQueryResult<T>> {
    if (!this.connection) throw new Error("DuckDB adapter not connected");
    const reader = await this.connection.runAndReadAll(sql);
    const rows = reader.getRowObjectsJson() as T[];
    return { rows, rowCount: rows.length };
  }

  async execute(sql: string): Promise<void> {
    if (!this.connection) throw new Error("DuckDB adapter not connected");
    await this.connection.run(sql);
  }

  async listTables(): Promise<AdapterTableInfo[]> {
    const { rows } = await this.query<AdapterTableInfo>(
      `SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = 'main' ORDER BY table_name`
    );
    return rows;
  }

  async info(): Promise<AdapterInfo> {
    const tables = await this.listTables();
    return {
      type: this.type,
      connected: this.isConnected(),
      tables: tables.length,
      meta: { path: this.config.path },
    };
  }
}

/* ─────────────── Postgres stub adapter ─────────────── */

export class PostgresAdapter implements DatabaseAdapter {
  readonly type: DatabaseType = "postgres";
  private _connected = false;
  private config: DatabaseConfig;

  constructor(config: DatabaseConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (!this.config.connectionString) {
      throw new Error("Postgres adapter requires connectionString");
    }
    // In a real implementation this would use pg Pool
    this._connected = true;
  }

  async disconnect(): Promise<void> {
    this._connected = false;
  }

  isConnected(): boolean {
    return this._connected;
  }

  async query<T = Record<string, unknown>>(_sql: string): Promise<AdapterQueryResult<T>> {
    throw new Error("Postgres query requires pg driver (not bundled). Install 'pg' to use.");
  }

  async execute(_sql: string): Promise<void> {
    throw new Error("Postgres execute requires pg driver (not bundled). Install 'pg' to use.");
  }

  async listTables(): Promise<AdapterTableInfo[]> {
    throw new Error("Postgres listTables requires pg driver (not bundled). Install 'pg' to use.");
  }

  async info(): Promise<AdapterInfo> {
    return {
      type: this.type,
      connected: this._connected,
      tables: 0,
      meta: { connectionString: this.config.connectionString ? "(set)" : "(not set)" },
    };
  }
}

/* ─────────────── Snowflake stub adapter ─────────────── */

export class SnowflakeAdapter implements DatabaseAdapter {
  readonly type: DatabaseType = "snowflake";
  private _connected = false;
  private config: DatabaseConfig;

  constructor(config: DatabaseConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (!this.config.connectionString) {
      throw new Error("Snowflake adapter requires connectionString");
    }
    this._connected = true;
  }

  async disconnect(): Promise<void> {
    this._connected = false;
  }

  isConnected(): boolean {
    return this._connected;
  }

  async query<T = Record<string, unknown>>(_sql: string): Promise<AdapterQueryResult<T>> {
    throw new Error("Snowflake query requires snowflake-sdk (not bundled).");
  }

  async execute(_sql: string): Promise<void> {
    throw new Error("Snowflake execute requires snowflake-sdk (not bundled).");
  }

  async listTables(): Promise<AdapterTableInfo[]> {
    throw new Error("Snowflake listTables requires snowflake-sdk (not bundled).");
  }

  async info(): Promise<AdapterInfo> {
    return { type: this.type, connected: this._connected, tables: 0 };
  }
}

/* ─────────────── BigQuery stub adapter ─────────────── */

export class BigQueryAdapter implements DatabaseAdapter {
  readonly type: DatabaseType = "bigquery";
  private _connected = false;
  private config: DatabaseConfig;

  constructor(config: DatabaseConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (!this.config.connectionString) {
      throw new Error("BigQuery adapter requires connectionString (project ID)");
    }
    this._connected = true;
  }

  async disconnect(): Promise<void> {
    this._connected = false;
  }

  isConnected(): boolean {
    return this._connected;
  }

  async query<T = Record<string, unknown>>(_sql: string): Promise<AdapterQueryResult<T>> {
    throw new Error("BigQuery query requires @google-cloud/bigquery (not bundled).");
  }

  async execute(_sql: string): Promise<void> {
    throw new Error("BigQuery execute requires @google-cloud/bigquery (not bundled).");
  }

  async listTables(): Promise<AdapterTableInfo[]> {
    throw new Error("BigQuery listTables requires @google-cloud/bigquery (not bundled).");
  }

  async info(): Promise<AdapterInfo> {
    return { type: this.type, connected: this._connected, tables: 0 };
  }
}

/* ─────────────── Factory ─────────────── */

export function createAdapter(config: DatabaseConfig): DatabaseAdapter {
  switch (config.type) {
    case "duckdb":
      return new DuckDBAdapter(config);
    case "postgres":
      return new PostgresAdapter(config);
    case "snowflake":
      return new SnowflakeAdapter(config);
    case "bigquery":
      return new BigQueryAdapter(config);
    default:
      throw new Error(`Unsupported database type: ${config.type}`);
  }
}

/** Enumerate all supported adapter types. */
export function supportedAdapters(): DatabaseType[] {
  return ["duckdb", "postgres", "snowflake", "bigquery"];
}
