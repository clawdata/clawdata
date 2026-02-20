/**
 * `clawdata watch` — monitors dbt model files for changes and triggers compilation.
 */

import * as path from "path";
import { FileWatcher, WatchEvent } from "../lib/watcher.js";

export async function watchCommand(rest: string[]): Promise<void> {
  const dir = rest[0] || path.resolve("apps/dbt/models");
  const exts = rest.includes("--ext")
    ? rest[rest.indexOf("--ext") + 1]?.split(",").map((e) => (e.startsWith(".") ? e : `.${e}`)) ?? [".sql"]
    : [".sql"];

  console.log(`Watching ${dir} for changes to ${exts.join(", ")} files…`);
  console.log("Press Ctrl+C to stop.\n");

  const watcher = new FileWatcher({ dir, extensions: exts, debounce: 300 });

  watcher.on("ready", (info: { dir: string; directories: number }) => {
    console.log(`✓ Watching ${info.directories} directories`);
  });

  watcher.on("change", (event: WatchEvent) => {
    const relative = path.relative(process.cwd(), event.file);
    const time = event.timestamp.toLocaleTimeString();
    console.log(`[${time}] ${event.type}: ${relative}`);
  });

  watcher.start();

  // Keep process alive until SIGINT
  return new Promise<void>((resolve) => {
    const cleanup = () => {
      watcher.stop();
      console.log("\nStopped watching.");
      resolve();
    };
    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
  });
}
