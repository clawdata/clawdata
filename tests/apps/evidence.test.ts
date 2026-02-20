import { describe, it, expect } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";

const EVIDENCE_DIR = path.resolve(import.meta.dirname, "../../apps/evidence");

describe("Evidence analytics app", () => {
  it("evidence.config.js exists", async () => {
    const stat = await fs.stat(path.join(EVIDENCE_DIR, "evidence.config.js"));
    expect(stat.isFile()).toBe(true);
  });

  it("config sets title to ClawData Analytics", async () => {
    const content = await fs.readFile(path.join(EVIDENCE_DIR, "evidence.config.js"), "utf-8");
    expect(content).toContain("ClawData Analytics");
  });

  it("connection.yaml points to DuckDB warehouse", async () => {
    const content = await fs.readFile(
      path.join(EVIDENCE_DIR, "sources/clawdata/connection.yaml"),
      "utf-8"
    );
    expect(content).toContain("type: duckdb");
    expect(content).toContain("warehouse.duckdb");
  });

  it("index.md exists as home page", async () => {
    const content = await fs.readFile(path.join(EVIDENCE_DIR, "pages/index.md"), "utf-8");
    expect(content).toContain("ClawData Analytics");
  });

  it("revenue.md contains SQL and charts", async () => {
    const content = await fs.readFile(path.join(EVIDENCE_DIR, "pages/revenue.md"), "utf-8");
    expect(content).toContain("```sql");
    expect(content).toContain("<LineChart");
    expect(content).toContain("<BarChart");
  });

  it("customers.md contains SQL and charts", async () => {
    const content = await fs.readFile(path.join(EVIDENCE_DIR, "pages/customers.md"), "utf-8");
    expect(content).toContain("```sql");
    expect(content).toContain("<BarChart");
    expect(content).toContain("<DataTable");
  });

  it("pages use Evidence components", async () => {
    const revenue = await fs.readFile(path.join(EVIDENCE_DIR, "pages/revenue.md"), "utf-8");
    const customers = await fs.readFile(path.join(EVIDENCE_DIR, "pages/customers.md"), "utf-8");
    // At least one BigValue, LineChart, BarChart, DataTable across all pages
    const all = revenue + customers;
    expect(all).toContain("BarChart");
    expect(all).toContain("DataTable");
  });

  it("README.md exists with setup instructions", async () => {
    const content = await fs.readFile(path.join(EVIDENCE_DIR, "README.md"), "utf-8");
    expect(content).toContain("npm run dev");
    expect(content).toContain("Evidence");
  });

  it("has at least 3 page files", async () => {
    const files = await fs.readdir(path.join(EVIDENCE_DIR, "pages"));
    const mdFiles = files.filter((f) => f.endsWith(".md"));
    expect(mdFiles.length).toBeGreaterThanOrEqual(3);
  });
});
