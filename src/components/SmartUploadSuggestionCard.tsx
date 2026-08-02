"use client";

import { useState } from "react";
import { Check, FolderInput, Loader2, Sparkles } from "lucide-react";
import type { SmartUploadPresentation } from "@/lib/actions/client";
import { saveDocument } from "@/lib/organization/saveDocument";

type Props = {
  presentation: SmartUploadPresentation;
  onSaved: (result: { movedToProfileId?: string | null; profilePath?: string | null }) => void;
  onKeepHere: () => void;
  onError?: (message: string) => void;
};

function confidenceLabel(confidence: number): string {
  return `${Math.round(Math.max(0, Math.min(1, confidence)) * 100)}%`;
}

export default function SmartUploadSuggestionCard({
  presentation,
  onSaved,
  onKeepHere,
  onError,
}: Props) {
  const [busy, setBusy] = useState<"save" | "keep" | null>(null);

  async function handleSave() {
    if (!presentation.suggestion) {
      onKeepHere();
      return;
    }
    setBusy("save");
    const result = await saveDocument({ suggestion: presentation.suggestion });
    setBusy(null);
    if (!result.ok) {
      onError?.(result.error ?? "Couldn't save the document.");
      return;
    }
    onSaved({
      movedToProfileId: result.movedToProfileId,
      profilePath: presentation.profilePath,
    });
  }

  async function handleKeepHere() {
    if (!presentation.suggestion) {
      onKeepHere();
      return;
    }
    setBusy("keep");
    const result = await saveDocument({
      suggestion: presentation.suggestion,
      action: "keep_current",
    });
    setBusy(null);
    if (!result.ok) {
      onError?.(result.error ?? "Couldn't update filing.");
      return;
    }
    onKeepHere();
  }

  const saveLabel = presentation.needsCreate ? "Create & save" : "Save here";

  return (
    <div className="rounded-2xl border border-brand/25 bg-brand-light/30 px-3.5 py-3 shadow-sm">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
          <Sparkles className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-brand">
            Smart upload
          </p>
          <p className="mt-0.5 text-sm font-semibold text-foreground">
            {presentation.title}
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            {presentation.documentType}
            {presentation.showConfidence ? (
              <span className="ml-2 font-medium text-brand">
                {confidenceLabel(presentation.confidence)} match
              </span>
            ) : null}
          </p>

          {presentation.profilePath ? (
            <div className="mt-2 flex items-center gap-1.5 text-sm text-foreground">
              <FolderInput className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
              <span className="font-medium">{presentation.profilePath}</span>
            </div>
          ) : (
            <div className="mt-2 text-sm text-foreground">
              <span className="font-medium">{presentation.workspaceLabel}</span>
              {presentation.vaultLabel ? (
                <span className="text-ink-muted"> · {presentation.vaultLabel}</span>
              ) : null}
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
            >
              {busy === "save" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              {saveLabel}
            </button>
            <button
              type="button"
              onClick={() => void handleKeepHere()}
              disabled={busy !== null}
              className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-muted hover:bg-stone-50 disabled:opacity-60"
            >
              {busy === "keep" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                "Keep here"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
