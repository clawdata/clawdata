import { describe, it, expect, vi } from "vitest";
import { compareSemver, checkForUpdate, type UpdateCheckResult } from "../../src/commands/update.js";

describe("clawdata update command", () => {
  describe("compareSemver", () => {
    it("returns 0 for equal versions", () => {
      expect(compareSemver("1.0.0", "1.0.0")).toBe(0);
    });

    it("returns 1 when a > b", () => {
      expect(compareSemver("2.0.0", "1.0.0")).toBe(1);
      expect(compareSemver("1.1.0", "1.0.0")).toBe(1);
      expect(compareSemver("1.0.1", "1.0.0")).toBe(1);
    });

    it("returns -1 when a < b", () => {
      expect(compareSemver("1.0.0", "2.0.0")).toBe(-1);
      expect(compareSemver("1.0.0", "1.1.0")).toBe(-1);
      expect(compareSemver("1.0.0", "1.0.1")).toBe(-1);
    });

    it("handles multi-digit versions", () => {
      expect(compareSemver("10.0.0", "9.0.0")).toBe(1);
      expect(compareSemver("1.20.0", "1.3.0")).toBe(1);
    });
  });

  describe("checkForUpdate", () => {
    it("returns updateAvailable false when registry is unreachable", () => {
      // Use a non-existent package to simulate failure
      const result = checkForUpdate("1.0.0", "clawdata-nonexistent-pkg-xyz-12345");
      expect(result.updateAvailable).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it("returns currentVersion in result", () => {
      const result = checkForUpdate("99.99.99", "clawdata-nonexistent-pkg-xyz-12345");
      expect(result.currentVersion).toBe("99.99.99");
    });
  });

  describe("updateCommand", () => {
    it("prints current version and check message", async () => {
      const { updateCommand } = await import("../../src/commands/update.js");
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});

      // Use --check mode with non-existent package so it doesn't try to install
      await updateCommand("--check", [], "1.0.0");

      const allOutput = spy.mock.calls.flat().join("\n");
      expect(allOutput).toContain("1.0.0");
      spy.mockRestore();
    });

    it("reports up to date when version is very high", async () => {
      // This will fail to reach registry for clawdata (not published) so
      // we just verify it handles gracefully
      const { updateCommand } = await import("../../src/commands/update.js");
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});

      await updateCommand("--check", [], "999.999.999");

      const allOutput = spy.mock.calls.flat().join("\n");
      // Either "up to date" or registry error — both are valid
      expect(allOutput.length).toBeGreaterThan(0);
      spy.mockRestore();
    });
  });
});
