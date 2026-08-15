import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueueDocumentProcessingJob } from "@/lib/documents/processingJobs";
import { isGuardianOntologyEnabled } from "@/lib/features/ontology";
import { getInstalledPack } from "./catalog";
import type { AnalyzeKnowledgeSelection, ProfilePackConfiguration } from "./types";

export type AnalyzePreview = {
  documents: Array<{ id: string; fileName: string; profileId: string }>;
  proposals: Array<{ id: string; title: string }>;
  sourceItems: Array<{ id: string; name: string; sourceId: string }>;
  spaces: Array<{ id: string; displayName: string }>;
};

export type AnalyzeResult = {
  documentsQueued: number;
  proposalsNoted: number;
  sourceItemsQueued: number;
  skipped: string[];
};

/**
 * Build a preview of what will be analyzed before the user confirms.
 */
export async function previewAnalyzeKnowledge(
  supabase: SupabaseClient,
  profileId: string,
  selection: AnalyzeKnowledgeSelection
): Promise<AnalyzePreview> {
  const spaceIds = new Set<string>([profileId, ...(selection.spaceIds ?? [])]);

  const { data: childSpaces } = await supabase
    .from("guardian_profiles")
    .select("id, display_name")
    .eq("parent_profile_id", profileId);

  for (const child of childSpaces ?? []) {
    if (selection.spaceIds?.includes(child.id) || selection.includeAllDocuments) {
      spaceIds.add(child.id);
    }
  }

  const spaces = [
    { id: profileId, displayName: "(this business Space)" },
    ...((childSpaces ?? [])
      .filter((s) => spaceIds.has(s.id))
      .map((s) => ({
        id: String(s.id),
        displayName: String(s.display_name ?? "Space"),
      })) as Array<{ id: string; displayName: string }>),
  ];

  let documents: AnalyzePreview["documents"] = [];
  if (selection.documentIds?.length) {
    const { data } = await supabase
      .from("documents")
      .select("id, file_name, profile_id")
      .in("id", selection.documentIds);
    documents = (data ?? []).map((d) => ({
      id: String(d.id),
      fileName: String(d.file_name ?? "Document"),
      profileId: String(d.profile_id),
    }));
  } else if (selection.includeAllDocuments || selection.spaceIds?.length) {
    const ids = Array.from(spaceIds);
    const { data } = await supabase
      .from("documents")
      .select("id, file_name, profile_id")
      .in("profile_id", ids)
      .limit(500);
    documents = (data ?? []).map((d) => ({
      id: String(d.id),
      fileName: String(d.file_name ?? "Document"),
      profileId: String(d.profile_id),
    }));
  }

  let proposals: AnalyzePreview["proposals"] = [];
  if (selection.proposalIds?.length || selection.includeAllProposals) {
    let query = supabase
      .from("proposals")
      .select("id, title")
      .eq("business_profile_id", profileId);
    if (selection.proposalIds?.length) {
      query = query.in("id", selection.proposalIds);
    }
    const { data } = await query.limit(200);
    proposals = (data ?? []).map((p) => ({
      id: String(p.id),
      title: String(p.title ?? "Proposal"),
    }));
  }

  let sourceItems: AnalyzePreview["sourceItems"] = [];
  if (selection.sourceItemIds?.length) {
    const { data } = await supabase
      .from("source_items")
      .select("id, name, source_id")
      .in("id", selection.sourceItemIds);
    sourceItems = (data ?? []).map((s) => ({
      id: String(s.id),
      name: String(s.name ?? "Item"),
      sourceId: String(s.source_id),
    }));
  }

  return { documents, proposals, sourceItems, spaces };
}

/**
 * Queue ontology extraction for selected documents (async).
 * Proposals are noted for future pack-aware extraction; source items use
 * the existing connector analyze pipeline when IDs are provided.
 */
export async function startAnalyzeKnowledge(
  supabase: SupabaseClient,
  args: {
    profileId: string;
    userId: string;
    packSlug: string;
    selection: AnalyzeKnowledgeSelection;
  }
): Promise<AnalyzeResult> {
  if (!isGuardianOntologyEnabled()) {
    throw new Error(
      "Ontology extraction is disabled. Enable GUARDIAN_ONTOLOGY_ENABLED."
    );
  }

  const installed = await getInstalledPack(
    supabase,
    args.profileId,
    args.packSlug
  );
  if (!installed) {
    throw new Error("Install this Pack before analyzing knowledge.");
  }

  const preview = await previewAnalyzeKnowledge(
    supabase,
    args.profileId,
    args.selection
  );

  const skipped: string[] = [];
  let documentsQueued = 0;

  for (const doc of preview.documents) {
    const result = await enqueueDocumentProcessingJob(supabase, {
      documentId: doc.id,
      profileId: doc.profileId,
      userId: args.userId,
      jobType: "extract_ontology",
      force: true,
    });
    if (result.enqueued) documentsQueued += 1;
    else skipped.push(`document:${doc.id}`);
  }

  // Connector source items: mark for analysis via existing processing_status
  let sourceItemsQueued = 0;
  for (const item of preview.sourceItems) {
    const { error } = await supabase
      .from("source_items")
      .update({
        processing_status: "discovered",
        analysis_error: null,
      })
      .eq("id", item.id);
    if (!error) sourceItemsQueued += 1;
    else skipped.push(`source_item:${item.id}`);
  }

  const configuration: ProfilePackConfiguration = {
    ...installed.installation.configuration,
    analyzedAt: new Date().toISOString(),
    lastAnalyzeSelection: args.selection,
  };

  await supabase
    .from("profile_packs")
    .update({
      configuration,
      updated_at: new Date().toISOString(),
    })
    .eq("id", installed.installation.id);

  await supabase.from("pack_install_events").insert({
    profile_id: args.profileId,
    pack_id: installed.definition.pack.id,
    pack_version_id: installed.definition.version.id,
    event_type: "analyze_knowledge",
    actor_user_id: args.userId,
    metadata: {
      documentsQueued,
      proposalsNoted: preview.proposals.length,
      sourceItemsQueued,
      selection: args.selection,
    },
  });

  return {
    documentsQueued,
    proposalsNoted: preview.proposals.length,
    sourceItemsQueued,
    skipped,
  };
}
