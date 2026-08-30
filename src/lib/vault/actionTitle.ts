/**
 * Derive a short action title from a Gideon answer (first meaningful line).
 */
export function titleFromAssistantPlainText(
  plainText: string,
  maxLen = 120
): string {
  const lines = plainText
    .split(/\r?\n/)
    .map((l) =>
      l
        .replace(/^#{1,6}\s+/, "")
        .replace(/^[-*•]\s+/, "")
        .replace(/^\d+[.)]\s+/, "")
        .replace(/\*\*/g, "")
        .trim()
    )
    .filter(Boolean);

  const skip = /^(projects?|contracts?|sources?|important details?|key (stats|facts)|overview|summary)\b/i;
  const line =
    lines.find((l) => !skip.test(l) && l.length > 8) ?? lines[0] ?? "";
  if (!line) return "Follow up from Gideon";
  if (line.length <= maxLen) return line;
  return `${line.slice(0, maxLen - 1).trimEnd()}…`;
}

/** Short body snippet for Today card summary (not the title line). */
export function snippetFromAssistantPlainText(
  plainText: string,
  title: string,
  maxLen = 220
): string | null {
  const cleaned = plainText.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  let rest = cleaned;
  if (title && cleaned.startsWith(title)) {
    rest = cleaned.slice(title.length).replace(/^[\s—–:-]+/, "");
  }
  if (!rest || rest.length < 12) return null;
  if (rest.length <= maxLen) return rest;
  return `${rest.slice(0, maxLen - 1).trimEnd()}…`;
}
