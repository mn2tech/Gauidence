import "server-only";

export type {
  RetrievalScope,
  WorkspaceContextBlocks,
  WorkspaceContextData,
  WorkspaceContextMeta,
  WorkspacePromptOptions,
} from "./types";

export { suggestionKindFrom } from "./suggestionKind";
export { loadLinkedOrgContext } from "./linkedProfiles";
export { resolveWorkspaceScopes, askGideonScopeMeta } from "./scopes";
export {
  loadWorkspaceContext,
  type LoadWorkspaceContextArgs,
  type WorkspaceContextResult,
} from "./buildContext";
export {
  buildGideonSystemPrompt,
  gideonMaxTokens,
} from "./formatSystemPrompt";

export {
  buildWorkingInDisplay,
  profileIdsForSearchScope,
  searchScopeLabel,
  formatSearchConfidence,
  SEARCH_SCOPE_MODES,
  type SearchScopeMode,
  type WorkingInDisplay,
} from "./searchScope";
