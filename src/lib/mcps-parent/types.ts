export type ParentSchoolContext = {
  id: string;
  user_id: string;
  /** Optional friendly label (Child 1, Matthew). Not required. */
  label: string | null;
  school_name: string;
  school_id: string | null;
  grade_level: string;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
};

/** Temporary UI view — does not change which context is primary. */
export type ParentActiveView = "all" | string;

export type ParentReminderStatus = "active" | "completed" | "dismissed";

export type ParentKnowledgeReminder = {
  id: string;
  user_id: string;
  knowledge_item_id: string | null;
  parent_school_context_id?: string | null;
  title: string;
  reminder_date: string;
  event_date: string | null;
  status: ParentReminderStatus;
  created_at: string;
};

export type RelevanceReason =
  | "Applies to your school"
  | "District-wide"
  | "Applies to your grade"
  | "Coming up this week"
  | "Coming up soon"
  | "Parent action required"
  | "No school / closure"
  | "Early release"
  | "Transportation"
  | "Deadline";

export type ScoredParentItem = {
  id: string;
  title: string;
  summary: string;
  category: string;
  school: string | null;
  grade_level: string | null;
  authority: string | null;
  source_url: string | null;
  source_name: string;
  event_date: string | null;
  effective_date: string | null;
  expires_at: string | null;
  last_checked_at: string | null;
  score: number;
  reasons: RelevanceReason[];
  importance_tags: string[];
  stale: boolean;
  /** Which parent contexts this card applies to (family merge). */
  applies_to_context_ids?: string[];
  district_wide?: boolean;
  /** Human labels for "Applies to" / "For" (never expose raw IDs). */
  applies_to_labels?: string[];
};

export type ComingUpGroup = {
  label: "This Week" | "Next Week" | "Later";
  items: ScoredParentItem[];
};

export type ParentDashboardPayload = {
  /** @deprecated Prefer primary_context; kept for one-school clients. */
  context: ParentSchoolContext | null;
  primary_context: ParentSchoolContext | null;
  contexts: ParentSchoolContext[];
  active_view: ParentActiveView;
  greeting: string;
  state: "needs_setup" | "caught_up" | "has_items";
  what_you_need: ScoredParentItem[];
  coming_up: ComingUpGroup[];
  suggested_questions: string[];
  max_contexts: number;
};

export type ParentIntelligenceDebugItem = ScoredParentItem & {
  publication_status: string;
};
