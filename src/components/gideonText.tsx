/**
 * Render stray markdown AI responses sometimes emit (**bold**, # headings)
 * instead of showing raw asterisks and hashes. Used inside
 * whitespace-pre-wrap containers, so newlines are preserved.
 */
export function renderGideonText(text: string): React.ReactNode[] {
  return text.split(/\r?\n/).map((line, i) => {
    const heading = line.match(/^#{1,4}\s+(.+)$/);
    const source = heading ? heading[1] : line;
    const parts = source
      .split(/\*\*([^*]+)\*\*/g)
      .map((part, j) =>
        j % 2 === 1 ? <strong key={j}>{part}</strong> : part
      );
    return (
      <span key={i} className={heading ? "font-semibold" : undefined}>
        {parts}
        {"\n"}
      </span>
    );
  });
}
