"use client";

import { useEffect, useState } from "react";
import {
  Check,
  FolderInput,
  Loader2,
  MapPin,
  Pencil,
  Sparkles,
  Undo2,
  X,
} from "lucide-react";
import { useActiveProfile } from "@/components/ProfileProvider";
import { topLevelProfiles } from "@/lib/profiles/types";
import type { OrganizationSuggestionPayload } from "@/lib/organization/types";

type Props = {
  suggestion: OrganizationSuggestionPayload;
  onResolved: (result: {
    action: string;
    movedToProfileId?: string | null;
    undoAvailable?: boolean;
  }) => void;
  onChooseLocation: () => void;
  onDismiss: () => void;
};

export default function OrganizationSuggestionModal({
  suggestion,
  onResolved,
  onChooseLocation,
  onDismiss,
}: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editNames, setEditNames] = useState(false);
  const [profileName, setProfileName] = useState(suggestion.profileName ?? "");
  const [vaultName, setVaultName] = useState(suggestion.vaultName ?? "");
  const [showUndo, setShowUndo] = useState(suggestion.autoApplied);
  const [choosingLocation, setChoosingLocation] = useState(false);
  const { profiles } = useActiveProfile();

  useEffect(() => {
    setProfileName(suggestion.profileName ?? "");
    setVaultName(suggestion.vaultName ?? "");
    setShowUndo(suggestion.autoApplied);
  }, [suggestion]);

  async function resolve(
    action: string,
    extra?: Record<string, string>
  ) {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(
        `/api/organization/suggestions/${suggestion.id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...extra }),
        }
      );
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        movedToProfileId?: string | null;
        undoAvailable?: boolean;
      };
      if (!res.ok) {
        setError(body.error ?? "Something went wrong.");
        return;
      }
      if (body.undoAvailable) setShowUndo(true);
      onResolved({
        action,
        movedToProfileId: body.movedToProfileId,
        undoAvailable: body.undoAvailable,
      });
    } catch {
      setError("Couldn't reach Guardian. Check your connection.");
    } finally {
      setBusy(null);
    }
  }

  const needsCreate =
    suggestion.recommendedAction === "create_profile_and_vault" ||
    suggestion.recommendedAction === "create_vault";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-labelledby="org-suggestion-title"
    >
      <div className="w-full max-w-lg rounded-2xl border border-stone-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-stone-100 px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
              <Sparkles className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-brand">
                Suggested by Guardian — nothing changes until you approve.
              </p>
              <h2
                id="org-suggestion-title"
                className="mt-1 text-base font-semibold text-ink"
              >
                {suggestion.headline}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-lg p-1 text-ink-muted hover:bg-stone-100"
            aria-label="Dismiss"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {suggestion.duplicateWarning ? (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {suggestion.duplicateWarning}
            </p>
          ) : null}

          {needsCreate && !editNames ? (
            <div className="rounded-xl bg-stone-50 px-4 py-3 text-sm">
              <p className="font-medium text-ink">Guardian recommends creating:</p>
              {suggestion.profileName ? (
                <p className="mt-1 text-ink-muted">
                  Profile: <span className="font-semibold text-ink">{suggestion.profileName}</span>
                </p>
              ) : null}
              {suggestion.vaultName ? (
                <p className="text-ink-muted">
                  Vault: <span className="font-semibold text-ink">{suggestion.vaultName}</span>
                </p>
              ) : null}
            </div>
          ) : (
            <div className="rounded-xl bg-stone-50 px-4 py-3 text-sm">
              <p className="flex items-center gap-1.5 font-medium text-ink">
                <MapPin className="h-4 w-4 text-brand" aria-hidden />
                Recommended location
              </p>
              {editNames ? (
                <div className="mt-2 space-y-2">
                  <label className="block text-xs text-ink-muted">
                    Profile name
                    <input
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block text-xs text-ink-muted">
                    Vault name
                    <input
                      value={vaultName}
                      onChange={(e) => setVaultName(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                    />
                  </label>
                </div>
              ) : (
                <p className="mt-1 text-base font-semibold text-ink">
                  {suggestion.profilePath ?? suggestion.vaultName ?? "Current vault"}
                </p>
              )}
            </div>
          )}

          {suggestion.detected.length > 0 ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Detected
              </p>
              <ul className="mt-2 space-y-1 text-sm text-ink">
                {suggestion.detected.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {suggestion.tags.length > 0 ? (
            <p className="text-sm text-ink-muted">
              Tags:{" "}
              <span className="text-ink">{suggestion.tags.join(", ")}</span>
            </p>
          ) : null}

          {suggestion.reason ? (
            <p className="text-sm text-ink-muted">{suggestion.reason}</p>
          ) : null}

          {suggestion.showConfidence ? (
            <p className="text-xs text-ink-muted">
              Confidence: {Math.round(suggestion.confidence * 100)}%
            </p>
          ) : null}

          {error ? (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}

          {showUndo ? (
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void resolve("undo")}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-semibold text-ink hover:bg-stone-50 disabled:opacity-60"
            >
              {busy === "undo" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Undo2 className="h-4 w-4" />
              )}
              Undo move
            </button>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 border-t border-stone-100 px-5 py-4 sm:flex-row sm:flex-wrap">
          {editNames ? (
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() =>
                void resolve("create_suggested", {
                  profileName,
                  vaultName,
                })
              }
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
            >
              {busy === "create_suggested" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Create and save
            </button>
          ) : needsCreate ? (
            <>
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() =>
                  void resolve("create_suggested", {
                    profileName: profileName || suggestion.profileName || "",
                    vaultName: vaultName || suggestion.vaultName || "",
                  })
                }
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
              >
                {busy === "create_suggested" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Create and save
              </button>
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => setEditNames(true)}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-semibold text-ink hover:bg-stone-50"
              >
                <Pencil className="h-4 w-4" />
                Edit names
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void resolve("accept")}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
            >
              {busy === "accept" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Save here
            </button>
          )}

          {!needsCreate && suggestion.recommendedAction === "create_vault" ? (
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void resolve("create_suggested")}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-semibold text-ink hover:bg-stone-50"
            >
              Create suggested vault
            </button>
          ) : null}

          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => setChoosingLocation((v) => !v)}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-semibold text-ink hover:bg-stone-50"
          >
            <FolderInput className="h-4 w-4" />
            Choose another location
          </button>

          {choosingLocation ? (
            <div className="w-full rounded-xl border border-stone-200 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Pick a vault
              </p>
              <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
                {topLevelProfiles(profiles).map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() =>
                        void resolve("accept", { targetProfileId: p.id })
                      }
                      className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-stone-50 disabled:opacity-60"
                    >
                      {p.display_name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void resolve("keep_current")}
            className="text-sm font-medium text-ink-muted hover:text-ink disabled:opacity-60"
          >
            Keep in current vault
          </button>

          {needsCreate ? (
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void resolve("keep_unorganized")}
              className="text-sm font-medium text-ink-muted hover:text-ink disabled:opacity-60"
            >
              Keep unorganized
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
