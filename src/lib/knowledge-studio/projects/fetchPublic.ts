import "server-only";

import { getDocumentProxy, extractText } from "unpdf";
import {
  assertAllowedDomainUrl,
} from "@/lib/knowledge-studio/normalize";
import { stripHtmlToText } from "@/lib/knowledge-studio/website/stripHtml";
import {
  PROJECT_FETCH_TIMEOUT_MS,
  PROJECT_MAX_RESPONSE_BYTES,
  PROJECT_MAX_TEXT_CHARS,
} from "./constants";

export type FetchedPublicDocument = {
  url: string;
  finalUrl: string;
  text: string;
  contentType: string;
};

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes);
  const merged = await extractText(pdf, { mergePages: true });
  return String(merged.text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Fetch a public HTTPS page or document from an allowlisted domain family.
 * Supports HTML and publicly accessible PDFs. No authenticated scraping.
 */
export async function fetchPublicKnowledgeDocument(args: {
  url: string;
  allowedDomains: ReadonlyArray<string>;
}): Promise<FetchedPublicDocument> {
  const seed = assertAllowedDomainUrl(args.url, args.allowedDomains);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROJECT_FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(seed.toString(), {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/pdf,text/plain;q=0.9,*/*;q=0.8",
        "User-Agent": "GuardianKnowledgeStudio/1.0 (+https://guardian)",
      },
    });

    const finalUrl = res.url || seed.toString();
    assertAllowedDomainUrl(finalUrl, args.allowedDomains);

    if (!res.ok) {
      throw new Error(`Failed to fetch source: HTTP ${res.status}`);
    }

    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
    const lengthHeader = res.headers.get("content-length");
    if (lengthHeader && Number(lengthHeader) > PROJECT_MAX_RESPONSE_BYTES) {
      throw new Error("Source response is too large.");
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > PROJECT_MAX_RESPONSE_BYTES) {
      throw new Error("Source response is too large.");
    }

    const isPdf =
      contentType.includes("application/pdf") ||
      seed.pathname.toLowerCase().endsWith(".pdf") ||
      finalUrl.toLowerCase().includes(".pdf");

    let text: string;
    if (isPdf) {
      text = await extractPdfText(Uint8Array.from(buf));
      if (!text.trim()) {
        throw new Error("PDF contained no extractable text.");
      }
    } else if (
      !contentType ||
      contentType.includes("text/html") ||
      contentType.includes("application/xhtml") ||
      contentType.includes("text/plain")
    ) {
      text = stripHtmlToText(buf.toString("utf8"), PROJECT_MAX_TEXT_CHARS);
    } else {
      throw new Error("Unsupported content type. Use a public webpage or PDF.");
    }

    if (!text.trim()) {
      throw new Error("No usable text could be extracted from the source.");
    }

    if (text.length > PROJECT_MAX_TEXT_CHARS) {
      text = `${text.slice(0, PROJECT_MAX_TEXT_CHARS).trimEnd()}\n…`;
    }

    return {
      url: seed.toString(),
      finalUrl,
      text,
      contentType: contentType || (isPdf ? "application/pdf" : "text/html"),
    };
  } finally {
    clearTimeout(timer);
  }
}
