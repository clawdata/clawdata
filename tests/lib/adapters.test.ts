import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

import {
  createAdapter,
  supportedAdapters,
  DuckDBAdapter,
  PostgresAdapter,
  SnowflakeAdapter,
  BigQueryAdapter,
  DatabaseAdapter,
} from "../../src/lib/adapters.js";

/* ──────────────── factory ──────────────── */
describe("createAdapter", () => {
  it("returns DuckDBAdapter for duckdb type", () => {
    const a = createAdapter({ type: "duckdb", path: ":memory:" });
    expect(a).toBeInstanceOf(DuckDBAdapter);
    expect(a.type).toBe("duckdb");
  });

  it("returns PostgresAdapter for postgres type", () => {
    const a = createAdapter({ type: "postgres", connectionString: "pg://localhost/test" });
    expect(a).toBeInstanceOf(PostgresAdapter);
    expect(a.type).toBe("postgres");
  });

  it("returns SnowflakeAdapter for snowflake type", () => {
    const a = createAdapter({ type: "snowflake", connectionString: "sf://account" });
    expect(a).toBeInstanceOf(SnowflakeAdapter);
    expect(a.type).toBe("snowflake");
  });

  it("returns BigQueryAdapter for bigquery type", () => {
    const a = createAdapter({ type: "bigquery", connectionString: "my-project" });
    expect(a).toBeInstanceOf(BigQueryAdapter);
    expect(a.type).toBe("bigquery");
  });

  it("throws for unsupported type", () => {
    expect(() =>
      createAdapter({ type: "mysql" as any })
    ).toThrow("Unsupported database type");
  });
});

describe("supportedAdapters", () => {
  it("lists all 4 types", () => {
    const types = supportedAdapters();
    expect(types).toContain("duckdb");
    expect(types).toContain("postgres");
    expect(types).toContain("snowflake");
    expect(types).toContain("bigquery");
    expect(types.length).toBe(4);
  });
});

/* ──────────────── DuckDB adapter (live) ──────────────── */
describe("DuckDBAdapter", () => {
  let adapter: DuckDBAdapter;
  let tmpDir: string;
  let dbPath: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "claw-adapt-"));
    dbPath = path.join(tmpDir, "test.duckdb");
    adapter = new DuckDBAdapter({ type: "duckdb", path: dbPath });
  });

  afterEach(async () => {
    if (adapter.isConnected()) await adapter.disconnect();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("connects and disconnects", async () => {
    expect(adapter.isConnected()).toBe(false);
    await adapter.connect();
    expect(adapter.isConnected()).toBe(true);
    await adapter.disconnect();
    expect(adapter.isConnected()).toBe(false);
  });

  it("query returns rows", async () => {
    await adapter.connect();
    const result = await adapter.query<{ n: number }>("SELECT 42 AS n");
    expect(result.rows).toEqual([{ n: 42 }]);
    expect(result.rowCount).toBe(1);
  });

  it("execute creates a table", async () => {
    await adapter.connect();
    await adapter.execute("CREATE TABLE t1 (id INTEGER, name VARCHAR)");
    await adapter.execute("INSERT INTO t1 VALUES (1, 'alice')");
    const { rows } = await adapter.query<{ id: number; name: string }>("SELECT * FROM t1");
    expect(rows).toEqual([{ id: 1, name: "alice" }]);
  });

  it("listTables returns created tables", async () => {
    await adapter.connect();
    await adapter.execute("CREATE TABLE foo (x INT)");
    await adapter.execute("CREATE TABLE bar (y INT)");
    const tables = await adapter.listTables();
    const names = tables.map((t) => t.table_name).sort();
    expect(names).toEqual(["bar", "foo"]);
  });

  it("info reflects state", async () => {
    await adapter.connect();
    await adapter.execute("CREATE TABLE tbl (a INT)");
    const inf = await adapter.info();
    expect(inf.type).toBe("duckdb");
    expect(inf.connected).toBe(true);
    expect(inf.tables).toBe(1);
  });

  it("throws on query when not connected", async () => {
    await expect(adapter.query("SELECT 1")).rejects.toThrow("not connected");
  });

  it("works with :memory: path", async () => {
    const mem = new DuckDBAdapter({ type: "duckdb", path: ":memory:" });
    await mem.connect();
    const { rows } = await mem.query<{ v: number }>("SELECT 99 AS v");
    expect(rows[0].v).toBe(99);
    await mem.disconnect();
  });
});

/* ──────────────── Stub adapters ──────────────── */
describe("PostgresAdapter", () => {
  it("requires connectionString to connect", async () => {
    const a = new PostgresAdapter({ type: "postgres" });
    await expect(a.connect()).rejects.toThrow("connectionString");
  });

  it("marks connected after connect()", async () => {
    const a = new PostgresAdapter({ type: "postgres", connectionString: "pg://localhost" });
    await a.connect();
    expect(a.isConnected()).toBe(true);
    await a.disconnect();
    expect(a.isConnected()).toBe(false);
  });

  it("query throws driver-required error", async () => {
    const a = new PostgresAdapter({ type: "postgres", connectionString: "x" });
    await a.connect();
    await expect(a.query("SELECT 1")).rejects.toThrow("pg driver");
  });

  it("info returns type and connected status", async () => {
    const a = new PostgresAdapter({ type: "postgres", connectionString: "x" });
    await a.connect();
    const inf = await a.info();
    expect(inf.type).toBe("postgres");
    expect(inf.connected).toBe(true);
  });
});

describe("SnowflakeAdapter", () => {
  it("requires connectionString", async () => {
    const a = new SnowflakeAdapter({ type: "snowflake" });
    await expect(a.connect()).rejects.toThrow("connectionString");
  });

  it("info works when connected", async () => {
    const a = new SnowflakeAdapter({ type: "snowflake", connectionString: "sf://x" });
    await a.connect();
    expect(a.isConnected()).toBe(true);
    const inf = await a.info();
    expect(inf.type).toBe("snowflake");
  });
});

describe("BigQueryAdapter", () => {
  it("requires connectionString", async () => {
    const a = new BigQueryAdapter({ type: "bigquery" });
    await expect(a.connect()).rejects.toThrow("connectionString");
  });

  it("info works when connected", async () => {
    const a = new BigQueryAdapter({ type: "bigquery", connectionString: "proj-id" });
    await a.connect();
    expect(a.isConnected()).toBe(true);
    const inf = await a.info();
    expect(inf.type).toBe("bigquery");
  });
});
