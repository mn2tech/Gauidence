import type { GuardianProfileType } from "@/lib/profiles/types";
import { PROFILE_TYPE_LABELS } from "@/lib/profiles/types";
import type { SearchScopeMode } from "@/lib/workspace-context/searchScope";

export type VaultScopeCandidate = {
  id: string;
  display_name: string;
  profile_type?: GuardianProfileType;
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Matches possessive forms: Nolan, Nolan's, Nolans (no apostrophe). */
function possessiveSuffixPattern(): string {
  return "(?:'s|s(?=\\s|$))";
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
  const pattern = new RegExp(
    `\\b${escapeRegex(name)}${possessiveSuffixPattern()}?\\b`,
    "i"
  );
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
    new RegExp(
      `\\b${escapeRegex(token)}${possessiveSuffixPattern()}?\\b`,
      "i"
    ).test(question)
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

/**
 * When the user names a vault in their question (e.g. "Nolan's soccer schedule"),
 * return that profile if the mention is unambiguous.
 */
export function detectMentionedVault(args: {
  question: string;
  accessibleProfiles: VaultScopeCandidate[];
}): VaultScopeCandidate | null {
  const candidates = args.accessibleProfiles.filter((p) => {
    if (!profileMentionedInQuestion(args.question, p.display_name)) return false;
    if (fullNameMentioned(args.question, p.display_name)) return true;

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

/** Pick the vault that supplied most retrieved excerpts, when one vault clearly dominates. */
export function dominantRetrievalProfileId(
  chunks: { profile_id?: string }[],
  minShare = 0.5
): string | null {
  const counts = new Map<string, number>();
  for (const chunk of chunks) {
    const id = chunk.profile_id;
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
  if (total === 0) return null;

  let bestId: string | null = null;
  let bestCount = 0;
  for (const [id, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      bestId = id;
    }
  }
  if (bestId && bestCount / total >= minShare) return bestId;
  return null;
}

const SPACE_HINT_TYPES: Record<string, GuardianProfileType[]> = {
  personal: ["personal"],
  family: ["family"],
  business: ["business"],
  nonprofit: ["non_profit"],
  "non-profit": ["non_profit"],
  "non profit": ["non_profit"],
  employee: ["employee"],
  client: ["client"],
  child: ["child"],
  student: ["student"],
  teacher: ["teacher"],
  vehicle: ["vehicle", "vehicles"],
  home: ["home"],
  pet: ["pet"],
  hobby: ["hobby"],
};

function profileTypesForSpaceHint(hint: string): GuardianProfileType[] | null {
  const key = hint.trim().toLowerCase();
  if (SPACE_HINT_TYPES[key]) return SPACE_HINT_TYPES[key]!;

  for (const [type, label] of Object.entries(PROFILE_TYPE_LABELS)) {
    const normalized = label.toLowerCase();
    if (normalized === key || normalized.startsWith(`${key} `)) {
      return [type as GuardianProfileType];
    }
  }
  return null;
}

/**
 * When the user scopes a question to a named space ("in my Personal space about Nolan"),
 * return that profile if the name resolves unambiguously.
 */
export function resolveExplicitSpaceScope(args: {
  question: string;
  accessibleProfiles: VaultScopeCandidate[];
}): VaultScopeCandidate | null {
  const match = args.question.match(
    /\bin\s+(?:my\s+)?(.+?)\s+(?:space|workspace)\b/i
  );
  if (!match) return null;

  let nameHint = match[1]!.trim();
  nameHint = nameHint.replace(/['']s$/i, "").trim();
  if (!nameHint || /^(this|that|the|a|an)$/i.test(nameHint)) return null;

  const exact = args.accessibleProfiles.filter(
    (p) => p.display_name.trim().toLowerCase() === nameHint.toLowerCase()
  );
  if (exact.length === 1) return exact[0]!;

  const loose = args.accessibleProfiles.filter((p) =>
    profileMentionedInQuestion(nameHint, p.display_name)
  );
  if (loose.length === 1) return loose[0]!;

  const hintedTypes = profileTypesForSpaceHint(nameHint);
  if (hintedTypes) {
    const typed = args.accessibleProfiles.filter(
      (p) => p.profile_type && hintedTypes.includes(p.profile_type)
    );
    if (typed.length === 1) return typed[0]!;
  }

  return null;
}

/**
 * Vault profiles Gideon searches when answering in a chat thread.
 * workspace = chat home (+ optional scoped vault); global = every accessible vault.
 */
export function buildVaultChatRetrievalScopes(args: {
  accessibleProfiles: VaultChatRetrievalProfile[];
  chatHomeProfileId: string;
  scopedProfileId?: string | null;
  searchScope?: SearchScopeMode;
}): VaultChatRetrievalProfile[] {
  const scopedId =
    typeof args.scopedProfileId === "string" && args.scopedProfileId.trim()
      ? args.scopedProfileId.trim()
      : null;
  const searchScope = args.searchScope ?? "workspace";
  const byId = new Map(args.accessibleProfiles.map((p) => [p.id, p]));

  if (searchScope === "global") {
    return [...args.accessibleProfiles];
  }

  const out: VaultChatRetrievalProfile[] = [];
  const seen = new Set<string>();

  for (const id of [args.chatHomeProfileId, scopedId]) {
    if (!id) continue;
    const profile = byId.get(id);
    if (!profile || seen.has(profile.id)) continue;
    seen.add(profile.id);
    out.push(profile);
  }

  return out.length > 0 ? out : [...args.accessibleProfiles];
}

/**
 * When a chat is scoped to a nested vault (e.g. client under a business),
 * default writes to the scoped vault instead of the chat home container.
 */
export function defaultGideonWriteProfileId(args: {
  activeProfileId: string;
  chatHomeProfileId: string;
  chatScopedProfileId?: string | null;
}): string {
  const scoped =
    typeof args.chatScopedProfileId === "string" && args.chatScopedProfileId.trim()
      ? args.chatScopedProfileId.trim()
      : null;
  if (scoped && scoped !== args.chatHomeProfileId) {
    return scoped;
  }
  return args.activeProfileId;
}

export function resolveGideonWriteVault(args: {
  question: string;
  activeProfileId: string;
  accessibleProfiles: VaultScopeCandidate[];
  retrievedChunks?: { profile_id?: string }[];
}): VaultScopeCandidate {
  const mentioned = detectMentionedVault({
    question: args.question,
    accessibleProfiles: args.accessibleProfiles,
  });
  if (mentioned) return mentioned;

  const dominantId = dominantRetrievalProfileId(args.retrievedChunks ?? []);
  if (dominantId) {
    const match = args.accessibleProfiles.find((p) => p.id === dominantId);
    if (match) return match;
  }

  const active =
    args.accessibleProfiles.find((p) => p.id === args.activeProfileId) ?? null;
  if (active) return active;

  return {
    id: args.activeProfileId,
    display_name: "This vault",
  };
}

export function buildVaultScopePayload(args: {
  writeVault: VaultScopeCandidate;
  activeProfile: VaultScopeCandidate;
}): {
  profileId: string;
  profileName: string;
  activeProfileName: string;
} | null {
  if (args.writeVault.id === args.activeProfile.id) return null;
  return {
    profileId: args.writeVault.id,
    profileName: args.writeVault.display_name,
    activeProfileName: args.activeProfile.display_name,
  };
}

export type VaultChatRetrievalProfile = VaultScopeCandidate & {
  profile_type: GuardianProfileType;
};

export function chatScopedProfilePayload(args: {
  scopedProfileId?: string | null;
  accessibleProfiles: VaultScopeCandidate[];
  chatHomeProfileId: string;
}): { profileId: string; profileName: string } | null {
  const scopedId =
    typeof args.scopedProfileId === "string" && args.scopedProfileId.trim()
      ? args.scopedProfileId.trim()
      : null;
  if (!scopedId || scopedId === args.chatHomeProfileId) return null;
  const match = args.accessibleProfiles.find((p) => p.id === scopedId);
  if (!match) return null;
  return { profileId: match.id, profileName: match.display_name };
}
