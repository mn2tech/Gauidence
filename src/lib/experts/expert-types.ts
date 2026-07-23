import type {
  ExpertStatus,
  ExpertCategory,
  ModuleStatus,
  ExpertCapability,
  ExpertRoadmapModule,
  ExpertKnowledgeTopic,
  ExpertGlossaryItem,
  ExpertQuiz,
  ExpertQuizQuestion,
  ExpertScenario,
  ExpertInterviewQuestion,
  ExpertDefinition,
  ExpertCatalogItem,
  ExpertCatalog,
} from "./expert-schema";

export type {
  ExpertStatus,
  ExpertCategory,
  ModuleStatus,
  ExpertCapability,
  ExpertRoadmapModule,
  ExpertKnowledgeTopic,
  ExpertGlossaryItem,
  ExpertQuiz,
  ExpertQuizQuestion,
  ExpertScenario,
  ExpertInterviewQuestion,
  ExpertDefinition,
  ExpertCatalogItem,
  ExpertCatalog,
};

export type ExpertCatalogEntry = ExpertCatalogItem & {
  validationError?: string;
  effectiveStatus: ExpertStatus;
};

export type ExpertPublicView = Omit<ExpertDefinition, "systemPrompt">;

export type ExpertDashboardView = ExpertPublicView & {
  userExpertId: string;
  profileId: string;
  expertVersion: string;
  installedAt: string;
  lastOpenedAt: string | null;
};

export type ExpertModuleProgressStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "skipped";

export type ExpertModuleProgress = {
  id: string;
  user_expert_id: string;
  module_id: string;
  status: ExpertModuleProgressStatus;
  progress_percent: number;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
};

export type UserExpert = {
  id: string;
  user_id: string;
  profile_id: string;
  expert_id: string;
  expert_version: string;
  status: string;
  installed_at: string;
  last_opened_at: string | null;
  preferences: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ExpertQuizAttempt = {
  id: string;
  user_expert_id: string;
  quiz_id: string;
  score: number;
  correct_answers: number;
  total_questions: number;
  answers: unknown[];
  completed_at: string;
};

export type ExpertScenarioAttempt = {
  id: string;
  user_expert_id: string;
  scenario_id: string;
  selected_choice_index: number | null;
  was_correct: boolean | null;
  completed_at: string;
};

export type ExpertInterviewSession = {
  id: string;
  user_expert_id: string;
  status: string;
  question_ids: string[];
  responses: unknown[];
  feedback: Record<string, unknown>;
  started_at: string;
  completed_at: string | null;
};

export type ExpertActivityType =
  | "expert_installed"
  | "expert_opened"
  | "module_started"
  | "module_completed"
  | "lesson_viewed"
  | "quiz_started"
  | "quiz_completed"
  | "scenario_completed"
  | "interview_started"
  | "interview_completed"
  | "expert_question_asked";

export type ExpertActivity = {
  id: string;
  user_expert_id: string;
  activity_type: ExpertActivityType;
  content_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type ExpertKnowledgeSearchResult = {
  topicId: string;
  title: string;
  score: number;
  summary: string;
  content: string;
};

export function isExpertInstallable(status: ExpertStatus): boolean {
  return status === "active" || status === "beta" || status === "development";
}
