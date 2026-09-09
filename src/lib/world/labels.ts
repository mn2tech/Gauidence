/**
 * Consumer-facing labels for My World (never expose DB terminology).
 */

const TYPE_GROUP: Record<string, "people" | "organizations" | "events" | "things"> = {
  person: "people",
  organization: "organizations",
  agency: "organizations",
  client: "organizations",
  school: "organizations",
  event: "events",
  deadline: "events",
};

export type WorldTabId =
  | "overview"
  | "people"
  | "organizations"
  | "events"
  | "things"
  | "map";

export function worldEntityGroup(
  entityType: string
): "people" | "organizations" | "events" | "things" {
  return TYPE_GROUP[entityType] ?? "things";
}

export function worldEntityTypeLabel(entityType: string): string {
  switch (entityType) {
    case "person":
      return "Person";
    case "organization":
    case "agency":
    case "client":
      return "Organization";
    case "school":
      return "School";
    case "event":
      return "Event";
    case "deadline":
      return "Deadline";
    case "project":
      return "Project";
    case "contract":
      return "Contract";
    case "document":
      return "Document";
    case "place":
    case "location":
      return "Place";
    case "account":
      return "Account";
    case "asset":
      return "Asset";
    case "topic":
      return "Topic";
    default:
      return "Thing";
  }
}

export function worldRelationshipLabel(type: string): string {
  return type.replace(/_/g, " ");
}

export function worldTimelineEntryLabel(entryType: string): string {
  return entryType.replace(/_/g, " ");
}

/** Ask Gideon deep-link with entity as draft context (Sprint 4 wires retrieval). */
export function askAboutWorldEntityHref(args: {
  entityId: string;
  entityName: string;
  spaceId?: string | null;
}): string {
  const draft = `What's going on with ${args.entityName}?`;
  const params = new URLSearchParams();
  params.set("draft", draft);
  params.set("worldEntityId", args.entityId);
  if (args.spaceId) params.set("profileId", args.spaceId);
  return `/ask?${params.toString()}`;
}

export function worldEntityHref(entityId: string): string {
  return `/world/${encodeURIComponent(entityId)}`;
}

export const WORLD_MAP_PATH = "/world/map";
export const WORLD_INBOX_PATH = "/world/inbox";
