"use client";

import Image from "next/image";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useActiveProfile } from "@/components/ProfileProvider";
import {
  isLinkedMemberProfile,
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

function ProfileChip({
  profile,
  selected,
  onSelect,
}: {
  profile: GuardianProfile;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={`flex w-full items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-left transition sm:min-w-[8.5rem] sm:max-w-[11rem] ${
        selected
          ? "border-brand bg-brand-light ring-1 ring-brand/30"
          : "border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50"
      }`}
    >
      {profile.avatar_url ? (
        <Image
          src={profile.avatar_url}
          alt=""
          width={36}
          height={36}
          className="h-9 w-9 shrink-0 rounded-full border border-stone-200 object-cover"
          unoptimized
        />
      ) : (
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
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
  const { profiles, active, loading, switchProfile } = useActiveProfile();
  const topLevel = topLevelProfiles(profiles);
  const viewingLinked = active && isLinkedMemberProfile(active);
  const chipHighlightId = viewingLinked
    ? active.parent_profile_id
    : active?.id;

  return (
    <div className="welcome-strip space-y-4 sm:space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
          Welcome, {ownerName}
        </h1>
        {ownerEmail ? (
          <p className="mt-0.5 truncate text-sm text-ink-muted">{ownerEmail}</p>
        ) : null}
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-medium text-foreground">Your profiles</p>
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
          <ul
            className="welcome-chips mt-3 grid grid-cols-2 gap-2 sm:flex sm:gap-2.5 sm:overflow-x-auto sm:pb-1 sm:[-ms-overflow-style:none] sm:[scrollbar-width:none] sm:[&::-webkit-scrollbar]:hidden"
            role="listbox"
            aria-label="Guardian profiles"
          >
            {topLevel.map((p, i) => {
              const selected = p.id === chipHighlightId;
              return (
                <li
                  key={p.id}
                  className="welcome-chip min-w-0 sm:shrink-0"
                  style={{ animationDelay: `${80 + i * 45}ms` }}
                >
                  <ProfileChip
                    profile={p}
                    selected={selected}
                    onSelect={() => {
                      if (p.id !== active?.id) void switchProfile(p.id);
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
                Add
              </Link>
            </li>
          </ul>
        )}

        {viewingLinked && active ? (
          <p className="mt-3 text-xs text-ink-muted">
            Viewing:{" "}
            <span className="font-medium text-foreground">
              {active.display_name}
            </span>{" "}
            ({profileTypeLabel(active.profile_type)})
          </p>
        ) : active ? (
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
    </div>
  );
}
