/**
 * Gideon intent router — classify before any Guardian retrieval.
 * Pure helpers (safe for unit tests). Do not expose these labels to users.
 */

export type GideonIntent =
  | "conversation"
  | "chief_of_staff"
  | "knowledge_search"
  | "calendar"
  | "task"
  | "combined";

export type GideonCapabilities = {
  conversation: boolean;
  chiefOfStaff: boolean;
  guardianKnowledge: boolean;
  calendar: boolean;
  task: boolean;
};

export type GideonRoute = {
  intent: GideonIntent;
  capabilities: GideonCapabilities;
  /** User-facing status lines — never mention RAG, vectors, or routing. */
  statusSteps: string[];
  confirmationRequired: boolean;
  calendarWrite: boolean;
};

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type ClassifyGideonIntentArgs = {
  question: string;
  history?: ChatTurn[];
  hasAttachment?: boolean;
  /** Override: existing vault agents that must retrieve (inventory, OCR, pictures). */
  forceKnowledge?: boolean;
};

const DEFINITION_QUESTION =
  /^(hey |hi |hello |gideon[,:]? )?(please )?(what(?:'s| is| are)|who(?:'s| is| are)|how does|how do(?:es)?|explain|define|tell me about)\b/i;

const KNOWLEDGE_EXPLICIT =
  /\b(ask guardian|search guardian|from (my|the|our) (files?|documents?|spaces?|guardian)|in (this|my|the|our) (space|workspace|vault|files?|documents?)|what(?:'s| is) (uploaded|stored|in this space)|what (documents?|files?) (are|do i)|space map|what spaces do i have)\b/i;

const KNOWLEDGE_SOURCE =
  /\b(handbook|contract|invoice|invoices|policy|agreement|nda|lease|receipt|warranty|uploaded|(my|the|our) documents?|(my|the|our) files?|daily logs?|client requests?|trello|chord charts?)\b/i;

/** Song/chart questions must search Guardian even when they start with "what is/are". */
const KNOWLEDGE_MUSIC =
  /\b(chords?|chord charts?|set\s*lists?|hymns?|lyrics|what key|which key|key of|trello|songs?(?:\s+list)?|list of songs|song titles?|living\s+waters|what songs|songs (?:are |on |in )|piano|keyboard|learn (this |that )?(song|chart|hymn)|practice (this |that )?(song|chart))\b/i;

const KNOWLEDGE_CONNECTED =
  /\b(analyzed (pdf|file|chart|attachment|jpg|jpeg|png)|the (pdf|jpg|jpeg|png)|connected (file|trello|source)|trello (board|pdf|chart|attachment))\b/i;

const KNOWLEDGE_SAY =
  /\bwhat does (the |my |our |this )?.{0,80}\b(say|mention|cover|require)\b/i;

const KNOWLEDGE_SUMMARIZE =
  /\b(summarize|summarise)\b.{0,40}\b(document|file|contract|handbook|invoice|log|notes?|proposal)\b/i;

const KNOWLEDGE_ATTENTION =
  /\b(what needs (my )?attention|which (invoices?|contracts?) (are |need )|how many (employees|clients) are linked)\b/i;

const KNOWLEDGE_FIND =
  /\b(find|search|look\s+for|where\s+is|show\s+me|locate)\b.{0,40}\b(my|the|our)\b/i;

/** Business Pack / organizational intelligence questions. */
const KNOWLEDGE_BUSINESS =
  /\b(clients?|contractors?|employees?|proposals?|contracts?|projects?|opportunit(?:y|ies)|policies|procedures?|follow[- ]?up|outstanding|expire|expiring|working with|everything we know about|who (is|are|works)|what (clients?|proposals?|contracts?|projects?|tasks?)|what did we promise|associated with|business relationships?)\b/i;

const BUSINESS_ADVISORY =
  /\b(what should i (follow up|focus|do|prioritize)|what needs (my )?attention|recommend|next steps?)\b/i;

const CALENDAR_READ =
  /\b((what|which|any) (meetings?|events?|appointments?) (do i have|are there)|meetings? (do i have|today|tomorrow)|today'?s (meetings?|calendar|schedule)|what(?:'s| is) on my (calendar|schedule)|show me my (calendar|meetings?)|check my (calendar|meetings?)|my calendar)\b/i;

const CALENDAR_AVAILABILITY =
  /\b(find( me)? (a |an )?\d+[- ]?(minute|min|hour|hr).{0,30}(focus )?block|find (me )?available|available (time|slot)|free (slot|time)|open (slot|time)|focus block (tomorrow|today|monday|tuesday|wednesday|thursday|friday))\b/i;

const CALENDAR_WRITE =
  /\b(block\s+\d{1,2}(:\d{2})?|(block|hold|book)\b.{0,50}\b(on (my )?calendar|focus (time|block))|add .{0,30}(to|on) (my )?calendar|create (a |an )?(calendar )?event|reschedule (the |my )?(meeting|event|focus block))\b/i;

const COS_TIMER =
  /\b((how much|what(?:'s| is) the) time (is )?left|time remaining|countdown|start (a |the )?(90\s*\/\s*20 |90[- ]?minute |focus |work )?block|begin (a )?(focus|work) block)\b/i;

const COS_PLAN =
  /\b(plan my (day|week|morning|afternoon)|help me plan|plan today|weekly plan|30\s*[\/-]\s*60\s*[\/-]\s*90|set my priorities|prioritiz|competing priorit|break .{0,40} into tasks|next actions|prepare for (a |the |my )?(meeting|call)|protect focus|reduce (unnecessary )?meetings?|accountability|thinking partner)\b/i;

const COS_SCHEDULE =
  /\b(90\s*\/\s*20|focus (time|schedule|blocks?)|time blocks?|work schedule|help me (create|build|design|decide|organize)|i want to (start )?(using|try).{0,40}(schedule|90|pomodoro|focus)|so i can focus|better for my workday)\b/i;

const COS_HELP_ME = /\bhelp me\b/i;

const TASK_REMINDER =
  /\b(remind me|set a reminder|add a reminder|follow up on|don'?t let me forget)\b/i;

const CONVERSATION_HISTORY =
  /\b((what )?did we (just )?decide|we decided|earlier (in this (chat|conversation)|about)|you (just )?(suggested|proposed|said)|from (this|our) (chat|conversation|plan)|the (first|second|third) block)\b/i;

const DEICTIC_PLAN =
  /\b(second block|first block|third block|those blocks|that (block|schedule|plan)|move .{0,20}(after|before|to)|after lunch|swap (them|those|the blocks))\b/i;

const PLAN_IN_ASSISTANT =
  /\b(\d{1,2}:\d{2}|focus|break|lunch|90\s*\/\s*20|priority|priorities|time block)\b/i;

const OFFERED_GUARDIAN =
  /\b(check (guardian|your (spaces?|documents?|files?))|search (guardian|your spaces?)|look (that|it) up in (guardian|your spaces?))\b/i;

const OFFERED_CALENDAR =
  /\b(check (your )?calendar|fit .{0,40}(meetings?|calendar)|around your (actual )?meetings)\b/i;

const AFFIRM =
  /^(yes|yeah|yep|sure|please do|ok|okay|do it|go ahead)\b/i;

const AROUND_MEETINGS =
  /\b(around my meetings|around (the|my) calendar|fit .{0,30}meetings)\b/i;

const GREETING_ONLY = /^(hi|hey|hello|thanks|thank you|ok|okay|yo|gideon)[.!?]*$/i;

function lastRoleContent(
  history: ChatTurn[] | undefined,
  role: "user" | "assistant"
): string {
  if (!history?.length) return "";
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]!.role === role) return history[i]!.content;
  }
  return "";
}

function capabilities(partial: Partial<GideonCapabilities>): GideonCapabilities {
  return {
    conversation: false,
    chiefOfStaff: false,
    guardianKnowledge: false,
    calendar: false,
    task: false,
    ...partial,
  };
}

function statusStepsFor(caps: GideonCapabilities, intent: GideonIntent): string[] {
  const steps = ["Thinking..."];
  if (caps.calendar) steps.push("Checking your calendar...");
  if (caps.guardianKnowledge) steps.push("Searching Guardian...");
  if (caps.chiefOfStaff || intent === "chief_of_staff" || intent === "combined") {
    steps.push("Planning your day...");
  }
  return steps;
}

function route(
  intent: GideonIntent,
  caps: GideonCapabilities,
  extras?: { confirmationRequired?: boolean; calendarWrite?: boolean }
): GideonRoute {
  return {
    intent,
    capabilities: caps,
    statusSteps: statusStepsFor(caps, intent),
    confirmationRequired: extras?.confirmationRequired ?? false,
    calendarWrite: extras?.calendarWrite ?? false,
  };
}

function isKnowledgeQuestion(q: string): boolean {
  return (
    KNOWLEDGE_EXPLICIT.test(q) ||
    KNOWLEDGE_SAY.test(q) ||
    KNOWLEDGE_SUMMARIZE.test(q) ||
    KNOWLEDGE_ATTENTION.test(q) ||
    KNOWLEDGE_FIND.test(q) ||
    KNOWLEDGE_SOURCE.test(q) ||
    KNOWLEDGE_MUSIC.test(q) ||
    KNOWLEDGE_CONNECTED.test(q) ||
    KNOWLEDGE_BUSINESS.test(q)
  );
}

function isCalendarRead(q: string): boolean {
  return CALENDAR_READ.test(q) || CALENDAR_AVAILABILITY.test(q);
}

function isCalendarWrite(q: string): boolean {
  return CALENDAR_WRITE.test(q);
}

function isChiefOfStaff(q: string): boolean {
  if (DEFINITION_QUESTION.test(q) && !COS_HELP_ME.test(q) && !COS_PLAN.test(q)) {
    return false;
  }
  return (
    COS_PLAN.test(q) ||
    COS_SCHEDULE.test(q) ||
    COS_TIMER.test(q) ||
    COS_HELP_ME.test(q)
  );
}

function isTask(q: string): boolean {
  return TASK_REMINDER.test(q);
}

function withKnowledge(base: GideonRoute): GideonRoute {
  const caps = { ...base.capabilities, guardianKnowledge: true };
  const intent: GideonIntent =
    base.capabilities.chiefOfStaff || base.capabilities.calendar
      ? "combined"
      : "knowledge_search";
  return {
    ...base,
    intent,
    capabilities: caps,
    statusSteps: statusStepsFor(caps, intent),
  };
}

/**
 * Classify a Gideon turn. Document retrieval must not run unless
 * `capabilities.guardianKnowledge` is true.
 */
export function classifyGideonIntent(args: ClassifyGideonIntentArgs): GideonRoute {
  const question = args.question.trim();
  const q = question.replace(/\s+/g, " ");
  const history = args.history ?? [];
  const lastAssistant = lastRoleContent(history, "assistant");

  if (args.hasAttachment || args.forceKnowledge) {
    const base = classifyGideonIntent({
      question,
      history,
    });
    return withKnowledge({
      ...base,
      capabilities: { ...base.capabilities, conversation: true },
    });
  }

  if (AFFIRM.test(q) && OFFERED_GUARDIAN.test(lastAssistant)) {
    return route("knowledge_search", capabilities({ guardianKnowledge: true, conversation: true }));
  }
  if (AFFIRM.test(q) && OFFERED_CALENDAR.test(lastAssistant)) {
    return route("calendar", capabilities({ calendar: true, conversation: true, chiefOfStaff: true }), {
      confirmationRequired: false,
    });
  }

  if (CONVERSATION_HISTORY.test(q) || DEICTIC_PLAN.test(q)) {
    const planFollowUp = PLAN_IN_ASSISTANT.test(lastAssistant) || DEICTIC_PLAN.test(q);
    if (planFollowUp && !isKnowledgeQuestion(q)) {
      return route(
        "chief_of_staff",
        capabilities({ conversation: true, chiefOfStaff: true })
      );
    }
    if (!isKnowledgeQuestion(q)) {
      return route("conversation", capabilities({ conversation: true }));
    }
  }

  const knowledge = isKnowledgeQuestion(q);
  const calendarWrite = isCalendarWrite(q);
  const calendarRead = isCalendarRead(q) || calendarWrite;
  const cos = isChiefOfStaff(q) || (BUSINESS_ADVISORY.test(q) && knowledge);
  const task = isTask(q);
  const combinedSignals =
    (cos && (calendarRead || knowledge)) || AROUND_MEETINGS.test(q);

  if (combinedSignals) {
    return route(
      "combined",
      capabilities({
        conversation: true,
        chiefOfStaff: true,
        guardianKnowledge: knowledge,
        calendar: calendarRead || AROUND_MEETINGS.test(q),
      }),
      { calendarWrite, confirmationRequired: calendarWrite }
    );
  }

  if (calendarRead) {
    return route(
      "calendar",
      capabilities({ calendar: true, conversation: true }),
      { calendarWrite, confirmationRequired: calendarWrite }
    );
  }

  if (task && !knowledge) {
    return route("task", capabilities({ task: true, conversation: true }));
  }

  if (knowledge) {
    return route(
      "knowledge_search",
      capabilities({ guardianKnowledge: true, conversation: true })
    );
  }

  if (cos) {
    return route(
      "chief_of_staff",
      capabilities({ chiefOfStaff: true, conversation: true })
    );
  }

  if (GREETING_ONLY.test(q.toLowerCase()) || DEFINITION_QUESTION.test(q)) {
    return route("conversation", capabilities({ conversation: true }));
  }

  return route("conversation", capabilities({ conversation: true }));
}

export function shouldSearchGuardianKnowledge(route: GideonRoute): boolean {
  return route.capabilities.guardianKnowledge;
}
