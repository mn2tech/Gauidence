import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { processOntologyExtraction } from "./processJob";
import { isGuardianOntologyEnabled } from "@/lib/features/ontology";

export type BackfillResult = {
  processed: number;
  successful: number;
  failed: number;
  skipped: number;
  entitiesCreated: number;
  entitiesMatched: number;
  relationshipsCreated: number;
};

export async function backfillOntologyForDocuments(
  supabase: SupabaseClient,
  args: {
    userId: string;
    spaceId: string;
    documentIds?: string[];
    limit?: number;
  }
): Promise<BackfillResult> {
  if (!isGuardianOntologyEnabled()) {
    throw new Error("Ontology engine is disabled");
  }

  const result: BackfillResult = {
    processed: 0,
    successful: 0,
    failed: 0,
    skipped: 0,
    entitiesCreated: 0,
    entitiesMatched: 0,
    relationshipsCreated: 0,
  };

  let documentIds = args.documentIds;

  if (!documentIds?.length) {
    const limit = args.limit ?? 10;
    const { data: docs } = await supabase
      .from("documents")
      .select("id")
      .eq("profile_id", args.spaceId)
      .in("indexing_status", ["completed"])
      .order("created_at", { ascending: false })
      .limit(limit);

    documentIds = (docs ?? []).map((d) => d.id);
  }

  for (const documentId of documentIds) {
    result.processed += 1;

    const { data: doc } = await supabase
      .from("documents")
      .select("profile_id, indexing_status, ontology_status")
      .eq("id", documentId)
      .maybeSingle();

    if (!doc || doc.profile_id !== args.spaceId) {
      result.skipped += 1;
      continue;
    }

    if (doc.indexing_status !== "completed") {
      result.skipped += 1;
      continue;
    }

    try {
      await supabase
        .from("documents")
        .update({ ontology_status: "processing" })
        .eq("id", documentId);

      await processOntologyExtraction(
        supabase,
        args.userId,
        documentId,
        args.spaceId
      );

      await supabase
        .from("documents")
        .update({ ontology_status: "completed" })
        .eq("id", documentId);

      result.successful += 1;
    } catch (err) {
      console.error("Ontology backfill failed:", documentId, err);
      await supabase
        .from("documents")
        .update({ ontology_status: "failed" })
        .eq("id", documentId);
      result.failed += 1;
    }
  }

  return result;
}
