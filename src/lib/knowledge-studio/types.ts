/** Shared Knowledge Studio types — org-agnostic for future clients. */

export const KNOWLEDGE_LIFECYCLES = [
  "draft",
  "needs_review",
  "approved",
  "published",
  "archived",
] as const;

export type KnowledgeLifecycle = (typeof KNOWLEDGE_LIFECYCLES)[number];

export const KNOWLEDGE_VISIBILITIES = ["private", "members", "public"] as const;
export type KnowledgeVisibility = (typeof KNOWLEDGE_VISIBILITIES)[number];

export const FACT_CATEGORIES = [
  "organization",
  "program",
  "contact",
  "purpose",
  "registration",
  "hospitality",
  "speaker",
  "other",
  "general",
] as const;

export type FactCategory = (typeof FACT_CATEGORIES)[number];

export type KnowledgeFactRow = {
  id: string;
  organization_slug: string;
  category: string;
  title: string;
  content: string;
  source_label: string | null;
  source_url: string | null;
  lifecycle_status: KnowledgeLifecycle;
  visibility: KnowledgeVisibility;
  published_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type KnowledgeEventRow = {
  id: string;
  organization_slug: string;
  title: string;
  description: string | null;
  start_at: string | null;
  end_at: string | null;
  location: string | null;
  organizer: string | null;
  contact: string | null;
  rsvp_url: string | null;
  cost: string | null;
  audience: string | null;
  source_label: string | null;
  source_url: string | null;
  lifecycle_status: KnowledgeLifecycle;
  visibility: KnowledgeVisibility;
  published_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ExtractedFact = {
  category: string;
  title: string;
  content: string;
  source_url: string;
};

export type ExtractedEvent = {
  title: string;
  description: string;
  start_at: string | null;
  end_at: string | null;
  location: string;
  organizer: string;
  contact: string;
  rsvp_url: string;
  cost: string;
  audience: string;
  source_url: string;
};

export type WebsiteScanExtraction = {
  facts: ExtractedFact[];
  events: ExtractedEvent[];
};

export type WebsiteScanSaveResult = {
  facts_found: number;
  facts_created: number;
  events_found: number;
  events_created: number;
  skipped_duplicates: number;
};
