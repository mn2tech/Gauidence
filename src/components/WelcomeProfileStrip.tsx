"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { DOCUMENTS_PATH } from "@/lib/routes";
import { useActiveProfile } from "@/components/ProfileProvider";
import {
  isGroupStyleProfile,
  isLinkedMemberProfile,
  nestedUnder,
  profileSubtitle,
  profileTypeLabel,
  topLevelProfiles,
  type GuardianProfile,
} from "@/lib/profiles/types";

function initialFor(profile: GuardianProfile): string {
  const name = profile.display_name.trim();
  if (!name) return "?";
  return name.charAt(0).toUpperCase();
}

/** Re-open the Ask Gideon nudge for the current vault without switching. */
function showVaultNudge(profileId: string) {
  window.dispatchEvent(
    new CustomEvent("guardian:profile-changed", {
      detail: { profileId, nudgeAt: Date.now() },
    })
  );
}

function ProfileChip({
  profile,
  selected,
  expanded,
  indented,
  onSelect,
}: {
  profile: GuardianProfile;
  selected: boolean;
  /** Parent container is open because a nested vault is active. */
  expanded?: boolean;
  indented?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={`flex w-full items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-left transition ${
        indented ? "sm:min-w-[7.5rem] sm:max-w-[10rem]" : "sm:min-w-[8.5rem] sm:max-w-[11rem]"
      } ${
        selected
          ? "border-brand bg-brand-light ring-1 ring-brand/30"
          : expanded
            ? "border-stone-300 bg-stone-50 hover:border-stone-400 hover:bg-stone-100"
            : "border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50"
      }`}
    >
      {profile.avatar_url ? (
        <Image
          src={profile.avatar_url}
          alt=""
          width={36}
          height={36}
          className={`shrink-0 rounded-full border border-stone-200 object-cover ${
            indented ? "h-8 w-8" : "h-9 w-9"
          }`}
          unoptimized
        />
      ) : (
        <span
          className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${
            indented ? "h-8 w-8 text-xs" : "h-9 w-9 text-sm"
          } ${
            selected ? "bg-brand text-white" : "bg-stone-100 text-ink-muted"
          }`}
          aria-hidden
        >
          {initialFor(profile)}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold leading-tight">
          {profile.display_name}
        </span>
        <span className="block truncate text-[11px] text-ink-muted">
          {profileTypeLabel(profile.profile_type)}
        </span>
      </span>
    </button>
  );
}

type Props = {
  ownerName: string;
  ownerEmail?: string | null;
};

export default function WelcomeProfileStrip({
  ownerName,
  ownerEmail,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profiles, active, loading, switchProfile } = useActiveProfile();
  const [passwordNotice, setPasswordNotice] = useState(false);

  useEffect(() => {
    if (searchParams.get("passwordUpdated") !== "1") return;
    setPasswordNotice(true);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("passwordUpdated");
    const qs = params.toString();
    router.replace(qs ? `/dashboard?docs=1&${qs}` : DOCUMENTS_PATH, { scroll: false });
  }, [searchParams, router]);

  const topLevel = topLevelProfiles(profiles);
  const viewingLinked = active && isLinkedMemberProfile(active);

  const focusedContainerId = viewingLinked
    ? active.parent_profile_id
    : active?.id;
  const focusedContainer =
    profiles.find(
      (p) =>
        p.id === focusedContainerId && isGroupStyleProfile(p.profile_type)
    ) ?? null;
  const nested = focusedContainer
    ? nestedUnder(profiles, focusedContainer)
    : [];

  return (
    <div className="welcome-strip space-y-4 sm:space-y-5">
      {passwordNotice ? (
        <p
          role="status"
          className="rounded-xl border border-brand/30 bg-brand-light px-4 py-3 text-sm text-brand-dark"
        >
          Your password has been updated.
        </p>
      ) : null}
      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
          Welcome, {ownerName}
        </h1>
        {ownerEmail ? (
          <p className="mt-0.5 truncate text-sm text-ink-muted">{ownerEmail}</p>
        ) : null}
        <p className="mt-2 text-sm text-ink-muted">
          {profiles.length === 0
            ? "Start by choosing a space below."
            : "Who are you helping today?"}
        </p>
      </div>

      {profiles.length === 0 && !loading ? null : (
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-medium text-foreground">
            Your people & spaces
          </p>
          <Link
            href="/settings/profiles"
            className="text-xs font-medium text-brand hover:text-brand-dark"
          >
            Manage
          </Link>
        </div>

        {loading && profiles.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">Loading profiles…</p>
        ) : (
          <>
            <ul
              className="welcome-chips mt-3 grid grid-cols-2 gap-2 sm:flex sm:gap-2.5 sm:overflow-x-auto sm:pb-1 sm:[-ms-overflow-style:none] sm:[scrollbar-width:none] sm:[&::-webkit-scrollbar]:hidden"
              role="listbox"
              aria-label="Guardian profiles"
            >
              {topLevel.map((p, i) => {
                const selected = active?.id === p.id;
                const expanded = Boolean(
                  viewingLinked && p.id === active.parent_profile_id
                );
                return (
                  <li
                    key={p.id}
                    className="welcome-chip min-w-0 sm:shrink-0"
                    style={{ animationDelay: `${80 + i * 45}ms` }}
                  >
                    <ProfileChip
                      profile={p}
                      selected={selected}
                      expanded={expanded}
                      onSelect={() => {
                        if (p.id === active?.id) {
                          showVaultNudge(p.id);
                          return;
                        }
                        void switchProfile(p.id);
                      }}
                    />
                  </li>
                );
              })}
              <li
                className="welcome-chip min-w-0 sm:shrink-0"
                style={{
                  animationDelay: `${80 + topLevel.length * 45}ms`,
                }}
              >
                <Link
                  href="/settings/profiles?add=1"
                  className="flex h-full w-full min-h-[3.25rem] items-center gap-2 rounded-2xl border border-dashed border-stone-300 bg-white/70 px-3 py-2.5 text-sm font-medium text-ink-muted transition hover:border-brand hover:text-brand sm:min-w-[8.5rem]"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-50">
                    <Plus className="h-4 w-4" />
                  </span>
                  Add more
                </Link>
              </li>
            </ul>

            {focusedContainer && nested.length > 0 ? (
              <div className="mt-3 rounded-2xl border border-stone-100 bg-stone-50/80 px-3 py-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                  Under {focusedContainer.display_name}
                </p>
                <ul
                  className="mt-2 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-2"
                  role="listbox"
                  aria-label={`Under ${focusedContainer.display_name}`}
                >
                  {nested.map((child) => (
                    <li key={child.id} className="min-w-0 sm:shrink-0">
                      <ProfileChip
                        profile={child}
                        selected={active?.id === child.id}
                        indented
                        onSelect={() => {
                          if (child.id === active?.id) {
                            showVaultNudge(child.id);
                            return;
                          }
                          void switchProfile(child.id);
                        }}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ) : focusedContainer ? (
              <p className="mt-3 text-xs text-ink-muted">
                Nothing nested under {focusedContainer.display_name} yet. Use
                the sections below (or Manage) to add people, pets, vehicles,
                and more.
              </p>
            ) : null}
          </>
        )}

        {viewingLinked && active ? (
          <p className="mt-3 text-xs text-ink-muted">
            Viewing:{" "}
            <span className="font-medium text-foreground">
              {active.display_name}
            </span>{" "}
            ({profileTypeLabel(active.profile_type)})
          </p>
        ) : active && !focusedContainer ? (
          <p className="mt-3 text-xs text-ink-muted">
            Viewing{" "}
            <span className="font-medium text-foreground">
              {active.display_name}
            </span>
            <span>
              {" "}
              · {profileSubtitle(active)}
            </span>
          </p>
        ) : null}
      </div>
      )}
    </div>
  );
}
