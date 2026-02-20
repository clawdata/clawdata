/**
 * Tests for DatabaseManager — new methods: sampleTable, profileTable, exportQuery.
 * Also tests type safety of getInfo returning DatabaseInfo.
 * Feature: Type safety, db sample, db profile, db export
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { DatabaseManager } from "../../src/lib/database.js";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

const TEST_DB = path.join(os.tmpdir(), `clawdata_test_${Date.now()}.duckdb`);

describe("DatabaseManager", () => {
  let db: DatabaseManager;

  beforeAll(async () => {
    process.env.DB_PATH = TEST_DB;
    db = new DatabaseManager();
    await db.initialize();

    // Create and populate a test table
    await db.execute(`
      CREATE TABLE test_customers (
        id INTEGER,
        name VARCHAR,
        email VARCHAR,
        country VARCHAR,
        spend DECIMAL(10,2)
      )
    `);
    await db.execute(`
      INSERT INTO test_customers VALUES
        (1, 'Alice', 'alice@example.com', 'US', 150.00),
        (2, 'Bob', 'bob@example.com', 'UK', 250.50),
        (3, 'Charlie', NULL, 'US', 75.00),
        (4, 'Diana', 'diana@example.com', 'AU', 320.00),
        (5, 'Eve', 'eve@example.com', 'US', 95.00),
        (6, 'Frank', 'frank@example.com', 'UK', 180.00),
        (7, 'Grace', 'grace@example.com', 'AU', NULL)
    `);
  });

  afterAll(async () => {
    await db.close();
    try { await fs.unlink(TEST_DB); } catch {}
    try { await fs.unlink(TEST_DB + ".wal"); } catch {}
  });

  // ── getInfo (type safety) ────────────────────────────────────────

  describe("getInfo", () => {
    it("returns properly typed DatabaseInfo", async () => {
      const info = await db.getInfo();
      expect(info.type).toBe("duckdb");
      expect(typeof info.tables).toBe("number");
      expect(info.tables).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(info.tableList)).toBe(true);
      expect(info.tableList[0]).toHaveProperty("table_name");
      expect(info.tableList[0]).toHaveProperty("table_type");
    });
  });

  // ── query with generics ─────────────────────────────────────────

  describe("query<T>", () => {
    it("returns typed results", async () => {
      const rows = await db.query<{ id: number; name: string }>(
        "SELECT id, name FROM test_customers WHERE id = 1"
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe("Alice");
    });
  });

  // ── sampleTable ──────────────────────────────────────────────────

  describe("sampleTable", () => {
    it("returns default 5 rows", async () => {
      const rows = await db.sampleTable("test_customers");
      expect(rows.length).toBe(5);
    });

    it("respects custom limit", async () => {
      const rows = await db.sampleTable("test_customers", 3);
      expect(rows.length).toBe(3);
    });

    it("returns all rows when limit exceeds count", async () => {
      const rows = await db.sampleTable("test_customers", 100);
      expect(rows.length).toBe(7);
    });

    it("returns records with expected columns", async () => {
      const rows = await db.sampleTable("test_customers", 1);
      expect(rows[0]).toHaveProperty("id");
      expect(rows[0]).toHaveProperty("name");
      expect(rows[0]).toHaveProperty("email");
    });
  });

  // ── profileTable ─────────────────────────────────────────────────

  describe("profileTable", () => {
    it("returns a profile for each column", async () => {
      const profiles = await db.profileTable("test_customers");
      expect(profiles.length).toBe(5); // id, name, email, country, spend
    });

    it("detects null counts correctly", async () => {
      const profiles = await db.profileTable("test_customers");
      const emailProfile = profiles.find((p) => p.column_name === "email");
      expect(emailProfile).toBeDefined();
      expect(Number(emailProfile!.null_count)).toBe(1); // Charlie has no email
    });

    it("detects distinct counts", async () => {
      const profiles = await db.profileTable("test_customers");
      const countryProfile = profiles.find((p) => p.column_name === "country");
      expect(countryProfile).toBeDefined();
      expect(Number(countryProfile!.distinct_count)).toBe(3); // US, UK, AU
    });

    it("reports min/max values", async () => {
      const profiles = await db.profileTable("test_customers");
      const idProfile = profiles.find((p) => p.column_name === "id");
      expect(idProfile).toBeDefined();
      expect(idProfile!.min_value).toBe("1");
      expect(idProfile!.max_value).toBe("7");
    });

    it("includes data_type", async () => {
      const profiles = await db.profileTable("test_customers");
      const idProfile = profiles.find((p) => p.column_name === "id");
      expect(idProfile!.data_type).toBe("INTEGER");
    });

    it("throws for nonexistent table", async () => {
      await expect(db.profileTable("nonexistent_table")).rejects.toThrow();
    });
  });

  // ── exportQuery ──────────────────────────────────────────────────

  describe("exportQuery", () => {
    const exportDir = path.join(os.tmpdir(), `clawdata_export_${Date.now()}`);

    beforeAll(async () => {
      await fs.mkdir(exportDir, { recursive: true });
    });

    afterAll(async () => {
      try { await fs.rm(exportDir, { recursive: true, force: true }); } catch {}
    });

    it("exports CSV", async () => {
      const file = path.join(exportDir, "out.csv");
      const result = await db.exportQuery("SELECT * FROM test_customers", file, "csv");
      expect(result).toContain("Exported");
      const content = await fs.readFile(file, "utf-8");
      expect(content).toContain("Alice");
      expect(content).toContain("id"); // header
    });

    it("exports JSON", async () => {
      const file = path.join(exportDir, "out.json");
      await db.exportQuery("SELECT * FROM test_customers WHERE id = 1", file, "json");
      const content = await fs.readFile(file, "utf-8");
      const data = JSON.parse(`[${content.trim().split("\n").join(",")}]`);
      expect(data[0].name).toBe("Alice");
    });

    it("exports Parquet", async () => {
      const file = path.join(exportDir, "out.parquet");
      await db.exportQuery("SELECT * FROM test_customers", file, "parquet");
      const stat = await fs.stat(file);
      expect(stat.size).toBeGreaterThan(0);
    });
  });

  // ── reset ────────────────────────────────────────────────────────

  describe("reset", () => {
    it("removes the database file", async () => {
      // Use a separate DB for reset test
      const resetPath = path.join(os.tmpdir(), `clawdata_reset_${Date.now()}.duckdb`);
      const origEnv = process.env.DB_PATH;
      process.env.DB_PATH = resetPath;

      const resetDb = new DatabaseManager();
      await resetDb.initialize();
      await resetDb.execute("CREATE TABLE t (x INT)");

      const result = await resetDb.reset();
      expect(result).toContain("Removed");

      // File should not exist
      await expect(fs.access(resetPath)).rejects.toThrow();
      process.env.DB_PATH = origEnv;
    });
  });
});
