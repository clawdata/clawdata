import { describe, it, expect } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";

const LIGHTDASH_DIR = path.resolve(import.meta.dirname, "../../apps/lightdash");

describe("Lightdash BI app", () => {
  it("README.md exists with setup instructions", async () => {
    const content = await fs.readFile(path.join(LIGHTDASH_DIR, "README.md"), "utf-8");
    expect(content).toContain("Lightdash");
    expect(content).toContain("docker-compose");
  });

  it("README.md describes pre-built dashboards", async () => {
    const content = await fs.readFile(path.join(LIGHTDASH_DIR, "README.md"), "utf-8");
    expect(content).toContain("Revenue Overview");
    expect(content).toContain("Customer Segments");
    expect(content).toContain("Product Performance");
  });

  it("docker-compose.yml exists", async () => {
    const stat = await fs.stat(path.join(LIGHTDASH_DIR, "docker-compose.yml"));
    expect(stat.isFile()).toBe(true);
  });

  it("docker-compose.yml has lightdash service", async () => {
    const content = await fs.readFile(path.join(LIGHTDASH_DIR, "docker-compose.yml"), "utf-8");
    expect(content).toContain("lightdash");
    expect(content).toContain("8080:8080");
  });

  it("docker-compose.yml has postgres service", async () => {
    const content = await fs.readFile(path.join(LIGHTDASH_DIR, "docker-compose.yml"), "utf-8");
    expect(content).toContain("postgres:");
    expect(content).toContain("POSTGRES_USER");
  });

  it("docker-compose.yml mounts dbt project", async () => {
    const content = await fs.readFile(path.join(LIGHTDASH_DIR, "docker-compose.yml"), "utf-8");
    expect(content).toContain("apps/dbt");
  });
});
