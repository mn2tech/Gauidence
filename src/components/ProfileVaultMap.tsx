"use client";

import ProfileAvatar from "@/components/ProfileAvatar";
import { buildVaultMapRoots } from "@/lib/profiles/vaultMap";
import {
  profileTypeLabel,
  type GuardianProfile,
} from "@/lib/profiles/types";

type Props = {
  profiles: GuardianProfile[];
  activeId?: string;
  onSwitch: (id: string) => void;
};

function MapNode({
  profile,
  activeId,
  onSwitch,
  size = "md",
}: {
  profile: GuardianProfile;
  activeId?: string;
  onSwitch: (id: string) => void;
  size?: "md" | "sm";
}) {
  const active = profile.id === activeId;
  return (
    <button
      type="button"
      onClick={() => onSwitch(profile.id)}
      className={`flex min-w-[5.5rem] max-w-[8.5rem] flex-col items-center gap-1.5 rounded-xl border bg-white px-2 py-2.5 text-center transition hover:border-brand/40 hover:bg-brand-light/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
        active
          ? "border-brand ring-2 ring-brand/25 shadow-sm"
          : "border-stone-200 shadow-sm"
      }`}
      aria-current={active ? "true" : undefined}
      title={`Open ${profile.display_name}'s vault`}
    >
      <ProfileAvatar profile={profile} size={size === "sm" ? "sm" : "md"} />
      <span
        className={`line-clamp-2 w-full font-medium leading-tight text-foreground ${
          size === "sm" ? "text-[11px]" : "text-xs"
        }`}
      >
        {profile.display_name}
      </span>
      <span className="line-clamp-1 w-full text-[10px] text-ink-muted">
        {profileTypeLabel(profile.profile_type)}
      </span>
      {active ? (
        <span className="rounded-full bg-brand-light px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-brand-dark">
          Active
        </span>
      ) : null}
    </button>
  );
}

function VaultMapTree({
  root,
  activeId,
  onSwitch,
}: {
  root: ReturnType<typeof buildVaultMapRoots>[number];
  activeId?: string;
  onSwitch: (id: string) => void;
}) {
  const { profile, children } = root;

  if (children.length === 0) {
    return (
      <div className="flex justify-center">
        <MapNode profile={profile} activeId={activeId} onSwitch={onSwitch} />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <MapNode profile={profile} activeId={activeId} onSwitch={onSwitch} />
      <div className="h-4 w-px bg-stone-300" aria-hidden />
      <div className="relative w-full px-2 pt-3">
        {children.length > 1 ? (
          <div
            className="absolute left-8 right-8 top-0 h-px bg-stone-300"
            aria-hidden
          />
        ) : null}
        <ul className="flex flex-wrap items-start justify-center gap-x-4 gap-y-3">
          {children.map((child) => (
            <li key={child.id} className="flex flex-col items-center">
              <div className="h-3 w-px bg-stone-300" aria-hidden />
              <MapNode
                profile={child}
                activeId={activeId}
                onSwitch={onSwitch}
                size="sm"
              />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function ProfileVaultMap({
  profiles,
  activeId,
  onSwitch,
}: Props) {
  const roots = buildVaultMapRoots(profiles);
  if (roots.length === 0) return null;

  return (
    <section
      className="rounded-2xl border border-stone-200 bg-stone-50/80 p-4 shadow-sm"
      aria-labelledby="vault-map-heading"
    >
      <div className="mb-4">
        <h2 id="vault-map-heading" className="text-sm font-semibold text-foreground">
          Vault map
        </h2>
        <p className="mt-0.5 text-xs text-ink-muted">
          Tap a person or space to switch vaults. Linked members appear under
          their Family, Business, or Vehicles space.
        </p>
      </div>
      <div className="space-y-8">
        {roots.map((root) => (
          <VaultMapTree
            key={root.profile.id}
            root={root}
            activeId={activeId}
            onSwitch={onSwitch}
          />
        ))}
      </div>
    </section>
  );
}
