import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

describe("clawdata skill command", () => {
  let tmpDir: string;
  let origCwd: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "claw-skill-"));
    origCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(async () => {
    process.chdir(origCwd);
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function loadSkillCommand() {
    const mod = await import("../../src/commands/skill.js");
    return mod.skillCommand;
  }

  it("creates a skill folder with SKILL.md", async () => {
    const skillCommand = await loadSkillCommand();
    await skillCommand("create", ["myskill"]);

    const skillDir = path.join(tmpDir, "skills", "myskill");
    const stat = await fs.stat(skillDir);
    expect(stat.isDirectory()).toBe(true);

    const md = await fs.readFile(path.join(skillDir, "SKILL.md"), "utf-8");
    expect(md).toContain("# myskill Skill");
    expect(md).toContain("## Overview");
    expect(md).toContain("## Commands");
    expect(md).toContain("## Configuration");
    expect(md).toContain("## Examples");
  });

  it("SKILL.md contains correct placeholders for the skill name", async () => {
    const skillCommand = await loadSkillCommand();
    await skillCommand("create", ["Analytics"]);

    const md = await fs.readFile(
      path.join(tmpDir, "skills", "analytics", "SKILL.md"),
      "utf-8"
    );
    expect(md).toContain("# Analytics Skill");
    expect(md).toContain("clawdata analytics");
    expect(md).toContain("ANALYTICS_HOST");
  });

  it("does not overwrite an existing SKILL.md", async () => {
    const skillCommand = await loadSkillCommand();
    const skillDir = path.join(tmpDir, "skills", "existing");
    const skillMd = path.join(skillDir, "SKILL.md");

    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(skillMd, "# Custom content\n", "utf-8");

    await skillCommand("create", ["existing"]);

    const md = await fs.readFile(skillMd, "utf-8");
    expect(md).toBe("# Custom content\n");
  });

  it("errors when no name is provided", async () => {
    const skillCommand = await loadSkillCommand();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit");
    }) as never);

    await expect(skillCommand("create", [])).rejects.toThrow("process.exit");
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("Usage"));

    spy.mockRestore();
    exitSpy.mockRestore();
  });

  it("lists skills in the skills directory", async () => {
    const skillCommand = await loadSkillCommand();
    const skillsDir = path.join(tmpDir, "skills");
    await fs.mkdir(path.join(skillsDir, "alpha"), { recursive: true });
    await fs.mkdir(path.join(skillsDir, "beta"), { recursive: true });
    // also a file that should be excluded
    await fs.writeFile(path.join(skillsDir, "README.md"), "hi", "utf-8");

    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await skillCommand("list", []);

    const allOutput = spy.mock.calls.flat().join("\n");
    expect(allOutput).toContain("alpha");
    expect(allOutput).toContain("beta");
    expect(allOutput).not.toContain("README.md");
    spy.mockRestore();
  });

  it("handles empty skills directory gracefully", async () => {
    const skillCommand = await loadSkillCommand();
    await fs.mkdir(path.join(tmpDir, "skills"), { recursive: true });

    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await skillCommand("list", []);

    const allOutput = spy.mock.calls.flat().join("\n");
    expect(allOutput).toContain("No skills found");
    spy.mockRestore();
  });

  it("handles missing skills directory gracefully", async () => {
    const skillCommand = await loadSkillCommand();
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await skillCommand("list", []);

    const allOutput = spy.mock.calls.flat().join("\n");
    expect(allOutput).toContain("No skills directory");
    spy.mockRestore();
  });

  it("shows help for unknown subcommand", async () => {
    const skillCommand = await loadSkillCommand();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit");
    }) as never);

    await expect(skillCommand("bogus", [])).rejects.toThrow("process.exit");
    const errOutput = errSpy.mock.calls.flat().join("\n");
    expect(errOutput).toContain("Unknown skill command: bogus");

    const logOutput = logSpy.mock.calls.flat().join("\n");
    expect(logOutput).toContain("create <name>");
    expect(logOutput).toContain("list");

    errSpy.mockRestore();
    logSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("shows help without error for --help flag", async () => {
    const skillCommand = await loadSkillCommand();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await skillCommand("--help", []);
    expect(errSpy).not.toHaveBeenCalled();

    const logOutput = logSpy.mock.calls.flat().join("\n");
    expect(logOutput).toContain("create <name>");
    expect(logOutput).toContain("list");

    errSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("outputs JSON when --json mode is active", async () => {
    // Inject --json into argv so that the output module picks it up on fresh import
    const origArgv = [...process.argv];
    process.argv.push("--json");
    vi.resetModules();

    const { skillCommand: jsonSkillCmd } = await import("../../src/commands/skill.js");

    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    await jsonSkillCmd("create", ["jsonskill"]);

    const allOutput = spy.mock.calls.flat().join("\n");
    expect(allOutput).toContain('"created": true');
    expect(allOutput).toContain("SKILL.md");

    spy.mockRestore();
    process.argv.length = 0;
    process.argv.push(...origArgv);
    vi.resetModules();
  });
});
