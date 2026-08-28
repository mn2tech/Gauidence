import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type GuardianItemSourceView = {
  itemId: string;
  title: string;
  documentId: string | null;
  documentTitle: string | null;
  excerpt: string | null;
  accessible: boolean;
  message: string;
};

/**
 * Resolve source evidence for display.
 * If the source document is no longer accessible, do not leak the excerpt.
 */
export async function getGuardianItemSource(
  supabase: SupabaseClient,
  itemId: string
): Promise<GuardianItemSourceView | null> {
  const { data: item, error } = await supabase
    .from("guardian_items")
    .select(
      "id, title, source_document_id, source_excerpt, source_type, space_id"
    )
    .eq("id", itemId)
    .maybeSingle();

  if (error || !item) return null;

  if (!item.source_document_id) {
    return {
      itemId: item.id,
      title: item.title,
      documentId: null,
      documentTitle: null,
      excerpt: item.source_type === "daily_log" ? item.source_excerpt : null,
      accessible: true,
      message:
        item.source_type === "user"
          ? "You added this reminder yourself."
          : item.source_type === "daily_log"
            ? "Guardian found this in a Daily Log."
            : "Guardian saved this without a linked document.",
    };
  }

  const { data: doc } = await supabase
    .from("documents")
    .select("id, file_name, profile_id")
    .eq("id", item.source_document_id)
    .maybeSingle();

  if (!doc) {
    return {
      itemId: item.id,
      title: item.title,
      documentId: item.source_document_id,
      documentTitle: null,
      excerpt: null,
      accessible: false,
      message: "The original document is no longer available.",
    };
  }

  return {
    itemId: item.id,
    title: item.title,
    documentId: doc.id,
    documentTitle: doc.file_name,
    excerpt: item.source_excerpt,
    accessible: true,
    message: "Guardian found this in your documents.",
  };
}
