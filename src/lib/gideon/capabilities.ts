import type { GideonRoute } from "./intent";

/** Which Guardian context blocks to load for this turn. */
export type GideonLoadFlags = {
  documents: boolean;
  logs: boolean;
  schedule: boolean;
  workMemory: boolean;
  vaultMap: boolean;
  clientRequests: boolean;
  proposals: boolean;
  linkedProfiles: boolean;
};

export const GIDEON_LOAD_NONE: GideonLoadFlags = {
  documents: false,
  logs: false,
  schedule: false,
  workMemory: false,
  vaultMap: false,
  clientRequests: false,
  proposals: false,
  linkedProfiles: false,
};

export const GIDEON_LOAD_FULL: GideonLoadFlags = {
  documents: true,
  logs: true,
  schedule: true,
  workMemory: true,
  vaultMap: true,
  clientRequests: true,
  proposals: true,
  linkedProfiles: true,
};

/**
 * Map a routed intent to load flags.
 * Document RAG / ontology only when guardianKnowledge is on.
 * Chief of Staff may use work memory + Guardian reminders without searching files.
 */
export function loadFlagsForRoute(gideonRoute: GideonRoute): GideonLoadFlags {
  const knowledge = gideonRoute.capabilities.guardianKnowledge;
  const cos = gideonRoute.capabilities.chiefOfStaff;
  const calendar = gideonRoute.capabilities.calendar;
  const task = gideonRoute.capabilities.task;
  const combined = gideonRoute.intent === "combined";

  return {
    documents: knowledge,
    logs: knowledge,
    schedule: knowledge || calendar || task || cos,
    workMemory: knowledge || cos || combined,
    vaultMap: knowledge,
    clientRequests: knowledge,
    proposals: knowledge,
    linkedProfiles: knowledge,
  };
}
