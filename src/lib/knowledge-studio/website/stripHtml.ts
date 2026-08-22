/**
 * Strip HTML to plain visible text for Knowledge Studio website scans.
 * Pure helper — no DOM dependency. Treat output as untrusted.
 */

const BLOCK_BREAK =
  /<\/(p|div|section|article|h[1-6]|li|tr|br|hr|header|footer|nav|main)>/gi;

export function stripHtmlToText(html: string, maxChars: number): string {
  let text = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, " ")
    .replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, " ");

  text = text.replace(BLOCK_BREAK, "\n");
  text = text.replace(/<[^>]+>/g, " ");
  text = text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  // Drop common cookie / consent noise lines.
  text = text
    .split("\n")
    .filter((line) => {
      const l = line.trim().toLowerCase();
      if (!l) return false;
      if (/cookie|accept all|privacy policy|terms of (use|service)/i.test(l) && l.length < 80) {
        return false;
      }
      return true;
    })
    .join("\n")
    .trim();

  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars).trimEnd()}\n…`;
}
