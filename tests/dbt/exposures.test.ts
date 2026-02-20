/**
 * Tests for dbt exposures.
 * Feature: document downstream consumers of gold-layer models.
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";

const SCHEMA_FILE = path.resolve("apps/dbt/models/sample/schema.yml");

describe("dbt exposures", () => {
  let content: string;

  it("schema.yml contains exposures block", async () => {
    content = await fs.readFile(SCHEMA_FILE, "utf-8");
    expect(content).toContain("exposures:");
  });

  it("defines executive_revenue_dashboard exposure", async () => {
    content = content || await fs.readFile(SCHEMA_FILE, "utf-8");
    expect(content).toContain("name: executive_revenue_dashboard");
    expect(content).toContain("type: dashboard");
    expect(content).toContain("ref('gld_revenue_summary')");
  });

  it("defines customer_segmentation_report exposure", async () => {
    content = content || await fs.readFile(SCHEMA_FILE, "utf-8");
    expect(content).toContain("name: customer_segmentation_report");
    expect(content).toContain("type: analysis");
    expect(content).toContain("ref('gld_customer_analytics')");
  });

  it("defines product_performance_api exposure", async () => {
    content = content || await fs.readFile(SCHEMA_FILE, "utf-8");
    expect(content).toContain("name: product_performance_api");
    expect(content).toContain("type: application");
    expect(content).toContain("ref('dim_products')");
  });

  it("all exposures have owner with name and email", async () => {
    content = content || await fs.readFile(SCHEMA_FILE, "utf-8");
    // Extract the exposures section
    const exposuresIdx = content.indexOf("exposures:");
    const exposuresSection = content.slice(exposuresIdx);
    const ownerBlocks = exposuresSection.match(/owner:\s*\n\s+name:.*\n\s+email:.*/g);
    expect(ownerBlocks).not.toBeNull();
    expect(ownerBlocks!.length).toBe(3);
  });

  it("all exposures declare depends_on refs", async () => {
    content = content || await fs.readFile(SCHEMA_FILE, "utf-8");
    const exposuresIdx = content.indexOf("exposures:");
    const exposuresSection = content.slice(exposuresIdx);
    const dependsBlocks = exposuresSection.match(/depends_on:/g);
    expect(dependsBlocks).not.toBeNull();
    expect(dependsBlocks!.length).toBe(3);
  });
});
