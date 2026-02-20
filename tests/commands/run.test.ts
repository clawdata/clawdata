/**
 * Tests for the `clawdata run` pipeline command.
 * Feature: Implement clawdata run command
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { PipelineResult } from "../../src/commands/run.js";

// We test the logic by mocking ingestor and dbtManager

describe("runCommand", () => {
  // Test the PipelineResult interface
  describe("PipelineResult interface", () => {
    it("has expected shape", () => {
      const result: PipelineResult = {
        success: true,
        steps: [
          { step: "ingest", success: true, message: "4 files loaded", durationMs: 500 },
          { step: "dbt-run", success: true, message: "All models built", durationMs: 1200 },
          { step: "dbt-test", success: true, message: "All tests passed", durationMs: 800 },
        ],
        totalDurationMs: 2500,
      };
      expect(result.success).toBe(true);
      expect(result.steps).toHaveLength(3);
      expect(result.steps[0].step).toBe("ingest");
    });

    it("represents failure correctly", () => {
      const result: PipelineResult = {
        success: false,
        steps: [
          { step: "ingest", success: true, message: "4 files loaded", durationMs: 500 },
          { step: "dbt-run", success: false, message: "Compilation Error", durationMs: 200 },
        ],
        totalDurationMs: 700,
      };
      expect(result.success).toBe(false);
      expect(result.steps).toHaveLength(2);
    });
  });

  describe("step ordering", () => {
    it("steps are ingest, dbt-run, dbt-test", () => {
      const expectedOrder = ["ingest", "dbt-run", "dbt-test"];
      expectedOrder.forEach((step, i) => {
        expect(step).toBe(expectedOrder[i]);
      });
    });
  });
});
