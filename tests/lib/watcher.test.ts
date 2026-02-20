/**
 * Tests for FileWatcher.
 * Feature: clawdata watch — monitor dbt model files for changes.
 */

import { describe, it, expect, afterEach } from "vitest";
import { FileWatcher, WatchEvent } from "../../src/lib/watcher.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const WATCH_DIR = path.join(os.tmpdir(), `clawdata_watch_${Date.now()}`);

describe("FileWatcher", () => {
  let watcher: FileWatcher | null = null;

  // Set up watch directory with some .sql files
  const setup = () => {
    fs.mkdirSync(path.join(WATCH_DIR, "gold"), { recursive: true });
    fs.writeFileSync(path.join(WATCH_DIR, "model_a.sql"), "SELECT 1");
    fs.writeFileSync(path.join(WATCH_DIR, "gold", "model_b.sql"), "SELECT 2");
    fs.writeFileSync(path.join(WATCH_DIR, "readme.txt"), "ignore");
  };

  afterEach(() => {
    if (watcher) {
      watcher.stop();
      watcher = null;
    }
    try {
      fs.rmSync(WATCH_DIR, { recursive: true, force: true });
    } catch {}
  });

  it("starts and reports running state", () => {
    setup();
    watcher = new FileWatcher({ dir: WATCH_DIR });
    expect(watcher.running).toBe(false);
    watcher.start();
    expect(watcher.running).toBe(true);
  });

  it("emits ready event on start", () => {
    setup();
    watcher = new FileWatcher({ dir: WATCH_DIR });
    let readyFired = false;
    watcher.on("ready", () => { readyFired = true; });
    watcher.start();
    expect(readyFired).toBe(true);
  });

  it("stops cleanly and sets running to false", () => {
    setup();
    watcher = new FileWatcher({ dir: WATCH_DIR });
    watcher.start();
    expect(watcher.running).toBe(true);
    watcher.stop();
    expect(watcher.running).toBe(false);
  });

  it("throws when watching a non-existent directory", () => {
    watcher = new FileWatcher({ dir: "/tmp/nonexistent_clawdata_dir_xyz" });
    expect(() => watcher!.start()).toThrow("Watch directory does not exist");
  });

  it("does not start twice", () => {
    setup();
    watcher = new FileWatcher({ dir: WATCH_DIR });
    watcher.start();
    // Second start should be no-op
    watcher.start();
    expect(watcher.running).toBe(true);
  });

  it("detects file change events", async () => {
    setup();
    watcher = new FileWatcher({ dir: WATCH_DIR, debounce: 50 });
    const events: WatchEvent[] = [];
    watcher.on("change", (e: WatchEvent) => events.push(e));
    watcher.start();

    // Modify a watched file
    await new Promise((r) => setTimeout(r, 100));
    fs.writeFileSync(path.join(WATCH_DIR, "model_a.sql"), "SELECT 1 -- updated");

    // Wait for debounce + processing
    await new Promise((r) => setTimeout(r, 500));

    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].file).toContain("model_a.sql");
  });

  it("ignores non-matching extensions", async () => {
    setup();
    watcher = new FileWatcher({ dir: WATCH_DIR, extensions: [".sql"], debounce: 50 });
    const events: WatchEvent[] = [];
    watcher.on("change", (e: WatchEvent) => events.push(e));
    watcher.start();

    // Wait for any stale creation events from setup to settle
    await new Promise((r) => setTimeout(r, 300));
    events.length = 0; // Clear any setup noise

    fs.writeFileSync(path.join(WATCH_DIR, "readme.txt"), "updated text");

    await new Promise((r) => setTimeout(r, 500));
    // No events should reference the .txt file
    const txtEvents = events.filter((e) => e.file.endsWith(".txt"));
    expect(txtEvents.length).toBe(0);
  });

  it("supports custom extensions", async () => {
    setup();
    watcher = new FileWatcher({ dir: WATCH_DIR, extensions: [".txt"], debounce: 50 });
    const events: WatchEvent[] = [];
    watcher.on("change", (e: WatchEvent) => events.push(e));
    watcher.start();

    await new Promise((r) => setTimeout(r, 100));
    fs.writeFileSync(path.join(WATCH_DIR, "readme.txt"), "updated text again");

    await new Promise((r) => setTimeout(r, 500));
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].file).toContain("readme.txt");
  });
});
