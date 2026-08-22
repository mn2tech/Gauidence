import "server-only";

import {
  WEBSITE_FETCH_TIMEOUT_MS,
  WEBSITE_MAX_RESPONSE_BYTES,
  WEBSITE_MAX_TEXT_PER_PAGE,
} from "@/lib/knowledge-studio/constants";
import { assertAllowedWebsiteUrl } from "@/lib/knowledge-studio/normalize";
import { stripHtmlToText } from "./stripHtml";

export type FetchedWebsitePage = {
  url: string;
  finalUrl: string;
  text: string;
};

/**
 * Fetch a single allowlisted HTTPS page with SSRF protections.
 * Does not accept arbitrary user URLs — caller must pass fixed seed URLs.
 */
export async function fetchAllowedWebsitePage(args: {
  url: string;
  allowedHosts: ReadonlySet<string>;
}): Promise<FetchedWebsitePage> {
  const seed = assertAllowedWebsiteUrl(args.url, args.allowedHosts);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBSITE_FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(seed.toString(), {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "GuardianKnowledgeStudio/1.0 (+https://guardian)",
      },
    });

    const finalUrl = res.url || seed.toString();
    assertAllowedWebsiteUrl(finalUrl, args.allowedHosts);

    if (!res.ok) {
      throw new Error(`Failed to fetch ${seed.pathname}: HTTP ${res.status}`);
    }

    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
    if (
      contentType &&
      !contentType.includes("text/html") &&
      !contentType.includes("application/xhtml") &&
      !contentType.includes("text/plain")
    ) {
      throw new Error("Unexpected content type from website.");
    }

    const lengthHeader = res.headers.get("content-length");
    if (lengthHeader && Number(lengthHeader) > WEBSITE_MAX_RESPONSE_BYTES) {
      throw new Error("Website response is too large.");
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > WEBSITE_MAX_RESPONSE_BYTES) {
      throw new Error("Website response is too large.");
    }

    const html = buf.toString("utf8");
    const text = stripHtmlToText(html, WEBSITE_MAX_TEXT_PER_PAGE);
    return {
      url: seed.toString(),
      finalUrl,
      text,
    };
  } finally {
    clearTimeout(timer);
  }
}
