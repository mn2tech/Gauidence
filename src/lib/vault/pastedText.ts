import { classifySourceType, looksLikeEmailThread } from "@/lib/artifacts/classify";

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
  const sourceType = classifySourceType({
    content: body,
    fileName: title || undefined,
    mimeType: "text/plain",
  });
  const typeLabel =
    sourceType === "email_thread"
      ? "Email thread"
      : sourceType === "email"
        ? "Email"
        : sourceType === "web_page"
          ? "Web page"
          : "Pasted";
  const base = title
    ? `${typeLabel} - ${safeFileName(title)}`
    : looksLikeEmailThread(body)
      ? `Email thread ${stamp}`
      : `${typeLabel} text ${stamp}`;
  const fileName = base.toLowerCase().endsWith(".txt") ? base : `${base}.txt`;
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  return new File([blob], fileName, {
    type: "text/plain",
    lastModified: Date.now(),
  });
}

/** Classify paste payload for artifact identity at ingest time. */
export function classifyPastedArtifact(content: string): {
  sourceType: ReturnType<typeof classifySourceType>;
} {
  return {
    sourceType: classifySourceType({
      content,
      mimeType: "text/plain",
      fileName: "pasted-text.txt",
    }),
  };
}
