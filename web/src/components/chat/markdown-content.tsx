"use client";

import { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

interface MarkdownContentProps {
  content: string;
  className?: string;
}

/**
 * Renders a markdown string with GFM support, syntax‑highlighted code blocks,
 * and a copy button on fenced code.
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

            if (match) {
              return (
                <CodeBlock language={match[1]} code={codeString} />
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
              <div className="my-2 overflow-x-auto rounded border">
                <table className="min-w-full text-xs">{children}</table>
              </div>
            );
          },
          th({ children }) {
            return (
              <th className="border-b bg-muted px-3 py-1.5 text-left text-xs font-medium">
                {children}
              </th>
            );
          },
          td({ children }) {
            return (
              <td className="border-b px-3 py-1.5 text-xs">{children}</td>
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

/* ── Heuristic: does the string contain markdown syntax? ─────────── */

function hasMarkdownSyntax(text: string): boolean {
  // Quick checks for common markdown markers
  return /```|^\s*#{1,6}\s|\*\*|__|\[.*\]\(.*\)|^\s*[-*+]\s|^\s*\d+\.\s|^\s*>\s|^\|/m.test(
    text,
  );
}
