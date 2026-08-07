import type { GuardianProfile, GuardianProfileType } from "@/lib/profiles/types";
import type { SuggestionProfileKind } from "@/lib/vault/gideon";
import type { SearchScopeMode } from "./searchScope";

/** A vault/profile in the current search scope. */
export type RetrievalScope = {
  id: string;
  display_name: string;
  profile_type?: GuardianProfileType;
};

/** Resolved workspace state for Gideon and the Action Engine. */
export type WorkspaceContextMeta = {
  activeProfile: Pick<
    GuardianProfile,
    "id" | "display_name" | "profile_type" | "parent_profile_id"
  >;
  retrievalScopes: RetrievalScope[];
  accessibleProfiles: GuardianProfile[];
  profileNames: Record<string, string>;
  searchProfileIds: string[];
  chatHomeProfileId: string;
  chatScopedProfileId: string | null;
  searchScope: SearchScopeMode;
  scopedProfile: GuardianProfile | null;
  profileKind: SuggestionProfileKind;
  chatContextLabel: string;
  vaultScopeNote: string;
};

/** Formatted context blocks injected into Gideon's system prompt. */
export type WorkspaceContextBlocks = {
  excerpts: string;
  fileInventory: string;
  attachedDocument: string;
  dailyLogs: string;
  clientRequests: string;
  proposals: string;
  schedule: string;
  linkedProfiles: string;
  vaultMap: string;
  workMemory: string;
  structuredKnowledge: string;
};

/** Options that modify how the system prompt is assembled. */
export type WorkspacePromptOptions = {
  timeZone: string;
  showPictures: boolean;
  reminderAgent: boolean;
  dailyLogCaptureAgent: boolean;
  workMemoryUpdateAgent: boolean;
  clientRequestReplyAgent: boolean;
  clientRequestCreateAgent: boolean;
  transcriptionMode: boolean;
  hasAttachedDocument: boolean;
  allVaultsNote: string;
  vaultEmptyNote: string;
  focusedWorkMemory: boolean;
  agentMode: boolean;
  fullLogQuote: boolean;
};

export type WorkspaceContextData = WorkspaceContextMeta & {
  blocks: WorkspaceContextBlocks;
  promptOptions: WorkspacePromptOptions;
};
