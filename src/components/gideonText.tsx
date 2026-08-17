/**
 * Render stray markdown AI responses sometimes emit (**bold**, # headings)
 * instead of showing raw asterisks and hashes. Used inside
 * whitespace-pre-wrap containers, so newlines are preserved.
 * Also turns http(s) URLs into clickable links (YouTube, etc.).
 */

import type { ReactNode } from "react";

const URL_SPLIT_RE = /(https?:\/\/[^\s<>"')\]]+)/g;

function linkifyPlainText(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(URL_SPLIT_RE);
  const nodes: ReactNode[] = [];
  for (let j = 0; j < parts.length; j++) {
    const part = parts[j] ?? "";
    if (/^https?:\/\//i.test(part)) {
      const href = part.replace(/[.,;:!?)]+$/, "");
      const trailing = part.slice(href.length);
      nodes.push(
        <span key={`${keyPrefix}-${j}`}>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-brand underline underline-offset-2 break-all"
          >
            {href}
          </a>
          {trailing}
        </span>
      );
    } else if (part) {
      nodes.push(part);
    }
  }
  return nodes;
}

export function renderGideonText(text: string): ReactNode[] {
  return text.split(/\r?\n/).map((line, i) => {
    const heading = line.match(/^#{1,4}\s+(.+)$/);
    const source = heading ? heading[1]! : line;
    const segments = source.split(/\*\*([^*]+)\*\*/g);
    const parts: ReactNode[] = [];
    for (let j = 0; j < segments.length; j++) {
      const part = segments[j] ?? "";
      if (j % 2 === 1) {
        parts.push(
          <strong key={`b-${i}-${j}`}>
            {linkifyPlainText(part, `bs-${i}-${j}`)}
          </strong>
        );
      } else {
        parts.push(...linkifyPlainText(part, `t-${i}-${j}`));
      }
    }
    return (
      <span key={i} className={heading ? "font-semibold" : undefined}>
        {parts}
        {"\n"}
      </span>
    );
  });
}
