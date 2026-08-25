import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { MCPS_ALLOWED_DOMAINS, MCPS_AUTHORITY } from "./constants";
import { extractKnowledgeItemsFromText } from "./extractKnowledge";
import { fetchPublicKnowledgeDocument } from "./fetchPublic";
import { contentHashFromText } from "./hash";
import type {
  AddSourceInput,
  KnowledgeItemRow,
  KnowledgeSourceRow,
  KnowledgeSourceVersionRow,
} from "./types";

export type IngestResult = {
  source: KnowledgeSourceRow;
  version: KnowledgeSourceVersionRow;
  items_created: number;
  changed: boolean;
  unchanged?: boolean;
};

async function nextVersionNumber(
  admin: SupabaseClient,
  sourceId: string
): Promise<number> {
  const { data } = await admin
    .from("knowledge_source_versions")
    .select("version_number")
    .eq("source_id", sourceId)
    .order("version_number", { ascending: false })
    .limit(1);
  const max = data?.[0]?.version_number;
  return typeof max === "number" ? max + 1 : 1;
}

/**
 * Create a source row and run the initial ingest pipeline.
 * Newly extracted items always enter needs_review — never auto-published.
 */
export async function createSourceAndIngest(args: {
  admin: SupabaseClient;
  userId: string;
  projectId: string;
  categoryId: string | null;
  input: AddSourceInput;
  allowedDomains?: ReadonlyArray<string>;
  authorityDefault?: string;
}): Promise<IngestResult> {
  const authority =
    args.input.authority?.trim() ||
    args.authorityDefault ||
    MCPS_AUTHORITY;

  const { data: existing } = await args.admin
    .from("knowledge_sources")
    .select("id")
    .eq("project_id", args.projectId)
    .eq("source_url", args.input.source_url)
    .maybeSingle();

  if (existing) {
    throw new Error("A source with this URL already exists in the project.");
  }

  const { data: source, error: insertError } = await args.admin
    .from("knowledge_sources")
    .insert({
      project_id: args.projectId,
      category_id: args.categoryId,
      source_name: args.input.source_name,
      source_url: args.input.source_url,
      category: args.input.category,
      authority,
      scope: args.input.scope,
      school: args.input.school ?? null,
      grade_level: args.input.grade_level ?? null,
      notes: args.input.notes ?? null,
      effective_date: args.input.effective_date ?? null,
      expires_at: args.input.expires_at ?? null,
      refresh_frequency: args.input.refresh_frequency ?? "manual",
      status: "fetching",
      created_by: args.userId,
    })
    .select("*")
    .single();

  if (insertError || !source) {
    throw new Error(insertError?.message ?? "Could not create source.");
  }

  try {
    return await ingestSourceContent({
      admin: args.admin,
      userId: args.userId,
      source: source as KnowledgeSourceRow,
      allowedDomains: args.allowedDomains ?? MCPS_ALLOWED_DOMAINS,
      isRefresh: false,
    });
  } catch (err) {
    await args.admin
      .from("knowledge_sources")
      .update({ status: "failed" })
      .eq("id", source.id);
    throw err;
  }
}

export async function ingestSourceContent(args: {
  admin: SupabaseClient;
  userId: string;
  source: KnowledgeSourceRow;
  allowedDomains?: ReadonlyArray<string>;
  isRefresh: boolean;
}): Promise<IngestResult> {
  const now = new Date().toISOString();
  await args.admin
    .from("knowledge_sources")
    .update({ status: "fetching", last_checked_at: now })
    .eq("id", args.source.id);

  let fetched;
  try {
    fetched = await fetchPublicKnowledgeDocument({
      url: args.source.source_url,
      allowedDomains: args.allowedDomains ?? MCPS_ALLOWED_DOMAINS,
    });
  } catch (err) {
    await args.admin
      .from("knowledge_sources")
      .update({ status: "failed", last_checked_at: now })
      .eq("id", args.source.id);
    throw err;
  }

  const hash = contentHashFromText(fetched.text);

  if (
    args.isRefresh &&
    args.source.content_hash &&
    args.source.content_hash === hash
  ) {
    await args.admin
      .from("knowledge_sources")
      .update({
        last_checked_at: now,
        last_successful_fetch_at: now,
        status:
          args.source.published_version_id != null
            ? "published"
            : args.source.status === "failed"
              ? "needs_review"
              : args.source.status,
      })
      .eq("id", args.source.id);

    const { data: currentVersion } = await args.admin
      .from("knowledge_source_versions")
      .select("*")
      .eq("id", args.source.current_version_id)
      .maybeSingle();

    return {
      source: {
        ...args.source,
        content_hash: hash,
        last_checked_at: now,
        last_successful_fetch_at: now,
      },
      version: (currentVersion ?? {
        id: args.source.current_version_id ?? "",
        source_id: args.source.id,
        version_number: 0,
        content_hash: hash,
        extracted_text: fetched.text,
        status: "published",
        change_summary: "unchanged",
        reviewed_by: null,
        reviewed_at: null,
        published_at: null,
        created_at: now,
      }) as KnowledgeSourceVersionRow,
      items_created: 0,
      changed: false,
      unchanged: true,
    };
  }

  const versionNumber = await nextVersionNumber(args.admin, args.source.id);
  const changeSummary = args.isRefresh
    ? "Source changed — review required"
    : "Initial ingest";

  // Archive prior review versions when creating a change version.
  if (args.isRefresh) {
    await args.admin
      .from("knowledge_source_versions")
      .update({ status: "archived" })
      .eq("source_id", args.source.id)
      .eq("status", "needs_review");
  }

  const { data: version, error: versionError } = await args.admin
    .from("knowledge_source_versions")
    .insert({
      source_id: args.source.id,
      version_number: versionNumber,
      content_hash: hash,
      extracted_text: fetched.text,
      status: "needs_review",
      change_summary: changeSummary,
    })
    .select("*")
    .single();

  if (versionError || !version) {
    await args.admin
      .from("knowledge_sources")
      .update({ status: "failed", last_checked_at: now })
      .eq("id", args.source.id);
    throw new Error(versionError?.message ?? "Could not save source version.");
  }

  const extracted = await extractKnowledgeItemsFromText({
    text: fetched.text,
    category: args.source.category,
    sourceUrl: fetched.finalUrl || args.source.source_url,
    sourceName: args.source.source_name,
  });

  let itemsCreated = 0;
  for (const item of extracted) {
    const { error } = await args.admin.from("knowledge_items").insert({
      project_id: args.source.project_id,
      source_id: args.source.id,
      version_id: version.id,
      title: item.title,
      content: item.content,
      category: item.category || args.source.category,
      subcategory: item.subcategory || null,
      school: item.school || args.source.school || null,
      grade_level: item.grade_level || args.source.grade_level || null,
      authority: args.source.authority,
      effective_date: args.source.effective_date,
      expires_at: args.source.expires_at,
      source_url: fetched.finalUrl || args.source.source_url,
      evidence_text: item.evidence_text,
      status: "needs_review",
    });
    if (!error) itemsCreated += 1;
  }

  const { data: updatedSource } = await args.admin
    .from("knowledge_sources")
    .update({
      status: "needs_review",
      content_hash: hash,
      current_version_id: version.id,
      last_checked_at: now,
      last_successful_fetch_at: now,
      source_url: args.source.source_url,
    })
    .eq("id", args.source.id)
    .select("*")
    .single();

  return {
    source: (updatedSource ?? args.source) as KnowledgeSourceRow,
    version: version as KnowledgeSourceVersionRow,
    items_created: itemsCreated,
    changed: true,
    unchanged: false,
  };
}

export async function refreshSource(args: {
  admin: SupabaseClient;
  userId: string;
  source: KnowledgeSourceRow;
  allowedDomains?: ReadonlyArray<string>;
}): Promise<IngestResult> {
  return ingestSourceContent({
    admin: args.admin,
    userId: args.userId,
    source: args.source,
    allowedDomains: args.allowedDomains,
    isRefresh: true,
  });
}

export async function refreshAllSources(args: {
  admin: SupabaseClient;
  userId: string;
  projectId: string;
  allowedDomains?: ReadonlyArray<string>;
}): Promise<{
  refreshed: number;
  changed: number;
  unchanged: number;
  failed: number;
  results: Array<{ source_id: string; status: string; message: string }>;
}> {
  const { data: sources } = await args.admin
    .from("knowledge_sources")
    .select("*")
    .eq("project_id", args.projectId)
    .neq("status", "archived");

  const results: Array<{ source_id: string; status: string; message: string }> =
    [];
  let changed = 0;
  let unchanged = 0;
  let failed = 0;

  for (const raw of sources ?? []) {
    const source = raw as KnowledgeSourceRow;
    try {
      const result = await refreshSource({
        admin: args.admin,
        userId: args.userId,
        source,
        allowedDomains: args.allowedDomains,
      });
      if (result.unchanged) {
        unchanged += 1;
        results.push({
          source_id: source.id,
          status: "unchanged",
          message: "No change",
        });
      } else {
        changed += 1;
        results.push({
          source_id: source.id,
          status: "changed",
          message: "Source changed — review required",
        });
      }
    } catch (err) {
      failed += 1;
      results.push({
        source_id: source.id,
        status: "failed",
        message: err instanceof Error ? err.message : "Refresh failed",
      });
    }
  }

  return {
    refreshed: (sources ?? []).length,
    changed,
    unchanged,
    failed,
    results,
  };
}

export type SourceReviewPayload = {
  source: KnowledgeSourceRow;
  versions: KnowledgeSourceVersionRow[];
  current_version: KnowledgeSourceVersionRow | null;
  published_version: KnowledgeSourceVersionRow | null;
  items: KnowledgeItemRow[];
  change_required: boolean;
};
