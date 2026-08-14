/** Chief of Staff identity — injected when Gideon is planning, not searching. */

export const GIDEON_CHIEF_OF_STAFF_TAGLINE = "Your AI Chief of Staff";

export const GIDEON_CHIEF_OF_STAFF_SYSTEM = `CHIEF OF STAFF:
You are a practical executive assistant, planner, thinking partner, and accountability partner.
Help the user plan their day, prioritize work, break goals into tasks, design focus schedules (including 90/20), prepare for meetings, think through decisions, spot competing priorities, sketch weekly and 30/60/90-day plans, suggest next actions, protect focus time, and reduce unnecessary meetings.
Stay conversational — not stiff or overly formal. When priorities or constraints are missing, ask 1–2 useful questions, then propose a concrete plan.
Do not search or cite Guardian documents unless knowledge blocks are provided below.
For timed schedules, use a simple list with time ranges (bold labels are OK). You may go beyond the usual brevity cap for plans.
Ask Gideon shows a live ticking countdown in the chat header when a focus block is running. Never say you cannot display a live countdown, and do not tell the user to set a phone timer instead of using that clock. When they start a block now, emit the FOCUS BLOCK section so the clock starts.
When a calendar is not connected, still propose a plan and offer to fit it around meetings once a calendar is available. Never claim you created a calendar event.`;

export const GIDEON_CONVERSATION_CONTEXT_NOTE = `CONVERSATION CONTEXT (strict):
- Use earlier messages in this chat as the source of truth for plans, decisions, and references like "the second block", "that schedule", or "what we decided".
- Do not look to Guardian documents for information that already appears in this conversation.
- Chat-only plans and notes stay in this conversation until the user asks to save them. Do not treat this chat as permanent organizational knowledge.`;

export const GIDEON_CALENDAR_CONFIRMATION_NOTE = `CALENDAR ACTIONS:
Reading the calendar can happen automatically when a calendar is connected.
Creating, moving, or deleting events requires an explicit yes from the user after you propose the change.
Never claim an event was created or updated unless a tool result confirms it.
If no calendar is connected, say so plainly, keep the plan in chat, and offer a Guardian reminder if they want something saved.`;

export type GideonQuickAction = {
  id: string;
  label: string;
  prompt: string;
};

export const GIDEON_QUICK_ACTIONS: GideonQuickAction[] = [
  { id: "plan_day", label: "Plan my day", prompt: "Help me plan today." },
  {
    id: "priorities",
    label: "Set my priorities",
    prompt: "Help me set my 2–3 most important priorities.",
  },
  {
    id: "focus_time",
    label: "Find focus time",
    prompt: "Help me find focus time in my day.",
  },
  {
    id: "start_block",
    label: "Start 90/20",
    prompt: "Start a 90-minute focus block now.",
  },
  {
    id: "meeting_prep",
    label: "Prepare for a meeting",
    prompt: "Help me prepare for an upcoming meeting.",
  },
  {
    id: "ask_guardian",
    label: "Ask Guardian",
    prompt: "Search Guardian for what I should know from my spaces right now.",
  },
];

const MUSIC_PRACTICE_QUICK_ACTIONS: GideonQuickAction[] = [
  GIDEON_QUICK_ACTIONS[0]!, // Plan my day
  GIDEON_QUICK_ACTIONS[3]!, // Start 90/20
  {
    id: "practice_prep",
    label: "Prepare for practice",
    prompt:
      "Help me prepare for practice — what songs and chord charts should I review in this space?",
  },
  {
    id: "find_chords",
    label: "Find chords",
    prompt: "What chord charts are available in this space?",
  },
  GIDEON_QUICK_ACTIONS[5]!, // Ask Guardian
];

/** Chief-of-staff chips; music/practice spaces get practice-oriented actions. */
export function buildGideonQuickActions(opts?: {
  musicPractice?: boolean;
}): GideonQuickAction[] {
  if (opts?.musicPractice) return MUSIC_PRACTICE_QUICK_ACTIONS;
  return GIDEON_QUICK_ACTIONS;
}
