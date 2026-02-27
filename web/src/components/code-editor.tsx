"use client";

import { useCallback } from "react";
import { useTheme } from "next-themes";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { yaml } from "@codemirror/lang-yaml";
import { json } from "@codemirror/lang-json";
import { languages } from "@codemirror/language-data";
import { EditorView } from "@codemirror/view";

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: "markdown" | "yaml" | "json" | "text";
  placeholder?: string;
  readOnly?: boolean;
  minHeight?: string;
  maxHeight?: string;
  className?: string;
}

const langExtensions = {
  markdown: [markdown({ codeLanguages: languages })],
  yaml: [yaml()],
  json: [json()],
  text: [],
};

/**
 * CodeMirror-based editor with theme integration and language support.
 * Drop-in replacement for `<Textarea>` in file editing contexts.
 */
export function CodeEditor({
  value,
  onChange,
  language = "markdown",
  placeholder = "Start typing…",
  readOnly = false,
  minHeight = "400px",
  maxHeight = "calc(100vh - 300px)",
  className,
}: CodeEditorProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const handleChange = useCallback(
    (val: string) => {
      onChange(val);
    },
    [onChange],
  );

  return (
    <div className={className}>
      <CodeMirror
        value={value}
        onChange={handleChange}
        theme={isDark ? "dark" : "light"}
        placeholder={placeholder}
        readOnly={readOnly}
        extensions={[
          ...(langExtensions[language] ?? []),
          EditorView.lineWrapping,
        ]}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLineGutter: true,
          highlightActiveLine: true,
          foldGutter: true,
          bracketMatching: true,
          closeBrackets: true,
          autocompletion: false,
          searchKeymap: true,
          indentOnInput: true,
        }}
        style={{
          minHeight,
          maxHeight,
          overflow: "auto",
          fontSize: "13px",
          borderRadius: "0.375rem",
          border: "1px solid hsl(var(--border))",
        }}
      />
    </div>
  );
}
