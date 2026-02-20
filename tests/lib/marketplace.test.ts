import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

import {
  DATASET_REGISTRY,
  searchDatasets,
  getDataset,
  listDatasets,
  downloadDataset,
  DatasetEntry,
} from "../../src/lib/marketplace.js";

/* ──────────────────────────── registry ──────────────────────────── */
describe("DATASET_REGISTRY", () => {
  it("contains at least 5 datasets", () => {
    expect(DATASET_REGISTRY.length).toBeGreaterThanOrEqual(5);
  });

  it("every entry has required fields", () => {
    for (const d of DATASET_REGISTRY) {
      expect(d.id).toBeTruthy();
      expect(d.name).toBeTruthy();
      expect(d.description).toBeTruthy();
      expect(["csv", "json", "parquet"]).toContain(d.format);
      expect(d.files.length).toBeGreaterThan(0);
      expect(d.tags.length).toBeGreaterThan(0);
      expect(d.rows).toBeTruthy();
    }
  });

  it("has unique IDs", () => {
    const ids = DATASET_REGISTRY.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

/* ──────────────────────────── search ──────────────────────────── */
describe("searchDatasets", () => {
  it("finds datasets by id", () => {
    const results = searchDatasets("iris");
    expect(results.length).toBe(1);
    expect(results[0].id).toBe("iris");
  });

  it("finds datasets by tag", () => {
    const results = searchDatasets("starter");
    expect(results.length).toBeGreaterThanOrEqual(2);
    for (const r of results) {
      expect(r.tags).toContain("starter");
    }
  });

  it("finds datasets by description keyword", () => {
    const results = searchDatasets("survival");
    expect(results.some((r) => r.id === "titanic")).toBe(true);
  });

  it("returns empty for nonsense query", () => {
    expect(searchDatasets("zzzznoexist")).toEqual([]);
  });

  it("is case-insensitive", () => {
    const a = searchDatasets("IRIS");
    const b = searchDatasets("iris");
    expect(a).toEqual(b);
  });
});

/* ──────────────────────────── getDataset ──────────────────────── */
describe("getDataset", () => {
  it("returns dataset by id", () => {
    const d = getDataset("titanic");
    expect(d).toBeDefined();
    expect(d!.name).toContain("Titanic");
  });

  it("returns undefined for unknown id", () => {
    expect(getDataset("does-not-exist")).toBeUndefined();
  });
});

/* ──────────────────────────── listDatasets ──────────────────────── */
describe("listDatasets", () => {
  it("returns all datasets", () => {
    expect(listDatasets().length).toBe(DATASET_REGISTRY.length);
  });

  it("returns a copy (not the original array)", () => {
    const a = listDatasets();
    const b = listDatasets();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

/* ──────────────────────────── downloadDataset ──────────────────── */
describe("downloadDataset", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "claw-mp-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("throws for unknown dataset", async () => {
    await expect(downloadDataset("nonexistent", tmpDir)).rejects.toThrow("Unknown dataset");
  });

  it("downloads built-in ecommerce dataset via generator", async () => {
    const result = await downloadDataset("ecommerce-sample", tmpDir);
    expect(result.source).toBe("generated");
    expect(result.files.length).toBeGreaterThan(0);
    // Verify files exist on disk
    for (const f of result.files) {
      const stat = await fs.stat(f);
      expect(stat.size).toBeGreaterThan(0);
    }
  });

  it("downloads built-in saas dataset via generator", async () => {
    const result = await downloadDataset("saas-metrics", tmpDir);
    expect(result.source).toBe("generated");
    expect(result.files.length).toBeGreaterThan(0);
  });

  it("creates a manifest for remote datasets", async () => {
    const result = await downloadDataset("titanic", tmpDir);
    expect(result.source).toBe("manifest");
    expect(result.files.length).toBe(1);
    const content = JSON.parse(await fs.readFile(result.files[0], "utf-8"));
    expect(content.dataset).toBe("titanic");
    expect(content.url).toContain("http");
  });

  it("creates target directory if needed", async () => {
    const nested = path.join(tmpDir, "a", "b", "c");
    const result = await downloadDataset("titanic", nested);
    expect(result.files.length).toBe(1);
    const stat = await fs.stat(nested);
    expect(stat.isDirectory()).toBe(true);
  });
});
