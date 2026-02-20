/**
 * Tests for incremental dbt models.
 * Feature: fct_orders and gld_revenue_summary use incremental materialization.
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";

const MODELS_DIR = path.resolve("apps/dbt/models/sample/gold");

describe("Incremental dbt models", () => {
  it("fct_orders has incremental materialization config", async () => {
    const sql = await fs.readFile(path.join(MODELS_DIR, "fct_orders.sql"), "utf-8");
    expect(sql).toContain("materialized='incremental'");
    expect(sql).toContain("unique_key='order_id'");
    expect(sql).toContain("incremental_strategy='merge'");
  });

  it("fct_orders uses is_incremental() guard", async () => {
    const sql = await fs.readFile(path.join(MODELS_DIR, "fct_orders.sql"), "utf-8");
    expect(sql).toContain("{% if is_incremental() %}");
    expect(sql).toContain("{% endif %}");
    expect(sql).toContain("SELECT MAX(created_at) FROM {{ this }}");
  });

  it("gld_revenue_summary has incremental materialization config", async () => {
    const sql = await fs.readFile(path.join(MODELS_DIR, "gld_revenue_summary.sql"), "utf-8");
    expect(sql).toContain("materialized='incremental'");
    expect(sql).toContain("unique_key='order_date'");
    expect(sql).toContain("incremental_strategy='merge'");
  });

  it("gld_revenue_summary uses is_incremental() guard", async () => {
    const sql = await fs.readFile(path.join(MODELS_DIR, "gld_revenue_summary.sql"), "utf-8");
    expect(sql).toContain("{% if is_incremental() %}");
    expect(sql).toContain("{% endif %}");
    expect(sql).toContain("SELECT MAX(order_date) FROM {{ this }}");
  });

  it("fct_orders still references slv_orders and slv_payments", async () => {
    const sql = await fs.readFile(path.join(MODELS_DIR, "fct_orders.sql"), "utf-8");
    expect(sql).toContain("{{ ref('slv_orders') }}");
    expect(sql).toContain("{{ ref('slv_payments') }}");
  });

  it("gld_revenue_summary still references fct_orders", async () => {
    const sql = await fs.readFile(path.join(MODELS_DIR, "gld_revenue_summary.sql"), "utf-8");
    expect(sql).toContain("{{ ref('fct_orders') }}");
  });
});
