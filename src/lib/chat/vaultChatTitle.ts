/** Default Ask Gideon prompts when the user sends a file without typing. */
export const DEFAULT_IMAGE_ATTACHMENT_QUESTION =
  "What do you see in this image? Transcribe any lists or notes clearly.";

const SUMMARIZE_FILE_PROMPT =
  /^Summarize what matters in .+\.$/i;

export function isDefaultAttachmentPrompt(question: string): boolean {
  const q = question.trim();
  if (q === DEFAULT_IMAGE_ATTACHMENT_QUESTION) return true;
  return SUMMARIZE_FILE_PROMPT.test(q);
}

export function isGenericVaultChatTitle(title: string): boolean {
  const t = title.trim();
  if (!t || t === "New chat") return true;
  if (isDefaultAttachmentPrompt(t)) return true;
  return SUMMARIZE_FILE_PROMPT.test(t);
}

/** When to replace the first-message title with an AI-generated label. */
export function shouldGenerateVaultChatTitle(args: {
  isFirstExchange: boolean;
  question: string;
}): boolean {
  if (!args.isFirstExchange) return false;
  const q = args.question.trim();
  if (!q) return false;
  if (isDefaultAttachmentPrompt(q)) return true;
  // Keep clear short user questions as the title (already set from the question).
  if (q.length <= 40) return false;
  return true;
}

export function sanitizeGeneratedChatTitle(raw: string): string | null {
  let t = raw
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ");
  t = t.replace(/^#+\s*/, "").replace(/[.?!]+$/, "").trim();
  if (!t || t.length < 2) return null;
  if (t.length > 48) t = `${t.slice(0, 47).trimEnd()}…`;
  return t;
}
