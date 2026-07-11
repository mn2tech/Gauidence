/**
 * Pure extraction-quality helpers (safe for unit tests; no server-only).
 */

export type ExtractionQualityReport = {
  score: number;
  issues: string[];
  estimatedLineRows: number;
  hasCurrency: boolean;
  hasInvoiceLabels: boolean;
  charCount: number;
  lineCount: number;
};

/** Count likely invoice table body rows (name + hours + rate + amount pattern). */
export function countLikelyInvoiceLineRows(text: string): number {
  const lines = text.split(/\r?\n/);
  let count = 0;
  for (const line of lines) {
    const t = line.trim();
    if (!t || /subtotal|total\s*due|invoice|bill\s*to|contractor|description/i.test(t)) {
      continue;
    }
    // Pipe table row or spaced numeric row with a person-like name
    const pipe = t.split("|").map((c) => c.trim());
    if (pipe.length >= 4) {
      const nums = pipe.filter((c) => /^\$?[\d,]+(\.\d+)?$/.test(c));
      if (nums.length >= 2 && /[A-Za-z]{2,}/.test(pipe[0] ?? "")) count += 1;
      continue;
    }
    const money = t.match(/\$?\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\$?\d+\.\d{2}/g) ?? [];
    const hours = t.match(/\b\d{2,4}\b/g) ?? [];
    if (/[A-Za-z]{3,}/.test(t) && money.length >= 1 && hours.length >= 1) count += 1;
  }
  return count;
}

/**
 * Score how usable extracted text is for structured analysis.
 * Also flags suspiciously broken currency / short / incomplete extractions.
 */
export function assessExtractionQuality(text: string): ExtractionQualityReport {
  const t = text.replace(/\u0000/g, "").trim();
  const issues: string[] = [];
  if (!t) {
    return {
      score: 0,
      issues: ["empty_extraction"],
      estimatedLineRows: 0,
      hasCurrency: false,
      hasInvoiceLabels: false,
      charCount: 0,
      lineCount: 0,
    };
  }

  const chars = t.length;
  const lines = t.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const digitRatio = (t.match(/\d/g)?.length ?? 0) / chars;
  const alphaRatio = (t.match(/[A-Za-z]/g)?.length ?? 0) / chars;
  const hasInvoiceLabels =
    /invoice\s*(#|no\.?|number|id)?/i.test(t) ||
    /total\s*(due|amount)?/i.test(t) ||
    /subtotal/i.test(t);
  const hasCurrency = /\$\s*[\d,]+/.test(t) || /\b\d{1,3}(?:,\d{3})+(?:\.\d{2})?\b/.test(t);
  const estimatedLineRows = countLikelyInvoiceLineRows(t);

  // Broken currency / missing digits heuristics (e.g. 712.62 from 71628, 1628 from 16128)
  if (/\$\s*\d{1,3}\.\d{2}\b/.test(t) && /total/i.test(t) && !/\d{1,3},\d{3}/.test(t)) {
    // Small totals can be valid; only flag when hours-like large multipliers also present
    if (/\b1[6-9]\d\b|\b2\d{2}\b/.test(t)) {
      issues.push("suspicious_small_currency_with_large_hours");
    }
  }
  if (chars < 80) issues.push("extremely_short");
  if (hasInvoiceLabels && estimatedLineRows === 0) issues.push("missing_table_rows");
  if (hasInvoiceLabels && estimatedLineRows > 0 && estimatedLineRows < 2) {
    issues.push("incomplete_line_items");
  }
  if (digitRatio > 0.55) issues.push("digit_heavy_noise");
  if (alphaRatio < 0.08 && chars > 40) issues.push("alpha_sparse");

  let score = 0;
  if (chars >= 80) score += 0.2;
  if (chars >= 400) score += 0.15;
  if (lines.length >= 5) score += 0.15;
  if (digitRatio >= 0.02 && digitRatio <= 0.45) score += 0.1;
  if (alphaRatio >= 0.15) score += 0.1;
  if (hasInvoiceLabels) score += 0.15;
  if (hasCurrency) score += 0.1;
  if (estimatedLineRows >= 2) score += 0.1;
  if (estimatedLineRows >= 4) score += 0.05;
  if (chars < 40) score *= 0.15;
  if (issues.includes("missing_table_rows")) score = Math.min(score, 0.35);
  if (issues.includes("suspicious_small_currency_with_large_hours")) {
    score = Math.min(score, 0.4);
  }

  return {
    score: Math.max(0, Math.min(1, score)),
    issues,
    estimatedLineRows,
    hasCurrency,
    hasInvoiceLabels,
    charCount: chars,
    lineCount: lines.length,
  };
}

export function scoreExtractionQuality(text: string): number {
  return assessExtractionQuality(text).score;
}

export function previewText(text: string, max = 1200): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…[truncated ${text.length - max} chars]`;
}

export function isAnalysisDebugEnabled() {
  return process.env.GUARDIAN_ANALYSIS_DEBUG === "1";
}
