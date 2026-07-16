import "server-only";

export type WebSearchResult = {
  title: string;
  url: string;
  snippet: string;
};

export type WebSearchResponse = {
  results: WebSearchResult[];
  provider: "tavily";
};

export function isWebSearchConfigured(): boolean {
  return Boolean(process.env.TAVILY_API_KEY?.trim());
}

/**
 * Live web search via Tavily (server-side only).
 * Requires TAVILY_API_KEY — https://tavily.com
 */
export async function searchWeb(
  query: string,
  opts?: { maxResults?: number }
): Promise<WebSearchResponse> {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Web search isn't configured. Add TAVILY_API_KEY.");
  }

  const maxResults = Math.min(Math.max(opts?.maxResults ?? 6, 3), 10);
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query: query.slice(0, 400),
      search_depth: "basic",
      include_answer: false,
      include_images: false,
      include_raw_content: false,
      max_results: maxResults,
    }),
  });

  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 200);
    throw new Error(
      `Web search failed (${res.status}).${detail ? ` ${detail}` : ""}`
    );
  }

  const body = (await res.json()) as {
    results?: { title?: string; url?: string; content?: string }[];
  };

  const results: WebSearchResult[] = (body.results ?? [])
    .map((r) => ({
      title: String(r.title ?? "").trim() || "Untitled",
      url: String(r.url ?? "").trim(),
      snippet: String(r.content ?? "").trim().slice(0, 600),
    }))
    .filter((r) => r.url.startsWith("http"));

  return { results, provider: "tavily" };
}

export function formatWebResultsForPrompt(results: WebSearchResult[]): string {
  if (results.length === 0) return "(no web results)";
  return results
    .map(
      (r, i) =>
        `[${i + 1}] ${r.title}\nURL: ${r.url}\nSnippet: ${r.snippet || "(no snippet)"}`
    )
    .join("\n\n");
}
