export type ParentSchoolContext = {
  id: string;
  user_id: string;
  school_name: string;
  school_id: string | null;
  grade_level: string;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
};

export type ParentReminderStatus = "active" | "completed" | "dismissed";

export type ParentKnowledgeReminder = {
  id: string;
  user_id: string;
  knowledge_item_id: string | null;
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
};

export type ComingUpGroup = {
  label: "This Week" | "Next Week" | "Later";
  items: ScoredParentItem[];
};

export type ParentDashboardPayload = {
  context: ParentSchoolContext | null;
  greeting: string;
  state: "needs_setup" | "caught_up" | "has_items";
  what_you_need: ScoredParentItem[];
  coming_up: ComingUpGroup[];
  suggested_questions: string[];
};

export type ParentIntelligenceDebugItem = ScoredParentItem & {
  publication_status: string;
};
