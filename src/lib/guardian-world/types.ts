/**
 * My World — friendly context cards over Spaces (guardian_profiles).
 * No new space table; aggregation only.
 */

export type WorldSpaceStats = {
  /** Active guardian_items in this context (+ nested). */
  itemCount: number;
  openActionCount: number;
  upcomingDeadlineCount: number;
  documentCount: number;
  logCount: number;
  linkedPeopleCount: number;
  recentActivityTitle: string | null;
  recentActivityAt: string | null;
  lastUpdatedAt: string | null;
};

export type WorldCardInput = {
  spaceId: string;
  name: string;
  description: string | null;
  profileType: string;
  typeLabel: string;
  /** Nested people/space names for optional display. */
  peoplePreview: string[];
  updatedAt: string | null;
  stats: WorldSpaceStats;
};

export type WorldCard = WorldCardInput & {
  /** One short line for the card body. */
  summaryLine: string;
};

export type SpaceActivityRow = {
  spaceId: string;
  title: string;
  at: string;
};

export type SpaceItemRow = {
  spaceId: string;
  title: string;
  status: string;
  requiresAction: boolean;
  dueAt: string | null;
  eventDate: string | null;
  type: string;
  updatedAt: string;
};

export type SpaceCountRow = {
  spaceId: string;
  count: number;
};
