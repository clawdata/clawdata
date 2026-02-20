import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

describe("clawdata connect command", () => {
  let tmpDir: string;
  let origRoot: string | undefined;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "claw-conn-"));
    origRoot = process.env.CLAWDATA_ROOT;
    process.env.CLAWDATA_ROOT = tmpDir;
  });

  afterEach(async () => {
    if (origRoot) process.env.CLAWDATA_ROOT = origRoot;
    else delete process.env.CLAWDATA_ROOT;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function loadConnectCommand() {
    const mod = await import("../../src/commands/connect.js");
    return mod.connectCommand;
  }

  it("adds a duckdb connection profile", async () => {
    const connectCommand = await loadConnectCommand();
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    await connectCommand("add", ["local", "--type", "duckdb", "--path", "data/test.duckdb"]);

    const allOutput = spy.mock.calls.flat().join("\n");
    expect(allOutput).toContain("Added connection: local");
    expect(allOutput).toContain("duckdb");

    // Verify persisted
    const store = JSON.parse(
      await fs.readFile(path.join(tmpDir, ".clawdata", "connections.json"), "utf-8")
    );
    expect(store.profiles).toHaveLength(1);
    expect(store.profiles[0].name).toBe("local");
    expect(store.profiles[0].type).toBe("duckdb");
    expect(store.profiles[0].path).toBe("data/test.duckdb");
    expect(store.active).toBe("local");

    spy.mockRestore();
  });

  it("adds a snowflake connection profile", async () => {
    const connectCommand = await loadConnectCommand();
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    await connectCommand("add", [
      "prod",
      "--type", "snowflake",
      "--account", "xy12345",
      "--user", "admin",
      "--database", "ANALYTICS",
    ]);

    const store = JSON.parse(
      await fs.readFile(path.join(tmpDir, ".clawdata", "connections.json"), "utf-8")
    );
    expect(store.profiles[0].type).toBe("snowflake");
    expect(store.profiles[0].account).toBe("xy12345");

    spy.mockRestore();
  });

  it("lists connection profiles", async () => {
    const connectCommand = await loadConnectCommand();
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    await connectCommand("add", ["dev", "--type", "duckdb", "--path", "dev.duckdb"]);
    spy.mockClear();

    await connectCommand("add", ["prod", "--type", "snowflake", "--account", "abc"]);
    spy.mockClear();

    await connectCommand("list", []);

    const allOutput = spy.mock.calls.flat().join("\n");
    expect(allOutput).toContain("dev");
    expect(allOutput).toContain("duckdb");
    expect(allOutput).toContain("prod");
    expect(allOutput).toContain("snowflake");
    expect(allOutput).toContain("(active)");

    spy.mockRestore();
  });

  it("removes a connection profile", async () => {
    const connectCommand = await loadConnectCommand();
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    await connectCommand("add", ["temp", "--type", "duckdb", "--path", "x.duckdb"]);
    spy.mockClear();

    await connectCommand("remove", ["temp"]);

    const allOutput = spy.mock.calls.flat().join("\n");
    expect(allOutput).toContain("Removed connection: temp");

    const store = JSON.parse(
      await fs.readFile(path.join(tmpDir, ".clawdata", "connections.json"), "utf-8")
    );
    expect(store.profiles).toHaveLength(0);

    spy.mockRestore();
  });

  it("switches active connection with use", async () => {
    const connectCommand = await loadConnectCommand();
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    await connectCommand("add", ["dev", "--type", "duckdb", "--path", "dev.duckdb"]);
    await connectCommand("add", ["prod", "--type", "snowflake", "--account", "abc"]);
    spy.mockClear();

    await connectCommand("use", ["prod"]);

    const allOutput = spy.mock.calls.flat().join("\n");
    expect(allOutput).toContain("Active connection: prod");

    const store = JSON.parse(
      await fs.readFile(path.join(tmpDir, ".clawdata", "connections.json"), "utf-8")
    );
    expect(store.active).toBe("prod");

    spy.mockRestore();
  });

  it("shows a connection profile details", async () => {
    const connectCommand = await loadConnectCommand();
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    await connectCommand("add", ["mydb", "--type", "postgres", "--host", "localhost", "--port", "5432"]);
    spy.mockClear();

    await connectCommand("show", ["mydb"]);

    const allOutput = spy.mock.calls.flat().join("\n");
    expect(allOutput).toContain("Connection: mydb");
    expect(allOutput).toContain("type: postgres");
    expect(allOutput).toContain("host: localhost");
    expect(allOutput).toContain("port: 5432");

    spy.mockRestore();
  });

  it("shows empty list message when no profiles exist", async () => {
    const connectCommand = await loadConnectCommand();
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    await connectCommand("list", []);

    const allOutput = spy.mock.calls.flat().join("\n");
    expect(allOutput).toContain("No connection profiles");

    spy.mockRestore();
  });

  it("shows help for unknown subcommand", async () => {
    const connectCommand = await loadConnectCommand();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit");
    }) as never);

    await expect(connectCommand("bogus", [])).rejects.toThrow("process.exit");

    errSpy.mockRestore();
    logSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("first added profile becomes active automatically", async () => {
    const connectCommand = await loadConnectCommand();
    vi.spyOn(console, "log").mockImplementation(() => {});

    await connectCommand("add", ["first", "--type", "duckdb", "--path", "a.duckdb"]);

    const store = JSON.parse(
      await fs.readFile(path.join(tmpDir, ".clawdata", "connections.json"), "utf-8")
    );
    expect(store.active).toBe("first");

    vi.restoreAllMocks();
  });

  it("active switches to next profile when active one is removed", async () => {
    const connectCommand = await loadConnectCommand();
    vi.spyOn(console, "log").mockImplementation(() => {});

    await connectCommand("add", ["a", "--type", "duckdb", "--path", "a.duckdb"]);
    await connectCommand("add", ["b", "--type", "duckdb", "--path", "b.duckdb"]);
    await connectCommand("remove", ["a"]);

    const store = JSON.parse(
      await fs.readFile(path.join(tmpDir, ".clawdata", "connections.json"), "utf-8")
    );
    expect(store.active).toBe("b");

    vi.restoreAllMocks();
  });
});
