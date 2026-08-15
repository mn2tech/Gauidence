import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueueDocumentProcessingJob } from "@/lib/documents/processingJobs";
import { isGuardianOntologyEnabled } from "@/lib/features/ontology";
import { getInstalledPack } from "./catalog";
import type { AnalyzeKnowledgeSelection, ProfilePackConfiguration } from "./types";

/** Keep start-analyze HTTP fast and avoid flooding workers. */
export const PACK_ANALYZE_BATCH_SIZE = 40;

export type AnalyzePreview = {
  documents: Array<{
    id: string;
    fileName: string;
    profileId: string;
    ontologyStatus: string | null;
  }>;
  proposals: Array<{ id: string; title: string }>;
  sourceItems: Array<{ id: string; name: string; sourceId: string }>;
  spaces: Array<{ id: string; displayName: string }>;
  /** Docs that still need ontology (shown first). */
  needingOntology: number;
  totalDocumentsInScope: number;
  batchLimit: number;
};

export type AnalyzeResult = {
  documentsQueued: number;
  proposalsNoted: number;
  sourceItemsQueued: number;
  skipped: string[];
  documentIds: string[];
  remainingNeedingOntology: number;
  batchLimit: number;
};

export type AnalyzeProgress = {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  skipped: number;
  percent: number;
  documentIds: string[];
  running: boolean;
  analyzedAt: string | null;
};

async function resolveSpaceIds(
  supabase: SupabaseClient,
  profileId: string,
  selection: AnalyzeKnowledgeSelection
): Promise<string[]> {
  const spaceIds = new Set<string>([profileId, ...(selection.spaceIds ?? [])]);

  const { data: childSpaces } = await supabase
    .from("guardian_profiles")
    .select("id")
    .eq("parent_profile_id", profileId);

  for (const child of childSpaces ?? []) {
    if (
      selection.spaceIds?.includes(child.id) ||
      selection.includeAllDocuments
    ) {
      spaceIds.add(String(child.id));
    }
  }

  return Array.from(spaceIds);
}

/**
 * Build a preview of what will be analyzed before the user confirms.
 */
export async function previewAnalyzeKnowledge(
  supabase: SupabaseClient,
  profileId: string,
  selection: AnalyzeKnowledgeSelection
): Promise<AnalyzePreview> {
  const spaceIds = await resolveSpaceIds(supabase, profileId, selection);

  const { data: childSpaces } = await supabase
    .from("guardian_profiles")
    .select("id, display_name")
    .eq("parent_profile_id", profileId);

  const spaces = [
    { id: profileId, displayName: "(this business Space)" },
    ...((childSpaces ?? [])
      .filter((s) => spaceIds.includes(String(s.id)))
      .map((s) => ({
        id: String(s.id),
        displayName: String(s.display_name ?? "Space"),
      })) as Array<{ id: string; displayName: string }>),
  ];

  let allDocs: Array<{
    id: string;
    file_name: string | null;
    profile_id: string;
    ontology_status: string | null;
  }> = [];

  if (selection.documentIds?.length) {
    const { data } = await supabase
      .from("documents")
      .select("id, file_name, profile_id, ontology_status")
      .in("id", selection.documentIds);
    allDocs = (data ?? []) as typeof allDocs;
  } else if (selection.includeAllDocuments || selection.spaceIds?.length) {
    const { data } = await supabase
      .from("documents")
      .select("id, file_name, profile_id, ontology_status")
      .in("profile_id", spaceIds)
      .limit(500);
    allDocs = (data ?? []) as typeof allDocs;
  }

  const needing = allDocs.filter((d) => d.ontology_status !== "completed");
  const pool = needing.length ? needing : allDocs;
  const batch = pool.slice(0, PACK_ANALYZE_BATCH_SIZE);

  const documents = batch.map((d) => ({
    id: String(d.id),
    fileName: String(d.file_name ?? "Document"),
    profileId: String(d.profile_id),
    ontologyStatus: d.ontology_status,
  }));

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

  return {
    documents,
    proposals,
    sourceItems,
    spaces,
    needingOntology: needing.length,
    totalDocumentsInScope: allDocs.length,
    batchLimit: PACK_ANALYZE_BATCH_SIZE,
  };
}

/**
 * Queue a bounded batch of ontology jobs (async). Prefer docs that still need
 * ontology. Force re-queue for failed/stale jobs so retries actually run.
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
  const documentIds: string[] = [];
  let documentsQueued = 0;
  let enqueueErrors = 0;

  // Enqueue in parallel chunks so the request returns quickly.
  const chunkSize = 8;
  for (let i = 0; i < preview.documents.length; i += chunkSize) {
    const chunk = preview.documents.slice(i, i + chunkSize);
    const results = await Promise.all(
      chunk.map(async (doc) => {
        // Always force for this batch — these docs were selected because they
        // still need ontology (failed / pending / never run). force:false was
        // skipping when an old extract_ontology job row was still "completed".
        const result = await enqueueDocumentProcessingJob(supabase, {
          documentId: doc.id,
          profileId: doc.profileId,
          userId: args.userId,
          jobType: "extract_ontology",
          force: true,
        });
        if (result.enqueued || result.jobId) {
          await supabase
            .from("documents")
            .update({
              ontology_status: "pending",
              last_processing_error: null,
            })
            .eq("id", doc.id);
        }
        return { doc, result };
      })
    );

    for (const { doc, result } of results) {
      documentIds.push(doc.id);
      if (result.enqueued) {
        documentsQueued += 1;
      } else if (result.jobId) {
        // Already pending/processing — still tracking; count as queued for UX.
        documentsQueued += 1;
      } else {
        enqueueErrors += 1;
        skipped.push(`document:${doc.id}`);
      }
    }
  }

  let sourceItemsQueued = 0;
  for (const item of preview.sourceItems.slice(0, 20)) {
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

  const remainingNeedingOntology = Math.max(
    0,
    preview.needingOntology - preview.documents.length
  );

  const configuration: ProfilePackConfiguration = {
    ...installed.installation.configuration,
    analyzedAt: new Date().toISOString(),
    lastAnalyzeSelection: args.selection,
    lastAnalyzeDocumentIds: documentIds,
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
      enqueueErrors,
      proposalsNoted: preview.proposals.length,
      sourceItemsQueued,
      documentIds,
      remainingNeedingOntology,
      selection: args.selection,
    },
  });

  if (preview.documents.length > 0 && documentsQueued === 0) {
    throw new Error(
      "Couldn't queue ontology jobs for these documents. Check that GUARDIAN_ONTOLOGY_ENABLED is on and document processing jobs are writable."
    );
  }

  return {
    documentsQueued,
    proposalsNoted: preview.proposals.length,
    sourceItemsQueued,
    skipped,
    documentIds,
    remainingNeedingOntology,
    batchLimit: PACK_ANALYZE_BATCH_SIZE,
  };
}

/** Progress for the last analyze batch (or space-wide ontology if no batch). */
export async function getAnalyzeProgress(
  supabase: SupabaseClient,
  profileId: string,
  packSlug: string
): Promise<AnalyzeProgress | null> {
  const installed = await getInstalledPack(supabase, profileId, packSlug);
  if (!installed) return null;

  const config = installed.installation.configuration ?? {};
  const documentIds = Array.isArray(config.lastAnalyzeDocumentIds)
    ? config.lastAnalyzeDocumentIds.filter(
        (id): id is string => typeof id === "string"
      )
    : [];

  let rows: Array<{ ontology_status: string | null }> = [];

  if (documentIds.length) {
    const { data } = await supabase
      .from("documents")
      .select("ontology_status")
      .in("id", documentIds);
    rows = (data ?? []) as typeof rows;
  } else {
    const spaceIds = await resolveSpaceIds(supabase, profileId, {
      includeAllDocuments: true,
    });
    const { data } = await supabase
      .from("documents")
      .select("ontology_status")
      .in("profile_id", spaceIds)
      .limit(500);
    rows = (data ?? []) as typeof rows;
  }

  let pending = 0;
  let processing = 0;
  let completed = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of rows) {
    const status = row.ontology_status ?? "pending";
    if (status === "completed") completed += 1;
    else if (status === "processing") processing += 1;
    else if (status === "failed" || status === "retryable") failed += 1;
    else if (status === "skipped") skipped += 1;
    else pending += 1;
  }

  const total = rows.length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  const running = pending > 0 || processing > 0;

  return {
    total,
    pending,
    processing,
    completed,
    failed,
    skipped,
    percent,
    documentIds,
    running,
    analyzedAt:
      typeof config.analyzedAt === "string" ? config.analyzedAt : null,
  };
}
