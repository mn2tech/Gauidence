import {
  AGENCY_CATALOG,
  CAPABILITY_CATALOG,
  NAICS_TITLES,
  SAM_BUSINESS_TYPE_MAP,
  TECHNOLOGY_CATALOG,
} from "@/lib/leads/research/catalogs";
import {
  SMALL_BUSINESS_STATUS_OPTIONS,
  type AgencyEntry,
  type NaicsEntry,
  type SmallBusinessStatusOption,
} from "@/lib/leads/research/types";

function fold(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeWebsite(input: string | null | undefined): string {
  const raw = (input ?? "").trim();
  if (!raw) return "";
  try {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(withProto);
    url.hash = "";
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    const path = url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "");
    return `https://${host}${path}`;
  } catch {
    return raw.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  }
}

export function websiteDomain(input: string | null | undefined): string {
  const normalized = normalizeWebsite(input);
  if (!normalized) return "";
  try {
    return new URL(normalized).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

export function looksLikeOfficialWebsite(url: string): boolean {
  const host = websiteDomain(url);
  if (!host) return false;
  const blocked = [
    "linkedin.com",
    "facebook.com",
    "twitter.com",
    "x.com",
    "instagram.com",
    "youtube.com",
    "crunchbase.com",
    "bloomberg.com",
    "wikipedia.org",
    "sam.gov",
    "usaspending.gov",
    "dnb.com",
    "zoominfo.com",
    "govtribe.com",
    "highergov.com",
    "bloomberg.com",
  ];
  return !blocked.some((b) => host === b || host.endsWith(`.${b}`));
}

export function normalizeNaicsCode(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length >= 6) return digits.slice(0, 6);
  return digits;
}

export function naicsTitle(code: string, fallback = ""): string {
  const normalized = normalizeNaicsCode(code);
  return NAICS_TITLES[normalized] ?? fallback.trim();
}

export function parseNaicsList(
  raw: unknown,
  primaryCode?: string | null
): NaicsEntry[] {
  const codes = new Map<string, NaicsEntry>();
  const push = (codeRaw: string, titleRaw = "", primary = false) => {
    const code = normalizeNaicsCode(codeRaw);
    if (code.length < 5) return;
    const existing = codes.get(code);
    const title = naicsTitle(code, titleRaw) || existing?.title || "";
    codes.set(code, {
      code,
      title,
      isPrimary: Boolean(existing?.isPrimary || primary),
    });
  };

  if (typeof raw === "string") {
    for (const part of raw.split(/[;,\n|]+/)) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const match = trimmed.match(/(\d{5,6})/);
      if (!match) continue;
      const title = trimmed.replace(match[1], "").replace(/[—–\-:PRIMARY]/gi, " ").trim();
      push(match[1], title, /primary/i.test(trimmed));
    }
  } else if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string") {
        const match = item.match(/(\d{5,6})/);
        if (match) push(match[1], item, /primary/i.test(item));
      } else if (item && typeof item === "object") {
        const row = item as Record<string, unknown>;
        const code = String(row.code ?? row.naicsCode ?? row.naics ?? "");
        const title = String(row.title ?? row.naicsDescription ?? row.description ?? "");
        const primary = Boolean(row.isPrimary ?? row.primary ?? row.is_primary);
        push(code, title, primary);
      }
    }
  }

  const primary = primaryCode ? normalizeNaicsCode(primaryCode) : "";
  if (primary && codes.has(primary)) {
    for (const [code, entry] of codes) {
      codes.set(code, { ...entry, isPrimary: code === primary });
    }
  } else if (primary && !codes.has(primary)) {
    push(primary, "", true);
  } else if (![...codes.values()].some((e) => e.isPrimary) && codes.size > 0) {
    const first = [...codes.values()][0];
    codes.set(first.code, { ...first, isPrimary: true });
  }

  return [...codes.values()].sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    return a.code.localeCompare(b.code);
  });
}

export function formatNaicsList(entries: NaicsEntry[]): string {
  return entries
    .map((e) => {
      const title = e.title ? ` — ${e.title}` : "";
      return `${e.code}${title}${e.isPrimary ? " — PRIMARY" : ""}`;
    })
    .join("\n");
}

export function normalizeAgencyName(raw: string): { name: string; bureau: string | null } {
  const folded = fold(raw);
  if (!folded) return { name: raw.trim(), bureau: null };

  for (const agency of AGENCY_CATALOG) {
    for (const bureau of agency.bureaus) {
      if (bureau.aliases.some((a) => folded === fold(a) || folded === fold(bureau.canonical))) {
        return { name: agency.canonical, bureau: bureau.canonical };
      }
    }
    if (
      agency.aliases.some((a) => folded === fold(a)) ||
      folded === fold(agency.canonical)
    ) {
      return { name: agency.canonical, bureau: null };
    }
    if (
      folded.includes(fold(agency.canonical)) ||
      agency.aliases.some((a) => a.length > 3 && folded.includes(fold(a)))
    ) {
      return { name: agency.canonical, bureau: null };
    }
  }
  return { name: raw.replace(/\s+/g, " ").trim(), bureau: null };
}

export function mergeAgencies(names: string[]): AgencyEntry[] {
  const map = new Map<string, Set<string>>();
  for (const raw of names) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const { name, bureau } = normalizeAgencyName(trimmed);
    const bureaus = map.get(name) ?? new Set<string>();
    if (bureau) bureaus.add(bureau);
    map.set(name, bureaus);
  }
  return [...map.entries()]
    .map(([name, bureaus]) => ({
      name,
      bureaus: [...bureaus].sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function formatAgencies(agencies: AgencyEntry[]): string {
  return agencies
    .map((a) =>
      a.bureaus.length > 0 ? `${a.name} (${a.bureaus.join(", ")})` : a.name
    )
    .join("; ");
}

function matchCatalog(
  raw: string,
  catalog: Array<{ canonical: string; aliases: string[] }>
): string | null {
  const folded = fold(raw);
  if (!folded) return null;
  for (const item of catalog) {
    if (folded === fold(item.canonical)) return item.canonical;
    if (item.aliases.some((a) => folded === fold(a))) return item.canonical;
  }
  for (const item of catalog) {
    if (folded.includes(fold(item.canonical))) return item.canonical;
    if (item.aliases.some((a) => a.length > 3 && folded.includes(fold(a)))) {
      return item.canonical;
    }
  }
  return null;
}

export function normalizeTagList(
  values: string[],
  catalog: Array<{ canonical: string; aliases: string[] }>,
  opts?: { allowCustom?: boolean; max?: number }
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const trimmed = raw.replace(/^#/, "").trim();
    if (!trimmed) continue;
    const matched = matchCatalog(trimmed, catalog);
    const tag = matched ?? (opts?.allowCustom === false ? null : toShortTag(trimmed));
    if (!tag) continue;
    const key = fold(tag);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (opts?.max && out.length >= opts.max) break;
  }
  return out;
}

export function toShortTag(value: string): string | null {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  if (cleaned.length > 40) return null;
  if (/[.!?]{1}.+\s/.test(cleaned)) return null;
  return cleaned;
}

export function extractCapabilityTags(values: string[]): string[] {
  return normalizeTagList(values, CAPABILITY_CATALOG, { allowCustom: true, max: 16 });
}

export function extractTechnologyTags(values: string[]): string[] {
  return normalizeTagList(values, TECHNOLOGY_CATALOG, { allowCustom: false, max: 16 });
}

export function extractPastPerformanceTags(values: string[]): string[] {
  return normalizeTagList(values, CAPABILITY_CATALOG, { allowCustom: true, max: 12 });
}

export function parseSmallBusinessStatuses(value: unknown): string[] {
  const raw: string[] = [];
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string" && item.trim()) raw.push(item);
    }
  } else if (typeof value === "string") {
    for (const part of value.split(/[;,|/]+/)) {
      if (part.trim()) raw.push(part.trim());
    }
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const match = SMALL_BUSINESS_STATUS_OPTIONS.find(
      (s) => fold(s) === fold(item)
    );
    const label = match ?? item.trim();
    const key = fold(label);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out.filter((s) => s !== "Unknown" || out.length === 1);
}

export function formatSmallBusinessStatuses(values: string[]): string {
  const parsed = parseSmallBusinessStatuses(values);
  if (parsed.length === 0) return "";
  return parsed.join(", ");
}

export function statusesFromSamCodes(codes: string[]): SmallBusinessStatusOption[] {
  const out = new Set<SmallBusinessStatusOption>();
  for (const code of codes) {
    const mapped = SAM_BUSINESS_TYPE_MAP[code.trim().toUpperCase()];
    if (mapped) out.add(mapped);
  }
  return [...out];
}

export function companyNameSimilarity(a: string, b: string): number {
  const left = fold(a).replace(/\b(inc|llc|corp|corporation|co|ltd|llc)\b/g, "").trim();
  const right = fold(b).replace(/\b(inc|llc|corp|corporation|co|ltd|llc)\b/g, "").trim();
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.85;
  const aTokens = new Set(left.split(" "));
  const bTokens = new Set(right.split(" "));
  let overlap = 0;
  for (const t of aTokens) if (bTokens.has(t)) overlap += 1;
  return overlap / Math.max(aTokens.size, bTokens.size);
}

export function isAuthoritativeSourceType(type: string): boolean {
  return type === "sam.gov" || type === "usaspending.gov" || type === "gsa" || type === "fpds";
}
