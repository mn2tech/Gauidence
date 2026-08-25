import {
  KNOWLEDGE_SCOPES,
  REFRESH_FREQUENCIES,
  type AddSourceInput,
  type KnowledgeScope,
  type RefreshFrequency,
} from "./types";

export type SourceValidationOk = { ok: true; value: AddSourceInput };
export type SourceValidationErr = { ok: false; error: string };
export type SourceValidationResult = SourceValidationOk | SourceValidationErr;

function asTrimmed(value: unknown, max = 500): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function asOptionalDate(value: unknown): string | null {
  const s = asTrimmed(value, 32);
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new Error("Dates must use YYYY-MM-DD format.");
  }
  return s;
}

export function parseHttpsUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new Error("Invalid URL.");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("Only HTTPS URLs are allowed.");
  }
  return parsed;
}

export function validateAddSourceInput(
  body: unknown,
  allowedCategories: ReadonlyArray<string>
): SourceValidationResult {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Invalid request body." };
  }
  const row = body as Record<string, unknown>;

  const source_name = asTrimmed(row.source_name, 200);
  if (!source_name) {
    return { ok: false, error: "Source Name is required." };
  }

  const source_url_raw = asTrimmed(row.source_url, 2000);
  if (!source_url_raw) {
    return { ok: false, error: "Source URL is required." };
  }
  let source_url: string;
  try {
    source_url = parseHttpsUrl(source_url_raw).href;
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Invalid URL.",
    };
  }

  const category = asTrimmed(row.category, 80).toLowerCase();
  if (!category) {
    return { ok: false, error: "Category is required." };
  }
  if (!allowedCategories.includes(category)) {
    return { ok: false, error: "Unknown category." };
  }

  const scopeRaw = asTrimmed(row.scope, 40).toLowerCase() || "district";
  if (!(KNOWLEDGE_SCOPES as readonly string[]).includes(scopeRaw)) {
    return { ok: false, error: "Invalid Knowledge Scope." };
  }

  const refreshRaw =
    asTrimmed(row.refresh_frequency, 40).toLowerCase() || "manual";
  if (!(REFRESH_FREQUENCIES as readonly string[]).includes(refreshRaw)) {
    return { ok: false, error: "Invalid Refresh Frequency." };
  }

  let effective_date: string | null = null;
  let expires_at: string | null = null;
  try {
    effective_date = asOptionalDate(row.effective_date);
    expires_at = asOptionalDate(row.expires_at);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Invalid date.",
    };
  }

  return {
    ok: true,
    value: {
      source_name,
      source_url,
      category,
      authority: asTrimmed(row.authority, 300) || undefined,
      scope: scopeRaw as KnowledgeScope,
      school: asTrimmed(row.school, 200) || null,
      grade_level: asTrimmed(row.grade_level, 80) || null,
      notes: asTrimmed(row.notes, 4000) || null,
      effective_date,
      expires_at,
      refresh_frequency: refreshRaw as RefreshFrequency,
    },
  };
}
