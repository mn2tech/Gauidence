"use client";

import { useCallback, useEffect, useMemo, useState, type DragEvent, type ReactNode } from "react";
import { ChevronDown, GripVertical, Trash2 } from "lucide-react";
import ProfileAvatar from "@/components/ProfileAvatar";
import {
  canAttachChildToParent,
  canHaveLinkedClients,
  canHaveLinkedEmployees,
  canHaveLinkedFamilyMembers,
  canHaveLinkedHomes,
  canHaveLinkedVehicles,
  clientsOf,
  employeesOf,
  familyMembersOf,
  homesOf,
  isGroupStyleProfile,
  isNestableProfileType,
  profileAvatarLabel,
  profileSubtitle,
  profileTypeLabel,
  topLevelProfiles,
  vehiclesOf,
  type GuardianProfile,
} from "@/lib/profiles/types";

const COLLAPSE_KEY = "guardian.profileCollapsed";

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

function NestedMemberRow({
  child,
  activeId,
  busy,
  editing,
  setEditing,
  onSaveEdit,
  onSwitch,
  onSetDefault,
  onRemove,
  dragEnabled,
  onDragStart,
  moveControl,
  onRefresh,
  onAvatarError,
}: {
  child: GuardianProfile;
  activeId?: string;
  busy: boolean;
  editing: GuardianProfile | null;
  setEditing: (p: GuardianProfile | null) => void;
  onSaveEdit: () => void;
  onSwitch: () => void;
  onSetDefault: () => void;
  onRemove: () => void;
  dragEnabled: boolean;
  onDragStart: (e: DragEvent, id: string) => void;
  moveControl: ReactNode;
  onRefresh: () => void | Promise<void>;
  onAvatarError: (message: string) => void;
}) {
  if (editing?.id === child.id) {
    return (
      <li className="rounded-xl bg-stone-50 px-3 py-2">
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
      </li>
    );
  }

  return (
    <li
      draggable={dragEnabled}
      onDragStart={(e) => onDragStart(e, child.id)}
      className={`flex flex-wrap items-start justify-between gap-2 rounded-xl bg-stone-50 px-3 py-2 ${
        dragEnabled ? "cursor-grab active:cursor-grabbing" : ""
      }`}
    >
      <div className="flex min-w-0 items-start gap-2">
        {dragEnabled ? (
          <GripVertical
            className="mt-2 h-3.5 w-3.5 shrink-0 text-ink-muted"
            aria-hidden
          />
        ) : null}
        <ProfileAvatar
          profile={child}
          size="sm"
          editable
          onUpdated={onRefresh}
          onError={onAvatarError}
        />
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {child.display_name}
            {child.is_default ? (
              <span className="ml-2 text-[11px] font-medium text-brand">
                Default
              </span>
            ) : null}
            {activeId === child.id ? (
              <span className="ml-2 text-[11px] font-medium text-ink-muted">
                Active
              </span>
            ) : null}
          </p>
          <p className="text-[11px] text-ink-muted">
            {profileTypeLabel(child.profile_type)}
            {child.job_title ? ` · ${child.job_title}` : ""}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {moveControl}
        {activeId !== child.id && (
          <button
            type="button"
            onClick={onSwitch}
            className="rounded-full border border-stone-300 px-2.5 py-1 text-[11px] font-medium"
          >
            Switch
          </button>
        )}
        {!child.is_default && (
          <button
            type="button"
            disabled={busy}
            onClick={onSetDefault}
            className="rounded-full border border-stone-300 px-2.5 py-1 text-[11px] font-medium"
          >
            Make default
          </button>
        )}
        <button
          type="button"
          onClick={() => setEditing(child)}
          className="rounded-full border border-stone-300 px-2.5 py-1 text-[11px] font-medium"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Delete ${child.display_name}`}
          className="inline-flex items-center gap-1 rounded-full border border-red-200 px-2.5 py-1 text-[11px] font-medium text-red-700 hover:bg-red-50"
        >
          <Trash2 className="h-3 w-3" />
          Delete
        </button>
      </div>
    </li>
  );
}

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
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);

  useEffect(() => {
    setCollapsed(loadCollapsed());
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

  const moveOptionsFor = (child: GuardianProfile) =>
    containers.filter(
      (c) =>
        c.id !== child.id &&
        canAttachChildToParent(child.profile_type, c.profile_type)
    );

  const renderMoveSelect = (child: GuardianProfile) => {
    if (!isNestableProfileType(child.profile_type)) return null;
    const options = moveOptionsFor(child);
    if (options.length === 0 && !child.parent_profile_id) return null;
    return (
      <label className="inline-flex items-center gap-1 text-[11px] text-ink-muted">
        <span className="sr-only">Move under</span>
        <select
          disabled={busy || movingId === child.id}
          value={child.parent_profile_id ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            void (async () => {
              setMovingId(child.id);
              try {
                await onMoveUnder(child.id, v || null);
              } finally {
                setMovingId(null);
              }
            })();
          }}
          className="max-w-[9rem] rounded-full border border-stone-300 bg-white px-2 py-1 text-[11px] font-medium text-foreground"
          aria-label={`Move ${child.display_name} under`}
        >
          <option value="">Top level</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.display_name}
            </option>
          ))}
        </select>
      </label>
    );
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-muted">
        Drag a child, spouse, home, employee, client, or vehicle onto a Family,
        Business, Nonprofit, or Vehicles card — or use Move under. Tap the
        chevron to collapse nested members. Use the camera on a profile to pick an
        avatar or upload a{" "}
        photo or logo.
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
          const nestedClients = canHaveLinkedClients(p.profile_type)
            ? clientsOf(profiles, p.id)
            : [];
          const nestedFamily = canHaveLinkedFamilyMembers(p.profile_type)
            ? familyMembersOf(profiles, p.id)
            : [];
          const nestedHomes = canHaveLinkedHomes(p.profile_type)
            ? homesOf(profiles, p.id)
            : [];
          const nestedVehicles = canHaveLinkedVehicles(p.profile_type)
            ? vehiclesOf(profiles, p.id)
            : [];
          const nested = [
            ...nestedEmployees,
            ...nestedClients,
            ...nestedFamily,
            ...nestedHomes,
            ...nestedVehicles,
          ];
          const isContainer = isGroupStyleProfile(p.profile_type);
          const isCollapsed = Boolean(collapsed[p.id]);
          const canDropHere = isContainer && acceptDrop(p);
          const isDropHighlight = dropTargetId === p.id && canDropHere;
          const nestable = isNestableProfileType(p.profile_type);

          return (
            <li
              key={p.id}
              draggable={nestable}
              onDragStart={
                nestable ? (e) => onDragStart(e, p.id) : undefined
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
              } ${nestable ? "cursor-grab active:cursor-grabbing" : ""}`}
            >
              {editing?.id === p.id ? (
                <div className="space-y-3">
                  <input
                    value={editing.display_name}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        display_name: e.target.value,
                      })
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
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2">
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
                        className="mt-2 rounded-md p-0.5 text-ink-muted hover:bg-stone-100 hover:text-foreground"
                      >
                        <ChevronDown
                          className={`h-4 w-4 transition-transform ${
                            isCollapsed ? "-rotate-90" : ""
                          }`}
                        />
                      </button>
                    ) : nestable ? (
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
                      editable
                      onUpdated={onRefresh}
                      onError={onAvatarError}
                    />
                    <div>
                      <p className="font-semibold">
                        {p.display_name}
                        {p.is_default ? (
                          <span className="ml-2 text-[11px] font-medium text-brand">
                            Default
                          </span>
                        ) : null}
                        {activeId === p.id ? (
                          <span className="ml-2 text-[11px] font-medium text-ink-muted">
                            Active
                          </span>
                        ) : null}
                        {nested.length > 0 ? (
                          <span className="ml-2 text-[11px] font-medium text-ink-muted">
                            {nested.length} nested
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-ink-muted">
                        {profileSubtitle(p)}
                        {" · "}
                        {profileAvatarLabel(p.profile_type)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {renderMoveSelect(p)}
                    {activeId !== p.id && (
                      <button
                        type="button"
                        onClick={() => onSwitch(p.id)}
                        className="rounded-full border border-stone-300 px-3 py-1.5 text-xs font-medium"
                      >
                        Switch
                      </button>
                    )}
                    {!p.is_default && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onSetDefault(p.id)}
                        className="rounded-full border border-stone-300 px-3 py-1.5 text-xs font-medium"
                      >
                        Make default
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setEditing(p)}
                      className="rounded-full border border-stone-300 px-3 py-1.5 text-xs font-medium"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemove(p)}
                      aria-label={`Delete ${p.display_name}`}
                      className="inline-flex items-center gap-1 rounded-full border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-3 w-3" />
                      Delete
                    </button>
                  </div>
                </div>
              )}

              {nested.length > 0 && !isCollapsed ? (
                <ul className="mt-3 space-y-2 border-t border-stone-100 pt-3">
                  {nestedEmployees.length > 0 ? (
                    <li className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                      Employees
                    </li>
                  ) : null}
                  {nestedEmployees.map((child) => (
                    <NestedMemberRow
                      key={child.id}
                      child={child}
                      activeId={activeId}
                      busy={busy}
                      editing={editing}
                      setEditing={setEditing}
                      onSaveEdit={onSaveEdit}
                      onSwitch={() => onSwitch(child.id)}
                      onSetDefault={() => onSetDefault(child.id)}
                      onRemove={() => onRemove(child)}
                      dragEnabled
                      onDragStart={onDragStart}
                      moveControl={renderMoveSelect(child)}
                      onRefresh={onRefresh}
                      onAvatarError={onAvatarError}
                    />
                  ))}
                  {nestedClients.length > 0 ? (
                    <li className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                      Clients
                    </li>
                  ) : null}
                  {nestedClients.map((child) => (
                    <NestedMemberRow
                      key={child.id}
                      child={child}
                      activeId={activeId}
                      busy={busy}
                      editing={editing}
                      setEditing={setEditing}
                      onSaveEdit={onSaveEdit}
                      onSwitch={() => onSwitch(child.id)}
                      onSetDefault={() => onSetDefault(child.id)}
                      onRemove={() => onRemove(child)}
                      dragEnabled
                      onDragStart={onDragStart}
                      moveControl={renderMoveSelect(child)}
                      onRefresh={onRefresh}
                      onAvatarError={onAvatarError}
                    />
                  ))}
                  {nestedFamily.length > 0 ? (
                    <li className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                      Family members
                    </li>
                  ) : null}
                  {nestedFamily.map((child) => (
                    <NestedMemberRow
                      key={child.id}
                      child={child}
                      activeId={activeId}
                      busy={busy}
                      editing={editing}
                      setEditing={setEditing}
                      onSaveEdit={onSaveEdit}
                      onSwitch={() => onSwitch(child.id)}
                      onSetDefault={() => onSetDefault(child.id)}
                      onRemove={() => onRemove(child)}
                      dragEnabled
                      onDragStart={onDragStart}
                      moveControl={renderMoveSelect(child)}
                      onRefresh={onRefresh}
                      onAvatarError={onAvatarError}
                    />
                  ))}
                  {nestedHomes.length > 0 ? (
                    <li className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                      Homes
                    </li>
                  ) : null}
                  {nestedHomes.map((child) => (
                    <NestedMemberRow
                      key={child.id}
                      child={child}
                      activeId={activeId}
                      busy={busy}
                      editing={editing}
                      setEditing={setEditing}
                      onSaveEdit={onSaveEdit}
                      onSwitch={() => onSwitch(child.id)}
                      onSetDefault={() => onSetDefault(child.id)}
                      onRemove={() => onRemove(child)}
                      dragEnabled
                      onDragStart={onDragStart}
                      moveControl={renderMoveSelect(child)}
                      onRefresh={onRefresh}
                      onAvatarError={onAvatarError}
                    />
                  ))}
                  {nestedVehicles.length > 0 ? (
                    <li className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                      Vehicles
                    </li>
                  ) : null}
                  {nestedVehicles.map((child) => (
                    <NestedMemberRow
                      key={child.id}
                      child={child}
                      activeId={activeId}
                      busy={busy}
                      editing={editing}
                      setEditing={setEditing}
                      onSaveEdit={onSaveEdit}
                      onSwitch={() => onSwitch(child.id)}
                      onSetDefault={() => onSetDefault(child.id)}
                      onRemove={() => onRemove(child)}
                      dragEnabled
                      onDragStart={onDragStart}
                      moveControl={renderMoveSelect(child)}
                      onRefresh={onRefresh}
                      onAvatarError={onAvatarError}
                    />
                  ))}
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
