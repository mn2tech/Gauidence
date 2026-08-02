"use client";

import type {
  OrganizationSuggestionPayload,
  ResolveOrganizationAction,
} from "./types";

export type SaveDocumentResult = {
  ok: boolean;
  error?: string;
  movedToProfileId?: string | null;
  undoAvailable?: boolean;
  action?: string;
};

/** Resolve an organization suggestion or keep the document in place. */
export async function saveDocument(args: {
  suggestion: OrganizationSuggestionPayload;
  action?: ResolveOrganizationAction;
  targetProfileId?: string;
  profileName?: string;
  vaultName?: string;
}): Promise<SaveDocumentResult> {
  const action =
    args.action ??
    (args.suggestion.recommendedAction === "create_profile_and_vault" ||
    args.suggestion.recommendedAction === "create_vault"
      ? "create_suggested"
      : "accept");

  try {
    const res = await fetch(
      `/api/organization/suggestions/${args.suggestion.id}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          ...(args.targetProfileId
            ? { targetProfileId: args.targetProfileId }
            : {}),
          ...(args.profileName ? { profileName: args.profileName } : {}),
          ...(args.vaultName ? { vaultName: args.vaultName } : {}),
        }),
      }
    );
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      movedToProfileId?: string | null;
      undoAvailable?: boolean;
    };
    if (!res.ok) {
      return { ok: false, error: body.error ?? "Couldn't save the document." };
    }
    return {
      ok: true,
      movedToProfileId: body.movedToProfileId,
      undoAvailable: body.undoAvailable,
      action,
    };
  } catch {
    return {
      ok: false,
      error: "Couldn't reach Guardian. Check your connection.",
    };
  }
}
