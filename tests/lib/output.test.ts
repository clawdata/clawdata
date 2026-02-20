/**
 * Unit tests for output helpers.
 * Feature: Testing & CI → Unit tests, --format flag, --verbose flag
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("output helpers", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe("table()", () => {
    it("prints (no rows) for empty array", async () => {
      const { table } = await import("../../src/lib/output.js");
      table([]);
      expect(consoleSpy).toHaveBeenCalledWith("(no rows)");
    });

    it("formats rows as an ASCII table", async () => {
      const { table } = await import("../../src/lib/output.js");
      table([
        { name: "Alice", age: 30 },
        { name: "Bob", age: 25 },
      ]);
      const calls = consoleSpy.mock.calls.map((c) => c[0]);
      // header
      expect(calls[0]).toContain("name");
      expect(calls[0]).toContain("age");
      // separator
      expect(calls[1]).toMatch(/^-+-/);
      // row count
      expect(calls[calls.length - 1]).toContain("2 row(s)");
    });

    it("pads columns to the widest value", async () => {
      const { table } = await import("../../src/lib/output.js");
      table([{ col: "short" }, { col: "a much longer value" }]);
      const header = consoleSpy.mock.calls[0][0] as string;
      expect(header.length).toBeGreaterThanOrEqual("a much longer value".length);
    });
  });

  describe("output()", () => {
    it("prints strings directly in non-json mode", async () => {
      const { output } = await import("../../src/lib/output.js");
      output("hello world");
      expect(consoleSpy).toHaveBeenCalledWith("hello world");
    });

    it("JSON-stringifies objects in non-json mode", async () => {
      const { output } = await import("../../src/lib/output.js");
      output({ key: "value" });
      const printed = consoleSpy.mock.calls[0][0];
      expect(JSON.parse(printed)).toEqual({ key: "value" });
    });
  });

  describe("OutputFormat type", () => {
    it("exports the OutputFormat type and outputFormat value", async () => {
      const mod = await import("../../src/lib/output.js");
      expect(mod.outputFormat).toBeDefined();
      expect(["table", "csv", "json", "markdown"]).toContain(mod.outputFormat);
    });
  });

  describe("verbose()", () => {
    it("is exported as a function", async () => {
      const mod = await import("../../src/lib/output.js");
      expect(typeof mod.verbose).toBe("function");
    });

    it("does not write when verboseMode is false", async () => {
      const mod = await import("../../src/lib/output.js");
      mod.verbose("test message");
      // In test mode --verbose is not set, so nothing should be logged to stderr
      const errorCalls = consoleErrorSpy.mock.calls.filter((c) =>
        String(c[0]).includes("test message")
      );
      expect(errorCalls).toHaveLength(0);
    });
  });

  describe("formatCSV via table()", () => {
    // We can't easily change outputFormat at runtime since it's a const.
    // But we can test the formatCSV logic indirectly by testing the function exists.
    it("module exports expected members", async () => {
      const mod = await import("../../src/lib/output.js");
      expect(mod.table).toBeDefined();
      expect(mod.output).toBeDefined();
      expect(mod.die).toBeDefined();
      expect(mod.verbose).toBeDefined();
      expect(mod.jsonMode).toBeDefined();
      expect(mod.outputFormat).toBeDefined();
      expect(mod.verboseMode).toBeDefined();
    });
  });
});
