/**
 * Tests for custom schema per dbt layer.
 * Feature: bronze/silver/gold write to separate DuckDB schemas.
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";

const DBT_DIR = path.resolve("apps/dbt");

describe("Custom schema per dbt layer", () => {
  describe("dbt_project.yml schema config", () => {
    it("bronze layer has +schema: bronze", async () => {
      const yml = await fs.readFile(path.join(DBT_DIR, "dbt_project.yml"), "utf-8");
      // Verify bronze block contains +schema: bronze
      const bronzeMatch = yml.match(/bronze:\s*\n(\s+\+\w+:.*\n)+/);
      expect(bronzeMatch).not.toBeNull();
      expect(bronzeMatch![0]).toContain("+schema: bronze");
    });

    it("silver layer has +schema: silver", async () => {
      const yml = await fs.readFile(path.join(DBT_DIR, "dbt_project.yml"), "utf-8");
      const silverMatch = yml.match(/silver:\s*\n(\s+\+\w+:.*\n)+/);
      expect(silverMatch).not.toBeNull();
      expect(silverMatch![0]).toContain("+schema: silver");
    });

    it("gold layer has +schema: gold", async () => {
      const yml = await fs.readFile(path.join(DBT_DIR, "dbt_project.yml"), "utf-8");
      const goldMatch = yml.match(/gold:\s*\n(\s+\+\w+:.*\n)+/);
      expect(goldMatch).not.toBeNull();
      expect(goldMatch![0]).toContain("+schema: gold");
    });
  });

  describe("generate_schema_name macro", () => {
    it("macro file exists", async () => {
      const macroPath = path.join(DBT_DIR, "macros", "generate_schema_name.sql");
      const stat = await fs.stat(macroPath);
      expect(stat.isFile()).toBe(true);
    });

    it("uses custom_schema_name when provided", async () => {
      const sql = await fs.readFile(
        path.join(DBT_DIR, "macros", "generate_schema_name.sql"),
        "utf-8"
      );
      expect(sql).toContain("custom_schema_name is not none");
      expect(sql).toContain("{{ custom_schema_name | trim }}");
    });

    it("falls back to target.schema otherwise", async () => {
      const sql = await fs.readFile(
        path.join(DBT_DIR, "macros", "generate_schema_name.sql"),
        "utf-8"
      );
      expect(sql).toContain("{{ target.schema | trim }}");
    });

    it("follows the standard dbt macro signature", async () => {
      const sql = await fs.readFile(
        path.join(DBT_DIR, "macros", "generate_schema_name.sql"),
        "utf-8"
      );
      expect(sql).toContain("macro generate_schema_name(custom_schema_name, node)");
    });
  });
});
