/**
 * Gideon request router — classify before answering.
 * Knowledge-first: Guardian world → Space context → general knowledge.
 * Pure helpers (safe for unit tests). Never expose routing metadata to users.
 */

import type { ChatTurn } from "@/lib/vault/expandRetrievalQuestion";
import { looksLikeChartTitleQuery } from "@/lib/vault/expandRetrievalQuestion";
import { isDocumentContentQuestion } from "@/lib/gideon/documentGrounding";
import {
  DEFAULT_RESPONSE_DEPTH,
  type GideonKnowledgeIntent,
  type KnowledgeSource,
  type OrchestrationResponseDepth,
} from "./orchestration-types";

export type {
  GideonKnowledgeIntent,
  OrchestrationResponseDepth,
  KnowledgeSource,
} from "./orchestration-types";

export { DEFAULT_RESPONSE_DEPTH };

export type GideonOrchestrationRoute = {
  intent: GideonKnowledgeIntent;
  responseDepth: OrchestrationResponseDepth;
  guardianKnowledgeRequired: boolean;
  generalKnowledgeAllowed: boolean;
  knowledgeSource: KnowledgeSource;
  spaceId?: string;
  confidence: number;
  /** Internal only — never expose to ordinary users. */
  reasoning?: string;
};

export type RouteGideonOrchestrationArgs = {
  question: string;
  userId?: string;
  spaceId?: string;
  spaceName?: string;
  spaceType?: string;
  conversationId?: string;
  history?: ChatTurn[];
  hasAttachment?: boolean;
  globalView?: boolean;
  knownEntityNames?: string[];
};

const EXPLAIN_DEPTH =
  /\b(why|explain|what does (this|that|it) mean|tell me more|how does (this|that|it) work|help me understand|walk me through|break (it|this) down)\b/i;

const DEEP_DEPTH =
  /\b(analyze|analyse|compare|research|give me everything|everything (guardian )?knows|deep dive|in[- ]?depth|create a strategy|assess|comprehensive (review|analysis)|all you know|tell me everything)\b/i;

const GENERAL_EXPLICIT =
  /\b(in general|generally speaking|as a (general )?rule|from (your|general) knowledge|what (is|are) (a|an|the) (typical|normal|usual)|is .{0,40} (normal|typical|common|usual)|compared to (the )?(industry|market|average))\b/i;

const GENERAL_DEFINITION =
  /^(hey |hi |hello |gideon[,:]? )?(please )?(what(?:'s| is| are) (a|an)\b|define\b|explain (what|the concept)|who (invented|founded) )/i;

const PURE_GENERAL =
  /^(hey |hi |hello |gideon[,:]? )?(please )?(what is (an? |the )?(ria|form crs|form adv|pomodoro|401\(?k\)?|ira|roth|sec|finra|nda|scorp|llc)\b)/i;

const ACTION_REQUEST =
  /\b(remind me|set a reminder|draft (an? |the )?email|schedule (a |an )?(meeting|call|appointment)|add this to|save (this|that|it) (as |to )?(a )?daily log|create (a |an )?(task|reminder|event|meeting)|book (a |an )?(meeting|call)|follow up (with|on)|send (an? )?email)\b/i;

const CLARIFICATION =
  /^(which (one|song|file|document|space)|what do you mean|can you clarify|did you mean|which .{0,30}\?)\s*$/i;

const GUARDIAN_WORLD =
  /\b(my|our|their|his|her|the (space|workspace|practice|firm|client|company)|this (space|workspace|practice|client)|uploaded|document|file|form crs|form adv|daily log|commitment|proposal|invoice|school (calendar|closure|closed)|passport|registration|appointment)\b/i;

const GUARDIAN_ENTITY_ASK =
  /\b(what (is|are|was|were|does|do|did)|when (is|are|was|were)|who (is|are|was|were)|where (is|are)|how much|how many|minimum (investment|account)|services? (do|does|offered|offer)|insurance|conflicts? of interest|what do we know|everything .{0,20}know)\b/i;

const PLUS_GENERAL =
  /\b(is .{0,60}(normal|typical|common|usual|reasonable|high|low)|compared to|relative to|in the (industry|market)|should i (worry|be concerned)|does that (make sense|seem)|how does (that|this) compare)\b/i;

const CONVERSATION_ADVICE =
  /\b(how should i (approach|prepare|handle|think)|what should i (say|do|ask)|advice|thinking partner|help me (think|prepare|decide))\b/i;

const GLOBAL_TODAY =
  /\b(what do i need to (know|focus on|do) today|what needs (my )?attention( today)?|brief me( today)?|today'?s (brief|priorities|overview))\b/i;

const DEICTIC_SPACE =
  /\b(they|them|their|this (client|firm|practice|company|space)|the (client|firm|practice))\b/i;

export function classifyOrchestrationDepth(
  question: string
): OrchestrationResponseDepth {
  const q = question.trim();
  if (!q) return DEFAULT_RESPONSE_DEPTH;
  if (DEEP_DEPTH.test(q)) return "deep";
  if (EXPLAIN_DEPTH.test(q)) return "explain";
  return DEFAULT_RESPONSE_DEPTH;
}

export function orchestrationDepthToLegacy(
  depth: OrchestrationResponseDepth
): 1 | 2 | 3 | 4 {
  switch (depth) {
    case "short":
      return 1;
    case "explain":
      return 3;
    case "deep":
      return 4;
  }
}

function mentionsKnownEntity(
  question: string,
  names: string[] | undefined
): boolean {
  if (!names?.length) return false;
  const lower = question.toLowerCase();
  return names.some((n) => {
    const t = n.trim().toLowerCase();
    if (t.length < 2) return false;
    return lower.includes(t) || lower.includes(t.split(/\s+/)[0]!);
  });
}

function looksLikeGuardianWorldQuestion(
  q: string,
  args: RouteGideonOrchestrationArgs
): boolean {
  if (args.hasAttachment) return true;
  if (isDocumentContentQuestion(q)) return true;
  if (looksLikeChartTitleQuery(q)) return true;
  if (GLOBAL_TODAY.test(q)) return true;
  if (GUARDIAN_WORLD.test(q) && GUARDIAN_ENTITY_ASK.test(q)) return true;
  // Possessive / ownership cues with concrete personal/business knowledge nouns.
  if (
    /\b(my|our)\b/i.test(q) &&
    /\b(passport|registration|appointment|school|document|file|invoice|proposal|commitment|daily log|form crs|form adv|insurance|minimum|services?)\b/i.test(
      q
    )
  ) {
    return true;
  }
  // "Kendall's minimum…" / "Lagos Dental's insurance…" — possessive entity cue.
  if (
    /\b[\w][\w'-]+(?:\s+[\w][\w'-]+){0,3}'s\b/i.test(q) &&
    GUARDIAN_ENTITY_ASK.test(q)
  ) {
    return true;
  }
  if (mentionsKnownEntity(q, args.knownEntityNames)) return true;
  if (
    args.spaceId &&
    !args.globalView &&
    DEICTIC_SPACE.test(q) &&
    GUARDIAN_ENTITY_ASK.test(q)
  ) {
    return true;
  }
  if (
    args.spaceId &&
    !args.globalView &&
    /\b(what|which|when|who|where|how much|how many)\b/i.test(q) &&
    /\b(services?|fees?|minimum|insurance|hours|address|clients?|patients?|commitments?|proposals?|conflicts?)\b/i.test(
      q
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Classify a user message for knowledge-first orchestration.
 * Complements (does not replace) capability routing in intent.ts.
 */
export function routeGideonOrchestration(
  args: RouteGideonOrchestrationArgs
): GideonOrchestrationRoute {
  const question = args.question.trim().replace(/\s+/g, " ");
  const q = question;
  const responseDepth = classifyOrchestrationDepth(q);
  const spaceId = args.spaceId;

  if (!q) {
    return {
      intent: "clarification",
      responseDepth: DEFAULT_RESPONSE_DEPTH,
      guardianKnowledgeRequired: false,
      generalKnowledgeAllowed: true,
      knowledgeSource: "general",
      spaceId,
      confidence: 0.9,
      reasoning: "empty question",
    };
  }

  if (CLARIFICATION.test(q)) {
    return {
      intent: "clarification",
      responseDepth,
      guardianKnowledgeRequired: false,
      generalKnowledgeAllowed: true,
      knowledgeSource: "guardian_and_general",
      spaceId,
      confidence: 0.85,
      reasoning: "clarification request",
    };
  }

  if (ACTION_REQUEST.test(q)) {
    return {
      intent: "action",
      responseDepth,
      guardianKnowledgeRequired: false,
      generalKnowledgeAllowed: true,
      knowledgeSource: "guardian_and_general",
      spaceId,
      confidence: 0.88,
      reasoning: "action request",
    };
  }

  const guardianWorld = looksLikeGuardianWorldQuestion(q, args);
  const wantsGeneral = GENERAL_EXPLICIT.test(q) || PLUS_GENERAL.test(q);
  const pureGeneral =
    PURE_GENERAL.test(q) ||
    (GENERAL_DEFINITION.test(q) && !guardianWorld && !args.hasAttachment);

  if (guardianWorld && wantsGeneral) {
    return {
      intent: "guardian_plus_general",
      responseDepth,
      guardianKnowledgeRequired: true,
      generalKnowledgeAllowed: true,
      knowledgeSource: "guardian_and_general",
      spaceId,
      confidence: 0.86,
      reasoning: "guardian fact plus general context",
    };
  }

  if (guardianWorld) {
    return {
      intent: "guardian_knowledge",
      responseDepth,
      guardianKnowledgeRequired: true,
      generalKnowledgeAllowed: false,
      knowledgeSource: "guardian",
      spaceId,
      confidence: 0.9,
      reasoning: args.spaceId
        ? "guardian-world question; prefer current space"
        : "guardian-world question",
    };
  }

  if (CONVERSATION_ADVICE.test(q)) {
    const hasSpace = Boolean(args.spaceId) && !args.globalView;
    return {
      intent: hasSpace ? "guardian_plus_general" : "conversation",
      responseDepth,
      guardianKnowledgeRequired: hasSpace,
      generalKnowledgeAllowed: true,
      knowledgeSource: hasSpace ? "guardian_and_general" : "general",
      spaceId,
      confidence: 0.75,
      reasoning: "conversational advice",
    };
  }

  if (pureGeneral || (GENERAL_DEFINITION.test(q) && !guardianWorld)) {
    return {
      intent: "general_knowledge",
      responseDepth,
      guardianKnowledgeRequired: false,
      generalKnowledgeAllowed: true,
      knowledgeSource: "general",
      spaceId,
      confidence: 0.92,
      reasoning: "general knowledge question",
    };
  }

  if (args.spaceId && !args.globalView && DEICTIC_SPACE.test(q)) {
    return {
      intent: "guardian_knowledge",
      responseDepth,
      guardianKnowledgeRequired: true,
      generalKnowledgeAllowed: false,
      knowledgeSource: "guardian",
      spaceId,
      confidence: 0.7,
      reasoning: "deictic reference in active space",
    };
  }

  return {
    intent: "conversation",
    responseDepth,
    guardianKnowledgeRequired: false,
    generalKnowledgeAllowed: true,
    knowledgeSource: "general",
    spaceId,
    confidence: 0.65,
    reasoning: "default conversation",
  };
}

export function knowledgeSourceForRoute(
  route: GideonOrchestrationRoute
): KnowledgeSource {
  return route.knowledgeSource;
}
