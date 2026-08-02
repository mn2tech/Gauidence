import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { GuardianProfile } from "@/lib/profiles/types";
import { listGuardianProfiles } from "@/lib/profiles/server";
import { buildVaultChatRetrievalScopes } from "@/lib/vault/detectVaultScope";
import {
  buildVaultScopeNote,
  gideonChatContextLabel,
} from "@/lib/vault/gideon";
import { suggestionKindFrom } from "./suggestionKind";
import type { RetrievalScope, WorkspaceContextMeta } from "./types";

export type ResolveWorkspaceScopesArgs = {
  accessibleProfiles: GuardianProfile[];
  activeProfile: GuardianProfile;
  chatHomeProfileId: string;
  chatScopedProfileId?: string | null;
};

/** Build retrieval scopes and workspace metadata for Gideon. */
export function resolveWorkspaceScopes(
  args: ResolveWorkspaceScopesArgs
): WorkspaceContextMeta {
  const { accessibleProfiles, activeProfile, chatHomeProfileId } = args;
  const chatScopedProfileId =
    typeof args.chatScopedProfileId === "string"
      ? args.chatScopedProfileId
      : null;

  const retrievalScopes: RetrievalScope[] = buildVaultChatRetrievalScopes({
    accessibleProfiles: accessibleProfiles.map((p) => ({
      id: p.id,
      display_name: p.display_name,
      profile_type: p.profile_type,
    })),
    chatHomeProfileId,
    scopedProfileId: chatScopedProfileId,
  });

  const profileNames = Object.fromEntries(
    retrievalScopes.map((s) => [s.id, s.display_name])
  );
  const searchProfileIds = retrievalScopes.map((s) => s.id);
  const scopedProfile =
    chatScopedProfileId != null
      ? accessibleProfiles.find((p) => p.id === chatScopedProfileId) ?? null
      : null;
  const profileKind = suggestionKindFrom(activeProfile.profile_type);

  return {
    activeProfile: {
      id: activeProfile.id,
      display_name: activeProfile.display_name,
      profile_type: activeProfile.profile_type,
      parent_profile_id: activeProfile.parent_profile_id,
    },
    retrievalScopes,
    accessibleProfiles,
    profileNames,
    searchProfileIds,
    chatHomeProfileId,
    chatScopedProfileId,
    scopedProfile,
    profileKind,
    chatContextLabel: gideonChatContextLabel(
      profileKind,
      activeProfile.display_name
    ),
    vaultScopeNote: buildVaultScopeNote({
      displayName: activeProfile.display_name,
      profileKind,
      allVaultNames: accessibleProfiles.map((p) => p.display_name),
      searchVaultNames: retrievalScopes.map((p) => p.display_name),
      chatScopedProfileName: scopedProfile?.display_name,
    }),
  };
}

/** Scope metadata for the Ask Gideon page (GET / vault-chat). */
export async function askGideonScopeMeta(
  supabase: SupabaseClient,
  userId: string,
  active: Pick<GuardianProfile, "id" | "display_name" | "profile_type">,
  options?: {
    chatHomeProfileId?: string;
    chatScopedProfileId?: string | null;
    accessibleProfiles?: GuardianProfile[];
  }
) {
  const accessibleProfiles =
    options?.accessibleProfiles ??
    (await listGuardianProfiles(supabase, userId));

  const meta = resolveWorkspaceScopes({
    accessibleProfiles,
    activeProfile: active as GuardianProfile,
    chatHomeProfileId: options?.chatHomeProfileId ?? active.id,
    chatScopedProfileId: options?.chatScopedProfileId,
  });

  return {
    profileKind: meta.profileKind,
    chatContextLabel: meta.chatContextLabel,
    vaultScopeNote: meta.vaultScopeNote,
  };
}
