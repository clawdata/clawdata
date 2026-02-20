/**
 * File watcher — monitors dbt model files and triggers actions on change.
 */

import * as fs from "fs";
import * as path from "path";
import { EventEmitter } from "events";

export interface WatchEvent {
  type: "change" | "rename";
  file: string;
  timestamp: Date;
}

export interface WatcherOptions {
  /** Directory to watch (default: apps/dbt/models) */
  dir: string;
  /** File extensions to watch (default: [".sql"]) */
  extensions?: string[];
  /** Debounce interval in ms (default: 300) */
  debounce?: number;
}

export class FileWatcher extends EventEmitter {
  private watchers: fs.FSWatcher[] = [];
  private options: Required<WatcherOptions>;
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private _running = false;

  constructor(options: WatcherOptions) {
    super();
    this.options = {
      dir: options.dir,
      extensions: options.extensions ?? [".sql"],
      debounce: options.debounce ?? 300,
    };
  }

  get running(): boolean {
    return this._running;
  }

  /**
   * Start watching the directory recursively.
   * Emits 'change' events with WatchEvent payloads.
   */
  start(): void {
    if (this._running) return;

    const dir = this.options.dir;
    if (!fs.existsSync(dir)) {
      throw new Error(`Watch directory does not exist: ${dir}`);
    }

    this._running = true;

    // Watch top-level and subdirectories
    const walkDirs = this.collectDirs(dir);
    for (const d of walkDirs) {
      try {
        const watcher = fs.watch(d, (eventType, filename) => {
          if (!filename) return;
          const ext = path.extname(filename).toLowerCase();
          if (!this.options.extensions.includes(ext)) return;

          const fullPath = path.join(d, filename);
          this.debouncedEmit(fullPath, eventType as "change" | "rename");
        });
        this.watchers.push(watcher);
      } catch {
        // Directory may have been removed between walk and watch
      }
    }

    this.emit("ready", { dir, directories: walkDirs.length });
  }

  /**
   * Stop all watchers and clean up.
   */
  stop(): void {
    for (const w of this.watchers) {
      w.close();
    }
    this.watchers = [];
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this._running = false;
    this.emit("stop");
  }

  private debouncedEmit(filePath: string, type: "change" | "rename"): void {
    const existing = this.debounceTimers.get(filePath);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.debounceTimers.delete(filePath);
      const event: WatchEvent = {
        type,
        file: filePath,
        timestamp: new Date(),
      };
      this.emit("change", event);
    }, this.options.debounce);

    this.debounceTimers.set(filePath, timer);
  }

  private collectDirs(root: string): string[] {
    const dirs: string[] = [root];
    const entries = fs.readdirSync(root, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        dirs.push(...this.collectDirs(path.join(root, entry.name)));
      }
    }
    return dirs;
  }
}
