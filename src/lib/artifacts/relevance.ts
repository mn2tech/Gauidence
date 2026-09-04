import type { ArtifactIdentity, ArtifactSourceType } from "./types";

const STOP = new Set([
  "the",
  "and",
  "for",
  "that",
  "with",
  "this",
  "from",
  "your",
  "have",
  "will",
  "are",
  "was",
  "were",
  "been",
  "into",
  "about",
  "please",
  "thanks",
  "thank",
  "email",
  "message",
  "subject",
  "sent",
  "http",
  "https",
  "www",
]);

/** Extract distinctive tokens for overlap scoring. */
export function distinctiveTokens(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9@.\s-]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOP.has(t));
  return new Set(tokens);
}

/**
 * Score how relevant a historical artifact is to the current artifact + user query.
 * Returns 0–1. Sensitive / unrelated wedding/ministry/ID docs score near 0 for Chamber emails.
 */
export function scoreArtifactRelevance(args: {
  current: {
    content: string;
    sourceType?: ArtifactSourceType | null;
    sourceName?: string | null;
  };
  candidate: {
    content: string;
    sourceType?: ArtifactSourceType | null;
    sourceName?: string | null;
    fusionScore?: number;
  };
  userQuery?: string;
}): number {
  const currentText = `${args.current.sourceName ?? ""}\n${args.current.content}`;
  const candidateText = `${args.candidate.sourceName ?? ""}\n${args.candidate.content}`;
  const query = args.userQuery ?? "";

  const currentTokens = distinctiveTokens(`${currentText}\n${query}`);
  const candidateTokens = distinctiveTokens(candidateText);
  if (currentTokens.size === 0 || candidateTokens.size === 0) {
    return Math.min(0.15, args.candidate.fusionScore ?? 0);
  }

  let overlap = 0;
  for (const t of candidateTokens) {
    if (currentTokens.has(t)) overlap += 1;
  }
  const union = new Set([...currentTokens, ...candidateTokens]).size;
  const jaccard = union > 0 ? overlap / Math.min(currentTokens.size, 24) : 0;

  // Penalize clearly incompatible source pairs (email vs wedding invite image)
  let typePenalty = 0;
  const cur = args.current.sourceType;
  const cand = args.candidate.sourceType;
  if (
    (cur === "email_thread" || cur === "email" || cur === "pasted_text") &&
    (cand === "image" || cand === "screenshot") &&
    overlap < 3
  ) {
    typePenalty = 0.45;
  }

  const fusion = Math.max(0, Math.min(1, args.candidate.fusionScore ?? 0));
  const score = Math.max(0, Math.min(1, jaccard * 0.75 + fusion * 0.25 - typePenalty));
  return Number(score.toFixed(4));
}

/** Default threshold for including historical artifacts when analyzing current input. */
export const HISTORICAL_RELEVANCE_THRESHOLD = 0.28;

/** Higher bar for sensitive historical artifacts. */
export const SENSITIVE_EXPLICIT_RELEVANCE_THRESHOLD = 0.55;

export function isExplicitlyRelevantToQuery(args: {
  candidateContent: string;
  candidateName?: string | null;
  userQuery: string;
  currentContent: string;
}): boolean {
  const qTokens = distinctiveTokens(args.userQuery);
  const curTokens = distinctiveTokens(args.currentContent);
  const candTokens = distinctiveTokens(
    `${args.candidateName ?? ""}\n${args.candidateContent}`
  );
  // Query must share distinctive tokens with candidate beyond generic overlap with current
  let hits = 0;
  for (const t of qTokens) {
    if (candTokens.has(t) && t.length >= 4) hits += 1;
  }
  if (hits >= 2) return true;
  // Same org / person names shared between current and candidate
  let sharedNamed = 0;
  for (const t of curTokens) {
    if (t.length >= 5 && candTokens.has(t) && /^[a-z]/.test(t)) sharedNamed += 1;
  }
  return sharedNamed >= 3 && hits >= 1;
}

export function sameThreadOrLinked(
  current: ArtifactIdentity,
  candidate: ArtifactIdentity
): boolean {
  if (current.artifactId === candidate.artifactId) return true;
  if (
    current.threadId &&
    candidate.threadId &&
    current.threadId === candidate.threadId
  ) {
    return true;
  }
  if (
    current.parentArtifactId === candidate.artifactId ||
    candidate.parentArtifactId === current.artifactId
  ) {
    return true;
  }
  return false;
}
