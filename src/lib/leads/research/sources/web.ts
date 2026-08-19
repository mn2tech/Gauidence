import "server-only";

import { discoverWebsite, type WebsiteDiscovery } from "@/lib/business-advisor/discovery";
import {
  formatWebResultsForPrompt,
  isWebSearchConfigured,
  searchWeb,
  type WebSearchResult,
} from "@/lib/research/webSearch";
import {
  looksLikeOfficialWebsite,
  websiteDomain,
} from "@/lib/leads/research/normalize";

export type WebResearchPacket = {
  officialWebsite: string;
  linkedinUrl: string;
  results: WebSearchResult[];
  promptBlock: string;
  discovery: WebsiteDiscovery | null;
  discoveryError: string | null;
  configured: boolean;
};

function linkedinCompanyUrl(results: WebSearchResult[]): string {
  const hit = results.find((r) =>
    /linkedin\.com\/company\//i.test(r.url)
  );
  return hit?.url ?? "";
}

function pickOfficialWebsite(
  results: WebSearchResult[],
  companyName: string,
  hinted?: string
): string {
  if (hinted && looksLikeOfficialWebsite(hinted)) return hinted;
  const folded = companyName.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const scored = results
    .filter((r) => looksLikeOfficialWebsite(r.url))
    .map((r) => {
      const host = websiteDomain(r.url).replace(/\./g, "");
      let score = 1;
      if (folded && host.includes(folded.slice(0, 8))) score += 4;
      if (/official|homepage|home/i.test(`${r.title} ${r.snippet}`)) score += 1;
      return { url: r.url, score };
    })
    .sort((a, b) => b.score - a.score);
  return scored[0]?.url ?? "";
}

export async function loadWebResearchPacket(args: {
  companyName: string;
  website?: string;
}): Promise<WebResearchPacket> {
  const hinted = args.website?.trim() ?? "";
  if (!isWebSearchConfigured()) {
    let discovery: WebsiteDiscovery | null = null;
    let discoveryError: string | null = null;
    if (hinted) {
      try {
        discovery = await discoverWebsite(hinted);
      } catch (err) {
        discoveryError = err instanceof Error ? err.message : "Couldn't reach the website.";
      }
    }
    return {
      officialWebsite: hinted,
      linkedinUrl: "",
      results: [],
      promptBlock: "(web search is not configured)",
      discovery,
      discoveryError,
      configured: false,
    };
  }

  const queries = [
    `${args.companyName} official website`,
    `${args.companyName} SAM.gov UEI CAGE`,
    `${args.companyName} GSA contract vehicle STARS OASIS`,
    `${args.companyName} site:usaspending.gov`,
    `${args.companyName} LinkedIn company`,
  ];

  const batches = await Promise.allSettled(
    queries.map((q) => searchWeb(q, { maxResults: 5 }))
  );
  const seen = new Set<string>();
  const results: WebSearchResult[] = [];
  for (const batch of batches) {
    if (batch.status !== "fulfilled") continue;
    for (const r of batch.value.results) {
      if (seen.has(r.url)) continue;
      seen.add(r.url);
      results.push(r);
    }
  }

  const officialWebsite = pickOfficialWebsite(results, args.companyName, hinted);
  const linkedinUrl = linkedinCompanyUrl(results);

  let discovery: WebsiteDiscovery | null = null;
  let discoveryError: string | null = null;
  const toFetch = officialWebsite || hinted;
  if (toFetch) {
    try {
      discovery = await discoverWebsite(toFetch);
    } catch (err) {
      discoveryError = err instanceof Error ? err.message : "Couldn't reach the website.";
    }
  }

  return {
    officialWebsite: officialWebsite || hinted,
    linkedinUrl,
    results,
    promptBlock: formatWebResultsForPrompt(results),
    discovery,
    discoveryError,
    configured: true,
  };
}
