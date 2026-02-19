/**
 * Shared CLI output helpers — formatting, JSON mode, error handling.
 */

export const jsonMode = process.argv.includes("--json");

export function die(msg: string): never {
  if (jsonMode) {
    console.log(JSON.stringify({ error: msg }));
  } else {
    console.error(`Error: ${msg}`);
  }
  process.exit(1);
}

export function output(data: unknown): void {
  if (jsonMode) {
    console.log(JSON.stringify(data, null, 2));
  } else if (typeof data === "string") {
    console.log(data);
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

export function table(rows: Record<string, unknown>[]): void {
  if (jsonMode) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  if (!rows.length) {
    console.log("(no rows)");
    return;
  }
  const keys = Object.keys(rows[0]);
  const widths = keys.map((k) =>
    Math.max(k.length, ...rows.map((r) => String(r[k] ?? "").length))
  );
  const sep = widths.map((w) => "-".repeat(w)).join("-+-");
  const header = keys.map((k, i) => k.padEnd(widths[i])).join(" | ");
  console.log(header);
  console.log(sep);
  for (const row of rows) {
    console.log(keys.map((k, i) => String(row[k] ?? "").padEnd(widths[i])).join(" | "));
  }
  console.log(`\n${rows.length} row(s)`);
}
