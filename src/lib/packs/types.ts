/** Guardian Pack Engine types. */

export type PackStatus = "available" | "deprecated" | "hidden";
export type PackVersionStatus = "draft" | "published" | "retired";
export type ProfilePackStatus = "installed" | "disabled" | "uninstalling";

export type PackRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  status: PackStatus;
  pack_number: number | null;
  created_at: string;
  updated_at: string;
};

export type PackVersionRow = {
  id: string;
  pack_id: string;
  version: string;
  changelog: string;
  status: PackVersionStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PackEntityTypeRow = {
  id: string;
  pack_version_id: string;
  key: string;
  label: string;
  description: string;
  sort_order: number;
};

export type PackRelationshipTypeRow = {
  id: string;
  pack_version_id: string;
  key: string;
  label: string;
  description: string;
  source_entity_type: string;
  target_entity_type: string;
  sort_order: number;
};

export type PackSpaceRow = {
  id: string;
  pack_version_id: string;
  key: string;
  display_name: string;
  description: string;
  profile_type: string;
  default_selected: boolean;
  sort_order: number;
};

export type PackGideonSkillRow = {
  id: string;
  pack_version_id: string;
  key: string;
  name: string;
  description: string;
  prompt_addon: string;
  sort_order: number;
};

export type PackRuleRow = {
  id: string;
  pack_version_id: string;
  key: string;
  rule_type: string;
  definition: Record<string, unknown>;
  sort_order: number;
};

export type PackStarterQuestionRow = {
  id: string;
  pack_version_id: string;
  question: string;
  skill_key: string | null;
  sort_order: number;
};

export type PackDashboardCard = {
  key: string;
  title: string;
  entityTypes?: string[];
  source?: string;
  empty: string;
};

export type PackDashboardConfigRow = {
  id: string;
  pack_version_id: string;
  cards: PackDashboardCard[];
  updated_at: string;
};

export type ProfilePackRow = {
  id: string;
  profile_id: string;
  pack_id: string;
  pack_version_id: string;
  status: ProfilePackStatus;
  installed_at: string;
  installed_by: string | null;
  updated_at: string;
  configuration: ProfilePackConfiguration;
};

export type ProfilePackConfiguration = {
  selectedSpaceKeys?: string[];
  analyzedAt?: string | null;
  lastAnalyzeSelection?: AnalyzeKnowledgeSelection | null;
  lastAnalyzeDocumentIds?: string[];
  [key: string]: unknown;
};

export type AnalyzeKnowledgeSelection = {
  spaceIds?: string[];
  documentIds?: string[];
  sourceItemIds?: string[];
  proposalIds?: string[];
  includeAllDocuments?: boolean;
  includeAllProposals?: boolean;
};

export type ProfilePackSpaceRow = {
  id: string;
  profile_pack_id: string;
  pack_space_key: string;
  space_profile_id: string;
  created_new: boolean;
  created_at: string;
};

export type PackDefinition = {
  pack: PackRow;
  version: PackVersionRow;
  entityTypes: PackEntityTypeRow[];
  relationshipTypes: PackRelationshipTypeRow[];
  spaces: PackSpaceRow[];
  gideonSkills: PackGideonSkillRow[];
  rules: PackRuleRow[];
  starterQuestions: PackStarterQuestionRow[];
  dashboard: PackDashboardConfigRow | null;
};

export type PackListItem = {
  pack: PackRow;
  latestVersion: PackVersionRow | null;
  installation: ProfilePackRow | null;
};

export type InstallPackInput = {
  profileId: string;
  packSlug: string;
  selectedSpaceKeys: string[];
  installedBy: string;
};

export type InstallPackResult = {
  profilePack: ProfilePackRow;
  spaces: Array<{
    key: string;
    spaceProfileId: string;
    displayName: string;
    createdNew: boolean;
    reused: boolean;
  }>;
  alreadyInstalled: boolean;
};

export type DashboardCardData = {
  key: string;
  title: string;
  count: number | null;
  items: Array<{
    id: string;
    label: string;
    href?: string;
    /** Secondary line (status, date, etc.). */
    meta?: string;
  }>;
  empty: string;
  detail?: string;
  /** Highlight cards that need action. */
  tone?: "neutral" | "attention";
  askQuestion?: string;
  askHref?: string;
};

export const GUARDIAN_BUSINESS_PACK_SLUG = "guardian-business";
export const GUARDIAN_BUSINESS_PACK_VERSION = "1.0.0";
