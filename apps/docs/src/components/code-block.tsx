"use client";

import { useState, useCallback } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Check, Copy } from "@phosphor-icons/react";

const LANG_LABELS: Record<string, string> = {
  bash: "Bash",
  sh: "Shell",
  json: "JSON",
  python: "Python",
  py: "Python",
  typescript: "TypeScript",
  ts: "TypeScript",
  javascript: "JavaScript",
  js: "JavaScript",
  tsx: "TSX",
  jsx: "JSX",
  html: "HTML",
  css: "CSS",
  sql: "SQL",
  yaml: "YAML",
  yml: "YAML",
  http: "HTTP",
  text: "Text",
  plaintext: "Text",
};

export function CodeBlock({
  language,
  children,
}: {
  language: string;
  children: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [children]);

  const label = LANG_LABELS[language.toLowerCase()] ?? language.toUpperCase();

  return (
    <div className="my-7 overflow-hidden rounded-lg border border-[var(--docs-line)]">
      <div className="flex items-center justify-between border-b border-[var(--docs-line)] bg-[var(--docs-control)] px-4 py-2.5">
        <span className="select-none text-[9px] font-medium uppercase tracking-[0.15em] text-[var(--docs-muted-faint)]">
          {label}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] text-[var(--docs-muted)] transition-colors hover:bg-[var(--docs-control-hover)] hover:text-[var(--docs-ink)]"
        >
          {copied ? (
            <>
              <Check size={14} />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy size={14} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <SyntaxHighlighter
        language={language}
        style={oneDark}
        customStyle={{
          margin: 0,
          padding: "1rem 1.25rem",
          background: "#090908",
          fontSize: "13px",
          lineHeight: "1.7",
          borderRadius: 0,
          overflowX: "auto",
        }}
        codeTagProps={{
          style: { fontFamily: "var(--font-geist-mono), ui-monospace, monospace" },
        }}
      >
        {children}
      </SyntaxHighlighter>
    </div>
  );
}
