/** Pure helpers for Knowledge Studio website allowlisting (safe for unit tests). */

const IPV4 =
  /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV6 = /^\[?[0-9a-f:]+\]?$/i;

export function isIpHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (IPV4.test(host)) return true;
  if (host.includes(":") || IPV6.test(host)) return true;
  return false;
}

export function isLocalHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".localhost")
  );
}

/**
 * Validate that a URL is HTTPS and on an exact allowlisted host.
 * Rejects localhost, IPs, and non-HTTPS schemes.
 */
export function assertAllowedWebsiteUrl(
  rawUrl: string,
  allowedHosts: ReadonlySet<string>
): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL.");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("Only HTTPS URLs are allowed.");
  }
  const host = parsed.hostname.trim().toLowerCase();
  if (isLocalHostname(host)) {
    throw new Error("Localhost URLs are not allowed.");
  }
  if (isIpHostname(host)) {
    throw new Error("IP address URLs are not allowed.");
  }
  if (!allowedHosts.has(host)) {
    throw new Error("Domain is not on the allowlist.");
  }
  return parsed;
}

export function normalizeKnowledgeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "")
    .trim();
}

export function factDuplicateKey(args: {
  organizationSlug: string;
  title: string;
  content: string;
  sourceUrl?: string | null;
}): string {
  return [
    args.organizationSlug.trim().toLowerCase(),
    normalizeKnowledgeText(args.title),
    normalizeKnowledgeText(args.content).slice(0, 240),
    (args.sourceUrl ?? "").trim().toLowerCase(),
  ].join("|");
}

export function eventDuplicateKey(args: {
  organizationSlug: string;
  title: string;
  startAt: string | null | undefined;
}): string {
  const start = args.startAt?.trim() ? new Date(args.startAt).toISOString() : "";
  return [
    args.organizationSlug.trim().toLowerCase(),
    normalizeKnowledgeText(args.title),
    start,
  ].join("|");
}
