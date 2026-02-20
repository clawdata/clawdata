/**
 * Tests for DbtManager — type safety and new lineage method.
 * Feature: Type safety, dbt lineage
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { DbtManager, DbtModelNode } from "../../src/lib/dbt.js";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

describe("DbtManager", () => {
  let dbt: DbtManager;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `clawdata_dbt_test_${Date.now()}`);
    await fs.mkdir(path.join(tmpDir, "target"), { recursive: true });
    process.env.DBT_PROJECT_DIR = tmpDir;
    process.env.DBT_PROFILES_DIR = tmpDir;
    dbt = new DbtManager();
  });

  // ── getManifest ──────────────────────────────────────────────────

  describe("getManifest", () => {
    it("returns error when manifest does not exist", async () => {
      const manifest = await dbt.getManifest();
      expect(manifest.error).toBeDefined();
      expect(manifest.error).toContain("Manifest not found");
    });

    it("parses a valid manifest", async () => {
      const fakeManifest = {
        nodes: {
          "model.proj.slv_customers": {
            name: "slv_customers",
            resource_type: "model",
            depends_on: { nodes: [] },
            fqn: ["proj", "silver", "slv_customers"],
          },
        },
      };
      await fs.writeFile(
        path.join(tmpDir, "target", "manifest.json"),
        JSON.stringify(fakeManifest)
      );
      const manifest = await dbt.getManifest();
      expect(manifest.error).toBeUndefined();
      expect(manifest.nodes).toBeDefined();
      expect(Object.keys(manifest.nodes!)).toHaveLength(1);
    });
  });

  // ── listModels ───────────────────────────────────────────────────

  describe("listModels", () => {
    it("returns empty array when no manifest", async () => {
      const models = await dbt.listModels();
      expect(models).toEqual([]);
    });

    it("lists model names from manifest", async () => {
      const fakeManifest = {
        nodes: {
          "model.proj.slv_customers": { name: "slv_customers", resource_type: "model", depends_on: { nodes: [] } },
          "model.proj.dim_customers": { name: "dim_customers", resource_type: "model", depends_on: { nodes: ["model.proj.slv_customers"] } },
          "test.proj.unique_id": { name: "unique_id", resource_type: "test" },
        },
      };
      await fs.writeFile(
        path.join(tmpDir, "target", "manifest.json"),
        JSON.stringify(fakeManifest)
      );
      const models = await dbt.listModels();
      expect(models).toContain("slv_customers");
      expect(models).toContain("dim_customers");
      expect(models).not.toContain("unique_id"); // tests excluded
    });
  });

  // ── listTests ────────────────────────────────────────────────────

  describe("listTests", () => {
    it("lists only test nodes", async () => {
      const fakeManifest = {
        nodes: {
          "model.proj.slv_customers": { name: "slv_customers", resource_type: "model", depends_on: { nodes: [] } },
          "test.proj.unique_id": { name: "unique_id", resource_type: "test", depends_on: { nodes: [] } },
          "test.proj.not_null_email": { name: "not_null_email", resource_type: "test", depends_on: { nodes: [] } },
        },
      };
      await fs.writeFile(
        path.join(tmpDir, "target", "manifest.json"),
        JSON.stringify(fakeManifest)
      );
      const tests = await dbt.listTests();
      expect(tests).toHaveLength(2);
      expect(tests).toContain("unique_id");
      expect(tests).toContain("not_null_email");
    });
  });

  // ── getLineage ───────────────────────────────────────────────────

  describe("getLineage", () => {
    it("returns empty lineage when no manifest", async () => {
      const lineage = await dbt.getLineage();
      expect(lineage.nodes).toEqual([]);
      expect(lineage.edges).toEqual([]);
    });

    it("builds correct nodes and edges", async () => {
      const fakeManifest = {
        nodes: {
          "model.proj.slv_customers": {
            name: "slv_customers",
            resource_type: "model",
            depends_on: { nodes: ["source.proj.raw.customers"] },
          },
          "model.proj.slv_orders": {
            name: "slv_orders",
            resource_type: "model",
            depends_on: { nodes: ["source.proj.raw.orders"] },
          },
          "model.proj.dim_customers": {
            name: "dim_customers",
            resource_type: "model",
            depends_on: { nodes: ["model.proj.slv_customers", "model.proj.slv_orders"] },
          },
          "model.proj.fct_orders": {
            name: "fct_orders",
            resource_type: "model",
            depends_on: { nodes: ["model.proj.slv_orders"] },
          },
        },
      };
      await fs.writeFile(
        path.join(tmpDir, "target", "manifest.json"),
        JSON.stringify(fakeManifest)
      );

      const lineage = await dbt.getLineage();
      expect(lineage.nodes).toHaveLength(4);
      // dim_customers depends on slv_customers and slv_orders
      expect(lineage.edges).toContainEqual({
        from: "model.proj.slv_customers",
        to: "model.proj.dim_customers",
      });
      expect(lineage.edges).toContainEqual({
        from: "model.proj.slv_orders",
        to: "model.proj.dim_customers",
      });
      // fct_orders depends on slv_orders
      expect(lineage.edges).toContainEqual({
        from: "model.proj.slv_orders",
        to: "model.proj.fct_orders",
      });
      // No edges from sources (they aren't model. prefixed)
      expect(lineage.edges).toHaveLength(3);
    });

    it("excludes non-model dependencies", async () => {
      const fakeManifest = {
        nodes: {
          "model.proj.slv_customers": {
            name: "slv_customers",
            resource_type: "model",
            depends_on: { nodes: ["source.proj.raw.customers", "macro.proj.some_macro"] },
          },
        },
      };
      await fs.writeFile(
        path.join(tmpDir, "target", "manifest.json"),
        JSON.stringify(fakeManifest)
      );

      const lineage = await dbt.getLineage();
      expect(lineage.nodes).toHaveLength(1);
      expect(lineage.edges).toHaveLength(0); // source and macro deps excluded
    });
  });
});
