import { describe, it, expect } from "vitest";
import {
  parseSimpleYaml,
  serializeSimpleYaml,
  loadConfig,
  saveConfig,
  configFilePath,
  applyConfigToEnv,
  type ClawdataConfig,
} from "../../src/lib/config.js";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

describe("clawdata.yml config", () => {
  describe("parseSimpleYaml", () => {
    it("parses top-level scalar values", () => {
      const result = parseSimpleYaml("name: my-project\nversion: 1.0\n");
      expect(result).toEqual({ name: "my-project", version: "1.0" });
    });

    it("parses nested sections", () => {
      const yaml = `project:
  name: test
  version: 2
`;
      const result = parseSimpleYaml(yaml);
      expect(result.project).toEqual({ name: "test", version: 2 });
    });

    it("parses array sections", () => {
      const yaml = `skills:
  - dbt
  - duckdb
  - airflow
`;
      const result = parseSimpleYaml(yaml);
      expect(result.skills).toEqual(["dbt", "duckdb", "airflow"]);
    });

    it("strips quotes from values", () => {
      const yaml = `name: "quoted-value"\nother: 'single'\n`;
      const result = parseSimpleYaml(yaml);
      expect(result.name).toBe("quoted-value");
      expect(result.other).toBe("single");
    });

    it("skips comments and blank lines", () => {
      const yaml = `# This is a comment\n\nname: value\n# another comment\n`;
      const result = parseSimpleYaml(yaml);
      expect(result).toEqual({ name: "value" });
    });

    it("parses numeric nested values as numbers", () => {
      const yaml = `dbt:\n  threads: 4\n  target: dev\n`;
      const result = parseSimpleYaml(yaml);
      expect((result.dbt as Record<string, unknown>).threads).toBe(4);
      expect((result.dbt as Record<string, unknown>).target).toBe("dev");
    });

    it("parses full config example", () => {
      const yaml = `project:
  name: my-project
  version: 1.0
paths:
  db_path: data/warehouse.duckdb
  data_folder: data/sample
skills:
  - dbt
  - duckdb
dbt:
  target: dev
  threads: 4
`;
      const result = parseSimpleYaml(yaml) as ClawdataConfig;
      expect(result.project?.name).toBe("my-project");
      expect(result.paths?.db_path).toBe("data/warehouse.duckdb");
      expect(result.skills).toEqual(["dbt", "duckdb"]);
      expect(result.dbt?.threads).toBe(4);
    });
  });

  describe("serializeSimpleYaml", () => {
    it("serializes scalars", () => {
      const yaml = serializeSimpleYaml({ name: "test", version: "1.0" });
      expect(yaml).toContain("name: test");
      expect(yaml).toContain("version: 1.0");
    });

    it("serializes nested objects", () => {
      const yaml = serializeSimpleYaml({
        project: { name: "test", version: "2" },
      });
      expect(yaml).toContain("project:");
      expect(yaml).toContain("  name: test");
      expect(yaml).toContain("  version: 2");
    });

    it("serializes arrays", () => {
      const yaml = serializeSimpleYaml({
        skills: ["dbt", "duckdb"],
      });
      expect(yaml).toContain("skills:");
      expect(yaml).toContain("  - dbt");
      expect(yaml).toContain("  - duckdb");
    });

    it("round-trips through parse", () => {
      const config = {
        project: { name: "test", version: "1" },
        skills: ["dbt"],
      };
      const yaml = serializeSimpleYaml(config);
      const parsed = parseSimpleYaml(yaml);
      expect(parsed.project).toEqual({ name: "test", version: 1 });
      expect(parsed.skills).toEqual(["dbt"]);
    });

    it("skips null and undefined values", () => {
      const yaml = serializeSimpleYaml({
        name: "test",
        empty: null as unknown,
        also_empty: undefined as unknown,
      });
      expect(yaml).not.toContain("empty");
      expect(yaml).not.toContain("also_empty");
    });
  });

  describe("loadConfig / saveConfig", () => {
    let tmpDir: string;

    it("returns null for missing config file", async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "claw-cfg-"));
      const cfg = await loadConfig(tmpDir);
      expect(cfg).toBeNull();
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it("saves and loads a config", async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "claw-cfg-"));
      const config: ClawdataConfig = {
        project: { name: "test-proj" },
        skills: ["dbt"],
      };
      const savedPath = await saveConfig(config, tmpDir);
      expect(savedPath).toBe(path.join(tmpDir, "clawdata.yml"));

      const loaded = await loadConfig(tmpDir);
      expect(loaded).not.toBeNull();
      expect((loaded!.project as Record<string, unknown>).name).toBe("test-proj");
      expect(loaded!.skills).toEqual(["dbt"]);
      await fs.rm(tmpDir, { recursive: true, force: true });
    });
  });

  describe("configFilePath", () => {
    it("returns clawdata.yml in given root", () => {
      const p = configFilePath("/my/project");
      expect(p).toBe("/my/project/clawdata.yml");
    });
  });

  describe("applyConfigToEnv", () => {
    it("sets env vars from paths config when not already set", () => {
      const origDbPath = process.env.DB_PATH;
      delete process.env.DB_PATH;

      const config: ClawdataConfig = {
        paths: { db_path: "custom/path.duckdb" },
      };
      const count = applyConfigToEnv(config);
      expect(count).toBe(1);
      expect(process.env.DB_PATH).toBe("custom/path.duckdb");

      // Restore
      if (origDbPath) process.env.DB_PATH = origDbPath;
      else delete process.env.DB_PATH;
    });

    it("does not override existing env vars", () => {
      const origDbPath = process.env.DB_PATH;
      process.env.DB_PATH = "existing/path.duckdb";

      const config: ClawdataConfig = {
        paths: { db_path: "alternate/path.duckdb" },
      };
      const count = applyConfigToEnv(config);
      expect(count).toBe(0);
      expect(process.env.DB_PATH).toBe("existing/path.duckdb");

      // Restore
      if (origDbPath) process.env.DB_PATH = origDbPath;
      else delete process.env.DB_PATH;
    });

    it("returns 0 when no paths configured", () => {
      const count = applyConfigToEnv({});
      expect(count).toBe(0);
    });
  });
});
