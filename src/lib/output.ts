/**
 * Shared CLI output helpers — formatting, JSON mode, error handling.
 *
 * Supports --json (legacy) and --format <table|csv|json|markdown> flags.
 */

export type OutputFormat = "table" | "csv" | "json" | "markdown" | "pretty";

function parseFormat(): OutputFormat {
  if (process.argv.includes("--json")) return "json";
  const idx = process.argv.indexOf("--format");
  if (idx !== -1 && process.argv[idx + 1]) {
    const fmt = process.argv[idx + 1] as OutputFormat;
    if (["table", "csv", "json", "markdown", "pretty"].includes(fmt)) return fmt;
  }
  return "table";
}

export const outputFormat: OutputFormat = parseFormat();
export const jsonMode = outputFormat === "json";
export const verboseMode = process.argv.includes("--verbose") || process.argv.includes("-V");

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

export function verbose(msg: string): void {
  if (verboseMode) {
    console.error(`[verbose] ${msg}`);
  }
}

export function table(rows: Record<string, unknown>[]): void {
  switch (outputFormat) {
    case "json":
      console.log(JSON.stringify(rows, null, 2));
      return;
    case "csv":
      formatCSV(rows);
      return;
    case "markdown":
      formatMarkdown(rows);
      return;
    case "pretty":
      formatPretty(rows);
      return;
    case "table":
    default:
      formatTable(rows);
      return;
  }
}

function formatTable(rows: Record<string, unknown>[]): void {
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

function formatCSV(rows: Record<string, unknown>[]): void {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  console.log(keys.join(","));
  for (const row of rows) {
    console.log(keys.map((k) => {
      const val = String(row[k] ?? "");
      return val.includes(",") || val.includes('"') || val.includes("\n")
        ? `"${val.replace(/"/g, '""')}"`
        : val;
    }).join(","));
  }
}

function formatMarkdown(rows: Record<string, unknown>[]): void {
  if (!rows.length) {
    console.log("*(no rows)*");
    return;
  }
  const keys = Object.keys(rows[0]);
  const widths = keys.map((k) =>
    Math.max(k.length, ...rows.map((r) => String(r[k] ?? "").length))
  );
  console.log("| " + keys.map((k, i) => k.padEnd(widths[i])).join(" | ") + " |");
  console.log("| " + widths.map((w) => "-".repeat(w)).join(" | ") + " |");
  for (const row of rows) {
    console.log("| " + keys.map((k, i) => String(row[k] ?? "").padEnd(widths[i])).join(" | ") + " |");
  }
}

/** Maximum column width for pretty format — wide values are truncated. */
const MAX_COL_WIDTH = 40;

export function formatPretty(rows: Record<string, unknown>[]): void {
  if (!rows.length) {
    console.log("(no rows)");
    return;
  }
  const keys = Object.keys(rows[0]);

  const truncate = (s: string, max: number): string =>
    s.length > max ? s.slice(0, max - 1) + "…" : s;

  const widths = keys.map((k) =>
    Math.min(
      MAX_COL_WIDTH,
      Math.max(k.length, ...rows.map((r) => String(r[k] ?? "").length))
    )
  );

  // Box-drawing characters
  const topBorder = "┌" + widths.map((w) => "─".repeat(w + 2)).join("┬") + "┐";
  const headerSep = "├" + widths.map((w) => "─".repeat(w + 2)).join("┼") + "┤";
  const botBorder = "└" + widths.map((w) => "─".repeat(w + 2)).join("┴") + "┘";

  const formatRow = (vals: string[]): string =>
    "│ " + vals.map((v, i) => truncate(v, widths[i]).padEnd(widths[i])).join(" │ ") + " │";

  console.log(topBorder);
  console.log(formatRow(keys.map((k, i) => k.toUpperCase().slice(0, widths[i]))));
  console.log(headerSep);
  for (const row of rows) {
    console.log(formatRow(keys.map((k) => String(row[k] ?? ""))));
  }
  console.log(botBorder);
  console.log(`${rows.length} row(s)`);
}
