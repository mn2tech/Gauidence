/** Crawl public HTML pages for vault website import (no browser/JS rendering). */

export const WEBSITE_IMPORT_MAX_PAGES = 8;
export const WEBSITE_IMPORT_MAX_CHARS = 40_000;
export const WEBSITE_IMPORT_PAGE_TIMEOUT_MS = 20_000;

const SKIP_PATH_RE =
  /\/(wp-admin|wp-login|cart|checkout|account|login|signin|sign-up|signup|register|cdn-cgi|feed|rss|tag\/|author\/)(\/|$)/i;

const PRIORITY_PATH_RE =
  /\/(about|services|team|fees|fee|advisors?|contact|who-we-are|our-team|disclosures?|form-adv|crs|fiduciary|process|approach|philosophy|investing|wealth|planning|get-started|locations?|offices?)(\/|$)/i;

export type CrawledPage = {
  url: string;
  finalUrl: string;
  title: string;
  text: string;
  statusCode: number;
};

export type WebsiteCrawlResult = {
  seedUrl: string;
  origin: string;
  pages: CrawledPage[];
  skipped: number;
  errors: string[];
};

export function normalizeWebsiteUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Enter a website URL.");
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new Error("That doesn't look like a valid website URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http and https URLs are supported.");
  }
  assertPublicHostname(parsed.hostname);
  parsed.hash = "";
  return parsed.toString();
}

export function assertPublicHostname(hostname: string): void {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!host) throw new Error("That URL is missing a hostname.");
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "metadata.google.internal"
  ) {
    throw new Error("That address can't be imported.");
  }
  // Block obvious private / link-local IPv4 literals (no DNS resolve in v1).
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const parts = host.split(".").map(Number);
    const [a, b] = parts;
    if (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    ) {
      throw new Error("That address can't be imported.");
    }
  }
}

function decodeBasicEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCharCode(code) : "";
    });
}

export function extractHtmlTitle(html: string): string | null {
  const m = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
  return m?.[1] ? decodeBasicEntities(m[1].trim()).replace(/\s+/g, " ") : null;
}

export function stripHtmlToText(
  html: string,
  maxChars = WEBSITE_IMPORT_MAX_CHARS
): string {
  const withoutNoise = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|h[1-6]|li|tr|br|section|article|header|footer)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeBasicEntities(withoutNoise)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
    .slice(0, maxChars);
}

function canonicalizePageUrl(href: string, base: URL): string | null {
  let absolute: URL;
  try {
    absolute = new URL(href, base);
  } catch {
    return null;
  }
  if (absolute.protocol !== "http:" && absolute.protocol !== "https:") return null;
  if (absolute.origin !== base.origin) return null;
  if (SKIP_PATH_RE.test(absolute.pathname)) return null;
  const path = absolute.pathname.toLowerCase();
  if (
    path.endsWith(".jpg") ||
    path.endsWith(".jpeg") ||
    path.endsWith(".png") ||
    path.endsWith(".gif") ||
    path.endsWith(".webp") ||
    path.endsWith(".svg") ||
    path.endsWith(".css") ||
    path.endsWith(".js") ||
    path.endsWith(".ico") ||
    path.endsWith(".xml") ||
    path.endsWith(".zip")
  ) {
    return null;
  }
  absolute.hash = "";
  // Drop tracking params but keep meaningful query rarely used on marketing sites.
  absolute.search = "";
  // Normalize trailing slash (except root).
  if (absolute.pathname.length > 1 && absolute.pathname.endsWith("/")) {
    absolute.pathname = absolute.pathname.slice(0, -1);
  }
  return absolute.toString();
}

export function extractSameOriginLinks(html: string, pageUrl: string): string[] {
  const base = new URL(pageUrl);
  const found = new Set<string>();
  const re = /href\s*=\s*["']([^"'#]+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const canonical = canonicalizePageUrl(match[1], base);
    if (canonical) found.add(canonical);
  }
  return [...found];
}

export function rankUrlsForImport(seedUrl: string, urls: string[]): string[] {
  const seed = new URL(seedUrl);
  const unique = [...new Set(urls.map((u) => {
    try {
      return canonicalizePageUrl(u, seed) ?? u;
    } catch {
      return u;
    }
  }))];

  const scored = unique.map((url) => {
    let score = 0;
    try {
      const path = new URL(url).pathname.toLowerCase();
      if (path === "/" || path === "") score += 100;
      if (PRIORITY_PATH_RE.test(path)) score += 50;
      // Prefer shorter paths (top-level pages).
      score += Math.max(0, 20 - path.split("/").filter(Boolean).length * 4);
    } catch {
      score -= 10;
    }
    return { url, score };
  });

  scored.sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));
  return scored.map((s) => s.url);
}

function titleFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname.replace(/\/+/g, "/").replace(/\/$/, "");
    if (!path || path === "/") return "Home";
    const last = path.split("/").filter(Boolean).pop() ?? "Page";
    return last
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  } catch {
    return "Page";
  }
}

async function fetchHtmlPage(url: string): Promise<{
  finalUrl: string;
  statusCode: number;
  html: string;
} | null> {
  assertPublicHostname(new URL(url).hostname);
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent": "Guardian-Website-Import/1.0 (+https://guardian.nm2tech.com)",
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(WEBSITE_IMPORT_PAGE_TIMEOUT_MS),
  });
  const contentType = res.headers.get("content-type") ?? "";
  if (!/text\/html|application\/xhtml\+xml/i.test(contentType) && contentType) {
    return null;
  }
  // After redirects, re-check host.
  try {
    assertPublicHostname(new URL(res.url).hostname);
  } catch {
    return null;
  }
  if (!res.ok) {
    return { finalUrl: res.url, statusCode: res.status, html: "" };
  }
  const html = await res.text();
  return { finalUrl: res.url, statusCode: res.status, html };
}

/**
 * Fetch seed URL, discover same-origin links, and return up to maxPages
 * text extractions pages (seed first, then priority paths).
 */
export async function crawlWebsiteForImport(
  websiteUrl: string,
  options?: { maxPages?: number }
): Promise<WebsiteCrawlResult> {
  const maxPages = Math.min(
    Math.max(1, options?.maxPages ?? WEBSITE_IMPORT_MAX_PAGES),
    WEBSITE_IMPORT_MAX_PAGES
  );
  const seedUrl = normalizeWebsiteUrl(websiteUrl);
  const seed = new URL(seedUrl);
  const errors: string[] = [];
  const pages: CrawledPage[] = [];
  let skipped = 0;

  const seedFetch = await fetchHtmlPage(seedUrl).catch((err) => {
    errors.push(err instanceof Error ? err.message : "Couldn't reach that website.");
    return null;
  });

  if (!seedFetch || !seedFetch.html) {
    if (!errors.length) {
      errors.push(
        seedFetch?.statusCode
          ? `Website returned status ${seedFetch.statusCode}.`
          : "Couldn't load that website."
      );
    }
    return { seedUrl, origin: seed.origin, pages, skipped, errors };
  }

  const seedTitle =
    extractHtmlTitle(seedFetch.html) ?? titleFromUrl(seedFetch.finalUrl);
  const seedText = stripHtmlToText(seedFetch.html);
  if (seedText.length < 40) {
    errors.push(
      "That page didn't have enough readable text (it may be heavily JavaScript-based)."
    );
  } else {
    pages.push({
      url: seedUrl,
      finalUrl: seedFetch.finalUrl,
      title: seedTitle,
      text: seedText,
      statusCode: seedFetch.statusCode,
    });
  }

  const discovered = extractSameOriginLinks(seedFetch.html, seedFetch.finalUrl);
  const seedCanonical =
    canonicalizePageUrl(seedFetch.finalUrl, new URL(seedFetch.finalUrl)) ??
    seedFetch.finalUrl;
  const ranked = rankUrlsForImport(seedFetch.finalUrl, discovered).filter(
    (u) => u !== seedCanonical
  );

  for (const nextUrl of ranked) {
    if (pages.length >= maxPages) {
      skipped += 1;
      continue;
    }
    const fetched = await fetchHtmlPage(nextUrl).catch(() => null);
    if (!fetched?.html || fetched.statusCode >= 400) {
      skipped += 1;
      continue;
    }
    // Stay on same registrable origin as seed after redirects.
    try {
      if (new URL(fetched.finalUrl).origin !== seed.origin) {
        skipped += 1;
        continue;
      }
    } catch {
      skipped += 1;
      continue;
    }
    const text = stripHtmlToText(fetched.html);
    if (text.length < 40) {
      skipped += 1;
      continue;
    }
    const title = extractHtmlTitle(fetched.html) ?? titleFromUrl(fetched.finalUrl);
    // Deduplicate near-identical pages by URL path already; also skip empty titles.
    if (pages.some((p) => p.finalUrl === fetched.finalUrl)) {
      skipped += 1;
      continue;
    }
    pages.push({
      url: nextUrl,
      finalUrl: fetched.finalUrl,
      title,
      text,
      statusCode: fetched.statusCode,
    });
  }

  return { seedUrl, origin: seed.origin, pages, skipped, errors };
}

export function websitePageFileName(title: string, pageUrl: string): string {
  const host = (() => {
    try {
      return new URL(pageUrl).hostname.replace(/^www\./i, "");
    } catch {
      return "website";
    }
  })();
  const safeTitle = title.replace(/[^\w.\- ]/g, "_").trim().slice(0, 60) || "page";
  return `Website - ${host} - ${safeTitle}.txt`;
}
