/**
 * Estimated Anthropic API prices (USD per 1M tokens).
 * Update when Anthropic changes list prices — estimates only, not invoices.
 */

export type ModelRate = {
  inputPerMTok: number;
  outputPerMTok: number;
};

/** Default = Claude Sonnet 4.5 list rates. */
export const DEFAULT_CLAUDE_RATE: ModelRate = {
  inputPerMTok: 3,
  outputPerMTok: 15,
};

const MODEL_RATES: { match: RegExp; rate: ModelRate }[] = [
  // Opus family
  { match: /opus/i, rate: { inputPerMTok: 15, outputPerMTok: 75 } },
  // Haiku family
  { match: /haiku/i, rate: { inputPerMTok: 1, outputPerMTok: 5 } },
  // Sonnet (incl. sonnet-4-5, claude-sonnet-*)
  { match: /sonnet/i, rate: { inputPerMTok: 3, outputPerMTok: 15 } },
];

export function rateForModel(model: string | null | undefined): ModelRate {
  const m = (model ?? "").trim();
  if (!m) return DEFAULT_CLAUDE_RATE;
  for (const row of MODEL_RATES) {
    if (row.match.test(m)) return row.rate;
  }
  return DEFAULT_CLAUDE_RATE;
}

/** Estimated USD for one Claude call (no caching discount). */
export function estimateClaudeCostUsd(args: {
  model?: string | null;
  inputTokens: number;
  outputTokens: number;
}): number {
  const parts = estimateClaudeCostParts(args);
  return parts.inputUsd + parts.outputUsd;
}

/** Split estimated USD into input vs output for a call or aggregate. */
export function estimateClaudeCostParts(args: {
  model?: string | null;
  inputTokens: number;
  outputTokens: number;
}): { inputUsd: number; outputUsd: number } {
  const rate = rateForModel(args.model);
  const input = Math.max(0, args.inputTokens);
  const output = Math.max(0, args.outputTokens);
  return {
    inputUsd: (input * rate.inputPerMTok) / 1_000_000,
    outputUsd: (output * rate.outputPerMTok) / 1_000_000,
  };
}

export function formatUsd(amount: number): string {
  if (amount <= 0) return "$0.00";
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}
