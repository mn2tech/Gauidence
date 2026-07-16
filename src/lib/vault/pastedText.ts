/** Soft cap for pasted text so analysis stays fast and focused. */
export const VAULT_PASTE_MAX_CHARS = 50_000;

function safeFileName(name: string) {
  return name.replace(/[^\w.\- ]/g, "_").trim() || "pasted-text";
}

/** Build a .txt File from pasted content for vault upload + analysis. */
export function buildPastedTextFile(args: {
  title?: string;
  content: string;
  sourceUrl?: string;
}): File {
  const body = args.content.trim();
  const title = args.title?.trim() || "";
  const sourceUrl = args.sourceUrl?.trim() || "";
  const parts: string[] = [];
  if (title) parts.push(`Title: ${title}`);
  if (sourceUrl) parts.push(`Source: ${sourceUrl}`);
  if (parts.length > 0) parts.push("");
  parts.push(body);
  const text = parts.join("\n");
  const stamp = new Date().toISOString().slice(0, 10);
  const base = title
    ? `Pasted - ${safeFileName(title)}`
    : `Pasted text ${stamp}`;
  const fileName = base.toLowerCase().endsWith(".txt") ? base : `${base}.txt`;
  return new File([text], fileName, { type: "text/plain" });
}
