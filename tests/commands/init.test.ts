import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

describe("initCommand", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "clawdata-init-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("should create expected project directories", async () => {
    // Dynamically import so env vars don't interfere
    const { initCommand } = await import("../../src/commands/init.js");
    await initCommand(tmpDir, []);

    const dataSample = await fs.stat(path.join(tmpDir, "data/sample"));
    expect(dataSample.isDirectory()).toBe(true);

    const bronze = await fs.stat(path.join(tmpDir, "apps/dbt/models/sample/bronze"));
    expect(bronze.isDirectory()).toBe(true);

    const seeds = await fs.stat(path.join(tmpDir, "apps/dbt/seeds"));
    expect(seeds.isDirectory()).toBe(true);

    const snapshots = await fs.stat(path.join(tmpDir, "apps/dbt/snapshots"));
    expect(snapshots.isDirectory()).toBe(true);
  });

  it("should create dbt_project.yml", async () => {
    const { initCommand } = await import("../../src/commands/init.js");
    await initCommand(tmpDir, []);

    const content = await fs.readFile(
      path.join(tmpDir, "apps/dbt/dbt_project.yml"),
      "utf-8"
    );
    expect(content).toContain("openclaw_dbt");
    expect(content).toContain("model-paths");
  });

  it("should create profiles.yml with duckdb target", async () => {
    const { initCommand } = await import("../../src/commands/init.js");
    await initCommand(tmpDir, []);

    const content = await fs.readFile(
      path.join(tmpDir, "apps/dbt/profiles.yml"),
      "utf-8"
    );
    expect(content).toContain("duckdb");
    expect(content).toContain("dev");
  });

  it("should create _sources.yml with raw source", async () => {
    const { initCommand } = await import("../../src/commands/init.js");
    await initCommand(tmpDir, []);

    const content = await fs.readFile(
      path.join(tmpDir, "apps/dbt/models/sample/_sources.yml"),
      "utf-8"
    );
    expect(content).toContain("name: raw");
    expect(content).toContain("sample_customers");
  });

  it("should create a starter bronze model", async () => {
    const { initCommand } = await import("../../src/commands/init.js");
    await initCommand(tmpDir, []);

    const content = await fs.readFile(
      path.join(tmpDir, "apps/dbt/models/sample/bronze/brz_customers.sql"),
      "utf-8"
    );
    expect(content).toContain("source('raw'");
  });

  it("should create silver models", async () => {
    const { initCommand } = await import("../../src/commands/init.js");
    await initCommand(tmpDir, []);

    const silver = await fs.readdir(path.join(tmpDir, "apps/dbt/models/sample/silver"));
    expect(silver.length).toBeGreaterThanOrEqual(3);
    expect(silver).toContain("slv_customers.sql");

    const content = await fs.readFile(
      path.join(tmpDir, "apps/dbt/models/sample/silver/slv_customers.sql"),
      "utf-8"
    );
    expect(content).toContain("ref('brz_customers')");
  });

  it("should create gold models", async () => {
    const { initCommand } = await import("../../src/commands/init.js");
    await initCommand(tmpDir, []);

    const gold = await fs.readdir(path.join(tmpDir, "apps/dbt/models/sample/gold"));
    expect(gold.length).toBeGreaterThanOrEqual(2);
    expect(gold).toContain("dim_customers.sql");

    const content = await fs.readFile(
      path.join(tmpDir, "apps/dbt/models/sample/gold/dim_customers.sql"),
      "utf-8"
    );
    expect(content).toContain("ref('slv_");
  });

  it("should generate schema.yml with model names", async () => {
    const { initCommand } = await import("../../src/commands/init.js");
    await initCommand(tmpDir, []);

    const content = await fs.readFile(
      path.join(tmpDir, "apps/dbt/models/sample/schema.yml"),
      "utf-8"
    );
    expect(content).toContain("brz_customers");
    expect(content).toContain("slv_customers");
    expect(content).toContain("dim_customers");
  });

  it("should skip existing files on second run", async () => {
    const { initCommand } = await import("../../src/commands/init.js");

    // First init
    await initCommand(tmpDir, []);

    // Modify an existing file
    const filePath = path.join(tmpDir, "apps/dbt/dbt_project.yml");
    await fs.writeFile(filePath, "# custom\n", "utf-8");

    // Second init should not overwrite
    await initCommand(tmpDir, []);
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toBe("# custom\n");
  });

  it("should use current directory when no arg given", async () => {
    const { initCommand } = await import("../../src/commands/init.js");
    // Pass the tmpDir via first positional arg in rest
    await initCommand(undefined, [tmpDir]);

    const exists = await fs
      .access(path.join(tmpDir, "apps/dbt/dbt_project.yml"))
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);
  });
});
