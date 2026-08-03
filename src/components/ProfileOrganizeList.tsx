"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  ChevronDown,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Star,
  Trash2,
  Users,
} from "lucide-react";
import ProfileAvatar from "@/components/ProfileAvatar";
import {
  ACTIVE_CLIENTS_GROUP_LABEL,
  INACTIVE_CLIENTS_GROUP_LABEL,
  activeClientsOf,
  inactiveClientsOf,
  canAttachChildToParent,
  canHaveLinkedClients,
  canHaveLinkedEmployees,
  canHaveLinkedFamilyMembers,
  canHaveLinkedHobbies,
  canHaveLinkedHomes,
  canHaveLinkedOtherSpaces,
  canHaveLinkedPets,
  canHaveLinkedStudents,
  canHaveLinkedVehicles,
  canManageProfileAccess,
  employeesOf,
  familyMembersOf,
  hobbiesOf,
  homesOf,
  isGroupStyleProfile,
  isNestableProfileType,
  isProfileOwner,
  isSharedGuardianProfile,
  otherSpacesOf,
  petsOf,
  profileAvatarLabel,
  profileSubtitle,
  sharedProfileAccessBadge,
  profileTypeLabel,
  studentsOf,
  topLevelProfiles,
  vehiclesOf,
  type GuardianProfile,
} from "@/lib/profiles/types";

const COLLAPSE_KEY = "guardian.profileCollapsed";
const SECTION_COLLAPSE_KEY = "guardian.profileSectionCollapsed";

function defaultSectionCollapsed(label: string) {
  return (
    label === "Employees" ||
    label === "Clients" ||
    label === ACTIVE_CLIENTS_GROUP_LABEL ||
    label === INACTIVE_CLIENTS_GROUP_LABEL
  );
}

function nestedSectionKey(parentId: string, label: string) {
  return `${parentId}:${label}`;
}

function loadSectionCollapsed(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(SECTION_COLLAPSE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, boolean>;
  } catch {
    return {};
  }
}

function persistSectionCollapsed(map: Record<string, boolean>) {
  try {
    localStorage.setItem(SECTION_COLLAPSE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function loadCollapsed(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, boolean>;
  } catch {
    return {};
  }
}

function persistCollapsed(map: Record<string, boolean>) {
  try {
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function useDesktopDrag(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setEnabled(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return enabled;
}

function ProfileRowBadges({
  profile,
  activeId,
  nestedCount,
}: {
  profile: GuardianProfile;
  activeId?: string;
  nestedCount?: number;
}) {
  return (
    <>
      {profile.is_default ? (
        <span className="ml-2 text-[11px] font-medium text-brand">Default</span>
      ) : null}
      {activeId === profile.id ? (
        <span className="ml-2 text-[11px] font-medium text-ink-muted">Active</span>
      ) : null}
      {sharedProfileAccessBadge(profile) ? (
        <span className="ml-2 text-[11px] font-medium text-brand">
          {sharedProfileAccessBadge(profile)}
        </span>
      ) : null}
      {nestedCount != null && nestedCount > 0 ? (
        <span className="ml-2 text-[11px] font-medium text-ink-muted">
          {nestedCount} nested
        </span>
      ) : null}
    </>
  );
}

function ProfileEditForm({
  editing,
  setEditing,
  busy,
  onSaveEdit,
}: {
  editing: GuardianProfile;
  setEditing: (p: GuardianProfile | null) => void;
  busy: boolean;
  onSaveEdit: () => void;
}) {
  return (
    <div className="space-y-2">
      <input
        value={editing.display_name}
        onChange={(e) =>
          setEditing({ ...editing, display_name: e.target.value })
        }
        className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm"
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onSaveEdit}
          className="rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => setEditing(null)}
          className="rounded-full border border-stone-300 px-3 py-1.5 text-xs"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function ProfileRowActions({
  profile,
  activeId,
  busy,
  moving,
  moveOptions,
  onSwitch,
  onSetDefault,
  onEdit,
  onRemove,
  onLeave,
  onMove,
}: {
  profile: GuardianProfile;
  activeId?: string;
  busy: boolean;
  moving: boolean;
  moveOptions: GuardianProfile[];
  onSwitch: () => void;
  onSetDefault: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onLeave?: () => void;
  onMove: (parentId: string | null) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isActive = activeId === profile.id;
  const owned = isProfileOwner(profile);
  const shared = isSharedGuardianProfile(profile);
  const canMove =
    owned && isNestableProfileType(profile.profile_type) &&
    (moveOptions.length > 0 || profile.parent_profile_id);
  const showManageAccess = canManageProfileAccess(profile);
  const hasMenu =
    (owned && !profile.is_default) ||
    showManageAccess ||
    owned ||
    shared ||
    canMove;

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const menuItemClass =
    "flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-foreground hover:bg-stone-50 disabled:opacity-50";

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {!isActive ? (
        <button
          type="button"
          onClick={onSwitch}
          className="rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark"
        >
          Open
        </button>
      ) : null}
      {hasMenu ? (
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label={`Actions for ${profile.display_name}`}
            disabled={busy || moving}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-stone-300 text-ink-muted transition hover:bg-stone-50 hover:text-foreground disabled:opacity-50"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menuOpen ? (
            <div
              role="menu"
              className="absolute right-0 z-40 mt-1 w-56 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-stone-200 bg-white py-1 shadow-lg"
            >
              {owned ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onEdit();
                  }}
                  className={menuItemClass}
                >
                  <Pencil className="h-4 w-4 shrink-0 text-ink-muted" />
                  Edit name
                </button>
              ) : null}
              {owned && !profile.is_default ? (
                <button
                  type="button"
                  role="menuitem"
                  disabled={busy}
                  onClick={() => {
                    setMenuOpen(false);
                    onSetDefault();
                  }}
                  className={menuItemClass}
                >
                  <Star className="h-4 w-4 shrink-0 text-ink-muted" />
                  Make default
                </button>
              ) : null}
              {showManageAccess ? (
                <Link
                  href={`/settings/profiles/${profile.id}/collaborators`}
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className={menuItemClass}
                >
                  <Users className="h-4 w-4 shrink-0 text-ink-muted" />
                  Manage access
                </Link>
              ) : null}
              {canMove ? (
                <>
                  <p className="border-t border-stone-100 px-3 py-2 text-[11px] font-medium text-ink-muted">
                    Move under
                  </p>
                  {profile.parent_profile_id ? (
                    <button
                      type="button"
                      role="menuitem"
                      disabled={busy || moving}
                      onClick={() => {
                        setMenuOpen(false);
                        onMove(null);
                      }}
                      className={menuItemClass}
                    >
                      Top level
                    </button>
                  ) : null}
                  {moveOptions.map((container) => (
                    <button
                      key={container.id}
                      type="button"
                      role="menuitem"
                      disabled={busy || moving}
                      onClick={() => {
                        setMenuOpen(false);
                        onMove(container.id);
                      }}
                      className={menuItemClass}
                    >
                      {container.display_name}
                    </button>
                  ))}
                </>
              ) : null}
              {owned ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onRemove();
                  }}
                  className={`${menuItemClass} text-red-700 hover:bg-red-50`}
                >
                  <Trash2 className="h-4 w-4 shrink-0" />
                  Delete
                </button>
              ) : shared && onLeave ? (
                <button
                  type="button"
                  role="menuitem"
                  disabled={busy}
                  onClick={() => {
                    setMenuOpen(false);
                    onLeave();
                  }}
                  className={menuItemClass}
                >
                  Leave shared vault
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ProfileVaultRow({
  profile,
  activeId,
  busy,
  moving,
  moveOptions,
  avatarSize,
  avatarEditable,
  subtitle,
  nestedCount,
  leading,
  dragEnabled,
  onDragStart,
  onSwitch,
  onSetDefault,
  onEdit,
  onRemove,
  onLeave,
  onMove,
  editing,
  setEditing,
  onSaveEdit,
  onRefresh,
  onAvatarError,
  className,
}: {
  profile: GuardianProfile;
  activeId?: string;
  busy: boolean;
  moving: boolean;
  moveOptions: GuardianProfile[];
  avatarSize: "sm" | "md";
  avatarEditable: boolean;
  subtitle: ReactNode;
  nestedCount?: number;
  leading?: ReactNode;
  dragEnabled: boolean;
  onDragStart?: (e: DragEvent, id: string) => void;
  onSwitch: () => void;
  onSetDefault: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onLeave?: () => void;
  onMove: (parentId: string | null) => void;
  editing: GuardianProfile | null;
  setEditing: (p: GuardianProfile | null) => void;
  onSaveEdit: () => void;
  onRefresh: () => void | Promise<void>;
  onAvatarError: (message: string) => void;
  className?: string;
}) {
  if (editing?.id === profile.id) {
    return (
      <li className={className ?? "rounded-xl bg-stone-50 px-3 py-2"}>
        <ProfileEditForm
          editing={editing}
          setEditing={setEditing}
          busy={busy}
          onSaveEdit={onSaveEdit}
        />
      </li>
    );
  }

  return (
    <li
      draggable={dragEnabled}
      onDragStart={
        dragEnabled && onDragStart
          ? (e) => onDragStart(e, profile.id)
          : undefined
      }
      className={`${className ?? "rounded-xl bg-stone-50 px-3 py-2"} ${
        dragEnabled ? "cursor-grab active:cursor-grabbing" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          {leading}
          <ProfileAvatar
            profile={profile}
            size={avatarSize}
            editable={avatarEditable}
            onUpdated={onRefresh}
            onError={onAvatarError}
          />
          <div className="min-w-0 flex-1">
            <p
              className={
                avatarSize === "md" ? "font-semibold" : "text-sm font-medium"
              }
            >
              {profile.display_name}
              <ProfileRowBadges
                profile={profile}
                activeId={activeId}
                nestedCount={nestedCount}
              />
            </p>
            <p className="text-[11px] text-ink-muted sm:text-xs">{subtitle}</p>
          </div>
        </div>
        <ProfileRowActions
          profile={profile}
          activeId={activeId}
          busy={busy}
          moving={moving}
          moveOptions={moveOptions}
          onSwitch={onSwitch}
          onSetDefault={onSetDefault}
          onEdit={onEdit}
          onRemove={onRemove}
          onLeave={onLeave}
          onMove={onMove}
        />
      </div>
    </li>
  );
}

type Props = {
  profiles: GuardianProfile[];
  activeId?: string;
  busy: boolean;
  editing: GuardianProfile | null;
  setEditing: (p: GuardianProfile | null) => void;
  onSaveEdit: () => void;
  onSwitch: (id: string) => void;
  onSetDefault: (id: string) => void;
  onRemove: (p: GuardianProfile) => void;
  onMoveUnder: (profileId: string, parentProfileId: string | null) => Promise<void>;
  onRefresh: () => void | Promise<void>;
  onAvatarError: (message: string) => void;
};

export default function ProfileOrganizeList({
  profiles,
  activeId,
  busy,
  editing,
  setEditing,
  onSaveEdit,
  onSwitch,
  onSetDefault,
  onRemove,
  onMoveUnder,
  onRefresh,
  onAvatarError,
}: Props) {
  const desktopDrag = useDesktopDrag();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [sectionCollapsed, setSectionCollapsed] = useState<Record<string, boolean>>(
    {}
  );
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);

  useEffect(() => {
    setCollapsed(loadCollapsed());
    setSectionCollapsed(loadSectionCollapsed());
  }, []);

  const topLevel = useMemo(() => topLevelProfiles(profiles), [profiles]);
  const containers = useMemo(
    () => topLevel.filter((p) => isGroupStyleProfile(p.profile_type)),
    [topLevel]
  );

  const dragged = dragId
    ? profiles.find((p) => p.id === dragId) ?? null
    : null;

  const toggleCollapsed = (id: string) => {
    setCollapsed((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      persistCollapsed(next);
      return next;
    });
  };

  const isSectionCollapsed = (parentId: string, label: string) => {
    const key = nestedSectionKey(parentId, label);
    if (sectionCollapsed[key] !== undefined) return sectionCollapsed[key];
    return defaultSectionCollapsed(label);
  };

  const toggleSectionCollapsed = (parentId: string, label: string) => {
    const key = nestedSectionKey(parentId, label);
    setSectionCollapsed((prev) => {
      const wasCollapsed =
        prev[key] !== undefined ? prev[key] : defaultSectionCollapsed(label);
      const next = { ...prev, [key]: !wasCollapsed };
      persistSectionCollapsed(next);
      return next;
    });
  };

  const onDragStart = useCallback((e: DragEvent, id: string) => {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
    setDragId(id);
  }, []);

  const endDrag = () => {
    setDragId(null);
    setDropTargetId(null);
  };

  const acceptDrop = (parent: GuardianProfile) => {
    if (!dragged) return false;
    if (dragged.id === parent.id) return false;
    return canAttachChildToParent(dragged.profile_type, parent.profile_type);
  };

  const handleDropOn = async (parentId: string | null) => {
    if (!dragId) return;
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
    if (!parent || !canAttachChildToParent(child.profile_type, parent.profile_type)) {
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
      setCollapsed((prev) => {
        const next = { ...prev, [parentId]: false };
        persistCollapsed(next);
        return next;
      });
    } finally {
      setMovingId(null);
      endDrag();
    }
  };

  const moveProfile = async (profileId: string, parentId: string | null) => {
    setMovingId(profileId);
    try {
      await onMoveUnder(profileId, parentId);
      if (parentId) {
        setCollapsed((prev) => {
          const next = { ...prev, [parentId]: false };
          persistCollapsed(next);
          return next;
        });
      }
    } finally {
      setMovingId(null);
    }
  };

  const moveOptionsFor = (child: GuardianProfile) =>
    containers.filter(
      (c) =>
        c.id !== child.id &&
        canAttachChildToParent(child.profile_type, c.profile_type)
    );

  const leaveSharedVault = async (profile: GuardianProfile) => {
    if (
      !window.confirm(
        "Leave this shared vault? You can rejoin if invited again."
      )
    ) {
      return;
    }
    const res = await fetch(`/api/profiles/${profile.id}/collaborators/me`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      onAvatarError(body.error ?? "Couldn't leave this vault.");
      return;
    }
    await onRefresh();
  };

  const renderNestedSection = (
    parentId: string,
    label: string,
    children: GuardianProfile[]
  ) => {
    if (children.length === 0) return null;
    const collapsedSection = isSectionCollapsed(parentId, label);
    return (
      <>
        <li>
          <button
            type="button"
            onClick={() => toggleSectionCollapsed(parentId, label)}
            aria-expanded={!collapsedSection}
            className="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-left text-[11px] font-medium uppercase tracking-wide text-ink-muted hover:bg-stone-50"
          >
            <ChevronDown
              className={`h-3.5 w-3.5 shrink-0 transition-transform ${
                collapsedSection ? "-rotate-90" : ""
              }`}
              aria-hidden
            />
            <span>{label}</span>
            <span className="text-[10px] font-medium normal-case">
              ({children.length})
            </span>
          </button>
        </li>
        {!collapsedSection
          ? children.map((child) => (
              <ProfileVaultRow
                key={child.id}
                profile={child}
                activeId={activeId}
                busy={busy}
                moving={movingId === child.id}
                moveOptions={moveOptionsFor(child)}
                avatarSize="sm"
                avatarEditable={isProfileOwner(child)}
                subtitle={
                  <>
                    {profileTypeLabel(child.profile_type)}
                    {child.job_title ? ` · ${child.job_title}` : ""}
                  </>
                }
                leading={
                  desktopDrag ? (
                    <GripVertical
                      className="mt-2 h-3.5 w-3.5 shrink-0 text-ink-muted"
                      aria-hidden
                    />
                  ) : (
                    <span className="w-3.5 shrink-0" aria-hidden />
                  )
                }
                dragEnabled={desktopDrag}
                onDragStart={onDragStart}
                onSwitch={() => onSwitch(child.id)}
                onSetDefault={() => onSetDefault(child.id)}
                onEdit={() => setEditing(child)}
                onRemove={() => onRemove(child)}
                onLeave={
                  isSharedGuardianProfile(child)
                    ? () => void leaveSharedVault(child)
                    : undefined
                }
                onMove={(moveParentId) => void moveProfile(child.id, moveParentId)}
                editing={editing}
                setEditing={setEditing}
                onSaveEdit={onSaveEdit}
                onRefresh={onRefresh}
                onAvatarError={onAvatarError}
              />
            ))
          : null}
      </>
    );
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-muted">
        {desktopDrag
          ? "Drag members onto a Family, Business, or Nonprofit card — or use Move under in the menu. "
          : "Use Move under in the ⋯ menu to reorganize. "}
        Tap the chevron to collapse nested members. Use the camera on a profile
        to pick an avatar or upload a photo or logo.
      </p>

      <ul
        className="space-y-3"
        onDragEnd={endDrag}
        onDragOver={(e) => {
          if (!dragged?.parent_profile_id) return;
          e.preventDefault();
          setDropTargetId("__top__");
        }}
        onDragLeave={() => {
          if (dropTargetId === "__top__") setDropTargetId(null);
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (dropTargetId === "__top__" || e.currentTarget === e.target) {
            void handleDropOn(null);
          }
        }}
      >
        {topLevel.map((p) => {
          const nestedEmployees = canHaveLinkedEmployees(p.profile_type)
            ? employeesOf(profiles, p.id)
            : [];
          const nestedActiveClients = canHaveLinkedClients(p.profile_type)
            ? activeClientsOf(profiles, p.id)
            : [];
          const nestedInactiveClients = canHaveLinkedClients(p.profile_type)
            ? inactiveClientsOf(profiles, p.id)
            : [];
          const nestedFamily = canHaveLinkedFamilyMembers(p.profile_type)
            ? familyMembersOf(profiles, p.id)
            : [];
          const nestedStudents = canHaveLinkedStudents(p.profile_type)
            ? studentsOf(profiles, p.id)
            : [];
          const nestedPets = canHaveLinkedPets(p.profile_type)
            ? petsOf(profiles, p.id)
            : [];
          const nestedHobbies = canHaveLinkedHobbies(p.profile_type)
            ? hobbiesOf(profiles, p.id)
            : [];
          const nestedHomes = canHaveLinkedHomes(p.profile_type)
            ? homesOf(profiles, p.id)
            : [];
          const nestedVehicles = canHaveLinkedVehicles(p.profile_type)
            ? vehiclesOf(profiles, p.id)
            : [];
          const nestedOthers = canHaveLinkedOtherSpaces(p.profile_type)
            ? otherSpacesOf(profiles, p.id)
            : [];
          const nested = [
            ...nestedEmployees,
            ...nestedActiveClients,
            ...nestedInactiveClients,
            ...nestedFamily,
            ...nestedStudents,
            ...nestedPets,
            ...nestedHobbies,
            ...nestedHomes,
            ...nestedVehicles,
            ...nestedOthers,
          ];
          const isContainer =
            isGroupStyleProfile(p.profile_type) ||
            canHaveLinkedHobbies(p.profile_type);
          const isCollapsed = Boolean(collapsed[p.id]);
          const canDropHere = isContainer && acceptDrop(p);
          const isDropHighlight = dropTargetId === p.id && canDropHere;
          const nestable = isNestableProfileType(p.profile_type);

          return (
            <li
              key={p.id}
              draggable={desktopDrag && nestable}
              onDragStart={
                desktopDrag && nestable
                  ? (e) => onDragStart(e, p.id)
                  : undefined
              }
              onDragOver={(e) => {
                if (!canDropHere) return;
                e.preventDefault();
                e.stopPropagation();
                setDropTargetId(p.id);
              }}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                if (dropTargetId === p.id) setDropTargetId(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (canDropHere) void handleDropOn(p.id);
              }}
              className={`rounded-2xl border bg-white p-4 shadow-sm transition ${
                isDropHighlight
                  ? "border-brand ring-2 ring-brand/30"
                  : "border-stone-200"
              } ${desktopDrag && nestable ? "cursor-grab active:cursor-grabbing" : ""}`}
            >
              {editing?.id === p.id ? (
                <ProfileEditForm
                  editing={editing}
                  setEditing={setEditing}
                  busy={busy}
                  onSaveEdit={onSaveEdit}
                />
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-start gap-2">
                    {isContainer && nested.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => toggleCollapsed(p.id)}
                        aria-expanded={!isCollapsed}
                        aria-label={
                          isCollapsed
                            ? `Expand ${p.display_name}`
                            : `Collapse ${p.display_name}`
                        }
                        className="mt-2 shrink-0 rounded-md p-0.5 text-ink-muted hover:bg-stone-100 hover:text-foreground"
                      >
                        <ChevronDown
                          className={`h-4 w-4 transition-transform ${
                            isCollapsed ? "-rotate-90" : ""
                          }`}
                        />
                      </button>
                    ) : desktopDrag && nestable ? (
                      <GripVertical
                        className="mt-2.5 h-4 w-4 shrink-0 text-ink-muted"
                        aria-hidden
                      />
                    ) : (
                      <span className="mt-2.5 w-4 shrink-0" aria-hidden />
                    )}
                    <ProfileAvatar
                      profile={p}
                      size="md"
                      editable={isProfileOwner(p)}
                      onUpdated={onRefresh}
                      onError={onAvatarError}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">
                        {p.display_name}
                        <ProfileRowBadges
                          profile={p}
                          activeId={activeId}
                          nestedCount={nested.length}
                        />
                      </p>
                      <p className="text-xs text-ink-muted">
                        {profileSubtitle(p)}
                        {" · "}
                        {profileAvatarLabel(p.profile_type)}
                      </p>
                    </div>
                  </div>
                  <ProfileRowActions
                    profile={p}
                    activeId={activeId}
                    busy={busy}
                    moving={movingId === p.id}
                    moveOptions={moveOptionsFor(p)}
                    onSwitch={() => onSwitch(p.id)}
                    onSetDefault={() => onSetDefault(p.id)}
                    onEdit={() => setEditing(p)}
                    onRemove={() => onRemove(p)}
                    onLeave={
                      isSharedGuardianProfile(p)
                        ? () => void leaveSharedVault(p)
                        : undefined
                    }
                    onMove={(parentId) => void moveProfile(p.id, parentId)}
                  />
                </div>
              )}

              {nested.length > 0 && !isCollapsed ? (
                <ul className="mt-3 space-y-2 border-t border-stone-100 pt-3">
                  {renderNestedSection(p.id, "Employees", nestedEmployees)}
                  {renderNestedSection(
                    p.id,
                    ACTIVE_CLIENTS_GROUP_LABEL,
                    nestedActiveClients
                  )}
                  {renderNestedSection(
                    p.id,
                    INACTIVE_CLIENTS_GROUP_LABEL,
                    nestedInactiveClients
                  )}
                  {renderNestedSection(p.id, "Family members", nestedFamily)}
                  {renderNestedSection(p.id, "Students", nestedStudents)}
                  {renderNestedSection(p.id, "Pets", nestedPets)}
                  {renderNestedSection(p.id, "Hobbies", nestedHobbies)}
                  {renderNestedSection(p.id, "Homes", nestedHomes)}
                  {renderNestedSection(p.id, "Vehicles", nestedVehicles)}
                  {renderNestedSection(p.id, "Other", nestedOthers)}
                </ul>
              ) : null}

              {isContainer && isDropHighlight ? (
                <p className="mt-2 text-xs font-medium text-brand">
                  Drop to nest under {p.display_name}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      {dragged?.parent_profile_id ? (
        <p className="text-xs text-ink-muted">
          Drop outside a container card to move back to top level.
        </p>
      ) : null}
    </div>
  );
}
