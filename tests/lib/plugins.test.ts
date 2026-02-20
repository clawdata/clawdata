import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PluginManager } from "../../src/lib/plugins.js";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

describe("PluginManager", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "claw-plugins-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("initialises with root and version", () => {
    const pm = new PluginManager("/my/project", "2.0.0");
    expect(pm.list()).toHaveLength(0);
    expect(pm.registeredCommands()).toHaveLength(0);
  });

  it("discover returns empty when no node_modules", async () => {
    const pm = new PluginManager(tmpDir);
    const discovered = await pm.discover();
    expect(discovered).toEqual([]);
  });

  it("discover finds clawdata-skill-* packages", async () => {
    const nm = path.join(tmpDir, "node_modules");
    await fs.mkdir(path.join(nm, "clawdata-skill-redis"), { recursive: true });
    await fs.mkdir(path.join(nm, "clawdata-skill-kafka"), { recursive: true });
    await fs.mkdir(path.join(nm, "some-other-pkg"), { recursive: true });

    const pm = new PluginManager(tmpDir);
    const discovered = await pm.discover();
    expect(discovered.sort()).toEqual(["clawdata-skill-kafka", "clawdata-skill-redis"]);
  });

  it("discover finds scoped clawdata-skill-* packages", async () => {
    const nm = path.join(tmpDir, "node_modules");
    await fs.mkdir(path.join(nm, "@myorg", "clawdata-skill-spark"), { recursive: true });
    await fs.mkdir(path.join(nm, "clawdata-skill-pg"), { recursive: true });

    const pm = new PluginManager(tmpDir);
    const discovered = await pm.discover();
    expect(discovered.sort()).toEqual([
      "@myorg/clawdata-skill-spark",
      "clawdata-skill-pg",
    ]);
  });

  it("loadPlugin reports error for missing package", async () => {
    const pm = new PluginManager(tmpDir);
    const entry = await pm.loadPlugin("clawdata-skill-nonexistent");
    expect(entry.loaded).toBe(false);
    expect(entry.error).toBeTruthy();
    expect(entry.name).toBe("nonexistent");
  });

  it("loadPlugin reads package.json manifest when available", async () => {
    const pkgDir = path.join(tmpDir, "node_modules", "clawdata-skill-test");
    await fs.mkdir(pkgDir, { recursive: true });
    await fs.writeFile(
      path.join(pkgDir, "package.json"),
      JSON.stringify({
        name: "clawdata-skill-test",
        version: "1.2.3",
        description: "A test skill",
        clawdata: { name: "test", commands: ["test-cmd"] },
        main: "./index.js",
      }),
      "utf-8"
    );
    // Create a minimal module that exports register
    await fs.writeFile(
      path.join(pkgDir, "index.js"),
      `module.exports = { register: (ctx) => { ctx.registerCommand("test-cmd", async () => {}); } };`,
      "utf-8"
    );

    const pm = new PluginManager(tmpDir);
    const entry = await pm.loadPlugin("clawdata-skill-test");
    expect(entry.loaded).toBe(true);
    expect(entry.manifest?.name).toBe("test");
    expect(entry.manifest?.version).toBe("1.2.3");
    expect(entry.manifest?.commands).toEqual(["test-cmd"]);
  });

  it("plugin can register commands via context", async () => {
    const pkgDir = path.join(tmpDir, "node_modules", "clawdata-skill-hello");
    await fs.mkdir(pkgDir, { recursive: true });
    await fs.writeFile(
      path.join(pkgDir, "package.json"),
      JSON.stringify({ name: "clawdata-skill-hello", version: "0.1.0", main: "./index.js" }),
      "utf-8"
    );
    await fs.writeFile(
      path.join(pkgDir, "index.js"),
      `module.exports = {
        register: (ctx) => {
          ctx.registerCommand("hello", async (args) => {
            console.log("Hello " + args.join(" "));
          });
        }
      };`,
      "utf-8"
    );

    const pm = new PluginManager(tmpDir);
    await pm.loadPlugin("clawdata-skill-hello");

    expect(pm.hasCommand("hello")).toBe(true);
    expect(pm.registeredCommands()).toContain("hello");
  });

  it("runCommand executes the registered handler", async () => {
    const pkgDir = path.join(tmpDir, "node_modules", "clawdata-skill-echo");
    await fs.mkdir(pkgDir, { recursive: true });
    await fs.writeFile(
      path.join(pkgDir, "package.json"),
      JSON.stringify({ name: "clawdata-skill-echo", version: "0.1.0", main: "./index.js" }),
      "utf-8"
    );

    let captured: string[] = [];
    // Write a CJS plugin that captures args
    await fs.writeFile(
      path.join(pkgDir, "index.js"),
      `let captured = [];
       module.exports = {
         register: (ctx) => {
           ctx.registerCommand("echo", async (args) => {
             global.__echoArgs = args;
           });
         }
       };`,
      "utf-8"
    );

    const pm = new PluginManager(tmpDir);
    await pm.loadPlugin("clawdata-skill-echo");
    await pm.runCommand("echo", ["foo", "bar"]);

    expect((global as any).__echoArgs).toEqual(["foo", "bar"]);
    delete (global as any).__echoArgs;
  });

  it("runCommand throws for unknown command", async () => {
    const pm = new PluginManager(tmpDir);
    await expect(pm.runCommand("missing", [])).rejects.toThrow("Unknown plugin command");
  });

  it("hasCommand returns false for unregistered commands", () => {
    const pm = new PluginManager(tmpDir);
    expect(pm.hasCommand("nope")).toBe(false);
  });

  it("loadPlugin reports error when no register function", async () => {
    const pkgDir = path.join(tmpDir, "node_modules", "clawdata-skill-bad");
    await fs.mkdir(pkgDir, { recursive: true });
    await fs.writeFile(
      path.join(pkgDir, "package.json"),
      JSON.stringify({ name: "clawdata-skill-bad", version: "0.0.1", main: "./index.js" }),
      "utf-8"
    );
    await fs.writeFile(path.join(pkgDir, "index.js"), `module.exports = {};`, "utf-8");

    const pm = new PluginManager(tmpDir);
    const entry = await pm.loadPlugin("clawdata-skill-bad");
    expect(entry.loaded).toBe(false);
    expect(entry.error).toContain("register()");
  });

  it("loadFromConfig loads multiple plugins", async () => {
    for (const name of ["clawdata-skill-a", "clawdata-skill-b"]) {
      const pkgDir = path.join(tmpDir, "node_modules", name);
      await fs.mkdir(pkgDir, { recursive: true });
      await fs.writeFile(
        path.join(pkgDir, "package.json"),
        JSON.stringify({ name, version: "1.0.0", main: "./index.js" }),
        "utf-8"
      );
      await fs.writeFile(
        path.join(pkgDir, "index.js"),
        `module.exports = { register: (ctx) => { ctx.registerCommand("${name.slice(-1)}", async () => {}); } };`,
        "utf-8"
      );
    }

    const pm = new PluginManager(tmpDir);
    await pm.loadFromConfig(["clawdata-skill-a", "clawdata-skill-b"]);
    expect(pm.list()).toHaveLength(2);
    expect(pm.hasCommand("a")).toBe(true);
    expect(pm.hasCommand("b")).toBe(true);
  });

  it("list returns all tracked plugins", async () => {
    const pm = new PluginManager(tmpDir);
    await pm.loadPlugin("clawdata-skill-missing");
    const all = pm.list();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe("missing");
    expect(all[0].loaded).toBe(false);
  });
});
