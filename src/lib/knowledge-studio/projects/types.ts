/** Org-agnostic Knowledge Project types (MCPS first implementation). */

export const KNOWLEDGE_PROJECT_TYPES = [
  "school_district",
  "school",
  "organization",
  "business",
  "community",
  "nonprofit",
  "government",
] as const;

export type KnowledgeProjectType = (typeof KNOWLEDGE_PROJECT_TYPES)[number];

export const KNOWLEDGE_SCOPES = [
  "district",
  "school",
  "grade_level",
  "department",
  "program",
] as const;

export type KnowledgeScope = (typeof KNOWLEDGE_SCOPES)[number];

export const REFRESH_FREQUENCIES = [
  "manual",
  "daily",
  "weekly",
  "monthly",
] as const;

export type RefreshFrequency = (typeof REFRESH_FREQUENCIES)[number];

export const SOURCE_STATUSES = [
  "draft",
  "fetching",
  "needs_review",
  "published",
  "failed",
  "archived",
] as const;

export type SourceStatus = (typeof SOURCE_STATUSES)[number];

export const SOURCE_VERSION_STATUSES = [
  "draft",
  "needs_review",
  "published",
  "archived",
  "failed",
] as const;

export type SourceVersionStatus = (typeof SOURCE_VERSION_STATUSES)[number];

export const KNOWLEDGE_ITEM_STATUSES = [
  "draft",
  "needs_review",
  "approved",
  "published",
  "rejected",
  "archived",
] as const;

export type KnowledgeItemStatus = (typeof KNOWLEDGE_ITEM_STATUSES)[number];

export type KnowledgeProjectRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  authority_default: string | null;
  disclaimer: string | null;
  project_type: KnowledgeProjectType | string;
  created_at: string;
  updated_at: string;
};

export type KnowledgeProjectCategoryRow = {
  id: string;
  project_id: string;
  slug: string;
  name: string;
  description: string | null;
  sort_order: number;
  created_at: string;
};

export type KnowledgeSourceRow = {
  id: string;
  project_id: string;
  category_id: string | null;
  source_name: string;
  source_url: string;
  category: string;
  authority: string;
  scope: KnowledgeScope | string;
  school: string | null;
  grade_level: string | null;
  notes: string | null;
  effective_date: string | null;
  expires_at: string | null;
  refresh_frequency: RefreshFrequency | string;
  last_checked_at: string | null;
  last_successful_fetch_at: string | null;
  content_hash: string | null;
  status: SourceStatus | string;
  current_version_id: string | null;
  published_version_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type KnowledgeSourceVersionRow = {
  id: string;
  source_id: string;
  version_number: number;
  content_hash: string;
  extracted_text: string;
  status: SourceVersionStatus | string;
  change_summary: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  published_at: string | null;
  created_at: string;
};

export type KnowledgeItemRow = {
  id: string;
  project_id: string;
  source_id: string;
  version_id: string | null;
  title: string;
  content: string;
  category: string;
  subcategory: string | null;
  school: string | null;
  grade_level: string | null;
  authority: string | null;
  effective_date: string | null;
  expires_at: string | null;
  source_url: string | null;
  evidence_text: string;
  status: KnowledgeItemStatus | string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ExtractedKnowledgeItem = {
  title: string;
  content: string;
  category: string;
  subcategory: string;
  school: string;
  grade_level: string;
  evidence_text: string;
};

export type CategoryDashboardStats = {
  slug: string;
  name: string;
  sources: number;
  published: number;
  needs_review: number;
};

export type ProjectDashboardStats = {
  sources: number;
  published: number;
  needs_review: number;
  failed: number;
  last_refresh: string | null;
  categories: CategoryDashboardStats[];
};

export type RetrievalHit = {
  item: KnowledgeItemRow;
  source_name: string;
  relevance: number;
  publication_status: string;
};

export type AddSourceInput = {
  source_name: string;
  source_url: string;
  category: string;
  authority?: string;
  scope: KnowledgeScope | string;
  school?: string | null;
  grade_level?: string | null;
  notes?: string | null;
  effective_date?: string | null;
  expires_at?: string | null;
  refresh_frequency?: RefreshFrequency | string;
};
