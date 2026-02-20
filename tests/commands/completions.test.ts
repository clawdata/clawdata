import { describe, it, expect } from "vitest";
import {
  COMMAND_TREE,
  generateBashCompletions,
  generateZshCompletions,
  generateFishCompletions,
} from "../../src/commands/completions.js";

describe("shell completions", () => {
  it("COMMAND_TREE should include all top-level commands", () => {
    const expected = [
      "data", "db", "dbt", "run", "init", "config",
      "status", "setup", "skills", "doctor", "version",
      "completions", "help",
    ];
    for (const cmd of expected) {
      expect(COMMAND_TREE).toHaveProperty(cmd);
    }
  });

  it("COMMAND_TREE subcommands for db should include sample and profile", () => {
    expect(COMMAND_TREE.db).toContain("sample");
    expect(COMMAND_TREE.db).toContain("profile");
    expect(COMMAND_TREE.db).toContain("export");
  });

  describe("bash completions", () => {
    it("should generate valid bash function", () => {
      const out = generateBashCompletions();
      expect(out).toContain("_clawdata()");
      expect(out).toContain("complete -F _clawdata clawdata");
      expect(out).toContain("COMPREPLY");
    });

    it("should include subcommands for data", () => {
      const out = generateBashCompletions();
      expect(out).toContain("data)");
      expect(out).toContain("ingest-all");
    });
  });

  describe("zsh completions", () => {
    it("should generate valid zsh compdef", () => {
      const out = generateZshCompletions();
      expect(out).toContain("#compdef clawdata");
      expect(out).toContain("_clawdata");
      expect(out).toContain("_describe");
    });

    it("should include command descriptions", () => {
      const out = generateZshCompletions();
      expect(out).toContain("'data:data command'");
      expect(out).toContain("'db:db command'");
    });
  });

  describe("fish completions", () => {
    it("should generate valid fish completions", () => {
      const out = generateFishCompletions();
      expect(out).toContain("complete -c clawdata");
      expect(out).toContain("__fish_use_subcommand");
    });

    it("should include subcommands for dbt", () => {
      const out = generateFishCompletions();
      expect(out).toContain("__fish_seen_subcommand_from dbt");
      expect(out).toContain("-a 'run'");
      expect(out).toContain("-a 'lineage'");
    });
  });
});
