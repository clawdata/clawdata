/**
 * Tests for dbt packages.yml.
 * Feature: declare external dbt packages (dbt_utils, dbt_expectations, dbt_date).
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";

const PACKAGES_FILE = path.resolve("apps/dbt/packages.yml");

describe("dbt packages.yml", () => {
  it("packages.yml exists", async () => {
    const stat = await fs.stat(PACKAGES_FILE);
    expect(stat.isFile()).toBe(true);
  });

  it("includes dbt_utils", async () => {
    const content = await fs.readFile(PACKAGES_FILE, "utf-8");
    expect(content).toContain("dbt-labs/dbt_utils");
  });

  it("includes dbt_expectations", async () => {
    const content = await fs.readFile(PACKAGES_FILE, "utf-8");
    expect(content).toContain("calogica/dbt_expectations");
  });

  it("includes dbt_date", async () => {
    const content = await fs.readFile(PACKAGES_FILE, "utf-8");
    expect(content).toContain("calogica/dbt_date");
  });

  it("specifies version ranges for all packages", async () => {
    const content = await fs.readFile(PACKAGES_FILE, "utf-8");
    // Each package should have a version key
    const versionMatches = content.match(/version:/g);
    expect(versionMatches).not.toBeNull();
    expect(versionMatches!.length).toBeGreaterThanOrEqual(3);
  });

  it("is valid YAML structure with packages array", async () => {
    const content = await fs.readFile(PACKAGES_FILE, "utf-8");
    expect(content).toMatch(/^packages:\s*\n/);
    // Each entry has a - package: key
    const packageEntries = content.match(/-\s+package:/g);
    expect(packageEntries).not.toBeNull();
    expect(packageEntries!.length).toBe(3);
  });
});
