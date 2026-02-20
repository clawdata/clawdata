import { describe, it, expect } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";

const SNAPSHOTS_DIR = path.resolve("apps/dbt/snapshots");

describe("dbt snapshots", () => {
  it("snp_customers.sql should exist", async () => {
    const exists = await fs
      .access(path.join(SNAPSHOTS_DIR, "snp_customers.sql"))
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);
  });

  it("snp_customers should use SCD Type 2 check strategy", async () => {
    const content = await fs.readFile(
      path.join(SNAPSHOTS_DIR, "snp_customers.sql"),
      "utf-8"
    );
    expect(content).toContain("strategy='check'");
    expect(content).toContain("unique_key='customer_id'");
    expect(content).toContain("check_cols=");
  });

  it("snp_customers should reference slv_customers", async () => {
    const content = await fs.readFile(
      path.join(SNAPSHOTS_DIR, "snp_customers.sql"),
      "utf-8"
    );
    expect(content).toContain("ref('slv_customers')");
  });

  it("snp_products.sql should exist", async () => {
    const exists = await fs
      .access(path.join(SNAPSHOTS_DIR, "snp_products.sql"))
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);
  });

  it("snp_products should use SCD Type 2 check strategy", async () => {
    const content = await fs.readFile(
      path.join(SNAPSHOTS_DIR, "snp_products.sql"),
      "utf-8"
    );
    expect(content).toContain("strategy='check'");
    expect(content).toContain("unique_key='product_sku'");
  });

  it("snp_products should reference slv_products", async () => {
    const content = await fs.readFile(
      path.join(SNAPSHOTS_DIR, "snp_products.sql"),
      "utf-8"
    );
    expect(content).toContain("ref('slv_products')");
  });

  it("snapshot-paths should be configured in dbt_project.yml", async () => {
    const content = await fs.readFile(
      path.resolve("apps/dbt/dbt_project.yml"),
      "utf-8"
    );
    expect(content).toContain('snapshot-paths: ["snapshots"]');
  });

  it("both snapshots should use target_schema snapshots", async () => {
    for (const file of ["snp_customers.sql", "snp_products.sql"]) {
      const content = await fs.readFile(
        path.join(SNAPSHOTS_DIR, file),
        "utf-8"
      );
      expect(content).toContain("target_schema='snapshots'");
    }
  });
});
