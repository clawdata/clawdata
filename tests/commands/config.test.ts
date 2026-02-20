import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

describe("configCommand", () => {
  let tmpDir: string;
  let origRoot: string | undefined;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "clawdata-config-"));
    origRoot = process.env.CLAWDATA_ROOT;
    process.env.CLAWDATA_ROOT = tmpDir;
  });

  afterEach(async () => {
    if (origRoot !== undefined) {
      process.env.CLAWDATA_ROOT = origRoot;
    } else {
      delete process.env.CLAWDATA_ROOT;
    }
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("CONFIG_KEYS should include all expected keys", async () => {
    const { CONFIG_KEYS } = await import("../../src/commands/config.js");
    expect(CONFIG_KEYS).toContain("DB_PATH");
    expect(CONFIG_KEYS).toContain("DATA_FOLDER");
    expect(CONFIG_KEYS).toContain("DBT_PROJECT_DIR");
    expect(CONFIG_KEYS).toContain("DBT_PROFILES_DIR");
    expect(CONFIG_KEYS).toContain("AIRFLOW_DAGS_FOLDER");
    expect(CONFIG_KEYS).toContain("CLAWDATA_ROOT");
  });

  it("resolveConfig should return entries for all keys", async () => {
    const { resolveConfig, CONFIG_KEYS } = await import(
      "../../src/commands/config.js"
    );
    const entries = await resolveConfig();
    expect(entries.length).toBe(CONFIG_KEYS.length);
    for (const entry of entries) {
      expect(CONFIG_KEYS).toContain(entry.key);
      expect(["env", "default", "dotfile"]).toContain(entry.source);
    }
  });

  it("resolveConfig should detect env-var source when var is set", async () => {
    process.env.DB_PATH = "/tmp/mydb.duckdb";
    const { resolveConfig } = await import("../../src/commands/config.js");
    const entries = await resolveConfig();
    const db = entries.find((e) => e.key === "DB_PATH");
    expect(db).toBeDefined();
    expect(db!.source).toBe("env");
    expect(db!.value).toBe("/tmp/mydb.duckdb");
    delete process.env.DB_PATH;
  });

  it("configCommand set should write to .clawdata dotfile", async () => {
    const { configCommand } = await import("../../src/commands/config.js");
    await configCommand("set", ["DATA_FOLDER", "/tmp/customdata"]);

    const content = await fs.readFile(
      path.join(tmpDir, ".clawdata"),
      "utf-8"
    );
    expect(content).toContain("DATA_FOLDER=/tmp/customdata");
  });

  it("configCommand set should preserve existing keys", async () => {
    const dotfile = path.join(tmpDir, ".clawdata");
    await fs.writeFile(dotfile, "DB_PATH=/tmp/test.duckdb\n", "utf-8");

    const { configCommand } = await import("../../src/commands/config.js");
    await configCommand("set", ["DATA_FOLDER", "/tmp/data"]);

    const content = await fs.readFile(dotfile, "utf-8");
    expect(content).toContain("DB_PATH=/tmp/test.duckdb");
    expect(content).toContain("DATA_FOLDER=/tmp/data");
  });
});
