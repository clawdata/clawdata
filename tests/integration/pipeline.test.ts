/**
 * Integration test — end-to-end: ingest sample data → query → verify tables.
 *
 * Uses a temporary DuckDB database to avoid polluting the real warehouse.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { DatabaseManager } from "../../src/lib/database.js";
import { TaskTracker } from "../../src/lib/tasks.js";
import { DataIngestor } from "../../src/lib/ingestor.js";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

describe("integration: ingest → query", () => {
  let tmpDbPath: string;
  let origDbPath: string | undefined;
  let db: DatabaseManager;
  let tracker: TaskTracker;
  let ingestor: DataIngestor;

  beforeAll(async () => {
    // Create a temp DuckDB so we don't touch real warehouse
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "clawdata-int-"));
    tmpDbPath = path.join(tmpDir, "test.duckdb");
    origDbPath = process.env.DB_PATH;
    process.env.DB_PATH = tmpDbPath;

    db = new DatabaseManager();
    tracker = new TaskTracker();
    ingestor = new DataIngestor(db, tracker);
  });

  afterAll(async () => {
    await db.close();
    if (origDbPath !== undefined) {
      process.env.DB_PATH = origDbPath;
    } else {
      delete process.env.DB_PATH;
    }
    await fs.rm(path.dirname(tmpDbPath), { recursive: true, force: true });
  });

  it("should ingest all sample CSV files", async () => {
    const result = await ingestor.ingestAll();
    expect(result).toBeTruthy();
    // Should mention loading files
    expect(result.toLowerCase()).toMatch(/loaded|created|ingested|sample/i);
  });

  it("should have tables after ingestion", async () => {
    const info = await db.getInfo();
    expect(info.tables).toBeGreaterThan(0);
  });

  it("should be able to query sample_customers", async () => {
    const rows = await db.query<{ id: number }>(
      "SELECT id FROM sample_customers LIMIT 3"
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toHaveProperty("id");
  });

  it("should be able to query sample_orders", async () => {
    const rows = await db.query<{ order_id: number }>(
      "SELECT order_id FROM sample_orders LIMIT 3"
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it("sample table should return rows", async () => {
    const rows = await db.sampleTable("sample_customers", 2);
    expect(rows.length).toBeLessThanOrEqual(2);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("profile table should return column stats", async () => {
    const profiles = await db.profileTable("sample_customers");
    expect(profiles.length).toBeGreaterThan(0);
    expect(profiles[0]).toHaveProperty("column_name");
    expect(profiles[0]).toHaveProperty("null_count");
    expect(profiles[0]).toHaveProperty("distinct_count");
  });

  it("export should write to CSV file", async () => {
    const outPath = path.join(path.dirname(tmpDbPath), "export.csv");
    await db.exportQuery("SELECT 1 as x, 2 as y", outPath, "csv");
    const content = await fs.readFile(outPath, "utf-8");
    expect(content).toContain("x");
  });
});
