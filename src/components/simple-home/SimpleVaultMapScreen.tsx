"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LayoutGrid } from "lucide-react";
import ProfileSetupHub from "@/components/ProfileSetupHub";
import ProfileVaultMap from "@/components/ProfileVaultMap";
import { useActiveProfile } from "@/components/ProfileProvider";
import { VAULTS_PATH } from "@/lib/simple-home/routing";
import { DOCUMENTS_PATH } from "@/lib/routes";

export default function SimpleVaultMapScreen() {
  const router = useRouter();
  const {
    profiles,
    active,
    accountName,
    loading,
    switchProfile,
    refresh,
  } = useActiveProfile();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openSpace = (profileId: string) => {
    void switchProfile(profileId);
    router.push(`${DOCUMENTS_PATH}#documents-${profileId}`);
  };

  const moveUnder = async (
    profileId: string,
    parentProfileId: string | null
  ) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/profiles/${profileId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentProfileId }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Couldn't move space.");
        return;
      }
      await refresh();
      window.dispatchEvent(new CustomEvent("guardian:profile-changed"));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <p className="p-6 text-sm text-ink-muted">Loading space map…</p>;
  }

  if (profiles.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <ProfileSetupHub returnTo="/vaults/map" />
      </div>
    );
  }

  return (
    <div className="simple-home-page mx-auto max-w-2xl px-4 py-6 sm:py-8">
      <header className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Space Map
            </h1>
            <p className="mt-1.5 text-sm text-ink-muted">
              How your spaces connect — tap to open, drag to reorganize on
              desktop.
            </p>
          </div>
          <Link
            href={VAULTS_PATH}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-stone-50"
          >
            <LayoutGrid className="h-4 w-4 text-brand" aria-hidden />
            List
          </Link>
        </div>
        {error ? (
          <p className="mt-3 text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
      </header>

      <ProfileVaultMap
        profiles={profiles}
        ownerLabel={accountName}
        activeId={active?.id}
        busy={busy}
        onSwitch={openSpace}
        onMoveUnder={moveUnder}
      />
    </div>
  );
}
