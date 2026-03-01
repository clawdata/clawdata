"use client";

import { memo, useState } from "react";
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

/**
 * Renders a markdown string with GFM support, syntax‑highlighted code blocks,
 * a copy button on fenced code, inline chart rendering, and SVG support.
 */
export const MarkdownContent = memo(function MarkdownContent({
  content,
  className,
}: MarkdownContentProps) {
  // If the content looks like plain text (no markdown markers), render raw.
  const looksPlain = !hasMarkdownSyntax(content);

  if (looksPlain) {
    return <p className={cn("whitespace-pre-wrap", className)}>{content}</p>;
  }

  return (
    <div className={cn("prose prose-sm dark:prose-invert max-w-none", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          code({ className: codeClass, children, ...rest }: any) {
            const match = /language-(\w+)/.exec(codeClass || "");
            const codeString = String(children).replace(/\n$/, "");
            const language = match?.[1] || "";

            // Chart blocks → render interactive chart
            if (language === "chart") {
              return <ChartRenderer spec={codeString} />;
            }

            // SVG blocks → render inline SVG
            if (language === "svg") {
              return <SvgRenderer svg={codeString} />;
            }

            if (match) {
              return (
                <CodeBlock language={language} code={codeString} />
              );
            }

            return (
              <code className={cn("rounded bg-muted px-1 py-0.5 text-xs font-mono", codeClass)} {...rest}>
                {children}
              </code>
            );
          },
          // Style tables nicely
          table({ children }) {
            return (
              <div className="my-2 overflow-x-auto rounded-lg border">
                <table className="min-w-full text-xs">{children}</table>
              </div>
            );
          },
          thead({ children }) {
            return (
              <thead className="bg-muted/50">{children}</thead>
            );
          },
          th({ children }) {
            return (
              <th className="border-b bg-muted px-3 py-1.5 text-left text-xs font-semibold">
                {children}
              </th>
            );
          },
          td({ children }) {
            return (
              <td className="border-b px-3 py-1.5 text-xs tabular-nums">{children}</td>
            );
          },
          tr({ children }) {
            return (
              <tr className="transition-colors hover:bg-muted/30">{children}</tr>
            );
          },
          // Links open in new tab
          a({ href, children }) {
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
          },
          // Prevent prose from adding excessive spacing on paragraphs
          p({ children }) {
            return <p className="my-1 leading-relaxed">{children}</p>;
          },
          // Better list styling
          ul({ children }) {
            return <ul className="my-1 ml-4 list-disc space-y-0.5">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="my-1 ml-4 list-decimal space-y-0.5">{children}</ol>;
          },
          li({ children }) {
            return <li className="text-sm leading-relaxed">{children}</li>;
          },
          // Styled blockquotes for insights / callouts
          blockquote({ children }) {
            return (
              <blockquote className="my-2 border-l-4 border-primary/40 bg-primary/5 pl-3 py-1 text-sm italic">
                {children}
              </blockquote>
            );
          },
          // Better heading styles inside chat
          h1({ children }) {
            return <h1 className="mt-3 mb-1 text-lg font-bold">{children}</h1>;
          },
          h2({ children }) {
            return <h2 className="mt-3 mb-1 text-base font-bold">{children}</h2>;
          },
          h3({ children }) {
            return <h3 className="mt-2 mb-1 text-sm font-semibold">{children}</h3>;
          },
          h4({ children }) {
            return <h4 className="mt-2 mb-0.5 text-sm font-semibold text-muted-foreground">{children}</h4>;
          },
          // Horizontal rule as a visual separator
          hr() {
            return <hr className="my-3 border-t border-border" />;
          },
        }}
      >
        {content}
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
  // Quick checks for common markdown markers
  return /```|^\s*#{1,6}\s|\*\*|__|\[.*\]\(.*\)|^\s*[-*+]\s|^\s*\d+\.\s|^\s*>\s|^\|/m.test(
    text,
  );
}
