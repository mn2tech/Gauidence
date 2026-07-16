"use client";

import ProfileAvatar from "@/components/ProfileAvatar";
import { buildVaultMapTree, type VaultMapBranch } from "@/lib/profiles/vaultMap";
import {
  profileTypeLabel,
  type GuardianProfile,
} from "@/lib/profiles/types";

type Props = {
  profiles: GuardianProfile[];
  ownerLabel?: string;
  activeId?: string;
  onSwitch: (id: string) => void;
};

function Connector({ tall = false }: { tall?: boolean }) {
  return (
    <div
      className={`w-px bg-stone-300 ${tall ? "h-4" : "h-3"}`}
      aria-hidden
    />
  );
}

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

function OwnerNode({
  label,
  personalProfile,
  activeId,
  onSwitch,
}: {
  label: string;
  personalProfile: GuardianProfile | null;
  activeId?: string;
  onSwitch: (id: string) => void;
}) {
  const active = personalProfile ? personalProfile.id === activeId : false;

  if (personalProfile) {
    return (
      <button
        type="button"
        onClick={() => onSwitch(personalProfile.id)}
        className={`flex min-w-[5.5rem] max-w-[8.5rem] flex-col items-center gap-1.5 rounded-xl border bg-white px-2 py-2.5 text-center transition hover:border-brand/40 hover:bg-brand-light/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
          active
            ? "border-brand ring-2 ring-brand/25 shadow-sm"
            : "border-stone-200 shadow-sm"
        }`}
        aria-current={active ? "true" : undefined}
        title={`Open ${label}'s personal vault`}
      >
        <ProfileAvatar profile={personalProfile} size="md" />
        <span className="line-clamp-2 w-full text-xs font-medium leading-tight text-foreground">
          {label}
        </span>
        <span className="line-clamp-1 w-full text-[10px] text-ink-muted">
          You
        </span>
        {active ? (
          <span className="rounded-full bg-brand-light px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-brand-dark">
            Active
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <div
      className="flex min-w-[5.5rem] max-w-[8.5rem] flex-col items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-2 py-2.5 text-center shadow-sm"
      aria-label={`${label}, your account`}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-light text-sm font-semibold text-brand-dark">
        {label.charAt(0).toUpperCase()}
      </div>
      <span className="line-clamp-2 w-full text-xs font-medium leading-tight text-foreground">
        {label}
      </span>
      <span className="line-clamp-1 w-full text-[10px] text-ink-muted">
        You
      </span>
    </div>
  );
}

function MemberRow({
  members,
  activeId,
  onSwitch,
}: {
  members: GuardianProfile[];
  activeId?: string;
  onSwitch: (id: string) => void;
}) {
  if (members.length === 0) return null;

  return (
    <div className="relative w-full px-2 pt-3">
      {members.length > 1 ? (
        <div
          className="absolute left-8 right-8 top-0 h-px bg-stone-300"
          aria-hidden
        />
      ) : null}
      <ul className="flex flex-wrap items-start justify-center gap-x-4 gap-y-3">
        {members.map((member) => (
          <li key={member.id} className="flex flex-col items-center">
            <Connector />
            <MapNode
              profile={member}
              activeId={activeId}
              onSwitch={onSwitch}
              size="sm"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function GroupedBranch({
  branch,
  activeId,
  onSwitch,
}: {
  branch: VaultMapBranch;
  activeId?: string;
  onSwitch: (id: string) => void;
}) {
  const { profile, groups } = branch;
  const visibleGroups = groups.filter((g) => g.members.length > 0);

  return (
    <li className="flex flex-col items-center">
      <Connector />
      <MapNode profile={profile} activeId={activeId} onSwitch={onSwitch} />
      {visibleGroups.length > 0 ? (
        <>
          <Connector tall />
          <div className="relative w-full px-2 pt-3">
            {visibleGroups.length > 1 ? (
              <div
                className="absolute left-8 right-8 top-0 h-px bg-stone-300"
                aria-hidden
              />
            ) : null}
            <ul className="flex flex-wrap items-start justify-center gap-x-6 gap-y-4">
              {visibleGroups.map((group) => (
                <li key={group.label} className="flex flex-col items-center">
                  <Connector />
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                    {group.label}
                  </p>
                  <ul className="flex flex-wrap items-start justify-center gap-x-3 gap-y-2">
                    {group.members.map((member) => (
                      <li key={member.id}>
                        <MapNode
                          profile={member}
                          activeId={activeId}
                          onSwitch={onSwitch}
                          size="sm"
                        />
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}
    </li>
  );
}

function FlatBranch({
  branch,
  activeId,
  onSwitch,
}: {
  branch: VaultMapBranch;
  activeId?: string;
  onSwitch: (id: string) => void;
}) {
  const { profile, members } = branch;

  if (members.length === 0) {
    return (
      <li className="flex flex-col items-center">
        <Connector />
        <MapNode profile={profile} activeId={activeId} onSwitch={onSwitch} />
      </li>
    );
  }

  return (
    <li className="flex flex-col items-center">
      <Connector />
      <MapNode profile={profile} activeId={activeId} onSwitch={onSwitch} />
      <MemberRow members={members} activeId={activeId} onSwitch={onSwitch} />
    </li>
  );
}

export default function ProfileVaultMap({
  profiles,
  ownerLabel = "You",
  activeId,
  onSwitch,
}: Props) {
  const tree = buildVaultMapTree(profiles, ownerLabel);
  if (!tree) return null;

  const { ownerLabel: label, personalProfile, branches } = tree;
  const hasBranches = branches.length > 0;

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
          Your account at the top, then Family, Business, and other spaces.
          Tap any vault to switch.
        </p>
      </div>
      <div className="flex flex-col items-center">
        <OwnerNode
          label={label}
          personalProfile={personalProfile}
          activeId={activeId}
          onSwitch={onSwitch}
        />
        {hasBranches ? (
          <>
            <Connector tall />
            <div className="relative w-full px-2 pt-3">
              {branches.length > 1 ? (
                <div
                  className="absolute left-8 right-8 top-0 h-px bg-stone-300"
                  aria-hidden
                />
              ) : null}
              <ul className="flex flex-wrap items-start justify-center gap-x-6 gap-y-6">
                {branches.map((branch) =>
                  branch.groups.length > 0 ? (
                    <GroupedBranch
                      key={branch.profile.id}
                      branch={branch}
                      activeId={activeId}
                      onSwitch={onSwitch}
                    />
                  ) : (
                    <FlatBranch
                      key={branch.profile.id}
                      branch={branch}
                      activeId={activeId}
                      onSwitch={onSwitch}
                    />
                  )
                )}
              </ul>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
