/**
 * Minimal glob helper — matches files against shell-style glob patterns.
 *
 * Supports: `*` (any chars except /), `?` (single char), `**` (recursive dir).
 * No external dependencies — uses `fs.readdir` with `recursive` option (Node 20+).
 */

import * as fs from "fs/promises";
import * as path from "path";

/**
 * Convert a shell glob pattern to a RegExp.
 */
export function globToRegex(pattern: string): RegExp {
  let re = "";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === "*" && pattern[i + 1] === "*") {
      // ** matches anything including /
      re += ".*";
      i += 2;
      if (pattern[i] === "/") i++; // skip trailing slash after **
    } else if (ch === "*") {
      re += "[^/]*";
      i++;
    } else if (ch === "?") {
      re += "[^/]";
      i++;
    } else if (ch === ".") {
      re += "\\.";
      i++;
    } else {
      re += ch;
      i++;
    }
  }
  return new RegExp("^" + re + "$");
}

/**
 * Find files matching a glob pattern, resolved relative to `baseDir`.
 * Returns absolute paths.
 */
export async function glob(pattern: string, baseDir: string): Promise<string[]> {
  const regex = globToRegex(pattern);
  const entries = await fs.readdir(baseDir, { recursive: true }) as string[];
  const results: string[] = [];

  for (const entry of entries) {
    if (regex.test(entry)) {
      const abs = path.join(baseDir, entry);
      try {
        const stat = await fs.stat(abs);
        if (stat.isFile()) results.push(abs);
      } catch {
        // skip unreadable entries
      }
    }
  }

  return results.sort();
}
