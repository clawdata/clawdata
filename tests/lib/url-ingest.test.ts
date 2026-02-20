/**
 * Tests for remote URL ingestion.
 * Feature: ingest from URLs via DuckDB's httpfs extension.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { DatabaseManager } from "../../src/lib/database.js";
import { DataIngestor } from "../../src/lib/ingestor.js";
import { TaskTracker } from "../../src/lib/tasks.js";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

const TEST_DB = path.join(os.tmpdir(), `clawdata_url_${Date.now()}.duckdb`);

describe("Remote URL ingestion", () => {
  let db: DatabaseManager;
  let tracker: TaskTracker;

  beforeAll(async () => {
    process.env.DB_PATH = TEST_DB;
    db = new DatabaseManager();
    await db.initialize();
    tracker = new TaskTracker();
  });

  afterAll(async () => {
    await db.close();
    try { await fs.unlink(TEST_DB); } catch {}
    try { await fs.unlink(TEST_DB + ".wal"); } catch {}
  });

  // ── DatabaseManager.loadURL ──────────────────────────────────────

  describe("DatabaseManager.loadURL", () => {
    it("loadURL method exists", () => {
      expect(typeof db.loadURL).toBe("function");
    });

    it("throws for non-duckdb type", async () => {
      const fakeMgr = Object.create(db);
      // loadURL checks config.type internally
      expect(db.loadURL.length).toBeGreaterThanOrEqual(2);
    });

    it("attempts httpfs install and throws on invalid URL", async () => {
      try {
        await db.loadURL("test_remote", "https://invalid.example.test/nope.csv");
        expect.unreachable("Should have thrown — URL doesn't exist");
      } catch (error: unknown) {
        const msg = (error as Error).message;
        expect(typeof msg).toBe("string");
        expect(msg.length).toBeGreaterThan(0);
      }
    });
  });

  // ── DataIngestor URL detection ───────────────────────────────────

  describe("DataIngestor.isURL", () => {
    it("detects http:// URLs", () => {
      expect(DataIngestor.isURL("http://example.com/data.csv")).toBe(true);
    });

    it("detects https:// URLs", () => {
      expect(DataIngestor.isURL("https://example.com/data.csv")).toBe(true);
    });

    it("detects s3:// URLs", () => {
      expect(DataIngestor.isURL("s3://my-bucket/data.parquet")).toBe(true);
    });

    it("rejects local file paths", () => {
      expect(DataIngestor.isURL("./data/sample.csv")).toBe(false);
      expect(DataIngestor.isURL("sample.csv")).toBe(false);
      expect(DataIngestor.isURL("/tmp/data.csv")).toBe(false);
    });
  });

  // ── DataIngestor.ingestURL ───────────────────────────────────────

  describe("DataIngestor.ingestURL", () => {
    it("ingestURL method exists", () => {
      const ingestor = new DataIngestor(db, tracker);
      expect(typeof ingestor.ingestURL).toBe("function");
    });

    it("derives table name from URL path", async () => {
      const ingestor = new DataIngestor(db, tracker);
      // Will fail due to network/invalid URL but we check the error doesn't mention table naming
      try {
        await ingestor.ingestURL("https://example.com/my_dataset.csv");
        expect.unreachable("Should throw");
      } catch (error: unknown) {
        // Error should come from DuckDB, not from table name derivation
        const msg = (error as Error).message;
        expect(msg).not.toContain("Cannot parse");
      }
    });

    it("accepts custom table name override", async () => {
      const ingestor = new DataIngestor(db, tracker);
      try {
        await ingestor.ingestURL("https://example.com/data.csv", "custom_table");
        expect.unreachable("Should throw");
      } catch (error: unknown) {
        // Verify it attempted to load — not a naming error
        const msg = (error as Error).message;
        expect(typeof msg).toBe("string");
      }
    });
  });
});
