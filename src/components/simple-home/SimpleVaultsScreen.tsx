"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useState,
  type DragEvent,
} from "react";
import {
  ChevronDown,
  ChevronRight,
  FolderPlus,
  GripVertical,
  Users,
} from "lucide-react";
import ProfileAvatar from "@/components/ProfileAvatar";
import ProfileSetupHub from "@/components/ProfileSetupHub";
import { useActiveProfile } from "@/components/ProfileProvider";
import { useDesktopDrag } from "@/hooks/useDesktopDrag";
import {
  canAttachChildToParent,
  canHaveLinkedClients,
  canHaveLinkedHobbies,
  canManageProfileAccess,
  clientsOf,
  getContainerLabel,
  isGroupStyleProfile,
  isNestableProfileType,
  nestedUnder,
  profileContainerName,
  SPACES_AND_WORKSPACES_LABEL,
  topLevelProfiles,
  type GuardianProfile,
} from "@/lib/profiles/types";
import { DOCUMENTS_PATH } from "@/lib/routes";

function clientsSectionHref(profileId: string) {
  return `${DOCUMENTS_PATH}&profileId=${profileId}#clients-${profileId}`;
}

function isDropContainer(profile: GuardianProfile): boolean {
  return (
    isGroupStyleProfile(profile.profile_type) ||
    canHaveLinkedHobbies(profile.profile_type)
  );
}

export default function SimpleVaultsScreen() {
  const router = useRouter();
  const desktopDrag = useDesktopDrag();
  const { profiles, active, loading, switchProfile, refresh } =
    useActiveProfile();
  const [expandedParents, setExpandedParents] = useState<Set<string>>(
    () => new Set()
  );
  const [organizeMode, setOrganizeMode] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dragEnabled = organizeMode && desktopDrag;
  const dragged = dragId
    ? profiles.find((p) => p.id === dragId) ?? null
    : null;

  useEffect(() => {
    if (!active?.parent_profile_id) return;
    setExpandedParents((prev) => {
      if (prev.has(active.parent_profile_id!)) return prev;
      const next = new Set(prev);
      next.add(active.parent_profile_id!);
      return next;
    });
  }, [active?.id, active?.parent_profile_id]);

  const toggleParent = (parentId: string) => {
    setExpandedParents((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId);
      else next.add(parentId);
      return next;
    });
  };

  const openSpace = (profileId: string) => {
    if (organizeMode) return;
    void switchProfile(profileId);
    router.push(`${DOCUMENTS_PATH}#documents-${profileId}`);
  };

  const enterOrganizeMode = () => {
    setOrganizeMode(true);
    setError(null);
    setExpandedParents(
      new Set(
        topLevelProfiles(profiles)
          .filter((space) => nestedUnder(profiles, space).length > 0)
          .map((space) => space.id)
      )
    );
  };

  const exitOrganizeMode = () => {
    setOrganizeMode(false);
    endDrag();
  };

  const endDrag = () => {
    setDragId(null);
    setDropTargetId(null);
  };

  const onDragStart = useCallback((e: DragEvent, id: string) => {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
    setDragId(id);
  }, []);

  const acceptDrop = (parent: GuardianProfile) => {
    if (!dragged) return false;
    if (dragged.id === parent.id) return false;
    return canAttachChildToParent(dragged.profile_type, parent.profile_type);
  };

  const moveUnder = async (
    profileId: string,
    parentProfileId: string | null
  ) => {
    setMovingId(profileId);
    setError(null);
    try {
      const res = await fetch(`/api/profiles/${profileId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentProfileId }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Couldn't move space.");
        return;
      }
      await refresh();
      window.dispatchEvent(new CustomEvent("guardian:profile-changed"));
      if (parentProfileId) {
        setExpandedParents((prev) => new Set(prev).add(parentProfileId));
      }
    } finally {
      setMovingId(null);
      endDrag();
    }
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
      await moveUnder(child.id, null);
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
    await moveUnder(child.id, parentId);
  };

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
  const showTopDropZone =
    dragEnabled && Boolean(dragged?.parent_profile_id) && dropTargetId === "__top__";

  return (
    <div className="simple-home-page mx-auto max-w-2xl px-4 py-6 sm:py-8">
      <header className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {SPACES_AND_WORKSPACES_LABEL}
            </h1>
            <p className="mt-1.5 text-sm text-ink-muted">
              {organizeMode
                ? "Drag spaces onto a parent to nest them, or drop on Top level to unnest."
                : "How Guardian has organized your knowledge."}
            </p>
          </div>
          {organizeMode ? (
            <button
              type="button"
              onClick={exitOrganizeMode}
              className="shrink-0 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-stone-50"
            >
              Done
            </button>
          ) : desktopDrag ? (
            <button
              type="button"
              onClick={enterOrganizeMode}
              className="shrink-0 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-stone-50"
            >
              Organize
            </button>
          ) : null}
        </div>
        {!organizeMode ? (
          <Link
            href="/settings/profiles?add=1&return=%2Fvaults"
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark"
          >
            <FolderPlus className="h-4 w-4" aria-hidden />
            New space
          </Link>
        ) : null}
        {error ? (
          <p className="mt-3 text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
        {organizeMode && !desktopDrag ? (
          <p className="mt-3 text-sm text-ink-muted">
            Drag to organize works on larger screens.{" "}
            <Link href="/settings/profiles" className="font-semibold text-brand">
              Manage all spaces
            </Link>{" "}
            for full controls.
          </p>
        ) : null}
      </header>

      {dragEnabled && dragged?.parent_profile_id ? (
        <div
          className={`mb-3 rounded-xl border-2 border-dashed px-4 py-3 text-center text-sm transition ${
            showTopDropZone
              ? "border-brand bg-brand-light/40 text-brand-dark"
              : "border-stone-300 text-ink-muted"
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
          Drop here to move to top level
        </div>
      ) : null}

      <ul
        className="space-y-3"
        onDragEnd={endDrag}
        onDragOver={(e) => {
          if (!dragEnabled || !dragged?.parent_profile_id) return;
          e.preventDefault();
          setDropTargetId("__top__");
        }}
      >
        {topLevel.map((space) => {
          const children = nestedUnder(profiles, space);
          const showClientsLink =
            !organizeMode &&
            canHaveLinkedClients(space.profile_type) &&
            canManageProfileAccess(space);
          const clientCount = showClientsLink
            ? clientsOf(profiles, space.id).length
            : 0;
          const nestedChildren = showClientsLink
            ? children.filter((child) => child.profile_type !== "client")
            : children;
          const hasSubItems = showClientsLink || nestedChildren.length > 0;
          const expanded =
            organizeMode && hasSubItems
              ? true
              : !hasSubItems || expandedParents.has(space.id);
          const subItemCount =
            nestedChildren.length + (showClientsLink ? clientCount : 0);
          const canDropHere =
            dragEnabled && isDropContainer(space) && acceptDrop(space);
          const isDropHighlight = dropTargetId === space.id && canDropHere;
          const spaceNestable = isNestableProfileType(space.profile_type);
          const spaceMoving = movingId === space.id;

          return (
            <li
              key={space.id}
              className={`simple-home-card overflow-hidden transition ${
                isDropHighlight ? "ring-2 ring-brand/40" : ""
              } ${spaceMoving ? "opacity-60" : ""}`}
              onDragOver={
                canDropHere
                  ? (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDropTargetId(space.id);
                    }
                  : undefined
              }
              onDragLeave={
                canDropHere
                  ? (e) => {
                      if (e.currentTarget.contains(e.relatedTarget as Node)) {
                        return;
                      }
                      if (dropTargetId === space.id) setDropTargetId(null);
                    }
                  : undefined
              }
              onDrop={
                canDropHere
                  ? (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void handleDropOn(space.id);
                    }
                  : undefined
              }
            >
              <div className="flex items-stretch">
                {dragEnabled && spaceNestable ? (
                  <span
                    draggable={!spaceMoving}
                    onDragStart={(e) => onDragStart(e, space.id)}
                    className="flex shrink-0 cursor-grab items-center self-stretch px-2 text-ink-muted active:cursor-grabbing"
                    aria-label={`Drag ${profileContainerName(space)}`}
                  >
                    <GripVertical className="h-4 w-4" aria-hidden />
                  </span>
                ) : null}
                {hasSubItems && !organizeMode ? (
                  <button
                    type="button"
                    onClick={() => toggleParent(space.id)}
                    aria-expanded={expanded}
                    aria-label={`${expanded ? "Collapse" : "Expand"} ${profileContainerName(space)}`}
                    className="flex shrink-0 items-center self-stretch rounded-l-xl px-3 text-ink-muted transition hover:bg-brand-light/30"
                  >
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${
                        expanded ? "" : "-rotate-90"
                      }`}
                      aria-hidden
                    />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => openSpace(space.id)}
                  disabled={organizeMode}
                  className={`flex min-w-0 flex-1 items-center gap-3 py-4 text-left transition ${
                    organizeMode
                      ? "cursor-default opacity-90"
                      : "hover:bg-brand-light/30"
                  } ${
                    hasSubItems && !organizeMode ? "pr-4 pl-1" : "px-4"
                  } ${dragEnabled && spaceNestable ? "pl-1" : ""}`}
                >
                  <ProfileAvatar profile={space} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-foreground">
                      {profileContainerName(space)}
                    </span>
                    <span className="block truncate text-sm text-ink-muted">
                      {getContainerLabel(space.profile_type)}
                      {hasSubItems && !expanded && subItemCount > 0
                        ? ` · ${subItemCount} nested`
                        : ""}
                      {canDropHere && dragged
                        ? ` · Drop to nest under ${profileContainerName(space)}`
                        : ""}
                    </span>
                  </span>
                </button>
              </div>

              {expanded && showClientsLink ? (
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

              {expanded && nestedChildren.length > 0 ? (
                <ul className="border-t border-border-subtle px-2 pb-2">
                  {nestedChildren.map((child) => {
                    const childNestable = isNestableProfileType(
                      child.profile_type
                    );
                    const childMoving = movingId === child.id;
                    return (
                      <li
                        key={child.id}
                        className={childMoving ? "opacity-60" : undefined}
                      >
                        <div className="flex items-center gap-1 rounded-xl px-1 py-1 transition hover:bg-brand-light/35">
                          {dragEnabled && childNestable ? (
                            <span
                              draggable={!childMoving}
                              onDragStart={(e) => onDragStart(e, child.id)}
                              className="flex shrink-0 cursor-grab items-center px-1 text-ink-muted active:cursor-grabbing"
                              aria-label={`Drag ${child.display_name}`}
                            >
                              <GripVertical className="h-3.5 w-3.5" aria-hidden />
                            </span>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => openSpace(child.id)}
                            disabled={organizeMode}
                            className={`flex min-w-0 flex-1 items-center gap-3 px-2 py-2 text-left text-sm ${
                              organizeMode ? "cursor-default" : ""
                            }`}
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
                          {!organizeMode &&
                          child.profile_type === "client" &&
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
                    );
                  })}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>

      {!organizeMode ? (
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
      ) : null}
    </div>
  );
}
