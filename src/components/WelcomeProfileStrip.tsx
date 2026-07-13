"use client";

import Image from "next/image";
import Link from "next/link";
import { Plus, UserRound } from "lucide-react";
import { useActiveProfile } from "@/components/ProfileProvider";
import {
  profileSubtitle,
  profileTypeLabel,
  type GuardianProfile,
} from "@/lib/profiles/types";

function initialFor(profile: GuardianProfile): string {
  const name = profile.display_name.trim();
  if (!name) return "?";
  return name.charAt(0).toUpperCase();
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

  return (
    <div className="welcome-strip space-y-5">
      <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Welcome, {ownerName}
          </h1>
          {ownerEmail ? (
            <p className="mt-0.5 text-sm text-ink-muted">{ownerEmail}</p>
          ) : null}
        </div>
        {/* Settings / sign-out stay in parent */}
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
            className="welcome-chips mt-3 flex gap-2.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="listbox"
            aria-label="Guardian profiles"
          >
            {profiles.map((p, i) => {
              const selected = p.id === active?.id;
              return (
                <li
                  key={p.id}
                  className="welcome-chip shrink-0"
                  style={{ animationDelay: `${80 + i * 45}ms` }}
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      if (p.id !== active?.id) void switchProfile(p.id);
                    }}
                    className={`flex min-w-[7.5rem] max-w-[10rem] items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-left transition ${
                      selected
                        ? "border-brand bg-brand-light ring-1 ring-brand/30"
                        : "border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50"
                    }`}
                  >
                    {p.avatar_url ? (
                      <Image
                        src={p.avatar_url}
                        alt=""
                        width={36}
                        height={36}
                        className="h-9 w-9 shrink-0 rounded-full border border-stone-200 object-cover"
                        unoptimized
                      />
                    ) : (
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                          selected
                            ? "bg-brand text-white"
                            : "bg-stone-100 text-ink-muted"
                        }`}
                        aria-hidden
                      >
                        {initialFor(p)}
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold leading-tight">
                        {p.display_name}
                      </span>
                      <span className="block truncate text-[11px] text-ink-muted">
                        {profileTypeLabel(p.profile_type)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
            <li
              className="welcome-chip shrink-0"
              style={{
                animationDelay: `${80 + profiles.length * 45}ms`,
              }}
            >
              <Link
                href="/settings/profiles?add=1"
                className="flex h-full min-w-[7.5rem] items-center gap-2 rounded-2xl border border-dashed border-stone-300 bg-white/70 px-3 py-2.5 text-sm font-medium text-ink-muted transition hover:border-brand hover:text-brand"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-50">
                  <Plus className="h-4 w-4" />
                </span>
                Add
              </Link>
            </li>
          </ul>
        )}

        {active ? (
          <p className="mt-3 text-xs text-ink-muted">
            Viewing{" "}
            <span className="font-medium text-foreground">
              {active.display_name}
            </span>
            <span className="text-ink-muted">
              {" "}
              · {profileSubtitle(active)}
            </span>
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Decorative avatar used outside the strip when we still want a face mark. */
export function WelcomeFallbackAvatar() {
  return (
    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-light text-brand">
      <UserRound className="h-7 w-7" />
    </span>
  );
}
