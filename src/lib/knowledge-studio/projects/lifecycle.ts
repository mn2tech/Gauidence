import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  KnowledgeItemRow,
  KnowledgeSourceRow,
  KnowledgeSourceVersionRow,
} from "./types";
import type { SourceReviewPayload } from "./ingest";

export async function loadSourceReview(args: {
  admin: SupabaseClient;
  projectId: string;
  sourceId: string;
}): Promise<SourceReviewPayload | null> {
  const { data: source } = await args.admin
    .from("knowledge_sources")
    .select("*")
    .eq("id", args.sourceId)
    .eq("project_id", args.projectId)
    .maybeSingle();

  if (!source) return null;

  const [{ data: versions }, { data: items }] = await Promise.all([
    args.admin
      .from("knowledge_source_versions")
      .select("*")
      .eq("source_id", args.sourceId)
      .order("version_number", { ascending: false }),
    args.admin
      .from("knowledge_items")
      .select("*")
      .eq("source_id", args.sourceId)
      .order("created_at", { ascending: true }),
  ]);

  const versionRows = (versions ?? []) as KnowledgeSourceVersionRow[];
  const sourceRow = source as KnowledgeSourceRow;
  const current =
    versionRows.find((v) => v.id === sourceRow.current_version_id) ??
    versionRows[0] ??
    null;
  const published =
    versionRows.find((v) => v.id === sourceRow.published_version_id) ?? null;

  const change_required =
    Boolean(published) &&
    Boolean(current) &&
    published!.id !== current!.id &&
    current!.status === "needs_review";

  return {
    source: sourceRow,
    versions: versionRows,
    current_version: current,
    published_version: published,
    items: (items ?? []) as KnowledgeItemRow[],
    change_required,
  };
}

export async function updateKnowledgeItem(args: {
  admin: SupabaseClient;
  projectId: string;
  itemId: string;
  patch: Partial<{
    title: string;
    content: string;
    subcategory: string | null;
    school: string | null;
    grade_level: string | null;
    evidence_text: string;
  }>;
}): Promise<{ ok: true; item: KnowledgeItemRow } | { ok: false; error: string }> {
  const { data, error } = await args.admin
    .from("knowledge_items")
    .update(args.patch)
    .eq("id", args.itemId)
    .eq("project_id", args.projectId)
    .select("*")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Update failed." };
  return { ok: true, item: data as KnowledgeItemRow };
}

export async function setKnowledgeItemStatus(args: {
  admin: SupabaseClient;
  projectId: string;
  itemId: string;
  status: "approved" | "rejected" | "needs_review" | "archived";
  userId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const now = new Date().toISOString();
  const { error } = await args.admin
    .from("knowledge_items")
    .update({
      status: args.status,
      reviewed_by: args.userId,
      reviewed_at: now,
    })
    .eq("id", args.itemId)
    .eq("project_id", args.projectId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteKnowledgeItem(args: {
  admin: SupabaseClient;
  projectId: string;
  itemId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await args.admin
    .from("knowledge_items")
    .delete()
    .eq("id", args.itemId)
    .eq("project_id", args.projectId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function approveAllItemsForSource(args: {
  admin: SupabaseClient;
  projectId: string;
  sourceId: string;
  userId: string;
}): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const now = new Date().toISOString();
  const { data, error } = await args.admin
    .from("knowledge_items")
    .update({
      status: "approved",
      reviewed_by: args.userId,
      reviewed_at: now,
    })
    .eq("project_id", args.projectId)
    .eq("source_id", args.sourceId)
    .in("status", ["needs_review", "draft"])
    .select("id");
  if (error) return { ok: false, error: error.message };
  return { ok: true, count: data?.length ?? 0 };
}

/**
 * Publish all approved items for a source. Archives previously published
 * items from older versions of the same source when a new version is published.
 */
export async function publishApprovedForSource(args: {
  admin: SupabaseClient;
  projectId: string;
  sourceId: string;
  userId: string;
  versionId?: string | null;
}): Promise<{ ok: true; published: number } | { ok: false; error: string }> {
  const now = new Date().toISOString();

  const { data: source } = await args.admin
    .from("knowledge_sources")
    .select("*")
    .eq("id", args.sourceId)
    .eq("project_id", args.projectId)
    .maybeSingle();
  if (!source) return { ok: false, error: "Source not found." };

  const versionId =
    args.versionId ||
    (source as KnowledgeSourceRow).current_version_id;

  let query = args.admin
    .from("knowledge_items")
    .update({
      status: "published",
      published_at: now,
      reviewed_by: args.userId,
      reviewed_at: now,
    })
    .eq("project_id", args.projectId)
    .eq("source_id", args.sourceId)
    .eq("status", "approved");

  if (versionId) {
    query = query.eq("version_id", versionId);
  }

  const { data: publishedRows, error } = await query.select("id");
  if (error) return { ok: false, error: error.message };

  const publishedCount = publishedRows?.length ?? 0;
  if (publishedCount === 0) {
    return { ok: false, error: "No approved items to publish." };
  }

  // Archive published items from other versions of this source.
  if (versionId) {
    await args.admin
      .from("knowledge_items")
      .update({ status: "archived" })
      .eq("project_id", args.projectId)
      .eq("source_id", args.sourceId)
      .eq("status", "published")
      .neq("version_id", versionId);

    await args.admin
      .from("knowledge_source_versions")
      .update({ status: "archived" })
      .eq("source_id", args.sourceId)
      .eq("status", "published")
      .neq("id", versionId);

    await args.admin
      .from("knowledge_source_versions")
      .update({
        status: "published",
        published_at: now,
        reviewed_by: args.userId,
        reviewed_at: now,
      })
      .eq("id", versionId);
  }

  await args.admin
    .from("knowledge_sources")
    .update({
      status: "published",
      published_version_id: versionId,
    })
    .eq("id", args.sourceId);

  return { ok: true, published: publishedCount };
}
