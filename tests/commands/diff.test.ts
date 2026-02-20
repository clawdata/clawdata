import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { DatabaseManager } from "../../src/lib/database.js";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

describe("db diff — snapshotTable & diffSnapshots", () => {
  let tmpDir: string;
  let db: DatabaseManager;
  let origDbPath: string | undefined;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "clawdata-diff-"));
    origDbPath = process.env.DB_PATH;
    process.env.DB_PATH = path.join(tmpDir, "test.duckdb");
    db = new DatabaseManager();
    await db.execute("CREATE TABLE test_diff (id INTEGER, name VARCHAR)");
    await db.execute("INSERT INTO test_diff VALUES (1, 'Alice'), (2, 'Bob')");
  });

  afterAll(async () => {
    await db.close();
    if (origDbPath !== undefined) process.env.DB_PATH = origDbPath;
    else delete process.env.DB_PATH;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("snapshotTable should capture row count and columns", async () => {
    const snap = await db.snapshotTable("test_diff");
    expect(snap.table_name).toBe("test_diff");
    expect(snap.row_count).toBe(2);
    expect(snap.columns.length).toBe(2);
    expect(snap.columns.map((c) => c.column_name)).toContain("id");
    expect(snap.columns.map((c) => c.column_name)).toContain("name");
    expect(snap.captured_at).toBeTruthy();
  });

  it("diffSnapshots should detect row additions", async () => {
    const before = await db.snapshotTable("test_diff");
    await db.execute("INSERT INTO test_diff VALUES (3, 'Charlie')");
    const after = await db.snapshotTable("test_diff");
    const diff = db.diffSnapshots(before, after);
    expect(diff.row_delta).toBe(1);
    expect(diff.before.row_count).toBe(2);
    expect(diff.after.row_count).toBe(3);
  });

  it("diffSnapshots should detect added columns", async () => {
    const before = await db.snapshotTable("test_diff");
    await db.execute("ALTER TABLE test_diff ADD COLUMN age INTEGER");
    const after = await db.snapshotTable("test_diff");
    const diff = db.diffSnapshots(before, after);
    expect(diff.added_columns).toContain("age");
    expect(diff.removed_columns).toHaveLength(0);
  });

  it("diffSnapshots should detect removed columns", async () => {
    const before = await db.snapshotTable("test_diff");
    await db.execute("ALTER TABLE test_diff DROP COLUMN age");
    const after = await db.snapshotTable("test_diff");
    const diff = db.diffSnapshots(before, after);
    expect(diff.removed_columns).toContain("age");
    expect(diff.added_columns).toHaveLength(0);
  });

  it("diffSnapshots should report no changes on identical snapshots", async () => {
    const snap = await db.snapshotTable("test_diff");
    const diff = db.diffSnapshots(snap, snap);
    expect(diff.row_delta).toBe(0);
    expect(diff.added_columns).toHaveLength(0);
    expect(diff.removed_columns).toHaveLength(0);
  });
});
