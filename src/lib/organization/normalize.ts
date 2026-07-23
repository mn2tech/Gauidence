/** Normalized name matching for vault/profile suggestions. */

const SYNONYM_GROUPS: string[][] = [
  ["education", "school", "academic", "classroom"],
  ["automobile", "vehicle", "car", "auto"],
  ["healthcare", "medical", "health", "clinic"],
  ["books", "reading", "literature", "library"],
  ["company", "business", "work", "employer"],
  ["identity", "personal", "id", "passport", "documents"],
  ["finance", "financial", "money", "banking", "tax"],
  ["insurance", "coverage", "policy"],
];

export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/['']/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function singularize(token: string): string {
  if (token.length <= 3) return token;
  if (token.endsWith("ies") && token.length > 4) {
    return `${token.slice(0, -3)}y`;
  }
  if (token.endsWith("s") && !token.endsWith("ss")) {
    return token.slice(0, -1);
  }
  return token;
}

// Keys must be singularized to match the singularized tokens looked up below.
const synonymCanonical = new Map<string, string>();
for (const group of SYNONYM_GROUPS) {
  const canonical = singularize(group[0]);
  for (const word of group) {
    synonymCanonical.set(singularize(word), canonical);
  }
}

export function normalizeTokens(value: string): string[] {
  return normalizeName(value)
    .split(" ")
    .filter(Boolean)
    .map(singularize);
}

function canonicalToken(token: string): string {
  return synonymCanonical.get(token) ?? token;
}

export function canonicalTokens(value: string): string[] {
  return normalizeTokens(value).map(canonicalToken);
}

export function namesMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ta = canonicalTokens(a);
  const tb = canonicalTokens(b);
  if (ta.join(" ") === tb.join(" ")) return true;
  if (ta.length === 1 && tb.length === 1 && ta[0] === tb[0]) return true;
  return false;
}

/**
 * 0–1 similarity score. Exact normalized matches outrank
 * singular/plural matches, which outrank synonym matches, so an
 * "Identity" vault beats a synonymous "Personal" vault for a target
 * named "Identity".
 */
export function nameMatchScore(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (normalizeTokens(a).join(" ") === normalizeTokens(b).join(" ")) {
    return 0.97;
  }
  if (namesMatch(a, b)) return 0.9;
  const ta = new Set(canonicalTokens(a));
  const tb = new Set(canonicalTokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let overlap = 0;
  for (const t of ta) {
    if (tb.has(t)) overlap += 1;
  }
  const union = new Set([...ta, ...tb]).size;
  return (overlap / union) * 0.8;
}

export function bestNameMatch<T extends { display_name: string }>(
  candidates: T[],
  targetName: string,
  minScore = 0.55
): T | null {
  let best: T | null = null;
  let bestScore = 0;
  for (const c of candidates) {
    const score = nameMatchScore(c.display_name, targetName);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return bestScore >= minScore ? best : null;
}
