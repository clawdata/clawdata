/**
 * Tests for auto-generated data dictionary.
 * Feature: `clawdata db dictionary` generates DATA_DICTIONARY.md from warehouse metadata.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { DatabaseManager } from "../../src/lib/database.js";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

const TEST_DB = path.join(os.tmpdir(), `clawdata_dict_${Date.now()}.duckdb`);

describe("Data dictionary generation", () => {
  let db: DatabaseManager;

  beforeAll(async () => {
    process.env.DB_PATH = TEST_DB;
    db = new DatabaseManager();
    await db.initialize();

    await db.execute(`
      CREATE TABLE customers (
        id INTEGER NOT NULL,
        name VARCHAR NOT NULL,
        email VARCHAR,
        active BOOLEAN DEFAULT true
      )
    `);
    await db.execute(`INSERT INTO customers VALUES (1,'Alice','alice@test.com',true),(2,'Bob',NULL,false)`);

    await db.execute(`
      CREATE TABLE orders (
        order_id INTEGER NOT NULL,
        customer_id INTEGER NOT NULL,
        amount DECIMAL(10,2),
        order_date DATE
      )
    `);
    await db.execute(`INSERT INTO orders VALUES (1,1,99.50,'2024-01-15'),(2,2,150.00,'2024-01-16'),(3,1,75.00,'2024-01-17')`);
  });

  afterAll(async () => {
    await db.close();
    try { await fs.unlink(TEST_DB); } catch {}
    try { await fs.unlink(TEST_DB + ".wal"); } catch {}
  });

  it("generateDictionary method exists", () => {
    expect(typeof db.generateDictionary).toBe("function");
  });

  it("returns markdown string starting with # Data Dictionary", async () => {
    const md = await db.generateDictionary();
    expect(md.startsWith("# Data Dictionary")).toBe(true);
  });

  it("includes database type and table count", async () => {
    const md = await db.generateDictionary();
    expect(md).toContain("**Database:** duckdb");
    expect(md).toContain("**Tables:** 2");
  });

  it("has a section for each table", async () => {
    const md = await db.generateDictionary();
    expect(md).toContain("## customers");
    expect(md).toContain("## orders");
  });

  it("shows row counts per table", async () => {
    const md = await db.generateDictionary();
    // customers has 2 rows, orders has 3
    expect(md).toMatch(/customers[\s\S]*?\*\*Rows:\*\*\s*2/);
    expect(md).toMatch(/orders[\s\S]*?\*\*Rows:\*\*\s*3/);
  });

  it("renders column table with headers", async () => {
    const md = await db.generateDictionary();
    expect(md).toContain("| Column | Type | Nullable |");
    expect(md).toContain("|--------|------|----------|");
  });

  it("lists column details for customers table", async () => {
    const md = await db.generateDictionary();
    expect(md).toContain("| id |");
    expect(md).toContain("| name |");
    expect(md).toContain("| email |");
    expect(md).toContain("| active |");
  });

  it("lists column details for orders table", async () => {
    const md = await db.generateDictionary();
    expect(md).toContain("| order_id |");
    expect(md).toContain("| customer_id |");
    expect(md).toContain("| amount |");
    expect(md).toContain("| order_date |");
  });
});
