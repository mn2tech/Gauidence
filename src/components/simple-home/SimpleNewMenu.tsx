"use client";

import Link from "next/link";
import { FileUp, NotebookPen, MessageCircle, FolderPlus, X } from "lucide-react";
import { useActiveProfile } from "@/components/ProfileProvider";
import { dailyLogHref, REQUESTS_PATH } from "@/lib/routes";
import { clientBusinessLabel } from "@/lib/client-requests/helpers";
import { canEditGuardianProfile, vaultCreateHref, VAULT_CREATE_CARDS } from "@/lib/profiles/types";

type SimpleNewMenuProps = {
  open: boolean;
  onClose: () => void;
};

export default function SimpleNewMenu({ open, onClose }: SimpleNewMenuProps) {
  const { active, profiles } = useActiveProfile();

  if (!open) return null;

  const businessLabel = clientBusinessLabel(profiles, active);
  const canEdit = active ? canEditGuardianProfile(active) : true;

  const uploadHref = active
    ? `/dashboard?camera=1#documents-${active.id}`
    : "/dashboard?camera=1";
  const noteHref = dailyLogHref(active?.id);
  const requestHref =
    active?.profile_type === "client"
      ? `${REQUESTS_PATH}?new=1`
      : `/ask?draft=${encodeURIComponent("I need to request something.")}`;
  const addVaultHref = vaultCreateHref(VAULT_CREATE_CARDS[0], "/home");

  const options = [
    ...(canEdit
      ? [
          {
            href: uploadHref,
            label: "Upload something",
            description: "Add a document or photo to your vault",
            icon: FileUp,
          },
          {
            href: noteHref,
            label: "Create a note",
            description: "Write a daily log or quick note",
            icon: NotebookPen,
          },
        ]
      : []),
    {
      href: requestHref,
      label: "Request something",
      description:
        active?.profile_type === "client"
          ? `Submit a request to ${businessLabel}`
          : "Ask Gideon to help with a request",
      icon: MessageCircle,
    },
    ...(canEdit
      ? [
          {
            href: addVaultHref,
            label: "Add a vault or profile",
            description: "Create a new vault for someone or something",
            icon: FolderPlus,
          },
        ]
      : []),
  ] as const;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close menu"
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="simple-new-menu-title"
        className="relative w-full max-w-md rounded-t-3xl border border-stone-200 bg-white p-4 shadow-xl sm:rounded-3xl sm:p-5"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="simple-new-menu-title" className="text-base font-semibold">
            New
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-ink-muted hover:bg-stone-100 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <ul className="space-y-2">
          {options.map((option) => {
            const Icon = option.icon;
            return (
              <li key={option.label}>
                <Link
                  href={option.href}
                  onClick={onClose}
                  className="flex items-start gap-3 rounded-2xl border border-stone-200 px-4 py-3 transition hover:border-stone-300 hover:bg-stone-50"
                >
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-foreground">
                      {option.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-ink-muted">
                      {option.description}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
