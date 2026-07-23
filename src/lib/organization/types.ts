/** AI Auto-Organization shared types. */

export const AUTO_ORGANIZE_MODES = ["off", "suggest", "auto"] as const;
export type AutoOrganizeMode = (typeof AUTO_ORGANIZE_MODES)[number];

export const ORGANIZATION_STATUSES = [
  "pending",
  "accepted",
  "rejected",
  "modified",
  "expired",
] as const;
export type OrganizationStatus = (typeof ORGANIZATION_STATUSES)[number];

export const RECOMMENDED_ACTIONS = [
  "save_to_existing",
  "create_vault",
  "create_profile_and_vault",
  "keep_current",
  "unorganized",
] as const;
export type RecommendedAction = (typeof RECOMMENDED_ACTIONS)[number];

/** Validated AI structured output for organization. */
export type OrganizationAiOutput = {
  title: string;
  document_type: string;
  summary: string;
  people: string[];
  organizations: string[];
  topics: string[];
  dates: string[];
  tags: string[];
  suggested_profile_name: string;
  suggested_vault_name: string;
  confidence: number;
  reason: string;
  suggested_questions: string[];
};

export type OrganizationMatchResult = {
  recommendedAction: RecommendedAction;
  suggestedProfileId: string | null;
  suggestedProfileName: string;
  suggestedVaultId: string | null;
  suggestedVaultName: string;
  confidence: number;
  reason: string;
  containerProfileId: string | null;
};

export type OrganizationSuggestionRow = {
  id: string;
  user_id: string;
  document_id: string;
  current_profile_id: string | null;
  current_vault_id: string | null;
  suggested_profile_id: string | null;
  suggested_profile_name: string | null;
  suggested_vault_id: string | null;
  suggested_vault_name: string | null;
  document_type: string | null;
  reason: string | null;
  confidence: number;
  detected_entities: Record<string, unknown>;
  suggested_tags: string[];
  recommended_action: RecommendedAction;
  status: OrganizationStatus;
  accepted_action: string | null;
  previous_profile_id: string | null;
  previous_vault_id: string | null;
  created_profile_id: string | null;
  created_vault_id: string | null;
  duplicate_warning: string | null;
  created_at: string;
  resolved_at: string | null;
};

export type OrganizationSuggestionPayload = {
  id: string;
  documentId: string;
  headline: string;
  recommendedAction: RecommendedAction;
  profileName: string | null;
  vaultName: string | null;
  profilePath: string | null;
  detected: string[];
  tags: string[];
  reason: string;
  confidence: number;
  showConfidence: boolean;
  duplicateWarning: string | null;
  status: OrganizationStatus;
  autoApplied: boolean;
  previousProfileId: string | null;
  suggestedProfileId: string | null;
  suggestedVaultId: string | null;
};

export type ResolveOrganizationAction =
  | "accept"
  | "reject"
  | "keep_current"
  | "keep_unorganized"
  | "create_suggested"
  | "undo";
