"use client";

import React, { memo, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChartRenderer } from "./chart-renderer";

interface MarkdownContentProps {
  content: string;
  className?: string;
}

/* ── Stable references (prevents ReactMarkdown remount cycles) ─── */

const REMARK_PLUGINS = [remarkGfm];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CodeComponent({ className: codeClass, children, ...rest }: any) {
  const match = /language-(\w+)/.exec(codeClass || "");
  const codeString = String(children).replace(/\n$/, "");
  const language = match?.[1] || "";

  if (language === "chart") {
    return <ChartRenderer spec={codeString} />;
  }
  if (language === "svg") {
    return <SvgRenderer svg={codeString} />;
  }
  if (match) {
    return <CodeBlock language={language} code={codeString} />;
  }
  return (
    <code
      className={cn(
        "rounded-md bg-muted/80 border border-border/40 px-1.5 py-0.5 text-[0.8em] font-mono text-foreground/90",
        codeClass,
      )}
      {...rest}
    >
      {children}
    </code>
  );
}

function TableComponent({ children }: { children?: React.ReactNode }) {
  return (
    <div className="my-3 overflow-x-auto rounded-lg border border-border/60 shadow-sm">
      <table className="min-w-full text-xs">{children}</table>
    </div>
  );
}

function TheadComponent({ children }: { children?: React.ReactNode }) {
  return <thead className="bg-muted/60 border-b">{children}</thead>;
}

function ThComponent({ children }: { children?: React.ReactNode }) {
  return (
    <th className="px-3 py-2 text-left text-xs font-semibold text-foreground/80 whitespace-nowrap">
      {children}
    </th>
  );
}

function TdComponent({ children }: { children?: React.ReactNode }) {
  return <td className="border-t border-border/30 px-3 py-1.5 text-xs tabular-nums">{children}</td>;
}

function TrComponent({ children }: { children?: React.ReactNode }) {
  return <tr className="transition-colors hover:bg-muted/30 even:bg-muted/10">{children}</tr>;
}

function AComponent({ href, children }: { href?: string; children?: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline underline-offset-2 hover:text-primary/80"
    >
      {children}
    </a>
  );
}

function PComponent({ children }: { children?: React.ReactNode }) {
  return <p className="my-1.5 leading-relaxed first:mt-0 last:mb-0">{children}</p>;
}

function UlComponent({ children }: { children?: React.ReactNode }) {
  return <ul className="my-2 ml-4 list-disc space-y-1 marker:text-muted-foreground/60">{children}</ul>;
}

function OlComponent({ children }: { children?: React.ReactNode }) {
  return <ol className="my-2 ml-4 list-decimal space-y-1 marker:text-muted-foreground/60">{children}</ol>;
}

function LiComponent({ children }: { children?: React.ReactNode }) {
  return (
    <li className="text-sm leading-relaxed pl-0.5 [&>ul]:mt-1 [&>ol]:mt-1 [&>p]:my-0.5">
      {children}
    </li>
  );
}

function StrongComponent({ children }: { children?: React.ReactNode }) {
  return <strong className="font-semibold text-foreground">{children}</strong>;
}

function EmComponent({ children }: { children?: React.ReactNode }) {
  return <em className="italic text-muted-foreground">{children}</em>;
}

function BlockquoteComponent({ children }: { children?: React.ReactNode }) {
  return (
    <blockquote className="my-3 border-l-4 border-primary/30 bg-primary/5 pl-4 pr-3 py-2 text-sm italic rounded-r-md [&>p]:my-0.5">
      {children}
    </blockquote>
  );
}

function H1Component({ children }: { children?: React.ReactNode }) {
  return <h1 className="mt-4 mb-2 text-lg font-bold tracking-tight border-b border-border/40 pb-1">{children}</h1>;
}

function H2Component({ children }: { children?: React.ReactNode }) {
  return <h2 className="mt-4 mb-1.5 text-base font-bold tracking-tight">{children}</h2>;
}

function H3Component({ children }: { children?: React.ReactNode }) {
  return <h3 className="mt-3 mb-1 text-sm font-semibold">{children}</h3>;
}

function H4Component({ children }: { children?: React.ReactNode }) {
  return <h4 className="mt-2.5 mb-0.5 text-sm font-medium text-muted-foreground">{children}</h4>;
}

function HrComponent() {
  return <hr className="my-4 border-t border-border/50" />;
}

const MD_COMPONENTS = {
  code: CodeComponent,
  table: TableComponent,
  thead: TheadComponent,
  th: ThComponent,
  td: TdComponent,
  tr: TrComponent,
  a: AComponent,
  p: PComponent,
  ul: UlComponent,
  ol: OlComponent,
  li: LiComponent,
  strong: StrongComponent,
  em: EmComponent,
  blockquote: BlockquoteComponent,
  h1: H1Component,
  h2: H2Component,
  h3: H3Component,
  h4: H4Component,
  hr: HrComponent,
};

/**
 * Renders a markdown string with GFM support, syntax‑highlighted code blocks,
 * a copy button on fenced code, inline chart rendering, and SVG support.
 * Markdown tables are automatically enhanced with an inline chart when they
 * contain at least one numeric column and a label column.
 */
export const MarkdownContent = memo(function MarkdownContent({
  content,
  className,
}: MarkdownContentProps) {
  // Pre-process: normalise structured AI output, then inject chart blocks.
  const enhanced = useMemo(() => {
    const normalised = normaliseStructuredOutput(content);
    return injectChartsAboveTables(normalised);
  }, [content]);

  // If the content looks like plain text (no markdown markers), render raw.
  const looksPlain = !hasMarkdownSyntax(content);

  if (looksPlain) {
    return <p className={cn("whitespace-pre-wrap", className)}>{content}</p>;
  }

  return (
    <div className={cn("prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed", className)}>
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        components={MD_COMPONENTS}
      >
        {enhanced}
      </ReactMarkdown>
    </div>
  );
});

/* ── Code block with copy button ─────────────────────────────────── */

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="group/code relative my-2 rounded-lg border bg-[#282c34] text-sm">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1">
        <span className="text-[10px] font-mono text-white/50">{language}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[10px] text-white/40 transition-colors hover:text-white/80"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" /> Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" /> Copy
            </>
          )}
        </button>
      </div>
      <SyntaxHighlighter
        style={oneDark}
        language={language}
        PreTag="div"
        customStyle={{
          margin: 0,
          padding: "0.75rem",
          background: "transparent",
          fontSize: "0.75rem",
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

/* ── SVG renderer ────────────────────────────────────────────────── */

function SvgRenderer({ svg }: { svg: string }) {
  // Sanitise: only allow actual SVG content
  if (!svg.trim().startsWith("<svg") && !svg.trim().startsWith("<?xml")) {
    return (
      <div className="my-2 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
        Invalid SVG content
      </div>
    );
  }

  return (
    <div
      className="my-3 flex justify-center overflow-x-auto rounded-lg border bg-card p-4 [&_svg]:max-w-full [&_svg]:h-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/* ── Heuristic: does the string contain markdown syntax? ─────────── */

function hasMarkdownSyntax(text: string): boolean {
  // Quick checks for common markdown markers (including • Unicode bullet)
  // Also detect structured output patterns: key::value, bold labels, multi-line with colons
  if (
    /```|^\s*#{1,6}\s|\*\*|__|\[.*\]\(.*\)|^\s*[-*+\u2022]\s|^\s*\d+\.\s|^\s*>\s|^\|/m.test(text)
  ) {
    return true;
  }

  // Detect structured key-value patterns (e.g. "schema:: table1, table2")
  if (/^.{1,40}\s*::\s*.+/m.test(text)) return true;

  // Detect multiple lines with colon-separated labels (structured list output)
  const colonLines = text.split("\n").filter((l) => /^\s*\S+.*:\s+\S/.test(l.trim()));
  if (colonLines.length >= 3) return true;

  // Detect content with multiple newlines (multi-paragraph responses)
  if ((text.match(/\n\n/g) || []).length >= 2) return true;

  return false;
}

/* ── Normalise structured AI output ──────────────────────────────── */

/**
 * Pre-process common structured patterns from AI output into proper markdown.
 *
 * Handles patterns like:
 * - "schema_name:: table1, table2, table3" → bold label with comma-separated items
 * - "SHOW TABLES IN X returned N objects:" → summary line formatting
 * - Consecutive key:: value lines → structured list with bold keys
 * - Plain numbered results without markdown → convert to proper lists
 */
function normaliseStructuredOutput(text: string): string {
  if (!text || text.length < 10) return text;

  let result = text;

  // ── Pattern 1: "key:: value1, value2, value3" lines → bold key with inline code items
  // e.g. "bronze_: customers, orders, payments" → "**bronze_:** `customers`, `orders`, `payments`"
  result = result.replace(
    /^(\s*[-*+\u2022]\s+)?(\S[^:\n]{0,40}?)\s*:{1,2}\s+(\S[^:\n]*(?:,\s*\S[^:\n]*)*)$/gm,
    (_match, bullet, key, values) => {
      const prefix = bullet || "";
      const trimKey = key.trim();
      const items = values
        .split(/,\s*/)
        .map((v: string) => v.trim())
        .filter(Boolean);

      // Only transform if there are multiple items (looks like a list)
      if (items.length < 2) {
        return `${prefix}**${trimKey}:** ${values.trim()}`;
      }
      const formatted = items.map((i: string) => `\`${i}\``).join(", ");
      return `${prefix}**${trimKey}:** ${formatted}`;
    },
  );

  // ── Pattern 2: Lines like "returned N objects:" → make it a heading-like bold line
  result = result.replace(
    /^(.*(?:returned|found|shows?|contains?|listing)\s+\d+\s+(?:objects?|items?|tables?|results?|rows?).*?)$/gmi,
    (_match, line) => {
      // Don't double-bold
      if (line.trim().startsWith("**")) return line;
      return `**${line.trim()}**`;
    },
  );

  // ── Pattern 3: Ensure blank lines between structural sections for proper paragraph breaks
  // Fix consecutive lines that should have paragraph breaks (e.g. a summary followed by a list)
  result = result.replace(/([^\n])\n([-*+\u2022]\s)/g, "$1\n\n$2");

  // ── Pattern 4: Fix orphaned bullet items that lack a preceding blank line after a heading/paragraph
  result = result.replace(/([^\n-*+\u2022].*\S)\n(\s*[-*+\u2022]\s)/g, "$1\n\n$2");

  return result;
}

/* ── Auto-chart injection ────────────────────────────────────────── */

/**
 * Pre-process markdown to inject ```chart code-blocks and convert
 * structured bullet-list data into proper tables with charts.
 *
 * Handles two patterns:
 * 1. Pipe-delimited markdown tables → inject chart above
 * 2. Bullet lists with consistent numeric data → convert to table + chart
 */
function injectChartsAboveTables(markdown: string): string {
  if (!markdown || markdown.length < 30) return markdown;

  let result = markdown;
  let injected = 0;
  const MAX_CHARTS = 3;

  // ── Pass 0: Strip broken markdown images (no valid URL) ────────
  result = result.replace(/!\[([^\]]*)\]\((?!https?:\/\/).*?\)\s*/g, "");

  // ── Pass 1: Convert structured bullet lists to tables ──────────
  result = convertBulletListsToTables(result);

  // ── Pass 2: Inject charts above pipe-delimited tables ──────────
  const tableRe =
    /((?:^[ \t]*\|.+\|[ \t]*\n)(?:^[ \t]*\|[ \t:]*[-]+[-| :\t]*\|[ \t]*\n)(?:^[ \t]*\|.+\|[ \t]*(?:\n|$)){2,})/gm;

  result = result.replace(tableRe, (match, _group, offset) => {
    if (injected >= MAX_CHARTS) return match;

    const preceding = result.slice(Math.max(0, offset - 300), offset);
    if (/```chart[\s\S]*```\s*$/m.test(preceding)) return match;

    const parsed = parseMarkdownTable(match);
    if (!parsed) return match;

    const title = extractTitleFromContext(preceding);
    const spec = buildChartSpecFromTable(parsed.headers, parsed.rows, title);
    if (!spec) return match;

    injected++;
    return "```chart\n" + JSON.stringify(spec) + "\n```\n\n" + match;
  });

  return result;
}

/* ── Bullet-list → table conversion ──────────────────────────────── */

/**
 * Detect consecutive bullet list items that contain structured data
 * (label: value / value / value) and convert them to a markdown table.
 *
 * Patterns matched:
 *   - Feb: 9 / $1.94K / $216
 *   - Q1 2024: 500, 300, 200
 *   - Widget A – 1,234 | 56% | $99
 */
function convertBulletListsToTables(markdown: string): string {
  const bulletBlockRe =
    /((?:^[ \t]*[-*+\u2022][ \t]+.+(?:\n|$)){3,})/gm;

  return markdown.replace(bulletBlockRe, (block, _group, offset: number) => {
    const lines = block
      .trim()
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /^[-*+\u2022]\s/.test(l));

    if (lines.length < 3) return block;

    // Try to parse each bullet into { label, values[] }
    const parsed = lines.map(parseBulletLine);

    // Check that most lines parsed successfully with the same # of values
    const validParsed = parsed.filter((p) => p !== null && p.values.length > 0);
    if (validParsed.length < 3) return block;

    // Check consistent column count (mode of value counts)
    const colCounts = validParsed.map((p) => p!.values.length);
    const modeCount = mode(colCounts);
    const consistent = validParsed.filter((p) => p!.values.length === modeCount);
    if (consistent.length < 3) return block;

    // At least one column must be predominantly numeric
    const hasNumeric = Array.from({ length: modeCount }, (_, ci) =>
      consistent.filter((p) => {
        const val = p!.values[ci];
        return isNumericish(val);
      }).length,
    ).some((count) => count >= consistent.length * 0.6);

    if (!hasNumeric) return block;

    // Extract headers from preceding heading context, with fallback
    const preceding = markdown.slice(Math.max(0, offset - 500), offset);
    const headers = extractHeadersFromContext(preceding, modeCount, consistent)
                    || inferBulletHeaders(modeCount, consistent);

    const sep = headers.map(() => "---").join(" | ");
    const headerRow = "| " + headers.join(" | ") + " |";
    const sepRow = "| " + sep + " |";
    const dataRows = consistent.map((p) => {
      const cells = [p!.label, ...p!.values];
      return "| " + cells.join(" | ") + " |";
    });

    const table = [headerRow, sepRow, ...dataRows].join("\n");

    // Replace just the matched bullet lines with the table
    // Keep any text annotations (like "← soft spot") as they'll be in the cells
    return "\n" + table + "\n";
  });
}

interface BulletParsed {
  label: string;
  values: string[];
  raw: string;
}

function parseBulletLine(line: string): BulletParsed | null {
  // Strip bullet marker (-, *, +, or •)
  const content = line.replace(/^[-*+\u2022]\s+/, "").trim();
  // Strip inline bold/italic for matching (keep raw for display)
  const clean = content.replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1");

  // Try pattern: "Label: V1 · V2 · V3" (middle-dot — common from AI)
  const dotMatch = clean.match(
    /^(.+?)\s*[:–\u2014-]\s*(.+?(?:\s*[\u00b7\u2022]\s*.+)+)$/,
  );
  if (dotMatch) {
    const label = dotMatch[1].trim();
    const values = dotMatch[2].split(/\s*[\u00b7\u2022]\s*/).map((v) => v.trim()).filter(Boolean);
    if (values.length >= 1 && values.some((v) => isNumericish(v))) {
      return { label, values, raw: content };
    }
  }

  // Try pattern: "Label: V1 / V2 / V3" (slash-delimited)
  const slashMatch = clean.match(
    /^(.+?)\s*[:–\u2014-]\s*(.+?(?:\s*\/\s*.+)+)$/,
  );
  if (slashMatch) {
    const label = slashMatch[1].trim();
    const values = slashMatch[2].split(/\s*\/\s*/).map((v) => v.trim());
    if (values.length >= 1 && values.some((v) => isNumericish(v))) {
      return { label, values, raw: content };
    }
  }

  // Try pattern: "Label: V1, V2, V3" (comma-delimited, only if values look numeric)
  const commaMatch = clean.match(
    /^(.+?)\s*[:–\u2014-]\s*(.+?(?:\s*,\s*.+)+)$/,
  );
  if (commaMatch) {
    const label = commaMatch[1].trim();
    const values = commaMatch[2].split(/\s*,\s*/).map((v) => v.trim());
    const numericCount = values.filter((v) => isNumericish(v)).length;
    if (values.length >= 2 && numericCount >= values.length * 0.5) {
      return { label, values, raw: content };
    }
  }

  // Try pattern: "Label | V1 | V2 | V3" (pipe-delimited)
  const pipeMatch = clean.match(
    /^(.+?)\s*[:–\u2014-]\s*(.+?(?:\s*\|\s*.+)+)$/,
  );
  if (pipeMatch) {
    const label = pipeMatch[1].trim();
    const values = pipeMatch[2].split(/\s*\|\s*/).map((v) => v.trim());
    if (values.length >= 1) {
      return { label, values, raw: content };
    }
  }

  // Try pattern: "Label – Value" (single value with separator)
  const singleMatch = clean.match(
    /^(.+?)\s*[:–\u2014]\s+(.+)$/,
  );
  if (singleMatch) {
    const label = singleMatch[1].trim();
    const val = singleMatch[2].trim();
    if (isNumericish(val.split(/\s/)[0])) {
      return { label, values: [val], raw: content };
    }
  }

  return null;
}

/** Check if a string starts with a number ($1.94K, 42%, 9 orders, $215 AOV, etc.) */
function isNumericish(val: string): boolean {
  if (!val) return false;
  const s = val
    .replace(/\*{1,2}|_{1,2}/g, "")  // strip bold/italic
    .replace(/[←→↑↓].*/g, "")        // strip annotation arrows
    .replace(/\(.*\)/g, "")           // strip parenthetical notes
    .trim();
  return /^[~≈$]?\s*[\d,.]+/.test(s);
}

function mode(arr: number[]): number {
  const freq = new Map<number, number>();
  for (const v of arr) freq.set(v, (freq.get(v) || 0) + 1);
  let best = arr[0];
  let bestCount = 0;
  for (const [val, count] of freq) {
    if (count > bestCount) {
      best = val;
      bestCount = count;
    }
  }
  return best;
}

/* ── Context extraction helpers ──────────────────────────────────── */

function extractHeadersFromContext(
  preceding: string,
  valueCount: number,
  _items: (BulletParsed | null)[],
): string[] | null {
  // Look for "heading (col1 / col2 / col3)" pattern in preceding text
  // Strip bold/italic markers before matching
  const clean = preceding.replace(/\*{1,2}/g, "");
  const parenMatch = clean.match(/\(([^)]{5,})\)\s*$/);
  if (parenMatch) {
    const parts = parenMatch[1]
      .split(/\s*[/|,\u00b7\u2022]\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === valueCount) {
      const labelName = extractLabelName(preceding) || "Label";
      return [labelName, ...parts.map(capitalizeFirst)];
    }
  }
  return null;
}

function extractLabelName(preceding: string): string | null {
  const lower = preceding.toLowerCase();
  if (/month|monthly/.test(lower)) return "Month";
  if (/quarter|quarterly/.test(lower)) return "Quarter";
  if (/year|annual/.test(lower)) return "Year";
  if (/week|weekly/.test(lower)) return "Week";
  if (/day|daily|date/.test(lower)) return "Date";
  if (/product|sku|item/.test(lower)) return "Product";
  if (/customer|user|account/.test(lower)) return "Customer";
  return null;
}

function extractTitleFromContext(preceding: string): string | null {
  const lines = preceding.split("\n").reverse();
  for (const line of lines) {
    // Strip bold markers first for consistent matching
    const cleaned = line.replace(/\*{1,2}/g, "").trim();
    // Match heading: "## Title" or "## Title (subtitle)"
    const headingMatch = cleaned.match(/^#{1,4}\s+(.+?)(?:\s*\(.*\))?\s*$/);
    if (headingMatch) {
      return headingMatch[1].trim();
    }
    // Match plain bold title line: "Title" or "Title (subtitle)"
    if (line.match(/^\s*\*\*/)) {
      const titleMatch = cleaned.match(/^(.+?)(?:\s*\(.*\))?\s*$/);
      if (titleMatch) {
        return titleMatch[1].trim();
      }
    }
    // Stop at non-empty, non-list lines
    if (line.trim() && !line.match(/^\s*[-*+\u2022|#]/)) break;
  }
  return null;
}

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function inferBulletHeaders(
  valueCount: number,
  items: (BulletParsed | null)[],
): string[] {
  // Default generic headers
  const headers = ["Label"];
  for (let i = 0; i < valueCount; i++) {
    // Try to guess from values
    const sample = items[0]?.values[i] || "";
    if (/\$/.test(sample) || /revenue|amount|cost|price/i.test(sample)) {
      headers.push(`Value ${i + 1} ($)`);
    } else if (/%/.test(sample)) {
      headers.push(`Value ${i + 1} (%)`);
    } else {
      headers.push(`Value ${i + 1}`);
    }
  }
  return headers;
}

/* ── Table chart spec builder ────────────────────────────────────── */

function buildChartSpecFromTable(
  headers: string[],
  rows: string[][],
  title?: string | null,
): Record<string, unknown> | null {
  const numericMask = headers.map((_, ci) => {
    const numericCount = rows.filter((r) => isNumericCell(r[ci])).length;
    return numericCount >= rows.length * 0.6;
  });

  let labelIdx = headers.findIndex((_, ci) => !numericMask[ci]);
  const valueCols = headers
    .map((h, ci) => ({ header: h, index: ci }))
    .filter((_, ci) => numericMask[ci]);

  if (valueCols.length === 0) return null;

  if (labelIdx === -1) {
    labelIdx = 0;
    const idx = valueCols.findIndex((v) => v.index === 0);
    if (idx !== -1) valueCols.splice(idx, 1);
    if (valueCols.length === 0) return null;
  }

  const data = rows.map((row) => {
    const entry: Record<string, unknown> = {
      // Strip markdown bold/italic markers from label for clean chart axes
      [headers[labelIdx]]: (row[labelIdx] || "").replace(/\*{1,2}|_{1,2}/g, ""),
    };
    for (const vc of valueCols) {
      entry[vc.header] = parseNumericCell(row[vc.index]);
    }
    return entry;
  });

  const isTimeSeries = rows.some((row) => looksLikeDate(row[labelIdx]));
  const manyRows = rows.length > 15;
  const chartType = isTimeSeries || manyRows ? "line" : "bar";

  const spec: Record<string, unknown> = {
    type: chartType,
    ...(title ? { title } : {}),
    data,
    xKey: headers[labelIdx],
    height: 250,
  };

  if (valueCols.length === 1) {
    spec.yKey = valueCols[0].header;
  } else {
    spec.series = valueCols.map((vc) => ({ key: vc.header }));
  }

  return spec;
}

/** Parse a pipe-delimited markdown table into headers and rows */
function parseMarkdownTable(
  tableStr: string,
): { headers: string[]; rows: string[][] } | null {
  const lines = tableStr
    .trim()
    .split("\n")
    .map((l) => l.trim());
  if (lines.length < 3) return null;

  const parseRow = (line: string) =>
    line
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((c) => c.trim());

  const headers = parseRow(lines[0]);

  // Validate separator
  if (!/^[\s|:-]+$/.test(lines[1].replace(/^\||\|$/g, ""))) return null;

  const rows = lines
    .slice(2)
    .filter((l) => l.includes("|"))
    .map(parseRow)
    .filter((r) => r.length === headers.length);

  if (rows.length < 2) return null;
  return { headers, rows };
}

function isNumericCell(val: string | undefined): boolean {
  if (!val) return false;
  const s = val
    .replace(/\*{1,2}|_{1,2}/g, "")
    .replace(/[←→↑↓].*/g, "")
    .replace(/\(.*\)/g, "")
    .trim();
  return /^[~≈$]?\s*[\d,.]+/.test(s);
}

function parseNumericCell(val: string | undefined): number {
  if (!val) return 0;
  const s = val
    .replace(/\*{1,2}|_{1,2}/g, "")
    .replace(/[←→↑↓].*/g, "")
    .replace(/\(.*\)/g, "")
    .trim();
  const match = s.match(/^[~≈$]?\s*([\d,.]+)\s*([KMBkmb])?/);
  if (!match) return 0;
  const num = Number(match[1].replace(/,/g, ""));
  if (isNaN(num)) return 0;
  const suffix = (match[2] || "").toUpperCase();
  const mult = suffix === "K" ? 1e3 : suffix === "M" ? 1e6 : suffix === "B" ? 1e9 : 1;
  return num * mult;
}

function looksLikeDate(val: string): boolean {
  return /\d{4}[-/]\d{1,2}|Q[1-4]\s*\d{4}|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/i.test(
    val,
  );
}
