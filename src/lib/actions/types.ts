import type { SupabaseClient } from "@supabase/supabase-js";
import type { GuardianProfileType } from "@/lib/profiles/types";

/** Runtime context passed to action matchers and executors. */
export type ActionContext = {
  question: string;
  userId: string;
  userEmail?: string | null;
  activeProfile: {
    id: string;
    display_name: string;
    profile_type: GuardianProfileType;
    parent_profile_id?: string | null;
  };
  /** Ask Gideon opened from a Work Memory project (`?projectId=`). */
  workProjectId?: string | null;
  confirmed?: boolean;
  supabase?: SupabaseClient;
};

/** Result from a direct (non-LLM) action execution. */
export type ActionDirectResult = {
  message: string;
  requiresConfirmation?: boolean;
  intent?: string;
  href?: string;
};

/** A registered Guardian action tool. */
export type ActionDefinition = {
  id: string;
  label: string;
  description: string;
  matches: (question: string, ctx: ActionContext) => boolean;
  /** Inject into Gideon system prompt when this action matches. */
  systemNote?: (ctx: ActionContext) => string | null;
  /** Bypass LLM when the action can be handled directly. */
  executeDirect?: (ctx: ActionContext) => Promise<ActionDirectResult | null>;
  requiresConfirmation?: boolean;
  /** Steps for the Thinking Panel (future UI). */
  thinkingSteps?: string[];
};

export type ActionEventPhase =
  | "detected"
  | "proposed"
  | "confirmed"
  | "executed"
  | "failed";

/** Structured action event for timeline / thinking panel (future persistence). */
export type ActionEvent = {
  actionId: string;
  label: string;
  phase: ActionEventPhase;
  message?: string;
  timestamp: number;
};
