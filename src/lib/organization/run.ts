import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Classification, GuardianAnalysis } from "@/lib/analysis/types";
import { VAULT_ORGANIZATION_SUGGESTIONS_ENABLED } from "@/lib/features/organization";
import { listGuardianProfiles } from "@/lib/profiles/server";
import { buildOrganizationAiOutput } from "./buildFromAnalysis";
import { logOrganizationEvent } from "./audit";
import { boostActiveProfileMatch, matchOrganizationTarget } from "./match";
import { toOrganizationSuggestionPayload } from "./payload";
import type {
  AutoOrganizeMode,
  OrganizationAiOutput,
  OrganizationSuggestionPayload,
} from "./types";
import { getUnorganizedProfileId } from "./unorganized";

async function loadAutoOrganizeSettings(
  supabase: SupabaseClient,
  userId: string
): Promise<{ mode: AutoOrganizeMode; threshold: number }> {
  const { data } = await supabase
    .from("profiles")
    .select("auto_organize_mode, auto_organize_threshold")
    .eq("id", userId)
    .maybeSingle();
  const mode = data?.auto_organize_mode;
  const threshold = Number(data?.auto_organize_threshold);
  return {
    mode:
      mode === "off" || mode === "suggest" || mode === "auto" ? mode : "suggest",
    threshold: Number.isFinite(threshold) ? threshold : 0.85,
  };
}

async function findDuplicateWarning(
  supabase: SupabaseClient,
  userId: string,
  documentId: string,
  fileName: string
): Promise<string | null> {
  const { data } = await supabase
    .from("documents")
    .select("id, file_name, profile_id")
    .eq("user_id", userId)
    .ilike("file_name", fileName)
    .neq("id", documentId)
    .limit(3);
  if (!data?.length) return null;
  return `A document named "${fileName}" already exists in your vault. You can still save this copy.`;
}

export type RunOrganizationResult = {
  skipped: boolean;
  reason?: string;
  suggestion: OrganizationSuggestionPayload | null;
  autoApplied: boolean;
};

/**
 * After document analysis, create an organization suggestion when enabled.
 */
export async function runOrganizationAfterAnalysis(
  supabase: SupabaseClient,
  params: {
    userId: string;
    documentId: string;
    currentProfileId: string;
    currentProfileName: string | null;
    analysis: GuardianAnalysis;
    classification: Classification;
    autoApply?: boolean;
  }
): Promise<RunOrganizationResult> {
  if (!VAULT_ORGANIZATION_SUGGESTIONS_ENABLED) {
    return {
      skipped: true,
      reason: "disabled",
      suggestion: null,
      autoApplied: false,
    };
  }

  const settings = await loadAutoOrganizeSettings(supabase, params.userId);
  if (settings.mode === "off") {
    return { skipped: true, reason: "off", suggestion: null, autoApplied: false };
  }

  const profiles = await listGuardianProfiles(supabase, params.userId);
  const ai = buildOrganizationAiOutput(
    params.analysis,
    params.classification,
    params.currentProfileName
  );

  let match = matchOrganizationTarget(
    profiles,
    ai,
    params.currentProfileId
  );
  match = boostActiveProfileMatch(
    profiles,
    match,
    params.currentProfileId,
    ai
  );

  const { data: doc } = await supabase
    .from("documents")
    .select("file_name")
    .eq("id", params.documentId)
    .maybeSingle();
  const duplicateWarning = doc?.file_name
    ? await findDuplicateWarning(
        supabase,
        params.userId,
        params.documentId,
        doc.file_name
      )
    : null;

  await supabase
    .from("organization_suggestions")
    .update({ status: "expired", resolved_at: new Date().toISOString() })
    .eq("document_id", params.documentId)
    .eq("status", "pending");

  const detected_entities = {
    people: ai.people,
    organizations: ai.organizations,
    topics: ai.topics,
    dates: ai.dates,
    title: ai.title,
    summary: ai.summary,
  };

  const { data: inserted, error } = await supabase
    .from("organization_suggestions")
    .insert({
      user_id: params.userId,
      document_id: params.documentId,
      current_profile_id: params.currentProfileId,
      current_vault_id: params.currentProfileId,
      suggested_profile_id: match.suggestedProfileId,
      suggested_profile_name: match.suggestedProfileName || ai.suggested_profile_name,
      suggested_vault_id: match.suggestedVaultId,
      suggested_vault_name: match.suggestedVaultName || ai.suggested_vault_name,
      document_type: ai.document_type,
      reason: match.reason,
      confidence: match.confidence,
      detected_entities,
      suggested_tags: ai.tags,
      recommended_action: match.recommendedAction,
      status: "pending",
      duplicate_warning: duplicateWarning,
    })
    .select("*")
    .single();

  if (error || !inserted) {
    console.error("organization_suggestions insert failed:", error?.message);
    return { skipped: true, reason: "insert_failed", suggestion: null, autoApplied: false };
  }

  await supabase
    .from("extracted_data")
    .update({
      entities: detected_entities,
      tags: ai.tags,
      suggested_questions: ai.suggested_questions,
    })
    .eq("document_id", params.documentId);

  await logOrganizationEvent(supabase, {
    userId: params.userId,
    documentId: params.documentId,
    suggestionId: inserted.id,
    eventType: "suggestion_created",
    payload: {
      recommended_action: match.recommendedAction,
      suggested_profile_id: match.suggestedProfileId,
      suggested_vault_id: match.suggestedVaultId,
      confidence: match.confidence,
      current_profile_id: params.currentProfileId,
    },
  });

  const payload = toOrganizationSuggestionPayload(
    inserted as typeof inserted & { recommended_action: string; status: string },
    ai
  );

  const shouldAutoApply =
    settings.mode === "auto" &&
    match.recommendedAction === "save_to_existing" &&
    match.confidence >= settings.threshold &&
    Boolean(match.suggestedVaultId);

  if (shouldAutoApply || params.autoApply) {
    const { resolveOrganizationSuggestion } = await import("./resolve");
    const resolved = await resolveOrganizationSuggestion(supabase, {
      userId: params.userId,
      suggestionId: inserted.id,
      action: "accept",
      autoApplied: true,
    });
    if (resolved.ok && resolved.suggestion) {
      return {
        skipped: false,
        suggestion: resolved.suggestion,
        autoApplied: true,
      };
    }
  }

  if (match.recommendedAction === "unorganized") {
    const unorganizedId = await getUnorganizedProfileId(supabase, params.userId);
    if (unorganizedId && unorganizedId !== params.currentProfileId) {
      const { moveDocumentToProfile } = await import("./moveDocument");
      const target = profiles.find((p) => p.id === unorganizedId);
      if (target) {
        await moveDocumentToProfile(
          supabase,
          params.userId,
          params.documentId,
          target
        );
        await logOrganizationEvent(supabase, {
          userId: params.userId,
          documentId: params.documentId,
          suggestionId: inserted.id,
          eventType: "moved_unorganized",
          payload: { target_profile_id: unorganizedId },
        });
      }
    }
  }

  return { skipped: false, suggestion: payload, autoApplied: false };
}

export type { OrganizationAiOutput };
