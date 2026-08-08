/**
 * User-facing Space / Workspace terminology.
 * Internal DB concepts (vault, vault_id) stay unchanged.
 */

import type { GuardianProfile, GuardianProfileType } from "./types";

export type ContainerKind = "space" | "workspace";

function isWorkspaceType(profileType: GuardianProfileType): boolean {
  return profileType === "business" || profileType === "non_profit";
}

function isSharedProfile(
  profile: Pick<GuardianProfile, "access_role">
): boolean {
  return profile.access_role === "editor" || profile.access_role === "viewer";
}

/** Business / Organization / Nonprofit → Workspace; everything else → Space. */
export function getContainerLabel(
  profileType: GuardianProfileType
): "Space" | "Workspace" {
  return isWorkspaceType(profileType) ? "Workspace" : "Space";
}

export function getContainerLabelPlural(
  profileType: GuardianProfileType
): "Spaces" | "Workspaces" {
  return isWorkspaceType(profileType) ? "Workspaces" : "Spaces";
}

/** Primary nav label when a user may have both Spaces and Workspaces. */
export const SPACES_NAV_LABEL = "Spaces";

/** Mixed list heading (home, settings). */
export const SPACES_AND_WORKSPACES_LABEL = "Spaces & Workspaces";

/** Map title for a single business/org context. */
export function spaceMapTitle(profileType?: GuardianProfileType | null): string {
  if (profileType && isWorkspaceType(profileType)) return "Workspace Map";
  return "Space Map";
}

function sharedSuffix(profile: Pick<GuardianProfile, "access_role">): string {
  if (!isSharedProfile(profile)) return "";
  return profile.access_role === "viewer" ? " (shared, view only)" : " (shared)";
}

/** Full user-facing container name, e.g. "Toyota Highlander Space" or "NM2TECH Workspace". */
export function profileContainerName(
  profile: Pick<GuardianProfile, "display_name" | "profile_type" | "access_role">
): string {
  const name = profile.display_name.trim() || "Profile";
  return `${name} ${getContainerLabel(profile.profile_type)}${sharedSuffix(profile)}`;
}

/** @deprecated Use profileContainerName — kept for internal call sites migrating gradually. */
export function vaultLabel(profile: GuardianProfile): string {
  return profileContainerName(profile);
}

export function askGideonContextLabel(profile: GuardianProfile): string {
  const name = profile.display_name.trim() || "this space";
  const kind = getContainerLabel(profile.profile_type).toLowerCase();
  return `Ask Gideon about ${name} ${kind}`;
}

/** Creation wizard card labels with Space / Workspace language. */
export const SPACE_CREATE_OPTIONS = [
  { id: "personal", label: "Personal Space", emoji: "👤", group: "other" as const, optionId: "myself" },
  { id: "family", label: "Family Space", emoji: "👨‍👩‍👧", group: "family" as const, optionId: "my_family" },
  { id: "business", label: "Business Workspace", emoji: "💼", group: "business" as const, optionId: "business" },
  { id: "client", label: "Client Space", emoji: "🤝", group: "business" as const, optionId: "client" },
  { id: "nonprofit", label: "Nonprofit Workspace", emoji: "💚", group: "business" as const, optionId: "nonprofit" },
  { id: "project", label: "Project Space", emoji: "📁", group: "other" as const, optionId: "other" },
  { id: "learning", label: "Learning Space", emoji: "📚", group: "other" as const, optionId: "hobby" },
  { id: "other", label: "Other", emoji: "⚙️", group: "other" as const, optionId: "other" },
] as const;

export type SpaceCreateOption = (typeof SPACE_CREATE_OPTIONS)[number];

export function spaceCreateHref(
  card: SpaceCreateOption,
  returnTo = "/home"
): string {
  const params = new URLSearchParams({
    add: "1",
    group: card.group,
    return: returnTo,
  });
  if (card.optionId) params.set("option", card.optionId);
  return `/settings/profiles?${params.toString()}`;
}
