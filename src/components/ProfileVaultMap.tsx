"use client";

import { useCallback, useState, type DragEvent } from "react";
import { GripVertical } from "lucide-react";
import ProfileAvatar from "@/components/ProfileAvatar";
import { buildVaultMapTree, type VaultMapBranch } from "@/lib/profiles/vaultMap";
import {
  canAttachChildToParent,
  isGroupStyleProfile,
  isNestableProfileType,
  profileTypeLabel,
  type GuardianProfile,
} from "@/lib/profiles/types";

type Props = {
  profiles: GuardianProfile[];
  ownerLabel?: string;
  activeId?: string;
  busy?: boolean;
  onSwitch: (id: string) => void;
  onMoveUnder: (profileId: string, parentProfileId: string | null) => Promise<void>;
};

type DragCtx = {
  dragId: string | null;
  movingId: string | null;
  dropTargetId: string | null;
  onDragStart: (e: DragEvent, id: string) => void;
  onDragEnd: () => void;
  setDropTargetId: (id: string | null) => void;
};

function MapNode({
  profile,
  activeId,
  onSwitch,
  size = "md",
  drag,
}: {
  profile: GuardianProfile;
  activeId?: string;
  onSwitch: (id: string) => void;
  size?: "md" | "sm";
  drag?: DragCtx & { draggable: boolean };
}) {
  const active = profile.id === activeId;
  const isMoving = drag?.movingId === profile.id;

  return (
    <div
      className={`relative flex w-full max-w-[9rem] flex-col items-center ${
        isMoving ? "opacity-50" : ""
      }`}
    >
      {drag?.draggable ? (
        <span
          draggable={!isMoving && !drag.movingId}
          onDragStart={(e) => drag.onDragStart(e, profile.id)}
          onDragEnd={drag.onDragEnd}
          className="mb-0.5 cursor-grab rounded p-0.5 text-ink-muted active:cursor-grabbing hover:bg-stone-100"
          aria-label={`Drag ${profile.display_name}`}
          title="Drag to move under another space"
        >
          <GripVertical className="h-3.5 w-3.5" aria-hidden />
        </span>
      ) : null}
      <button
        type="button"
        onClick={() => onSwitch(profile.id)}
        disabled={isMoving}
        className={`flex w-full flex-col items-center gap-1.5 rounded-xl border bg-white px-2 py-2.5 text-center transition hover:border-brand/40 hover:bg-brand-light/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-wait ${
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
    </div>
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
      <span className="line-clamp-1 w-full text-[10px] text-ink-muted">You</span>
    </div>
  );
}

function MemberGrid({
  members,
  activeId,
  onSwitch,
  drag,
}: {
  members: GuardianProfile[];
  activeId?: string;
  onSwitch: (id: string) => void;
  drag: DragCtx;
}) {
  return (
    <ul className="flex flex-wrap justify-center gap-2">
      {members.map((member) => (
        <li key={member.id} className="flex justify-center">
          <MapNode
            profile={member}
            activeId={activeId}
            onSwitch={onSwitch}
            size="sm"
            drag={{ ...drag, draggable: isNestableProfileType(member.profile_type) }}
          />
        </li>
      ))}
    </ul>
  );
}

function BranchColumn({
  branch,
  activeId,
  onSwitch,
  drag,
  canDropOn,
  onDropOn,
}: {
  branch: VaultMapBranch;
  activeId?: string;
  onSwitch: (id: string) => void;
  drag: DragCtx;
  canDropOn: (parent: GuardianProfile) => boolean;
  onDropOn: (parentId: string | null) => void;
}) {
  const visibleGroups = branch.groups.filter((g) => g.members.length > 0);
  const hasGroups = visibleGroups.length > 0;
  const hasFlat = !hasGroups && branch.members.length > 0;
  const isContainer = isGroupStyleProfile(branch.profile.profile_type);
  const isDropTarget =
    drag.dropTargetId === branch.profile.id && canDropOn(branch.profile);
  const rootDraggable =
    isNestableProfileType(branch.profile.profile_type) && !isContainer;

  return (
    <li
      className={`flex min-w-0 flex-col items-center rounded-xl border p-3 transition ${
        isDropTarget
          ? "border-brand bg-brand-light/30 ring-2 ring-brand/25"
          : "border-stone-200/80 bg-white/70"
      }`}
      onDragOver={(e) => {
        if (!canDropOn(branch.profile)) return;
        e.preventDefault();
        e.stopPropagation();
        drag.setDropTargetId(branch.profile.id);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        if (drag.dropTargetId === branch.profile.id) {
          drag.setDropTargetId(null);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (canDropOn(branch.profile)) void onDropOn(branch.profile.id);
      }}
    >
      <div className="mb-1 h-3 w-px bg-stone-300" aria-hidden />
      <MapNode
        profile={branch.profile}
        activeId={activeId}
        onSwitch={onSwitch}
        drag={rootDraggable ? { ...drag, draggable: true } : undefined}
      />
      {isDropTarget ? (
        <p className="mt-2 text-center text-[10px] font-medium text-brand">
          Drop to nest under {branch.profile.display_name}
        </p>
      ) : null}
      {hasGroups ? (
        <div className="mt-3 flex w-full flex-col gap-4">
          {visibleGroups.map((group) => (
            <div key={group.label} className="w-full">
              <p className="mb-2 text-center text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                {group.label}
              </p>
              <MemberGrid
                members={group.members}
                activeId={activeId}
                onSwitch={onSwitch}
                drag={drag}
              />
            </div>
          ))}
        </div>
      ) : null}
      {hasFlat ? (
        <div className="mt-3 w-full">
          <MemberGrid
            members={branch.members}
            activeId={activeId}
            onSwitch={onSwitch}
            drag={drag}
          />
        </div>
      ) : null}
    </li>
  );
}

export default function ProfileVaultMap({
  profiles,
  ownerLabel = "You",
  activeId,
  busy = false,
  onSwitch,
  onMoveUnder,
}: Props) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);

  const tree = buildVaultMapTree(profiles, ownerLabel);
  const dragged = dragId
    ? profiles.find((p) => p.id === dragId) ?? null
    : null;

  const onDragStart = useCallback((e: DragEvent, id: string) => {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
    setDragId(id);
  }, []);

  const endDrag = useCallback(() => {
    setDragId(null);
    setDropTargetId(null);
  }, []);

  const canDropOn = useCallback(
    (parent: GuardianProfile) => {
      if (!dragged) return false;
      if (dragged.id === parent.id) return false;
      return canAttachChildToParent(dragged.profile_type, parent.profile_type);
    },
    [dragged]
  );

  const handleDropOn = useCallback(
    async (parentId: string | null) => {
      if (!dragId || busy) return;
      const child = profiles.find((p) => p.id === dragId);
      if (!child) {
        endDrag();
        return;
      }
      if (parentId === null) {
        if (!child.parent_profile_id) {
          endDrag();
          return;
        }
        setMovingId(child.id);
        try {
          await onMoveUnder(child.id, null);
        } finally {
          setMovingId(null);
          endDrag();
        }
        return;
      }
      const parent = profiles.find((p) => p.id === parentId);
      if (
        !parent ||
        !canAttachChildToParent(child.profile_type, parent.profile_type)
      ) {
        endDrag();
        return;
      }
      if (child.parent_profile_id === parentId) {
        endDrag();
        return;
      }
      setMovingId(child.id);
      try {
        await onMoveUnder(child.id, parentId);
      } finally {
        setMovingId(null);
        endDrag();
      }
    },
    [dragId, busy, profiles, onMoveUnder, endDrag]
  );

  if (!tree) return null;

  const { ownerLabel: label, personalProfile, branches } = tree;
  const hasBranches = branches.length > 0;
  const drag: DragCtx = {
    dragId,
    movingId,
    dropTargetId,
    onDragStart,
    onDragEnd: endDrag,
    setDropTargetId,
  };

  return (
    <section
      className="rounded-2xl border border-stone-200 bg-stone-50/80 p-4 shadow-sm"
      aria-labelledby="vault-map-heading"
      onDragEnd={endDrag}
    >
      <div className="mb-4">
        <h2
          id="vault-map-heading"
          className="text-sm font-semibold text-foreground"
        >
          Vault map
        </h2>
        <p className="mt-0.5 text-xs text-ink-muted">
          Tap a vault to switch. Drag by the grip handle onto Family, Business,
          or another space to reorganize.
        </p>
      </div>
      <div className="flex flex-col items-center">
        {dragged?.parent_profile_id ? (
          <div
            className={`mb-3 w-full rounded-xl border border-dashed px-3 py-2 text-center text-xs transition ${
              dropTargetId === "__top__"
                ? "border-brand bg-brand-light/40 text-brand-dark"
                : "border-stone-300 bg-white/80 text-ink-muted"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDropTargetId("__top__");
            }}
            onDragLeave={() => {
              if (dropTargetId === "__top__") setDropTargetId(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              void handleDropOn(null);
            }}
          >
            Drop here to move back to top level
          </div>
        ) : null}
        <OwnerNode
          label={label}
          personalProfile={personalProfile}
          activeId={activeId}
          onSwitch={onSwitch}
        />
        {hasBranches ? (
          <>
            <div className="h-4 w-px bg-stone-300" aria-hidden />
            <ul
              className={`grid w-full gap-4 ${
                branches.length === 1
                  ? "max-w-md grid-cols-1"
                  : branches.length === 2
                    ? "grid-cols-1 sm:grid-cols-2"
                    : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"
              }`}
            >
              {branches.map((branch) => (
                <BranchColumn
                  key={branch.profile.id}
                  branch={branch}
                  activeId={activeId}
                  onSwitch={onSwitch}
                  drag={drag}
                  canDropOn={canDropOn}
                  onDropOn={handleDropOn}
                />
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </section>
  );
}
