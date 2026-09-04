export function parseFromHeader(raw: string): {
  fromName: string;
  fromEmail: string;
} {
  const trimmed = raw.trim();
  if (!trimmed) return { fromName: "Unknown", fromEmail: "" };
  const angle = trimmed.match(/^(.*)<([^>]+)>\s*$/);
  if (angle) {
    const name = angle[1]!.trim().replace(/^["']|["']$/g, "").trim();
    const email = angle[2]!.trim();
    return { fromName: name || email, fromEmail: email };
  }
  if (trimmed.includes("@")) {
    return { fromName: trimmed, fromEmail: trimmed };
  }
  return { fromName: trimmed, fromEmail: "" };
}

export function headerValue(
  headers: Array<{ name?: string; value?: string }> | undefined,
  name: string
): string {
  const hit = headers?.find(
    (h) => h.name?.toLowerCase() === name.toLowerCase()
  );
  return hit?.value?.trim() ?? "";
}

export function parseEmailDate(raw: string): string | null {
  if (!raw.trim()) return null;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}
