/** Normalize entity names for resolution and deduplication. */

const SUFFIX_PATTERNS: [RegExp, string][] = [
  [/\bllc\.?\b/gi, "llc"],
  [/\binc\.?\b/gi, "inc"],
  [/\bcorp\.?\b/gi, "corp"],
  [/\bltd\.?\b/gi, "ltd"],
  [/\bco\.?\b/gi, "co"],
  [/\bllp\.?\b/gi, "llp"],
  [/\bplc\.?\b/gi, "plc"],
];

/**
 * Normalize an entity name for matching.
 * Preserves the original display name separately in the database.
 */
export function normalizeEntityName(name: string): string {
  let normalized = name.trim().toLowerCase();

  for (const [pattern, replacement] of SUFFIX_PATTERNS) {
    normalized = normalized.replace(pattern, replacement);
  }

  normalized = normalized
    .replace(/[.,'"()&]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized;
}

const ONTOLOGY_QUERY_STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "your",
  "show",
  "what",
  "which",
  "where",
  "when",
  "about",
  "tell",
  "give",
  "find",
  "look",
  "please",
  "me",
  "my",
  "a",
  "an",
  "of",
  "to",
  "in",
  "on",
  "is",
  "are",
  "was",
  "were",
  "this",
  "that",
  "any",
  "all",
  "file",
  "files",
  "document",
  "documents",
]);

/**
 * Tokenize a user question for ontology entity matching.
 * Splits underscores/hyphens so "OnePi_invoice" → ["onepi", "invoice"].
 */
export function tokenizeForOntologySearch(query: string): string[] {
  const normalized = normalizeEntityName(query)
    .replace(/[_./\\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return [];

  const raw = normalized
    .split(" ")
    .map((t) => t.trim())
    .map(singularizeOntologyToken)
    .filter((t) => t.length >= 3)
    .filter((t) => !ONTOLOGY_QUERY_STOPWORDS.has(t));

  // Prefer distinctive tokens (longer first), keep order-stable unique set.
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const token of [...raw].sort((a, b) => b.length - a.length)) {
    if (seen.has(token)) continue;
    seen.add(token);
    unique.push(token);
    if (unique.length >= 6) break;
  }
  return unique;
}

/**
 * Remaining title-like phrase after dropping question words.
 * "What are the chords for Just As I Am?" → "just as i am"
 */
export function titlePhraseForOntologySearch(query: string): string | null {
  const stripped = query
    .toLowerCase()
    .replace(/[?!.,'"()]/g, " ")
    .replace(
      /\b(what|whats|which|are|is|the|a|an|chords?|charts?|for|key|pdf|jpe?g|png|analyzed|show|me|can|you|see|please|tell|about|song|hymn|from|trello|want|learn|piano|keyboard|help|practice|play|teach|this|that|on)\b/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
  if (stripped.length < 4) return null;
  return stripped.slice(0, 80);
}

/** Lightweight plural → singular for ontology search tokens. */
export function singularizeOntologyToken(token: string): string {
  const t = token.toLowerCase();
  if (t.length <= 3) return t;
  if (t.endsWith("ies") && t.length > 4) return `${t.slice(0, -3)}y`;
  if (t.endsWith("sses") || t.endsWith("ches") || t.endsWith("shes")) {
    return t.slice(0, -2);
  }
  if (t.endsWith("ses") && t.length > 4) return t.slice(0, -2);
  if (t.endsWith("s") && !t.endsWith("ss") && !t.endsWith("us") && !t.endsWith("is")) {
    return t.slice(0, -1);
  }
  return t;
}

/** True when the user is asking to list invoices and/or sum amounts. */
export function isInvoiceAggregateQuery(query: string): boolean {
  const q = query.toLowerCase();
  if (!/\binvoices?\b/.test(q)) return false;
  return (
    /\b(total|amount|sum|all|list|how many|outstanding|due)\b/.test(q) ||
    /show\s+(me\s+)?(the\s+)?invoices?\b/.test(q) ||
    /^(what|which)\s+invoices?\b/.test(q.trim()) ||
    q.trim() === "invoices" ||
    q.trim() === "invoice"
  );
}

/**
 * True when the user wants a full song / setlist / chord-chart catalog
 * (not a single-song lookup).
 */
export function isSongCatalogQuery(query: string): boolean {
  const q = query.toLowerCase().trim();
  if (
    /^(songs?|hymns?|set\s*lists?|chord\s*charts?|show me songs?|list songs?|all songs?)$/i.test(
      q
    )
  ) {
    return true;
  }
  if (!/\b(songs?|hymns?|tracks?|set\s*lists?|playlist|chord\s*charts?)\b/.test(q)) {
    return false;
  }
  return /\b(all|list|show|what|which|every|full|complete|names?|now)\b/.test(q);
}

/** True when the user is asking about analyzed Trello/Device charts or PDFs. */
export function isConnectedChartQuery(query: string): boolean {
  const q = query.toLowerCase();
  return /\b(trello|chord charts?|chords?|pdf|jpg|jpeg|png|analyzed|attachment|set\s*lists?)\b/.test(
    q
  );
}

/**
 * Full connector catalog (all analyzed items) vs a single title lookup.
 * Title-phrase chord questions must not dump the whole board.
 */
export function connectorOntologyUsesCatalog(args: {
  listInvoices?: boolean;
  listSongs?: boolean;
  listCharts?: boolean;
  titlePhrase?: string | null;
}): boolean {
  if (args.listInvoices || args.listSongs) return true;
  return Boolean(args.listCharts && !args.titlePhrase);
}

/** Levenshtein distance for conservative fuzzy matching. */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix: number[][] = Array.from({ length: a.length + 1 }, () =>
    Array(b.length + 1).fill(0)
  );

  for (let i = 0; i <= a.length; i++) matrix[i]![0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0]![j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1,
        matrix[i]![j - 1]! + 1,
        matrix[i - 1]![j - 1]! + cost
      );
    }
  }

  return matrix[a.length]![b.length]!;
}

/** Similarity ratio 0–1 based on Levenshtein distance. */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeEntityName(a);
  const nb = normalizeEntityName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(na, nb) / maxLen;
}

/** Whether fuzzy matching is safe for this entity type. */
export function isFuzzyMatchAllowed(entityType: string): boolean {
  return (
    entityType === "organization" ||
    entityType === "project" ||
    entityType === "restaurant" ||
    entityType === "place"
  );
}

/** Common person names should not auto-merge via fuzzy match. */
export function isAmbiguousPersonName(name: string): boolean {
  const parts = normalizeEntityName(name).split(" ").filter(Boolean);
  if (parts.length < 2) return true;
  const commonFirst = new Set([
    "john",
    "jane",
    "michael",
    "david",
    "james",
    "robert",
    "mary",
    "jennifer",
    "chris",
    "alex",
  ]);
  return commonFirst.has(parts[0]!);
}
