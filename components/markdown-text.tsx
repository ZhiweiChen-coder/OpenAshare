"use client";

import type { ReactNode } from "react";

export function MarkdownText({ content }: { content: string }) {
  const blocks = content.split(/\n{2,}/).filter(Boolean);
  return (
    <div className="markdown-body">
      {blocks.map((block, index) => {
        const trimmed = block.trim();
        if (!trimmed) {
          return null;
        }
        if (trimmed.startsWith("```") && trimmed.endsWith("```")) {
          return (
            <pre key={`${index}-${trimmed.slice(0, 12)}`}>
              <code>{trimmed.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "")}</code>
            </pre>
          );
        }
        if (trimmed.startsWith("### ")) {
          return <h3 key={`${index}-${trimmed}`}>{trimmed.slice(4)}</h3>;
        }
        if (trimmed.startsWith("## ")) {
          return <h2 key={`${index}-${trimmed}`}>{trimmed.slice(3)}</h2>;
        }
        if (trimmed.startsWith("# ")) {
          return <h1 key={`${index}-${trimmed}`}>{trimmed.slice(2)}</h1>;
        }

        const lines = trimmed.split("\n");
        if (lines.every((line) => /^[-*]\s+/.test(line))) {
          return (
            <ul key={`${index}-${trimmed.slice(0, 12)}`}>
              {lines.map((line, lineIndex) => (
                <li key={`${lineIndex}-${line}`}>{renderInlineMarkdown(line.replace(/^[-*]\s+/, ""))}</li>
              ))}
            </ul>
          );
        }
        if (lines.every((line) => /^\d+\.\s+/.test(line))) {
          return (
            <ol key={`${index}-${trimmed.slice(0, 12)}`}>
              {lines.map((line, lineIndex) => (
                <li key={`${lineIndex}-${line}`}>{renderInlineMarkdown(line.replace(/^\d+\.\s+/, ""))}</li>
              ))}
            </ol>
          );
        }
        return <p key={`${index}-${trimmed.slice(0, 12)}`}>{renderInlineMarkdown(trimmed)}</p>;
      })}
    </div>
  );
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const tokens = text.split(/(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return tokens.map((token, index) => {
    if (token.startsWith("**") && token.endsWith("**")) {
      return <strong key={`${token}-${index}`}>{token.slice(2, -2)}</strong>;
    }
    if (token.startsWith("`") && token.endsWith("`")) {
      return <code key={`${token}-${index}`}>{token.slice(1, -1)}</code>;
    }
    const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return (
        <a href={linkMatch[2]} key={`${token}-${index}`} target="_blank" rel="noreferrer">
          {linkMatch[1]}
        </a>
      );
    }
    return <span key={`${token}-${index}`}>{token}</span>;
  });
}

