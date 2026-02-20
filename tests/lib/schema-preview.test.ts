/**
 * Tests for schema inference preview.
 * Feature: show inferred column types before loading a file.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { DatabaseManager } from "../../src/lib/database.js";
import { DataIngestor } from "../../src/lib/ingestor.js";
import { TaskTracker } from "../../src/lib/tasks.js";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

const TEST_DB = path.join(os.tmpdir(), `clawdata_infer_${Date.now()}.duckdb`);
const TEST_DATA_DIR = path.join(os.tmpdir(), `clawdata_infer_data_${Date.now()}`);

describe("Schema inference preview", () => {
  let db: DatabaseManager;

  beforeAll(async () => {
    process.env.DB_PATH = TEST_DB;
    db = new DatabaseManager();
    await db.initialize();
    await fs.mkdir(TEST_DATA_DIR, { recursive: true });

    // Create test CSV
    await fs.writeFile(
      path.join(TEST_DATA_DIR, "users.csv"),
      "id,name,age,active,joined_at\n1,Alice,30,true,2024-01-15\n2,Bob,25,false,2024-02-20\n"
    );

    // Create test JSON
    await fs.writeFile(
      path.join(TEST_DATA_DIR, "events.json"),
      '[{"event":"click","ts":"2024-01-01T10:00:00","count":5},{"event":"view","ts":"2024-01-02T11:00:00","count":12}]\n'
    );
  });

  afterAll(async () => {
    await db.close();
    try { await fs.unlink(TEST_DB); } catch {}
    try { await fs.unlink(TEST_DB + ".wal"); } catch {}
    try { await fs.rm(TEST_DATA_DIR, { recursive: true }); } catch {}
  });

  // ── DatabaseManager.inferSchema ──────────────────────────────────

  describe("DatabaseManager.inferSchema", () => {
    it("inferSchema method exists", () => {
      expect(typeof db.inferSchema).toBe("function");
    });

    it("infers column names from CSV", async () => {
      const schema = await db.inferSchema(path.join(TEST_DATA_DIR, "users.csv"));
      const names = schema.map((c) => c.column_name);
      expect(names).toContain("id");
      expect(names).toContain("name");
      expect(names).toContain("age");
      expect(names).toContain("active");
      expect(names).toContain("joined_at");
    });

    it("infers types from CSV (numeric, varchar, boolean, date)", async () => {
      const schema = await db.inferSchema(path.join(TEST_DATA_DIR, "users.csv"));
      const typeMap = Object.fromEntries(schema.map((c) => [c.column_name, c.data_type]));
      // id should be numeric (BIGINT or INTEGER)
      expect(typeMap.id).toMatch(/INT/i);
      // name should be VARCHAR
      expect(typeMap.name).toMatch(/VARCHAR/i);
      // age should be numeric
      expect(typeMap.age).toMatch(/INT/i);
      // active should be BOOLEAN
      expect(typeMap.active).toMatch(/BOOL/i);
    });

    it("infers column names from JSON", async () => {
      const schema = await db.inferSchema(path.join(TEST_DATA_DIR, "events.json"));
      const names = schema.map((c) => c.column_name);
      expect(names).toContain("event");
      expect(names).toContain("ts");
      expect(names).toContain("count");
    });

    it("returns data_type for each column", async () => {
      const schema = await db.inferSchema(path.join(TEST_DATA_DIR, "events.json"));
      for (const col of schema) {
        expect(col).toHaveProperty("column_name");
        expect(col).toHaveProperty("data_type");
        expect(typeof col.data_type).toBe("string");
        expect(col.data_type.length).toBeGreaterThan(0);
      }
    });
  });

  // ── DataIngestor.previewSchema ───────────────────────────────────

  describe("DataIngestor.previewSchema", () => {
    it("previewSchema method exists", () => {
      const tracker = new TaskTracker();
      process.env.DATA_FOLDER = TEST_DATA_DIR;
      const ingestor = new DataIngestor(db, tracker);
      expect(typeof ingestor.previewSchema).toBe("function");
    });

    it("returns schema for a file in the data folder", async () => {
      const tracker = new TaskTracker();
      process.env.DATA_FOLDER = TEST_DATA_DIR;
      const ingestor = new DataIngestor(db, tracker);
      const schema = await ingestor.previewSchema("users.csv");
      expect(schema.length).toBe(5);
      expect(schema[0]).toHaveProperty("column_name");
      expect(schema[0]).toHaveProperty("data_type");
    });
  });
});
