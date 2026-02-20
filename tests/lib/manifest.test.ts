/**
 * Tests for incremental ingestion tracking.
 * Feature: detect already-loaded files via checksum manifest and skip them.
 */

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { IngestManifest } from "../../src/lib/manifest.js";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

const TEST_DIR = path.join(os.tmpdir(), `clawdata_manifest_${Date.now()}`);
const DATA_DIR = path.join(TEST_DIR, "data");

describe("IngestManifest — incremental ingestion", () => {
  beforeEach(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
  });

  afterAll(async () => {
    try { await fs.rm(TEST_DIR, { recursive: true }); } catch {}
  });

  it("needsIngest returns true for new files", async () => {
    const manifest = new IngestManifest(TEST_DIR);
    await manifest.load();
    await fs.writeFile(path.join(DATA_DIR, "new.csv"), "a,b\n1,2\n");
    expect(await manifest.needsIngest(path.join(DATA_DIR, "new.csv"))).toBe(true);
  });

  it("needsIngest returns false after recording", async () => {
    const manifest = new IngestManifest(TEST_DIR);
    const filePath = path.join(DATA_DIR, "recorded.csv");
    await fs.writeFile(filePath, "x,y\n3,4\n");
    await manifest.record(filePath, "recorded");
    expect(await manifest.needsIngest(filePath)).toBe(false);
  });

  it("needsIngest returns true when file content changes", async () => {
    const manifest = new IngestManifest(TEST_DIR);
    const filePath = path.join(DATA_DIR, "changing.csv");
    await fs.writeFile(filePath, "a\n1\n");
    await manifest.record(filePath, "changing");
    expect(await manifest.needsIngest(filePath)).toBe(false);

    // Modify file
    await fs.writeFile(filePath, "a\n1\n2\n");
    expect(await manifest.needsIngest(filePath)).toBe(true);
  });

  it("computes SHA-256 checksums", async () => {
    const filePath = path.join(DATA_DIR, "checksum.csv");
    await fs.writeFile(filePath, "hello");
    const hash = await IngestManifest.checksum(filePath);
    // SHA-256 of "hello" is well-known
    expect(hash).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  });

  it("saves and loads manifest from disk", async () => {
    const manifest1 = new IngestManifest(TEST_DIR);
    const filePath = path.join(DATA_DIR, "persist.csv");
    await fs.writeFile(filePath, "col\nval\n");
    await manifest1.record(filePath, "persist");
    await manifest1.save();

    // Load in new instance
    const manifest2 = new IngestManifest(TEST_DIR);
    await manifest2.load();
    const record = manifest2.get(filePath);
    expect(record).toBeDefined();
    expect(record!.table).toBe("persist");
    expect(record!.checksum.length).toBe(64); // SHA-256 hex
    expect(await manifest2.needsIngest(filePath)).toBe(false);
  });

  it("all() returns all recorded files", async () => {
    const manifest = new IngestManifest(TEST_DIR);
    const f1 = path.join(DATA_DIR, "a.csv");
    const f2 = path.join(DATA_DIR, "b.csv");
    await fs.writeFile(f1, "a\n1\n");
    await fs.writeFile(f2, "b\n2\n");
    await manifest.record(f1, "a");
    await manifest.record(f2, "b");
    expect(manifest.all().length).toBe(2);
  });

  it("clear() removes all records", async () => {
    const manifest = new IngestManifest(TEST_DIR);
    const f = path.join(DATA_DIR, "clear.csv");
    await fs.writeFile(f, "x\n1\n");
    await manifest.record(f, "clear");
    expect(manifest.all().length).toBeGreaterThan(0);
    manifest.clear();
    expect(manifest.all().length).toBe(0);
  });

  it("get() returns undefined for unknown files", () => {
    const manifest = new IngestManifest(TEST_DIR);
    expect(manifest.get("/nonexistent/file.csv")).toBeUndefined();
  });
});
