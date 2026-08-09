"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileUp, FolderPlus, NotebookPen, MessageCircle, X } from "lucide-react";
import { useActiveProfile } from "@/components/ProfileProvider";
import { ADD_ANYTHING_PATH, REMEMBER_TODAY_PATH } from "@/lib/simple-home/routing";
import { REQUESTS_PATH } from "@/lib/routes";
import { clientBusinessLabel } from "@/lib/client-requests/helpers";
import { canEditGuardianProfile } from "@/lib/profiles/types";

type SimpleNewMenuProps = {
  open: boolean;
  onClose: () => void;
};

export default function SimpleNewMenu({ open, onClose }: SimpleNewMenuProps) {
  const pathname = usePathname();
  const { active, profiles } = useActiveProfile();

  if (!open) return null;

  const businessLabel = clientBusinessLabel(profiles, active);
  const canEdit = active ? canEditGuardianProfile(active) : true;
  const returnTo =
    pathname?.startsWith("/") && !pathname.startsWith("//") ? pathname : "/home";
  const newSpaceHref = `/settings/profiles?add=1&return=${encodeURIComponent(returnTo)}`;

  const noteHref = REMEMBER_TODAY_PATH;
  const requestHref =
    active?.profile_type === "client"
      ? `${REQUESTS_PATH}?new=1`
      : `/ask?draft=${encodeURIComponent("I need to request something.")}`;

  const options = [
    ...(canEdit
      ? [
          {
            href: ADD_ANYTHING_PATH,
            label: "Add anything",
            description: "Upload, paste, or capture something new",
            icon: FileUp,
          },
          {
            href: noteHref,
            label: "Remember today",
            description: "Capture what happened today",
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
            href: newSpaceHref,
            label: "New space",
            description: "Family, business, personal, and more",
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
