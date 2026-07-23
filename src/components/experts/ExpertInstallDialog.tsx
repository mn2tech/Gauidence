"use client";

import { useState } from "react";
import type { ExpertCatalogItem } from "@/lib/experts/expert-schema";
import type { GuardianProfile } from "@/lib/profiles/types";

type Props = {
  expert: ExpertCatalogItem | null;
  profiles: GuardianProfile[];
  open: boolean;
  onClose: () => void;
  onConfirm: (profileId: string) => Promise<void>;
};

export default function ExpertInstallDialog({
  expert,
  profiles,
  open,
  onClose,
  onConfirm,
}: Props) {
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? "");
  const [loading, setLoading] = useState(false);

  if (!open || !expert) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-expert-title"
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
      >
        <h2 id="install-expert-title" className="text-lg font-semibold">
          Install {expert.name}
        </h2>
        <p className="mt-2 text-sm text-ink-muted">{expert.description}</p>

        <label className="mt-5 block text-sm font-medium">
          Choose profile
          <select
            value={profileId}
            onChange={(e) => setProfileId(e.target.value)}
            className="mt-2 w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm"
          >
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.display_name}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!profileId || loading}
            onClick={async () => {
              setLoading(true);
              try {
                await onConfirm(profileId);
              } finally {
                setLoading(false);
              }
            }}
            className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {loading ? "Installing…" : "Confirm installation"}
          </button>
        </div>
      </div>
    </div>
  );
}
