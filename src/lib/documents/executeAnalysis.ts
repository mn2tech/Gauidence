import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import { isDocumentCategory } from "@/lib/categories";
import { runAnalysisPipeline } from "@/lib/analysis/pipeline";
import { toDisplayFacts, collectDeadlines } from "@/lib/analysis/display";
import { documentTypeToCategory } from "@/lib/analysis/llm";
import type { AnalysisStatus } from "@/lib/analysis/types";
import { withLlmUsage } from "@/lib/usage/record";
import {
  createDiagnostics,
  logProcessingDiagnostics,
  mergeDiagnostics,
  recordDuration,
  type ProcessingDiagnostics,
} from "./processingDiagnostics";

export type ExecuteAnalysisResult = {
  summary: string;
  facts: ReturnType<typeof toDisplayFacts>;
  model: string;
  title: string;
  documentType: string;
  classificationConfidence: number;
  classificationReason: string;
  routedTo: string;
  guardianStatus: string;
  overallConfidence: number;
  warnings: string[];
  analysisStatus: AnalysisStatus;
  suggestedCategory: string | null;
  sourceText: string;
  analysis: Awaited<ReturnType<typeof runAnalysisPipeline>>["analysis"];
  classification: Awaited<ReturnType<typeof runAnalysisPipeline>>["classification"];
  diagnostics?: ProcessingDiagnostics;
};

export async function executeDocumentAnalysis(
  supabase: SupabaseClient,
  user: User,
  args: {
    documentId: string;
    timeZone: string;
    diagnostics?: ProcessingDiagnostics;
  }
): Promise<ExecuteAnalysisResult> {
  let diagnostics = args.diagnostics ?? createDiagnostics();
  const pipelineStart = Date.now();

  const { data: doc } = await supabase
    .from("documents")
    .select("id, file_name, file_path, mime_type, size_bytes, category, profile_id")
    .eq("id", args.documentId)
    .maybeSingle();

  if (!doc) {
    throw new Error("Document not found.");
  }

  const setStatus = async (status: AnalysisStatus) => {
    await supabase
      .from("documents")
      .update({
        analysis_status: status,
        processing_step: status,
        processing_progress: null,
      })
      .eq("id", doc.id);
  };

  const downloadStart = Date.now();
  const { data: file, error: downloadError } = await supabase.storage
    .from("documents")
    .download(doc.file_path);
  if (downloadError || !file) {
    throw new Error("We couldn't read the stored file.");
  }
  diagnostics = recordDuration(diagnostics, "storage_upload_ms", downloadStart);

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");

  const { data: accountProfile } = await supabase
    .from("profiles")
    .select("full_name, email, company_name")
    .eq("id", user.id)
    .maybeSingle();

  const { data: guardianProfile } = doc.profile_id
    ? await supabase
        .from("guardian_profiles")
        .select(
          "id, profile_type, display_name, business_legal_name, organization_name"
        )
        .eq("id", doc.profile_id)
        .maybeSingle()
    : { data: null };

  const companyName =
    (guardianProfile?.profile_type === "business" ||
    guardianProfile?.profile_type === "non_profit"
      ? guardianProfile.business_legal_name || guardianProfile.display_name
      : guardianProfile?.organization_name) ||
    accountProfile?.company_name ||
    null;

  const analysisStart = Date.now();
  const result = await withLlmUsage({ userId: user.id, feature: "analyze" }, () =>
    runAnalysisPipeline(
      {
        mimeType: doc.mime_type,
        fileName: doc.file_name,
        base64,
      },
      {
        fullName:
          guardianProfile?.display_name ?? accountProfile?.full_name ?? null,
        email: accountProfile?.email ?? user.email ?? null,
        companyName,
        timeZone: args.timeZone,
      },
      setStatus
    )
  );
  diagnostics = recordDuration(diagnostics, "llm_analysis_ms", analysisStart);

  const { analysis, classification, routedTo, model, sourceText } = result;
  const facts = toDisplayFacts(analysis, args.timeZone);
  const finalStatus: AnalysisStatus =
    analysis.guardian_status === "needs_verification"
      ? "needs_verification"
      : "completed";

  const profileId = doc.profile_id as string;

  const { error: saveError } = await supabase.from("extracted_data").upsert(
    {
      document_id: doc.id,
      user_id: user.id,
      profile_id: profileId,
      summary: analysis.summary,
      facts,
      model,
      document_type: analysis.document_type,
      document_subtype: classification.document_subtype,
      classification_confidence: classification.classification_confidence,
      guardian_status: analysis.guardian_status,
      overall_confidence: analysis.overall_confidence,
      warnings: analysis.warnings,
      specialist: {
        ...analysis.specialist,
        routed_to: routedTo,
        classification_reason: classification.classification_reason,
        people: analysis.people,
        organizations: analysis.organizations,
        obligations: analysis.obligations,
        suggested_actions: analysis.suggested_actions,
        important_dates: analysis.important_dates,
        amounts: analysis.amounts,
      },
      title: analysis.title,
      source_text: sourceText,
      source_text_indexed_at: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "document_id" }
  );
  if (saveError) {
    throw new Error("Analysis finished but couldn't be saved.");
  }

  await supabase.from("analysis_events").insert({ user_id: user.id });

  let suggestedCategory: string | null = null;
  if (!doc.category) {
    const cat = documentTypeToCategory(analysis.document_type);
    if (isDocumentCategory(cat)) {
      const { error: categoryError } = await supabase
        .from("documents")
        .update({ category: cat })
        .eq("id", doc.id);
      if (!categoryError) suggestedCategory = cat;
    }
  }

  const deadlines = collectDeadlines(analysis, doc.file_name);
  await supabase.from("alerts").delete().eq("document_id", doc.id);
  if (deadlines.length > 0) {
    await supabase.from("alerts").insert(
      deadlines.map((d) => ({
        document_id: doc.id,
        user_id: user.id,
        profile_id: profileId,
        title: d.title,
        due_date: d.due_date,
        source: "document",
      }))
    );
  }

  await supabase
    .from("documents")
    .update({
      analysis_status: finalStatus,
      processing_step: "indexing",
    })
    .eq("id", doc.id);

  diagnostics = mergeDiagnostics(diagnostics, {
    total_to_searchable_ms: Date.now() - pipelineStart,
  });
  logProcessingDiagnostics(doc.id, "analyze_complete", diagnostics);

  return {
    summary: analysis.summary,
    facts,
    model,
    title: analysis.title,
    documentType: analysis.document_type,
    classificationConfidence: classification.classification_confidence,
    classificationReason: classification.classification_reason,
    routedTo,
    guardianStatus: analysis.guardian_status,
    overallConfidence: analysis.overall_confidence,
    warnings: analysis.warnings,
    analysisStatus: finalStatus,
    suggestedCategory,
    sourceText,
    analysis,
    classification,
    diagnostics,
  };
}

export async function runOrganizationAfterAnalysisSafe(
  supabase: SupabaseClient,
  args: Parameters<
    typeof import("@/lib/organization/run")["runOrganizationAfterAnalysis"]
  >[1]
): Promise<{
  organizationSuggestion: unknown;
  organizationAutoApplied: boolean;
}> {
  try {
    const { runOrganizationAfterAnalysis } = await import(
      "@/lib/organization/run"
    );
    const orgResult = await runOrganizationAfterAnalysis(supabase, args);
    return {
      organizationSuggestion: orgResult.suggestion,
      organizationAutoApplied: orgResult.autoApplied,
    };
  } catch (orgErr) {
    console.error(
      "Organization suggestion failed:",
      orgErr instanceof Error ? orgErr.message : "error"
    );
    return { organizationSuggestion: null, organizationAutoApplied: false };
  }
}

export async function triggerLegacyKnowledgeEngines(
  supabase: SupabaseClient,
  args: {
    userId: string;
    documentId: string;
    profileId: string;
    fileName: string;
    sourceText: string;
    analysis: ExecuteAnalysisResult["analysis"];
  }
): Promise<void> {
  void Promise.all([
    import("@/lib/knowledge/trigger-knowledge-engine"),
    import("@/lib/knowledge/document-analysis-context"),
    import("@/lib/profiles/server"),
  ]).then(
    ([
      { triggerKnowledgeEngine },
      { buildDocumentAnalysisContext },
      { listGuardianProfiles },
    ]) =>
      listGuardianProfiles(supabase, args.userId).then((profiles) =>
        triggerKnowledgeEngine(
          {
            sourceType: "document",
            sourceId: args.documentId,
            profileId: args.profileId,
            vaultId: args.profileId,
            content:
              args.sourceText?.trim() || args.analysis.summary?.trim() || "",
            metadata: {
              fileName: args.fileName,
              documentType: args.analysis.document_type,
              title: args.analysis.title,
            },
            analysisContext: buildDocumentAnalysisContext(args.analysis),
          },
          {
            userId: args.userId,
            supabase,
            profileNames: profiles.map((p) => p.display_name),
          }
        )
      )
  );
}
