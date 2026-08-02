/**
 * Guardian Coach — conversational onboarding helpers (pure, testable).
 */

import {
  isOnboardingIntent,
  isSchoolIntent,
  type OnboardingIntent,
  type SchoolIntent,
} from "./intent";

export const GUARDIAN_COACH_SETUP_MARKER = "GUARDIAN_SETUP_JSON";

export type CoachMessage = {
  role: "user" | "assistant";
  content: string;
};

export type CoachSetupResult = {
  intent: OnboardingIntent;
  schoolIntent?: SchoolIntent | null;
  workspaceName?: string | null;
  summary?: string | null;
};

export const GUARDIAN_COACH_OPENING =
  "Hello! I'm Gideon. Let's build your Guardian in under a minute.\n\nWhat best describes you right now? You can pick an option below or tell me in your own words — for example, business owner, parent, teacher, or just organizing personal life.";

export function buildGuardianCoachSystemPrompt(userName?: string | null): string {
  const nameNote = userName?.trim()
    ? `The user's name is ${userName.trim()}. Greet them naturally once.`
    : "";

  return `You are Gideon, Guardian's onboarding coach. ${nameNote}

Your job is a short, friendly interview (1–3 turns) to learn how the user will use Guardian, then recommend a setup.

Valid intents (pick exactly one):
- personal — everyday life, receipts, personal documents
- family — household, kids, family activities
- business — company, clients, invoices, contracts
- school — teaching, studying, or supporting a student (requires schoolIntent)
- other — exploring or mixed use

For school intent you MUST also set schoolIntent to one of: teacher, student, parent.

Guidelines:
- Keep each reply under 80 words, warm and clear.
- Ask at most one question per turn.
- If the user is clear (e.g. "I run a small business"), conclude immediately.
- If they say "just exploring" or are vague, use intent "other".
- Optionally suggest a workspaceName (short, friendly label like "NM2TECH" or "Kola Family").
- When you have enough information, write a brief closing sentence, then on a new line output exactly:
${GUARDIAN_COACH_SETUP_MARKER}
followed by a single JSON object on the next line:
{"intent":"business","schoolIntent":null,"workspaceName":"My business","summary":"One line recap"}

For non-school intents, set schoolIntent to null. Never invent features Guardian does not have.`;
}

export function parseCoachAssistantMessage(raw: string): {
  reply: string;
  setup: CoachSetupResult | null;
} {
  const trimmed = raw.trim();
  const markerIdx = trimmed.indexOf(GUARDIAN_COACH_SETUP_MARKER);
  if (markerIdx < 0) {
    return { reply: trimmed, setup: null };
  }

  const reply = trimmed.slice(0, markerIdx).trim();
  const jsonPart = trimmed.slice(markerIdx + GUARDIAN_COACH_SETUP_MARKER.length).trim();
  const start = jsonPart.indexOf("{");
  const end = jsonPart.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return { reply: reply || trimmed, setup: null };
  }

  try {
    const parsed = JSON.parse(jsonPart.slice(start, end + 1)) as Record<
      string,
      unknown
    >;
    if (!isOnboardingIntent(parsed.intent)) {
      return { reply: reply || trimmed, setup: null };
    }

    let schoolIntent: SchoolIntent | null = null;
    if (parsed.intent === "school") {
      if (!isSchoolIntent(parsed.schoolIntent)) {
        return { reply: reply || trimmed, setup: null };
      }
      schoolIntent = parsed.schoolIntent;
    }

    const workspaceName =
      typeof parsed.workspaceName === "string"
        ? parsed.workspaceName.trim().slice(0, 80) || null
        : null;
    const summary =
      typeof parsed.summary === "string"
        ? parsed.summary.trim().slice(0, 200) || null
        : null;

    return {
      reply,
      setup: {
        intent: parsed.intent,
        schoolIntent,
        workspaceName,
        summary,
      },
    };
  } catch {
    return { reply: reply || trimmed, setup: null };
  }
}
