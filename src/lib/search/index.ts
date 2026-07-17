/**
 * Universal vault search helpers (pure — safe for unit tests).
 */

export type SearchResultKind =
  | "profile"
  | "daily_log"
  | "document"
  | "chat";

export type SearchResult = {
  kind: SearchResultKind;
  id: string;
  profileId: string;
  title: string;
  snippet: string;
  profilePath: string;
  occurredAt: string | null;
  href: string;
  score: number;
};

export const SEARCH_MIN_QUERY_LENGTH = 2;
export const SEARCH_MAX_RESULTS = 40;
export const SEARCH_PER_KIND_CAP = 12;

export function sanitizeSearchQuery(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  // Strip commas — PostgREST `.or()` uses commas as field separators.
  const q = raw
    .trim()
    .replace(/,/g, " ")
    .replace(/\s+/g, " ");
  if (q.length < SEARCH_MIN_QUERY_LENGTH) return null;
  return q.slice(0, 120);
}

/** Escape % and _ for Postgres ILIKE patterns. */
export function escapeIlikePattern(raw: string): string {
  return raw
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/,/g, " ");
}

export function buildIlikePattern(query: string): string {
  return `%${escapeIlikePattern(query)}%`;
}

/** Build "Parent > Child" path for a profile. */
export function buildProfilePath(
  profiles: { id: string; display_name: string; parent_profile_id: string | null }[],
  profileId: string
): string {
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const names: string[] = [];
  let current = byId.get(profileId);
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    names.unshift(current.display_name.trim() || "Vault");
    current = current.parent_profile_id
      ? byId.get(current.parent_profile_id)
      : undefined;
  }
  return names.join(" › ") || "Vault";
}

export function snippetAroundMatch(
  text: string,
  query: string,
  maxLen = 140
): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const lower = clean.toLowerCase();
  const q = query.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx < 0) {
    return clean.length <= maxLen ? clean : `${clean.slice(0, maxLen - 1)}…`;
  }
  const pad = Math.max(0, Math.floor((maxLen - q.length) / 2));
  const start = Math.max(0, idx - pad);
  const end = Math.min(clean.length, start + maxLen);
  const slice = clean.slice(start, end);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < clean.length ? "…" : "";
  return `${prefix}${slice}${suffix}`;
}

/** Rank: exact title > prefix title > body/content match. Higher is better. */
export function scoreMatch(args: {
  query: string;
  title: string;
  body?: string;
}): number {
  const q = args.query.toLowerCase().trim();
  const title = args.title.toLowerCase().trim();
  const body = (args.body ?? "").toLowerCase();
  if (!q) return 0;
  if (title === q) return 100;
  if (title.startsWith(q)) return 80;
  if (title.includes(q)) return 60;
  if (body.includes(q)) return 40;
  return 10;
}

export function hrefForResult(args: {
  kind: SearchResultKind;
  id: string;
  profileId: string;
}): string {
  const { kind, id, profileId } = args;
  if (kind === "profile") {
    return `/dashboard?profileId=${encodeURIComponent(profileId)}`;
  }
  if (kind === "daily_log") {
    return `/dashboard?profileId=${encodeURIComponent(profileId)}&logId=${encodeURIComponent(id)}#daily-log-${profileId}`;
  }
  if (kind === "document") {
    return `/dashboard?profileId=${encodeURIComponent(profileId)}&documentId=${encodeURIComponent(id)}#documents-${profileId}`;
  }
  return `/ask?profileId=${encodeURIComponent(profileId)}&chatId=${encodeURIComponent(id)}`;
}

/** Add the matched term to an existing relative deep link, preserving its hash. */
export function withSearchTerm(href: string, query: string): string {
  const term = query.trim();
  if (!term) return href;
  const [path, hash] = href.split("#", 2);
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}searchTerm=${encodeURIComponent(term)}${
    hash ? `#${hash}` : ""
  }`;
}

export function sortAndCapResults(
  results: SearchResult[],
  maxTotal = SEARCH_MAX_RESULTS
): SearchResult[] {
  const byKind = new Map<SearchResultKind, SearchResult[]>();
  for (const r of results) {
    const list = byKind.get(r.kind) ?? [];
    list.push(r);
    byKind.set(r.kind, list);
  }
  const capped: SearchResult[] = [];
  for (const kind of [
    "profile",
    "daily_log",
    "document",
    "chat",
  ] as SearchResultKind[]) {
    const list = (byKind.get(kind) ?? []).sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ta = a.occurredAt ?? "";
      const tb = b.occurredAt ?? "";
      return tb.localeCompare(ta);
    });
    capped.push(...list.slice(0, SEARCH_PER_KIND_CAP));
  }
  return capped
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ta = a.occurredAt ?? "";
      const tb = b.occurredAt ?? "";
      return tb.localeCompare(ta);
    })
    .slice(0, maxTotal);
}

export function groupSearchResults(results: SearchResult[]): {
  profiles: SearchResult[];
  dailyLogs: SearchResult[];
  documents: SearchResult[];
  chats: SearchResult[];
} {
  return {
    profiles: results.filter((r) => r.kind === "profile"),
    dailyLogs: results.filter((r) => r.kind === "daily_log"),
    documents: results.filter((r) => r.kind === "document"),
    chats: results.filter((r) => r.kind === "chat"),
  };
}
