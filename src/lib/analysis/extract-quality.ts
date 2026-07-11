/**
 * Pure extraction-quality helpers (safe for unit tests; no server-only).
 */

export function scoreExtractionQuality(text: string): number {
  const t = text.replace(/\u0000/g, "").trim();
  if (!t) return 0;
  const chars = t.length;
  const lines = t.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const digitRatio = (t.match(/\d/g)?.length ?? 0) / chars;
  const alphaRatio = (t.match(/[A-Za-z]/g)?.length ?? 0) / chars;
  const hasInvoiceHints =
    /invoice\s*(#|no\.?|number|id)?/i.test(t) ||
    /total\s*(due|amount)?/i.test(t) ||
    /subtotal/i.test(t) ||
    /\$\s*[\d,]+/.test(t);

  let score = 0;
  if (chars >= 80) score += 0.25;
  if (chars >= 400) score += 0.15;
  if (lines.length >= 5) score += 0.15;
  if (digitRatio >= 0.02 && digitRatio <= 0.45) score += 0.15;
  if (alphaRatio >= 0.2) score += 0.15;
  if (hasInvoiceHints) score += 0.15;
  if (chars < 40) score *= 0.2;
  return Math.max(0, Math.min(1, score));
}

export function previewText(text: string, max = 1200): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…[truncated ${text.length - max} chars]`;
}

export function isAnalysisDebugEnabled() {
  return process.env.GUARDIAN_ANALYSIS_DEBUG === "1";
}
