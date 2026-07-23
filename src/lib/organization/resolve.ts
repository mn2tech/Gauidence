import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canAttachChildToParent,
  isFamilyMemberType,
  profileTypeLabel,
} from "@/lib/profiles/types";
import {
  listGuardianProfiles,
  requireEditableGuardianProfile,
  requireOwnedGuardianProfile,
} from "@/lib/profiles/server";
import { logOrganizationEvent } from "./audit";
import { namesMatch } from "./normalize";
import { moveDocumentToProfile } from "./moveDocument";
import { toOrganizationSuggestionPayload } from "./payload";
import type {
  OrganizationSuggestionPayload,
  OrganizationSuggestionRow,
  ResolveOrganizationAction,
} from "./types";
import { getUnorganizedProfileId } from "./unorganized";
import { validateOrganizationAiOutput } from "./buildFromAnalysis";

function rowFromDb(data: Record<string, unknown>): OrganizationSuggestionRow {
  return data as unknown as OrganizationSuggestionRow;
}

type ResolveParams = {
  userId: string;
  suggestionId: string;
  action: ResolveOrganizationAction;
  targetProfileId?: string;
  profileName?: string;
  vaultName?: string;
  autoApplied?: boolean;
};

type ResolveResult = {
  ok: boolean;
  error?: string;
  suggestion?: OrganizationSuggestionPayload;
  movedToProfileId?: string;
  undoAvailable?: boolean;
};

function aiFromRow(row: OrganizationSuggestionRow) {
  const entities = row.detected_entities ?? {};
  return validateOrganizationAiOutput({
    title: typeof entities.title === "string" ? entities.title : "",
    document_type: row.document_type ?? "general",
    summary: typeof entities.summary === "string" ? entities.summary : "",
    people: entities.people,
    organizations: entities.organizations,
    topics: entities.topics,
    dates: entities.dates,
    tags: row.suggested_tags,
    suggested_profile_name: row.suggested_profile_name ?? "",
    suggested_vault_name: row.suggested_vault_name ?? "",
    confidence: row.confidence,
    reason: row.reason ?? "",
    suggested_questions: [],
  });
}

async function upsertPreference(
  supabase: SupabaseClient,
  userId: string,
  documentType: string | null,
  profileId: string | null,
  vaultId: string | null,
  accepted: boolean
) {
  if (!documentType) return;
  const { data: existing } = await supabase
    .from("organization_preferences")
    .select(
      "id, profile_id, vault_id, accepted_count, rejected_count, last_selected_at"
    )
    .eq("user_id", userId)
    .eq("document_type", documentType)
    .maybeSingle();

  if (existing?.id) {
    await supabase
      .from("organization_preferences")
      .update({
        profile_id: accepted ? profileId : existing.profile_id,
        vault_id: accepted ? vaultId : existing.vault_id,
        accepted_count: accepted
          ? (existing.accepted_count ?? 0) + 1
          : existing.accepted_count,
        rejected_count: accepted
          ? existing.rejected_count
          : (existing.rejected_count ?? 0) + 1,
        last_selected_at: accepted ? new Date().toISOString() : existing.last_selected_at,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    return;
  }

  await supabase.from("organization_preferences").insert({
    user_id: userId,
    document_type: documentType,
    profile_id: accepted ? profileId : null,
    vault_id: accepted ? vaultId : null,
    accepted_count: accepted ? 1 : 0,
    rejected_count: accepted ? 0 : 1,
    last_selected_at: accepted ? new Date().toISOString() : null,
  });
}

async function createTopicVault(
  supabase: SupabaseClient,
  userId: string,
  containerId: string,
  vaultName: string
): Promise<{ id: string; display_name: string } | null> {
  const container = await requireOwnedGuardianProfile(
    supabase,
    userId,
    containerId
  );
  if (!container) return null;

  const childType = "other";
  if (!canAttachChildToParent(childType, container.profile_type)) {
    return null;
  }

  const profiles = await listGuardianProfiles(supabase, userId);
  const existing = profiles.find(
    (p) =>
      p.parent_profile_id === containerId &&
      namesMatch(p.display_name, vaultName)
  );
  if (existing) {
    return { id: existing.id, display_name: existing.display_name };
  }

  const { data, error } = await supabase
    .from("guardian_profiles")
    .insert({
      owner_user_id: userId,
      profile_type: childType,
      display_name: vaultName,
      relationship: vaultName,
      parent_profile_id: containerId,
      is_default: false,
    })
    .select("id, display_name")
    .single();

  if (error || !data) {
    console.error("createTopicVault failed:", error?.message);
    return null;
  }
  return { id: String(data.id), display_name: String(data.display_name) };
}

async function createPersonProfile(
  supabase: SupabaseClient,
  userId: string,
  profileName: string,
  containerId: string | null
): Promise<{ id: string; display_name: string; containerId: string | null } | null> {
  const profiles = await listGuardianProfiles(supabase, userId);
  const existing = profiles.find((p) => namesMatch(p.display_name, profileName));
  if (existing) {
    return {
      id: existing.id,
      display_name: existing.display_name,
      containerId: existing.parent_profile_id,
    };
  }

  let parentId: string | null = containerId;
  let profileType = "other";

  if (parentId) {
    const parent = await requireOwnedGuardianProfile(supabase, userId, parentId);
    if (parent?.profile_type === "family") {
      profileType = "child";
    } else if (parent && canAttachChildToParent("other", parent.profile_type)) {
      profileType = "other";
    } else {
      parentId = null;
    }
  }

  if (!parentId) {
    const family = profiles.find((p) => p.profile_type === "family");
    if (family) {
      parentId = family.id;
      profileType = "child";
    } else {
      profileType = "personal";
    }
  }

  const parent = parentId
    ? await requireOwnedGuardianProfile(supabase, userId, parentId)
    : null;
  if (parent && isFamilyMemberType(profileType as "child")) {
    if (!canAttachChildToParent(profileType as "child", parent.profile_type)) {
      profileType = "personal";
      parentId = null;
    }
  }

  const { data, error } = await supabase
    .from("guardian_profiles")
    .insert({
      owner_user_id: userId,
      profile_type: profileType,
      display_name: profileName,
      relationship: isFamilyMemberType(profileType as "child")
        ? profileTypeLabel(profileType as "child")
        : profileName,
      parent_profile_id: parentId,
      is_default: false,
    })
    .select("id, display_name")
    .single();

  if (error || !data) {
    console.error("createPersonProfile failed:", error?.message);
    return null;
  }

  return {
    id: String(data.id),
    display_name: String(data.display_name),
    containerId: parentId,
  };
}

export async function resolveOrganizationSuggestion(
  supabase: SupabaseClient,
  params: ResolveParams
): Promise<ResolveResult> {
  const { data: rowData } = await supabase
    .from("organization_suggestions")
    .select("*")
    .eq("id", params.suggestionId)
    .eq("user_id", params.userId)
    .maybeSingle();

  if (!rowData) {
    return { ok: false, error: "Suggestion not found." };
  }

  const row = rowFromDb(rowData as Record<string, unknown>);
  const ai = aiFromRow(row);

  if (params.action === "undo") {
    if (!row.previous_profile_id) {
      return { ok: false, error: "Nothing to undo for this document." };
    }
    const target = await requireEditableGuardianProfile(
      supabase,
      params.userId,
      row.previous_profile_id
    );
    if (!target) {
      return { ok: false, error: "Previous vault is no longer accessible." };
    }
    const moved = await moveDocumentToProfile(
      supabase,
      params.userId,
      row.document_id,
      target
    );
    if (!moved.ok) {
      return { ok: false, error: moved.error };
    }
    await supabase
      .from("organization_suggestions")
      .update({
        status: "modified",
        accepted_action: "undo",
        resolved_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    await logOrganizationEvent(supabase, {
      userId: params.userId,
      documentId: row.document_id,
      suggestionId: row.id,
      eventType: "undo",
      payload: {
        restored_profile_id: row.previous_profile_id,
      },
    });
    return {
      ok: true,
      movedToProfileId: row.previous_profile_id,
      undoAvailable: false,
    };
  }

  if (row.status !== "pending" && params.action !== "reject") {
    return { ok: false, error: "This suggestion was already resolved." };
  }

  const { data: doc } = await supabase
    .from("documents")
    .select("profile_id")
    .eq("id", row.document_id)
    .eq("user_id", params.userId)
    .maybeSingle();

  const previousProfileId = (doc?.profile_id as string | null) ?? row.current_profile_id;

  if (params.action === "reject") {
    await supabase
      .from("organization_suggestions")
      .update({
        status: "rejected",
        accepted_action: "rejected",
        resolved_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    await upsertPreference(
      supabase,
      params.userId,
      row.document_type,
      null,
      null,
      false
    );
    await logOrganizationEvent(supabase, {
      userId: params.userId,
      documentId: row.document_id,
      suggestionId: row.id,
      eventType: "rejected",
      payload: {},
    });
    return {
      ok: true,
      suggestion: toOrganizationSuggestionPayload(row, ai),
    };
  }

  if (params.action === "keep_current") {
    await supabase
      .from("organization_suggestions")
      .update({
        status: "accepted",
        accepted_action: "keep_current",
        previous_profile_id: previousProfileId,
        previous_vault_id: previousProfileId,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    await upsertPreference(
      supabase,
      params.userId,
      row.document_type,
      previousProfileId,
      previousProfileId,
      true
    );
    await logOrganizationEvent(supabase, {
      userId: params.userId,
      documentId: row.document_id,
      suggestionId: row.id,
      eventType: "kept_current",
      payload: { profile_id: previousProfileId },
    });
    return {
      ok: true,
      suggestion: toOrganizationSuggestionPayload(row, ai),
      undoAvailable: false,
    };
  }

  if (params.action === "keep_unorganized") {
    const unorganizedId = await getUnorganizedProfileId(supabase, params.userId);
    if (!unorganizedId) {
      return { ok: false, error: "Couldn't open the Unorganized area." };
    }
    const target = await requireEditableGuardianProfile(
      supabase,
      params.userId,
      unorganizedId
    );
    if (!target) {
      return { ok: false, error: "Unorganized vault isn't accessible." };
    }
    const moved = await moveDocumentToProfile(
      supabase,
      params.userId,
      row.document_id,
      target
    );
    if (!moved.ok) return { ok: false, error: moved.error };
    await supabase
      .from("organization_suggestions")
      .update({
        status: "accepted",
        accepted_action: "keep_unorganized",
        previous_profile_id: previousProfileId,
        previous_vault_id: previousProfileId,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    await logOrganizationEvent(supabase, {
      userId: params.userId,
      documentId: row.document_id,
      suggestionId: row.id,
      eventType: "kept_unorganized",
      payload: { target_profile_id: unorganizedId },
    });
    return {
      ok: true,
      movedToProfileId: unorganizedId,
      suggestion: toOrganizationSuggestionPayload(row, ai),
      undoAvailable: true,
    };
  }

  let targetProfileId = params.targetProfileId?.trim() || null;
  let createdProfileId: string | null = null;
  let createdVaultId: string | null = null;

  if (
    params.action === "accept" ||
    params.action === "create_suggested"
  ) {
    const profileName =
      params.profileName?.trim() ||
      row.suggested_profile_name?.trim() ||
      "";
    const vaultName =
      params.vaultName?.trim() || row.suggested_vault_name?.trim() || "";

    if (targetProfileId) {
      const target = await requireEditableGuardianProfile(
        supabase,
        params.userId,
        targetProfileId
      );
      if (!target) {
        return { ok: false, error: "That vault isn't accessible." };
      }
    } else if (row.recommended_action === "save_to_existing" && row.suggested_vault_id) {
      targetProfileId = row.suggested_vault_id;
    } else if (
      row.recommended_action === "create_vault" ||
      params.action === "create_suggested"
    ) {
      const profiles = await listGuardianProfiles(supabase, params.userId);
      let personId = row.suggested_profile_id;
      if (!personId && profileName) {
        const family = profiles.find((p) => p.profile_type === "family");
        const created = await createPersonProfile(
          supabase,
          params.userId,
          profileName,
          family?.id ?? null
        );
        if (created) {
          personId = created.id;
          createdProfileId = created.id;
        }
      }
      const refreshed = await listGuardianProfiles(supabase, params.userId);
      const person = personId
        ? refreshed.find((p) => p.id === personId) ?? null
        : null;
      const containerId =
        person?.parent_profile_id ??
        person?.id ??
        refreshed.find((p) => p.profile_type === "family")?.id ??
        refreshed.find((p) => p.profile_type === "personal")?.id ??
        null;
      if (!containerId || !vaultName) {
        return { ok: false, error: "Couldn't determine where to create the vault." };
      }
      const vault = await createTopicVault(
        supabase,
        params.userId,
        containerId,
        vaultName
      );
      if (!vault) {
        return { ok: false, error: "Couldn't create the suggested vault." };
      }
      targetProfileId = vault.id;
      createdVaultId = vault.id;
    } else if (row.recommended_action === "create_profile_and_vault") {
      const created = await createPersonProfile(
        supabase,
        params.userId,
        profileName,
        null
      );
      if (!created) {
        return { ok: false, error: "Couldn't create the suggested profile." };
      }
      createdProfileId = created.id;
      const vault = vaultName
        ? await createTopicVault(
            supabase,
            params.userId,
            created.containerId ?? created.id,
            vaultName
          )
        : null;
      targetProfileId = vault?.id ?? created.id;
      if (vault) createdVaultId = vault.id;
    } else if (row.suggested_vault_id) {
      targetProfileId = row.suggested_vault_id;
    } else {
      return { ok: false, error: "No target vault selected." };
    }
  }

  if (!targetProfileId) {
    return { ok: false, error: "Choose where to save this document." };
  }

  const target = await requireEditableGuardianProfile(
    supabase,
    params.userId,
    targetProfileId
  );
  if (!target) {
    return { ok: false, error: "That vault isn't accessible." };
  }

  const moved = await moveDocumentToProfile(
    supabase,
    params.userId,
    row.document_id,
    target
  );
  if (!moved.ok) {
    return { ok: false, error: moved.error };
  }

  try {
    const { indexDocumentForVault } = await import("@/lib/vault/indexDocument");
    const { data: extracted } = await supabase
      .from("extracted_data")
      .select("title, summary, document_type, facts, warnings, specialist")
      .eq("document_id", row.document_id)
      .maybeSingle();
    const { data: docRow } = await supabase
      .from("documents")
      .select("file_name")
      .eq("id", row.document_id)
      .maybeSingle();
    if (extracted) {
      await indexDocumentForVault({
        supabase,
        userId: params.userId,
        profileId: target.id,
        documentId: row.document_id,
        fileName: docRow?.file_name ?? "document",
        source: {
          title: extracted.title,
          summary: extracted.summary,
          documentType: extracted.document_type,
          facts: extracted.facts,
          warnings: extracted.warnings,
          specialist: extracted.specialist,
        },
      });
    }
  } catch (indexErr) {
    console.error(
      "Vault re-index after organization failed:",
      indexErr instanceof Error ? indexErr.message : "error"
    );
  }

  await supabase
    .from("organization_suggestions")
    .update({
      status: "accepted",
      accepted_action: params.action,
      previous_profile_id: previousProfileId,
      previous_vault_id: previousProfileId,
      created_profile_id: createdProfileId,
      created_vault_id: createdVaultId,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", row.id);

  await upsertPreference(
    supabase,
    params.userId,
    row.document_type,
    row.suggested_profile_id,
    targetProfileId,
    true
  );

  await logOrganizationEvent(supabase, {
    userId: params.userId,
    documentId: row.document_id,
    suggestionId: row.id,
    eventType: params.autoApplied ? "auto_applied" : "accepted",
    payload: {
      original_profile_id: previousProfileId,
      suggested_profile_id: row.suggested_profile_id,
      suggested_vault_id: row.suggested_vault_id,
      chosen_profile_id: targetProfileId,
      created_profile_id: createdProfileId,
      created_vault_id: createdVaultId,
    },
  });

  const updatedRow = {
    ...row,
    status: "accepted" as const,
    previous_profile_id: previousProfileId,
  };

  return {
    ok: true,
    movedToProfileId: targetProfileId,
    suggestion: toOrganizationSuggestionPayload(updatedRow, ai, {
      autoApplied: params.autoApplied,
    }),
    undoAvailable: Boolean(previousProfileId && previousProfileId !== targetProfileId),
  };
}
