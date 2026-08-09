"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, FolderPlus, Users } from "lucide-react";
import ProfileAvatar from "@/components/ProfileAvatar";
import ProfileSetupHub from "@/components/ProfileSetupHub";
import { useActiveProfile } from "@/components/ProfileProvider";
import {
  canHaveLinkedClients,
  canManageProfileAccess,
  clientsOf,
  getContainerLabel,
  nestedUnder,
  profileContainerName,
  SPACES_AND_WORKSPACES_LABEL,
  topLevelProfiles,
} from "@/lib/profiles/types";
import { DOCUMENTS_PATH } from "@/lib/routes";

function clientsSectionHref(profileId: string) {
  return `${DOCUMENTS_PATH}&profileId=${profileId}#clients-${profileId}`;
}

export default function SimpleVaultsScreen() {
  const router = useRouter();
  const { profiles, loading, switchProfile } = useActiveProfile();

  if (loading) {
    return <p className="p-6 text-sm text-ink-muted">Loading spaces…</p>;
  }

  if (profiles.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <ProfileSetupHub returnTo="/vaults" />
      </div>
    );
  }

  const topLevel = topLevelProfiles(profiles);

  return (
    <div className="simple-home-page mx-auto max-w-2xl px-4 py-6 sm:py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {SPACES_AND_WORKSPACES_LABEL}
        </h1>
        <p className="mt-1.5 text-sm text-ink-muted">
          How Guardian has organized your knowledge.
        </p>
        <Link
          href="/settings/profiles?add=1&return=%2Fvaults"
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark"
        >
          <FolderPlus className="h-4 w-4" aria-hidden />
          New space
        </Link>
      </header>

      <ul className="space-y-3">
        {topLevel.map((space) => {
          const children = nestedUnder(profiles, space);
          const showClientsLink =
            canHaveLinkedClients(space.profile_type) &&
            canManageProfileAccess(space);
          const clientCount = showClientsLink
            ? clientsOf(profiles, space.id).length
            : 0;
          const nestedChildren = showClientsLink
            ? children.filter((child) => child.profile_type !== "client")
            : children;

          return (
            <li key={space.id} className="simple-home-card overflow-hidden">
              <button
                type="button"
                onClick={() => {
                  void switchProfile(space.id);
                  router.push(`${DOCUMENTS_PATH}#documents-${space.id}`);
                }}
                className="flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-brand-light/30"
              >
                <ProfileAvatar profile={space} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-foreground">
                    {profileContainerName(space)}
                  </span>
                  <span className="block truncate text-sm text-ink-muted">
                    {getContainerLabel(space.profile_type)}
                  </span>
                </span>
              </button>

              {showClientsLink ? (
                <div className="border-t border-border-subtle px-4 py-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      void switchProfile(space.id);
                      router.push(clientsSectionHref(space.id));
                    }}
                    className="inline-flex w-full items-center justify-between gap-2 rounded-lg px-1 py-1 text-left text-sm font-medium text-brand-dark transition hover:bg-brand-light/35"
                  >
                    <span>
                      {clientCount === 0
                        ? "No clients yet"
                        : `${clientCount} client${clientCount === 1 ? "" : "s"}`}
                    </span>
                    <span className="inline-flex items-center gap-0.5 text-xs font-semibold">
                      View clients
                      <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                    </span>
                  </button>
                </div>
              ) : null}

              {nestedChildren.length > 0 ? (
                <ul className="border-t border-border-subtle px-2 pb-2">
                  {nestedChildren.map((child) => (
                    <li key={child.id}>
                      <div className="flex items-center gap-2 rounded-xl px-1 py-1 transition hover:bg-brand-light/35">
                        <button
                          type="button"
                          onClick={() => {
                            void switchProfile(child.id);
                            router.push(`${DOCUMENTS_PATH}#documents-${child.id}`);
                          }}
                          className="flex min-w-0 flex-1 items-center gap-3 px-2 py-2 text-left text-sm"
                        >
                          <ProfileAvatar profile={child} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">
                              {child.display_name}
                            </span>
                            <span className="block truncate text-xs text-ink-muted">
                              {getContainerLabel(child.profile_type)}
                            </span>
                          </span>
                        </button>
                        {child.profile_type === "client" &&
                        canManageProfileAccess(child) ? (
                          <Link
                            href={`/settings/profiles/${child.id}/collaborators`}
                            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-stone-300 px-2.5 py-1 text-xs font-medium hover:bg-stone-50"
                          >
                            <Users className="h-3 w-3" />
                            Share
                          </Link>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <Link
          href="/settings/profiles?add=1"
          className="text-sm font-semibold text-brand-dark hover:underline"
        >
          New space
        </Link>
        <Link
          href="/settings/profiles"
          className="text-sm font-semibold text-brand-dark hover:underline"
        >
          Manage all spaces
        </Link>
      </div>
    </div>
  );
}
