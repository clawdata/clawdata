import { describe, it, expect } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";

const ROOT = path.resolve(import.meta.dirname, "../..");

describe("turbo.json monorepo config", () => {
  let config: any;

  it("exists and is valid JSON", async () => {
    const raw = await fs.readFile(path.join(ROOT, "turbo.json"), "utf-8");
    config = JSON.parse(raw);
    expect(config).toBeTruthy();
  });

  it("has $schema field", async () => {
    const raw = await fs.readFile(path.join(ROOT, "turbo.json"), "utf-8");
    config = JSON.parse(raw);
    expect(config.$schema).toContain("turbo.build");
  });

  it("defines build task with outputs", async () => {
    const raw = await fs.readFile(path.join(ROOT, "turbo.json"), "utf-8");
    config = JSON.parse(raw);
    expect(config.tasks.build).toBeDefined();
    expect(config.tasks.build.outputs).toContain("build/**");
  });

  it("defines test task depending on build", async () => {
    const raw = await fs.readFile(path.join(ROOT, "turbo.json"), "utf-8");
    config = JSON.parse(raw);
    expect(config.tasks.test).toBeDefined();
    expect(config.tasks.test.dependsOn).toContain("build");
  });

  it("defines dbt:run task with model inputs", async () => {
    const raw = await fs.readFile(path.join(ROOT, "turbo.json"), "utf-8");
    config = JSON.parse(raw);
    expect(config.tasks["dbt:run"]).toBeDefined();
    expect(config.tasks["dbt:run"].inputs).toEqual(
      expect.arrayContaining([expect.stringContaining("models")])
    );
  });

  it("defines dbt:test depending on dbt:run", async () => {
    const raw = await fs.readFile(path.join(ROOT, "turbo.json"), "utf-8");
    config = JSON.parse(raw);
    expect(config.tasks["dbt:test"].dependsOn).toContain("dbt:run");
  });

  it("dev task is not cached", async () => {
    const raw = await fs.readFile(path.join(ROOT, "turbo.json"), "utf-8");
    config = JSON.parse(raw);
    expect(config.tasks.dev.cache).toBe(false);
    expect(config.tasks.dev.persistent).toBe(true);
  });

  it("globalDependencies includes tsconfig", async () => {
    const raw = await fs.readFile(path.join(ROOT, "turbo.json"), "utf-8");
    config = JSON.parse(raw);
    expect(config.globalDependencies).toContain("tsconfig.json");
  });
});
