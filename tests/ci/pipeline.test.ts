import { describe, it, expect } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";

describe("GitHub Actions CI pipeline", () => {
  const ciPath = path.resolve(".github/workflows/ci.yml");

  it("ci.yml should exist", async () => {
    const exists = await fs
      .access(ciPath)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);
  });

  it("should trigger on push and pull_request to main", async () => {
    const content = await fs.readFile(ciPath, "utf-8");
    expect(content).toContain("push:");
    expect(content).toContain("pull_request:");
    expect(content).toContain("branches: [main]");
  });

  it("should run npm ci, build, and test", async () => {
    const content = await fs.readFile(ciPath, "utf-8");
    expect(content).toContain("npm ci");
    expect(content).toContain("npm run build");
    expect(content).toContain("npm test");
  });

  it("should include a type check step", async () => {
    const content = await fs.readFile(ciPath, "utf-8");
    expect(content).toContain("tsc --noEmit");
  });

  it("should test on Node.js 20 and 22", async () => {
    const content = await fs.readFile(ciPath, "utf-8");
    expect(content).toContain("node-version: [20, 22]");
  });

  it("should have a dbt job that runs dbt run + test", async () => {
    const content = await fs.readFile(ciPath, "utf-8");
    expect(content).toContain("dbt run");
    expect(content).toContain("dbt test");
    expect(content).toContain("dbt-core");
  });
});
