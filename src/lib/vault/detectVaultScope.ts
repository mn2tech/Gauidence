export type VaultScopeCandidate = {
  id: string;
  display_name: string;
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Tokens to match in a question (full name + first name for multi-word names). */
export function mentionTokensForDisplayName(displayName: string): string[] {
  const trimmed = displayName.trim();
  if (trimmed.length < 2) return [];
  const parts = trimmed.split(/\s+/).filter((p) => p.length >= 2);
  const tokens =
    parts.length > 1 ? [trimmed, parts[0]!] : [trimmed];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of tokens) {
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(token);
  }
  return out;
}

function fullNameMentioned(question: string, displayName: string): boolean {
  const name = displayName.trim();
  if (name.length < 2) return false;
  const pattern = new RegExp(`\\b${escapeRegex(name)}(?:'s)?\\b`, "i");
  if (!pattern.test(question)) return false;
  if (!name.includes(" ")) {
    const embeddedInLonger = new RegExp(
      `\\b${escapeRegex(name)}\\s+\\w`,
      "i"
    ).test(question);
    if (embeddedInLonger) return false;
  }
  return true;
}

export function profileMentionedInQuestion(
  question: string,
  displayName: string
): boolean {
  const tokens = mentionTokensForDisplayName(displayName);
  if (tokens.length === 0) return false;
  return tokens.some((token) =>
    new RegExp(`\\b${escapeRegex(token)}(?:'s)?\\b`, "i").test(question)
  );
}

/**
 * Pick one other vault to search when the user names it but it is not in the
 * active rollup scope. Returns null when ambiguous or not mentioned.
 */
export function detectCrossVaultScope(args: {
  question: string;
  activeProfileId: string;
  inScopeProfileIds: string[];
  accessibleProfiles: VaultScopeCandidate[];
}): VaultScopeCandidate | null {
  const inScope = new Set(args.inScopeProfileIds);
  const inScopePrimaryTokens = new Set(
    args.accessibleProfiles
      .filter((p) => inScope.has(p.id))
      .flatMap((p) =>
        mentionTokensForDisplayName(p.display_name).map((t) => t.toLowerCase())
      )
  );

  const candidates = args.accessibleProfiles.filter((p) => {
    if (p.id === args.activeProfileId || inScope.has(p.id)) return false;
    if (!profileMentionedInQuestion(args.question, p.display_name)) return false;

    if (fullNameMentioned(args.question, p.display_name)) return true;

    const tokens = mentionTokensForDisplayName(p.display_name);
    const firstName = (tokens.length > 1 ? tokens[1] : tokens[0])?.toLowerCase();
    if (firstName && inScopePrimaryTokens.has(firstName)) return false;

    const longerMatch = args.accessibleProfiles.some(
      (other) =>
        other.id !== p.id &&
        other.display_name.trim().length > p.display_name.trim().length &&
        fullNameMentioned(args.question, other.display_name)
    );
    return !longerMatch;
  });

  if (candidates.length === 1) return candidates[0]!;
  if (candidates.length === 0) return null;

  const fullNameMatches = candidates.filter((p) =>
    fullNameMentioned(args.question, p.display_name)
  );
  if (fullNameMatches.length === 1) return fullNameMatches[0]!;

  return null;
}
