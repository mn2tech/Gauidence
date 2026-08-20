import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { assertStorageQuota } from "@/lib/billing/storage";
import { enqueueAnalyzePipeline } from "@/lib/documents/processingJobs";
import { buildPastedTextFile } from "@/lib/vault/pastedText";
import {
  crawlWebsiteForImport,
  websitePageFileName,
  type CrawledPage,
  type WebsiteCrawlResult,
} from "@/lib/vault/websiteCrawl";

export type WebsiteImportDocument = {
  documentId: string;
  fileName: string;
  title: string;
  sourceUrl: string;
};

export type WebsiteImportResult = {
  crawl: WebsiteCrawlResult;
  documents: WebsiteImportDocument[];
  profileId: string;
};

async function insertPageDocument(
  supabase: SupabaseClient,
  args: {
    userId: string;
    profileId: string;
    storageOwnerId: string;
    page: CrawledPage;
  }
): Promise<WebsiteImportDocument> {
  const file = buildPastedTextFile({
    title: args.page.title,
    content: args.page.text,
    sourceUrl: args.page.finalUrl,
  });
  const fileName = websitePageFileName(args.page.title, args.page.finalUrl);
  const named = new File([await file.arrayBuffer()], fileName, {
    type: "text/plain",
    lastModified: Date.now(),
  });

  const safeName = fileName.replace(/[^\w.\- ]/g, "_");
  const path = `${args.storageOwnerId}/${args.profileId}/${randomUUID()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(path, named, { contentType: "text/plain" });
  if (uploadError) {
    throw new Error(
      uploadError.message?.includes("Bucket not found")
        ? "Document storage isn't set up yet on this project."
        : "Couldn't store a website page. Check your connection and try again."
    );
  }

  const { data: inserted, error: insertError } = await supabase
    .from("documents")
    .insert({
      user_id: args.userId,
      profile_id: args.profileId,
      file_name: fileName,
      file_path: path,
      mime_type: "text/plain",
      size_bytes: named.size,
      analysis_status: "uploaded",
    })
    .select("id, file_name")
    .single();

  if (insertError || !inserted) {
    await supabase.storage.from("documents").remove([path]);
    const detail = insertError?.message?.trim();
    throw new Error(
      detail
        ? `Couldn't save website page: ${detail}`
        : "Couldn't save website page. Please try again."
    );
  }

  await enqueueAnalyzePipeline(supabase, {
    documentId: inserted.id,
    profileId: args.profileId,
    userId: args.userId,
  });

  return {
    documentId: inserted.id,
    fileName: inserted.file_name,
    title: args.page.title,
    sourceUrl: args.page.finalUrl,
  };
}

/** Crawl a public website and store pages as Space documents + queue analysis. */
export async function importWebsiteToVault(
  supabase: SupabaseClient,
  args: {
    userId: string;
    profileId: string;
    storageOwnerId: string;
    websiteUrl: string;
    email?: string | null;
    maxPages?: number;
  }
): Promise<WebsiteImportResult> {
  const crawl = await crawlWebsiteForImport(args.websiteUrl, {
    maxPages: args.maxPages,
  });

  if (crawl.pages.length === 0) {
    const detail = crawl.errors[0] ?? "No readable pages found on that website.";
    throw new Error(detail);
  }

  const totalBytes = crawl.pages.reduce(
    (sum, page) => sum + Buffer.byteLength(page.text, "utf8") + 200,
    0
  );
  const quota = await assertStorageQuota(supabase, {
    accountId: args.storageOwnerId,
    additionalBytes: totalBytes,
    email: args.email,
  });
  if (!quota.ok) {
    throw new Error(
      "You've reached your vault storage limit. Delete files in Settings → Storage or upgrade your plan."
    );
  }

  const documents: WebsiteImportDocument[] = [];
  for (const page of crawl.pages) {
    const doc = await insertPageDocument(supabase, {
      userId: args.userId,
      profileId: args.profileId,
      storageOwnerId: args.storageOwnerId,
      page,
    });
    documents.push(doc);
  }

  return {
    crawl,
    documents,
    profileId: args.profileId,
  };
}
