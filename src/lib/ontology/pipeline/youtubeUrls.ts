/** YouTube URL helpers for Trello chart / song cards. */

const YOUTUBE_URL_RE =
  /https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?(?:[^#\s]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)[\w\-?=&%.]+/gi;

const YOUTUBE_ID_RE =
  /(?:youtube\.com\/(?:watch\?(?:[^#\s]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{6,})/i;

/** Normalize to a canonical watch URL when possible. */
export function normalizeYouTubeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const idMatch = trimmed.match(YOUTUBE_ID_RE);
  if (idMatch?.[1]) {
    return `https://www.youtube.com/watch?v=${idMatch[1]}`;
  }
  if (/youtube\.com|youtu\.be/i.test(trimmed) && /^https?:\/\//i.test(trimmed)) {
    return trimmed.split(/\s/)[0] ?? null;
  }
  return null;
}

/** Pull unique YouTube watch URLs from free text (card notes, attachments, answers). */
export function extractYouTubeUrls(text: string): string[] {
  if (!text?.trim()) return [];
  const found: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(YOUTUBE_URL_RE)) {
    const normalized = normalizeYouTubeUrl(match[0] ?? "");
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(normalized);
  }
  return found;
}

export function primaryYouTubeUrl(text: string): string | null {
  return extractYouTubeUrls(text)[0] ?? null;
}

/** Read youtube_url / youtube_urls from ontology entity properties + text fields. */
export function youTubeUrlsFromEntity(entity: {
  properties?: Record<string, unknown> | null;
  description?: string | null;
}): string[] {
  const props = entity.properties ?? {};
  const fromProps: string[] = [];
  const single = props.youtube_url;
  if (typeof single === "string" && single.trim()) fromProps.push(single);
  const many = props.youtube_urls;
  if (Array.isArray(many)) {
    for (const item of many) {
      if (typeof item === "string" && item.trim()) fromProps.push(item);
    }
  }
  const transcript =
    typeof props.content_transcript === "string"
      ? props.content_transcript
      : "";
  const blob = [fromProps.join("\n"), entity.description ?? "", transcript].join(
    "\n"
  );
  return extractYouTubeUrls(blob);
}

/**
 * Append Listen: links when ontology has YouTube URLs the answer omitted.
 */
export function ensureYouTubeLinksInAnswer(
  answer: string,
  urls: string[]
): string {
  const unique = [...new Set(urls.map((u) => normalizeYouTubeUrl(u)).filter(Boolean))] as string[];
  if (!unique.length) return answer;
  const lower = answer.toLowerCase();
  const missing = unique.filter((url) => {
    const id = url.match(YOUTUBE_ID_RE)?.[1]?.toLowerCase();
    if (id && lower.includes(id)) return false;
    return !lower.includes(url.toLowerCase());
  });
  if (!missing.length) return answer;
  const block =
    missing.length === 1
      ? `Listen: ${missing[0]}`
      : `Listen:\n${missing.map((u) => `- ${u}`).join("\n")}`;
  return `${answer.trim()}\n\n${block}`;
}
