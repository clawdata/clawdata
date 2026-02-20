/**
 * Tests for bronze layer dbt models.
 * Feature: Add bronze layer dbt models
 *
 * Verifies:
 * - Bronze model files exist for all sources
 * - Silver models reference bronze (ref) instead of sources directly
 * - dbt_project.yml configures bronze as views
 * - schema.yml documents all bronze models
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";

const DBT_DIR = path.resolve("apps/dbt");
const BRONZE_DIR = path.join(DBT_DIR, "models/sample/bronze");
const SILVER_DIR = path.join(DBT_DIR, "models/sample/silver");

describe("Bronze layer", () => {
  const expectedModels = [
    "brz_customers.sql",
    "brz_orders.sql",
    "brz_products.sql",
    "brz_payments.sql",
  ];

  describe("model files exist", () => {
    for (const model of expectedModels) {
      it(`${model} exists`, async () => {
        const stat = await fs.stat(path.join(BRONZE_DIR, model));
        expect(stat.isFile()).toBe(true);
      });
    }
  });

  describe("bronze models reference sources", () => {
    for (const model of expectedModels) {
      it(`${model} uses source()`, async () => {
        const content = await fs.readFile(path.join(BRONZE_DIR, model), "utf-8");
        expect(content).toContain("{{ source('raw'");
      });
    }
  });

  describe("silver models reference bronze via ref()", () => {
    it("slv_customers uses ref('brz_customers')", async () => {
      const content = await fs.readFile(path.join(SILVER_DIR, "slv_customers.sql"), "utf-8");
      expect(content).toContain("{{ ref('brz_customers') }}");
      expect(content).not.toContain("source('raw'");
    });

    it("slv_orders uses ref('brz_orders')", async () => {
      const content = await fs.readFile(path.join(SILVER_DIR, "slv_orders.sql"), "utf-8");
      expect(content).toContain("{{ ref('brz_orders') }}");
      expect(content).not.toContain("source('raw'");
    });

    it("slv_order_items uses ref('brz_orders')", async () => {
      const content = await fs.readFile(path.join(SILVER_DIR, "slv_order_items.sql"), "utf-8");
      expect(content).toContain("{{ ref('brz_orders') }}");
      expect(content).not.toContain("source('raw'");
    });

    it("slv_products uses ref('brz_products')", async () => {
      const content = await fs.readFile(path.join(SILVER_DIR, "slv_products.sql"), "utf-8");
      expect(content).toContain("{{ ref('brz_products') }}");
      expect(content).not.toContain("source('raw'");
    });

    it("slv_payments uses ref('brz_payments')", async () => {
      const content = await fs.readFile(path.join(SILVER_DIR, "slv_payments.sql"), "utf-8");
      expect(content).toContain("{{ ref('brz_payments') }}");
      expect(content).not.toContain("source('raw'");
    });
  });

  describe("dbt_project.yml configures bronze", () => {
    it("sets bronze materialization to view", async () => {
      const content = await fs.readFile(path.join(DBT_DIR, "dbt_project.yml"), "utf-8");
      expect(content).toContain("bronze:");
      expect(content).toContain("+materialized: view");
    });
  });

  describe("schema.yml documents bronze models", () => {
    it("includes all bronze model entries", async () => {
      const content = await fs.readFile(
        path.join(DBT_DIR, "models/sample/schema.yml"),
        "utf-8"
      );
      expect(content).toContain("brz_customers");
      expect(content).toContain("brz_orders");
      expect(content).toContain("brz_products");
      expect(content).toContain("brz_payments");
    });
  });
});
