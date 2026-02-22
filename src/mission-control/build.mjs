#!/usr/bin/env node
/**
 * Build script — bundles src/mission-control/client/main.ts → public/app.js
 *
 * Usage:
 *   node src/mission-control/build.mjs          # single build
 *   node src/mission-control/build.mjs --watch   # watch mode
 */
import { build, context } from "esbuild";

const watch = process.argv.includes("--watch");

const opts = {
  entryPoints: ["src/mission-control/client/main.ts"],
  bundle: true,
  format: "iife",
  outfile: "src/mission-control/public/app.js",
  target: "es2020",
  minify: false,       // keep readable for dev
  sourcemap: false,
  logLevel: "info",
};

if (watch) {
  const ctx = await context(opts);
  await ctx.watch();
  console.log("[mc-build] watching for changes…");
} else {
  await build(opts);
}
