import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { globToRegex, glob } from "../../src/lib/glob.js";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

describe("globToRegex", () => {
  it("should match wildcard *", () => {
    const re = globToRegex("*.csv");
    expect(re.test("orders.csv")).toBe(true);
    expect(re.test("orders.json")).toBe(false);
    expect(re.test("sub/orders.csv")).toBe(false); // * doesn't match /
  });

  it("should match single char ?", () => {
    const re = globToRegex("file?.csv");
    expect(re.test("file1.csv")).toBe(true);
    expect(re.test("fileAB.csv")).toBe(false);
  });

  it("should match recursive **", () => {
    const re = globToRegex("**/*.csv");
    expect(re.test("a/b/c.csv")).toBe(true);
    expect(re.test("top.csv")).toBe(true);
  });

  it("should match exact filenames", () => {
    const re = globToRegex("orders.csv");
    expect(re.test("orders.csv")).toBe(true);
    expect(re.test("xorders.csv")).toBe(false);
  });
});

describe("glob function", () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "clawdata-glob-"));
    await fs.mkdir(path.join(tmpDir, "sub"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, "a.csv"), "x");
    await fs.writeFile(path.join(tmpDir, "b.csv"), "x");
    await fs.writeFile(path.join(tmpDir, "c.json"), "x");
    await fs.writeFile(path.join(tmpDir, "sub", "d.csv"), "x");
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("should find *.csv in base dir only", async () => {
    const files = await glob("*.csv", tmpDir);
    const names = files.map((f) => path.basename(f));
    expect(names).toContain("a.csv");
    expect(names).toContain("b.csv");
    expect(names).not.toContain("d.csv"); // in sub/
  });

  it("should find **/*.csv recursively", async () => {
    const files = await glob("**/*.csv", tmpDir);
    const names = files.map((f) => path.relative(tmpDir, f));
    expect(names).toContain("a.csv");
    expect(names).toContain("b.csv");
    expect(names).toContain(path.join("sub", "d.csv"));
  });

  it("should match *.json", async () => {
    const files = await glob("*.json", tmpDir);
    expect(files.length).toBe(1);
    expect(path.basename(files[0])).toBe("c.json");
  });

  it("should return empty for no match", async () => {
    const files = await glob("*.parquet", tmpDir);
    expect(files).toHaveLength(0);
  });
});
