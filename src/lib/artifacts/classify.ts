import type { ArtifactSourceType } from "./types";

const EMAIL_HEADER =
  /^(from|to|cc|bcc|subject|sent|date|reply-to)\s*:/im;
const EMAIL_QUOTE = /^(>|\s*On .+ wrote:)/m;
const EMAIL_THREAD_MARKERS =
  /\b(forwarded message|original message|begin forwarded message)\b/i;
const EMAIL_ADDR = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

/**
 * Classify ingested / pasted content into an artifact source type.
 * Email threads take precedence over generic pasted_text.
 */
export function classifySourceType(args: {
  content?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  documentType?: string | null;
}): ArtifactSourceType {
  const content = (args.content ?? "").trim();
  const fileName = (args.fileName ?? "").toLowerCase();
  const mime = (args.mimeType ?? "").toLowerCase();
  const docType = (args.documentType ?? "").toLowerCase();

  if (looksLikeEmailThread(content)) return "email_thread";
  if (looksLikeSingleEmail(content)) return "email";

  if (
    mime.startsWith("image/") ||
    /\.(jpe?g|png|gif|webp|heic|bmp)$/i.test(fileName)
  ) {
    if (/screenshot|screen.?shot|snip/i.test(fileName) || /screenshot/i.test(content.slice(0, 200))) {
      return "screenshot";
    }
    return "image";
  }

  if (
    mime.includes("spreadsheet") ||
    mime.includes("excel") ||
    /\.(xlsx?|csv|tsv)$/i.test(fileName)
  ) {
    return "spreadsheet";
  }

  if (
    /^(web|url|crawl)/i.test(fileName) ||
    /^Source:\s*https?:\/\//im.test(content.slice(0, 400))
  ) {
    return "web_page";
  }

  if (
    /calendar|ics|invite|meeting invite/i.test(fileName) ||
    docType === "calendar_event"
  ) {
    return "calendar_event";
  }

  if (/^pasted/i.test(fileName) || fileName.includes("pasted text")) {
    return "pasted_text";
  }

  if (mime.startsWith("text/") && content.length > 0) {
    return content.length < 800 && !EMAIL_HEADER.test(content)
      ? "note"
      : "document";
  }

  if (content.length > 0 && !mime) {
    return content.length < 400 ? "note" : "pasted_text";
  }

  return "document";
}

/** True when text resembles a multi-message email thread. */
export function looksLikeEmailThread(text: string): boolean {
  const t = text.trim();
  if (t.length < 80) return false;

  const headerHits = countMatches(t, EMAIL_HEADER);
  const hasAddrs = EMAIL_ADDR.test(t);
  const hasQuote = EMAIL_QUOTE.test(t) || EMAIL_THREAD_MARKERS.test(t);
  const fromCount = (t.match(/^from\s*:/gim) ?? []).length;
  const subjectCount = (t.match(/^subject\s*:/gim) ?? []).length;

  if (fromCount >= 2 && (hasAddrs || subjectCount >= 1)) return true;
  if (headerHits >= 3 && hasAddrs) return true;
  if (hasQuote && headerHits >= 2 && hasAddrs) return true;
  if (EMAIL_THREAD_MARKERS.test(t) && headerHits >= 2) return true;

  // Soft: From + To + body with reply cues
  if (
    /^from\s*:/im.test(t) &&
    /^to\s*:/im.test(t) &&
    /\b(thanks|please|can you|let me know|meeting|attached)\b/i.test(t) &&
    hasAddrs
  ) {
    // Single email still classified separately unless thread markers / multi-from
    return fromCount >= 2 || hasQuote || EMAIL_THREAD_MARKERS.test(t);
  }

  return false;
}

export function looksLikeSingleEmail(text: string): boolean {
  const t = text.trim();
  if (t.length < 40) return false;
  if (looksLikeEmailThread(t)) return false;
  const headerHits = countMatches(t, EMAIL_HEADER);
  return (
    headerHits >= 2 &&
    EMAIL_ADDR.test(t) &&
    (/^from\s*:/im.test(t) || /^to\s*:/im.test(t))
  );
}

function countMatches(text: string, re: RegExp): number {
  const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
  const global = new RegExp(re.source, flags);
  return (text.match(global) ?? []).length;
}
