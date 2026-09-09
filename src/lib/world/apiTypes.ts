/**
 * Shared My World API types (safe for client components).
 */

export type WorldCounts = {
  people: number;
  organizations: number;
  events: number;
  things: number;
  needingAttention: number;
  inboxPending: number;
};

export type WorldEntitySummary = {
  id: string;
  name: string;
  type: string;
  typeLabel: string;
  group: "people" | "organizations" | "events" | "things";
  description: string | null;
  importance: number | null;
  lastSeenAt: string | null;
};

export type WorldAttentionItem = {
  id: string;
  title: string;
  description: string | null;
  dueAt: string | null;
  eventDate: string | null;
  priority: string;
  spaceId: string;
  entityIds: string[];
  actionLabel: string | null;
};

export type WorldOverview = {
  counts: WorldCounts;
  important: WorldEntitySummary[];
  recentChanges: Array<{
    id: string;
    title: string;
    summary: string | null;
    occurredAt: string;
    entryType: string;
    entityId: string | null;
  }>;
  upcomingEvents: WorldEntitySummary[];
  needingAttention: WorldAttentionItem[];
  inboxPendingCount: number;
};

export type WorldEntityDetail = {
  entity: WorldEntitySummary;
  description: string | null;
  aliases: string[];
  attributes: Record<string, unknown>;
  relationshipToUser: string | null;
  relatedPeople: WorldEntitySummary[];
  relatedOrganizations: WorldEntitySummary[];
  relationships: Array<{
    id: string;
    type: string;
    typeLabel: string;
    direction: "from" | "to";
    other: WorldEntitySummary;
  }>;
  facts: Array<{
    id: string;
    predicate: string;
    valueText: string | null;
    valueNumber: number | null;
    valueDate: string | null;
    confidence: number | null;
  }>;
  evidence: Array<{
    id: string;
    sourceType: string;
    sourceTitle: string | null;
    sourceExcerpt: string | null;
    spaceId: string | null;
    createdAt: string;
  }>;
  timeline: WorldOverview["recentChanges"];
  attention: WorldAttentionItem[];
  primarySpaceId: string | null;
};
