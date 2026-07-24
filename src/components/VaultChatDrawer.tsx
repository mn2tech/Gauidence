"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ExternalLink, X } from "lucide-react";
import GideonAvatar from "@/components/GideonAvatar";
import VaultChatPanel from "@/components/VaultChatPanel";

type Props = {
  profileId: string;
  profileName: string;
  onClose: () => void;
};

export default function VaultChatDrawer({
  profileId,
  profileName,
  onClose,
}: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const possessive = profileName.toLowerCase().endsWith("s")
    ? `${profileName}'`
    : `${profileName}'s`;

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-stone-900/40"
        aria-label="Close side panel"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`${profileName} vault chat`}
        className="relative z-10 flex h-full w-full max-w-lg flex-col border-l border-stone-200 bg-white shadow-2xl"
      >
        <header className="flex shrink-0 items-center gap-2.5 border-b border-stone-200 px-3 py-2.5 sm:px-4">
          <GideonAvatar size={32} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {possessive} vault
            </p>
            <p className="text-[11px] text-ink-muted">
              Ask Gideon here without leaving your current vault.
            </p>
          </div>
          <Link
            href={`/ask?profileId=${encodeURIComponent(profileId)}`}
            className="hidden shrink-0 items-center gap-1 rounded-full border border-stone-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-brand transition hover:bg-stone-50 sm:inline-flex"
          >
            Full page
            <ExternalLink className="h-3 w-3" />
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-full p-2 text-ink-muted transition hover:bg-stone-100 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1">
          <VaultChatPanel variant="drawer" scopedProfileId={profileId} />
        </div>
      </aside>
    </div>
  );
}
