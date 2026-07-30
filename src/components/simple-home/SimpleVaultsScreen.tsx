"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import ProfileAvatar from "@/components/ProfileAvatar";
import ProfileSetupHub from "@/components/ProfileSetupHub";
import LinkedClientsPanel from "@/components/LinkedClientsPanel";
import { useActiveProfile } from "@/components/ProfileProvider";
import {
  canHaveLinkedClients,
  canManageProfileAccess,
  nestedUnder,
  profileTypeLabel,
  topLevelProfiles,
} from "@/lib/profiles/types";
import { documentsHref } from "@/lib/routes";

export default function SimpleVaultsScreen() {
  const router = useRouter();
  const { profiles, loading, switchProfile } = useActiveProfile();

  if (loading) {
    return <p className="p-6 text-sm text-ink-muted">Loading vaults…</p>;
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
    <div className="simple-home-page mx-auto max-w-2xl px-4 py-6 pb-28 sm:py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Vaults
        </h1>
        <p className="mt-1.5 text-sm text-ink-muted">
          Your profiles and vaults in Guardian.
        </p>
      </header>

      <ul className="space-y-3">
        {topLevel.map((vault) => {
          const children = nestedUnder(profiles, vault);
          const showClientPanel =
            canHaveLinkedClients(vault.profile_type) &&
            canManageProfileAccess(vault);
          const nestedChildren = showClientPanel
            ? children.filter((child) => child.profile_type !== "client")
            : children;

          return (
            <li key={vault.id} className="simple-home-card overflow-hidden">
              <button
                type="button"
                onClick={() => {
                  void switchProfile(vault.id);
                  router.push(documentsHref(vault.id));
                }}
                className="flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-brand-light/30"
              >
                <ProfileAvatar profile={vault} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-foreground">
                    {vault.display_name}
                  </span>
                  <span className="block truncate text-sm text-ink-muted">
                    {profileTypeLabel(vault.profile_type)}
                  </span>
                </span>
              </button>

              {showClientPanel ? (
                <div className="border-t border-border-subtle px-3 pb-3 pt-1">
                  <LinkedClientsPanel parent={vault} embedded />
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
                            router.push(documentsHref(child.id));
                          }}
                          className="flex min-w-0 flex-1 items-center gap-3 px-2 py-2 text-left text-sm"
                        >
                          <ProfileAvatar profile={child} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">
                              {child.display_name}
                            </span>
                            <span className="block truncate text-xs text-ink-muted">
                              {profileTypeLabel(child.profile_type)}
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

      <Link
        href="/settings/profiles"
        className="mt-5 inline-block text-sm font-semibold text-brand-dark hover:underline"
      >
        Manage vaults
      </Link>
    </div>
  );
}
