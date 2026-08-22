import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CROSSROADS_ALLOWED_HOSTS,
  CROSSROADS_ORG_SLUG,
  CROSSROADS_SCAN_URLS,
  CROSSROADS_WEBSITE_SOURCE_LABEL,
} from "@/lib/knowledge-studio/constants";
import type { WebsiteScanSaveResult } from "@/lib/knowledge-studio/types";
import { fetchAllowedWebsitePage } from "./fetchPage";
import { extractKnowledgeFromWebsitePages } from "./extract";
import { saveWebsiteScanDrafts } from "./saveDrafts";

export type CrossroadsWebsiteScanResult = WebsiteScanSaveResult & {
  pages_scanned: string[];
};

/**
 * Fixed-URL CrossRoads website scan → extract → save private drafts.
 * Never publishes automatically.
 */
export async function scanCrossroadsWebsite(args: {
  admin: SupabaseClient;
  userId: string;
}): Promise<CrossroadsWebsiteScanResult> {
  const pages = [];
  for (const url of CROSSROADS_SCAN_URLS) {
    pages.push(
      await fetchAllowedWebsitePage({
        url,
        allowedHosts: CROSSROADS_ALLOWED_HOSTS,
      })
    );
  }

  const extraction = await extractKnowledgeFromWebsitePages(pages);
  const saved = await saveWebsiteScanDrafts({
    admin: args.admin,
    userId: args.userId,
    organizationSlug: CROSSROADS_ORG_SLUG,
    sourceLabel: CROSSROADS_WEBSITE_SOURCE_LABEL,
    facts: extraction.facts,
    events: extraction.events,
  });

  return {
    ...saved,
    pages_scanned: pages.map((p) => p.finalUrl),
  };
}
