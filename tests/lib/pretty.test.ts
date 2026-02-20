import { describe, it, expect, vi, afterEach } from "vitest";
import { formatPretty } from "../../src/lib/output.js";

describe("formatPretty — box-drawing table output", () => {
  const logs: string[] = [];
  const origLog = console.log;

  afterEach(() => {
    console.log = origLog;
    logs.length = 0;
  });

  function capture() {
    console.log = (...args: unknown[]) => logs.push(args.join(" "));
  }

  it("should output box-drawing characters", () => {
    capture();
    formatPretty([{ id: 1, name: "Alice" }]);
    const all = logs.join("\n");
    expect(all).toContain("┌");
    expect(all).toContain("┐");
    expect(all).toContain("├");
    expect(all).toContain("┤");
    expect(all).toContain("└");
    expect(all).toContain("┘");
    expect(all).toContain("│");
    expect(all).toContain("─");
  });

  it("should uppercase headers", () => {
    capture();
    formatPretty([{ id: 1, name: "Alice" }]);
    const headerLine = logs[1]; // second line after top border
    expect(headerLine).toContain("ID");
    expect(headerLine).toContain("NAME");
  });

  it("should print row count", () => {
    capture();
    formatPretty([
      { x: 1 },
      { x: 2 },
      { x: 3 },
    ]);
    expect(logs[logs.length - 1]).toContain("3 row(s)");
  });

  it("should handle empty rows", () => {
    capture();
    formatPretty([]);
    expect(logs[0]).toContain("(no rows)");
  });

  it("should truncate long values", () => {
    capture();
    const longVal = "A".repeat(60);
    formatPretty([{ col: longVal }]);
    const all = logs.join("\n");
    // Should contain truncation marker
    expect(all).toContain("…");
    // Should not contain the full 60-char value
    expect(all).not.toContain(longVal);
  });

  it("should handle multiple columns and rows", () => {
    capture();
    formatPretty([
      { id: 1, name: "Alice", score: 95 },
      { id: 2, name: "Bob", score: 87 },
    ]);
    const all = logs.join("\n");
    expect(all).toContain("Alice");
    expect(all).toContain("Bob");
    expect(all).toContain("2 row(s)");
    // Check box corners
    expect(all).toContain("┬");
    expect(all).toContain("┼");
    expect(all).toContain("┴");
  });
});
