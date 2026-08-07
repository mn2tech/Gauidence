export type WebsiteDiscovery = {
  url: string;
  finalUrl: string;
  statusCode: number;
  title: string | null;
  metaDescription: string | null;
  h1: string | null;
  textSample: string;
  headers: Record<string, string>;
  isHttps: boolean;
  loadTimeMs: number;
};

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Enter a website URL.");
  if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

function extractMeta(html: string, name: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']`,
    "i"
  );
  const alt = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${name}["']`,
    "i"
  );
  return re.exec(html)?.[1]?.trim() ?? alt.exec(html)?.[1]?.trim() ?? null;
}

function extractTitle(html: string): string | null {
  const m = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
  return m?.[1]?.trim() ?? null;
}

function extractH1(html: string): string | null {
  const m = /<h1[^>]*>([^<]+)<\/h1>/i.exec(html);
  return m?.[1]?.trim().replace(/\s+/g, " ") ?? null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
}

/** Fetch homepage and extract discovery signals. */
export async function discoverWebsite(websiteUrl: string): Promise<WebsiteDiscovery> {
  const url = normalizeUrl(websiteUrl);
  const started = Date.now();
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent": "Guardian-Business-Advisor/1.0 (+https://guardian.nm2tech.com)",
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(20_000),
  });
  const html = await res.text();
  const headers: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  return {
    url,
    finalUrl: res.url,
    statusCode: res.status,
    title: extractTitle(html),
    metaDescription:
      extractMeta(html, "description") ?? extractMeta(html, "og:description"),
    h1: extractH1(html),
    textSample: stripHtml(html),
    headers,
    isHttps: res.url.startsWith("https://"),
    loadTimeMs: Date.now() - started,
  };
}
