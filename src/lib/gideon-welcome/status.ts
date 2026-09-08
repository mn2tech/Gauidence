import {
  LEADS_PATH,
  PROPOSALS_PATH,
  REQUESTS_PATH,
} from "@/lib/routes";
import {
  ADD_ANYTHING_PATH,
  ASK_GIDEON_PATH,
  REMEMBER_TODAY_PATH,
} from "@/lib/simple-home/routing";
import type {
  GideonWelcomeAction,
  GideonWelcomeSpaceStats,
  GideonWelcomeStatusItem,
  GideonWelcomeViewModel,
} from "./types";

function plural(count: number, singular: string, pluralForm?: string): string {
  return count === 1 ? singular : (pluralForm ?? `${singular}s`);
}

function isSchoolProfile(profileType: GideonWelcomeSpaceStats["profileType"]): boolean {
  return profileType === "student" || profileType === "teacher";
}

function askHref(question: string, profileId?: string): string {
  const params = new URLSearchParams({ draft: question });
  if (profileId) params.set("profileId", profileId);
  return `${ASK_GIDEON_PATH}?${params.toString()}`;
}

/** Generic PDF theme chips — weak on Ask welcome when real work is pending. */
const GENERIC_DOC_THEME_QUESTION =
  /^(what services are described|what does this say about fees|what conflicts are disclosed|what does this policy require|what are the key terms|what amounts are listed|what information is missing|what does the form crs cover)\??$/i;

/** Drop chips that only echo the Space / brand name ("What do we know about X?"). */
function actionableDocumentQuestions(
  questions: string[],
  spaceName?: string | null
): string[] {
  const space = spaceName?.trim() || "";
  const tokens = space
    ? [
        ...space.split(/\s*[-–—|]\s*/).map((t) => t.trim()),
        ...space.split(/[\s\-–—,/|]+/).map((t) => t.trim()),
      ].filter((t) => t.length >= 2)
    : [];
  return questions.filter((q) => {
    const text = q.trim();
    if (!text) return false;
    if (GENERIC_DOC_THEME_QUESTION.test(text)) return false;
    if (!/^what do we know about\b/i.test(text)) return true;
    if (!space) return true;
    const about = text
      .replace(/^what do we know about\s+/i, "")
      .replace(/\?+$/, "")
      .trim();
    if (!about) return false;
    const aboutLower = about.toLowerCase();
    if (aboutLower === space.toLowerCase()) return false;
    if (tokens.some((t) => t.toLowerCase() === aboutLower)) return false;
    return true;
  });
}

function hasPendingBusinessWork(stats: GideonWelcomeSpaceStats): boolean {
  return (
    stats.leadsNeedFollowUp > 0 ||
    stats.proposalsAwaitingResponse > 0 ||
    stats.upcomingAlertsCount > 0 ||
    stats.openRequestCount > 0
  );
}

function buildBusinessStatus(stats: GideonWelcomeSpaceStats): GideonWelcomeStatusItem[] {
  const items: GideonWelcomeStatusItem[] = [];

  if (stats.leadsNeedFollowUp > 0) {
    items.push({
      id: "leads",
      text: `${stats.leadsNeedFollowUp} ${plural(stats.leadsNeedFollowUp, "lead")} may need follow-up`,
    });
  }
  if (stats.proposalsAwaitingResponse > 0) {
    items.push({
      id: "proposals",
      text: `${stats.proposalsAwaitingResponse} ${plural(stats.proposalsAwaitingResponse, "proposal")} ${stats.proposalsAwaitingResponse === 1 ? "is" : "are"} awaiting a response`,
    });
  }
  if (stats.recentItemsCount > 0) {
    items.push({
      id: "recent",
      text: `${stats.recentItemsCount} ${plural(stats.recentItemsCount, "item")} ${stats.recentItemsCount === 1 ? "was" : "were"} recently added`,
    });
  }
  if (stats.upcomingAlertsCount > 0) {
    items.push({
      id: "alerts",
      text: `${stats.upcomingAlertsCount} upcoming ${plural(stats.upcomingAlertsCount, "commitment", "commitments")}`,
    });
  }

  return items.slice(0, 4);
}

function buildPersonalStatus(stats: GideonWelcomeSpaceStats): GideonWelcomeStatusItem[] {
  const items: GideonWelcomeStatusItem[] = [];

  if (stats.upcomingAlertsCount > 0) {
    items.push({
      id: "events",
      text: `${stats.upcomingAlertsCount} upcoming ${plural(stats.upcomingAlertsCount, "event", "events")}`,
    });
  }
  if (stats.recentItemsCount > 0) {
    items.push({
      id: "recent",
      text: `${stats.recentItemsCount} ${plural(stats.recentItemsCount, "item")} added recently`,
    });
  }
  if (stats.openRequestCount > 0) {
    items.push({
      id: "requests",
      text: `${stats.openRequestCount} open ${plural(stats.openRequestCount, "request")}`,
    });
  }

  return items.slice(0, 4);
}

function buildSchoolStatus(stats: GideonWelcomeSpaceStats): GideonWelcomeStatusItem[] {
  const items: GideonWelcomeStatusItem[] = [];

  if (stats.upcomingAlertsCount > 0) {
    items.push({
      id: "dates",
      text: `${stats.upcomingAlertsCount} upcoming school ${plural(stats.upcomingAlertsCount, "date", "dates")}`,
    });
  }
  if (stats.recentItemsCount > 0) {
    items.push({
      id: "recent",
      text: `${stats.recentItemsCount} ${plural(stats.recentItemsCount, "document", "documents")} or notes added recently`,
    });
  }

  return items.slice(0, 4);
}

function buildEmptyActions(profileId?: string): GideonWelcomeAction[] {
  return [
    { id: "upload", label: "Upload a document", href: ADD_ANYTHING_PATH },
    { id: "note", label: "Add a note", href: REMEMBER_TODAY_PATH },
    {
      id: "contact",
      label: "Add a contact",
      href: ADD_ANYTHING_PATH,
    },
    {
      id: "ask",
      label: "Ask Gideon",
      href: profileId ? askHref("Help me get started.", profileId) : ASK_GIDEON_PATH,
    },
  ];
}

function buildDocumentAskActions(
  questions: string[],
  profileId?: string
): GideonWelcomeAction[] {
  return questions.slice(0, 3).map((question, index) => ({
    id: `doc-q-${index}`,
    label: question,
    href: askHref(question, profileId),
    question,
  }));
}

function buildBusinessActions(
  stats: GideonWelcomeSpaceStats,
  profileId?: string,
  spaceName?: string | null
): GideonWelcomeAction[] {
  const docQuestions = actionableDocumentQuestions(
    stats.documentQuestions ?? [],
    spaceName
  );
  // When leads/proposals/alerts are pending, those beat vague PDF theme chips.
  if (docQuestions.length > 0 && !hasPendingBusinessWork(stats)) {
    const actions = buildDocumentAskActions(docQuestions, profileId);
    actions.push({
      id: "ask",
      label: "Ask Gideon",
      href: profileId ? `${ASK_GIDEON_PATH}?profileId=${profileId}` : ASK_GIDEON_PATH,
    });
    if (actions.length < 4) {
      actions.push({ id: "add", label: "Add something", href: ADD_ANYTHING_PATH });
    }
    return actions.slice(0, 4);
  }

  const actions: GideonWelcomeAction[] = [
    {
      id: "attention",
      label: "What needs my attention?",
      href: askHref("What needs my attention?", profileId),
    },
  ];

  if (stats.leadsNeedFollowUp > 0) {
    actions.push({
      id: "leads",
      label: "Review leads",
      href: LEADS_PATH,
    });
  }

  if (stats.proposalsAwaitingResponse > 0) {
    actions.push({ id: "proposals", label: "Review proposals", href: PROPOSALS_PATH });
  }

  if (stats.upcomingAlertsCount > 0) {
    actions.push({
      id: "commitments",
      label: "What's coming up?",
      href: askHref("What upcoming commitments should I know about?", profileId),
    });
  }

  // One specific doc chip is fine as a secondary option when work is pending.
  if (docQuestions.length > 0 && actions.length < 3) {
    actions.push(...buildDocumentAskActions(docQuestions.slice(0, 1), profileId));
  }

  actions.push(
    {
      id: "ask",
      label: "Ask Gideon",
      href: profileId ? `${ASK_GIDEON_PATH}?profileId=${profileId}` : ASK_GIDEON_PATH,
    },
    { id: "add", label: "Add something", href: ADD_ANYTHING_PATH }
  );

  return actions.slice(0, 4);
}

function buildGeneralActions(
  stats: GideonWelcomeSpaceStats,
  profileId?: string,
  spaceName?: string | null
): GideonWelcomeAction[] {
  const docQuestions = actionableDocumentQuestions(
    stats.documentQuestions ?? [],
    spaceName
  );
  if (docQuestions.length > 0) {
    const actions = buildDocumentAskActions(docQuestions, profileId);
    actions.push({
      id: "ask",
      label: "Ask Gideon",
      href: profileId ? `${ASK_GIDEON_PATH}?profileId=${profileId}` : ASK_GIDEON_PATH,
    });
    if (actions.length < 4) {
      actions.push({ id: "add", label: "Add something", href: ADD_ANYTHING_PATH });
    }
    return actions.slice(0, 4);
  }

  const actions: GideonWelcomeAction[] = [
    {
      id: "attention",
      label: "What needs my attention?",
      href: askHref("What needs my attention?", profileId),
    },
    {
      id: "new",
      label: "What's new?",
      href: askHref("What's new across my spaces?", profileId),
    },
    {
      id: "ask",
      label: "Ask Gideon",
      href: profileId ? `${ASK_GIDEON_PATH}?profileId=${profileId}` : ASK_GIDEON_PATH,
    },
    { id: "add", label: "Add something", href: ADD_ANYTHING_PATH },
  ];

  if (stats.openRequestCount > 0) {
    actions.splice(2, 0, { id: "requests", label: "View requests", href: REQUESTS_PATH });
  }

  return actions.slice(0, 4);
}

export function buildGideonWelcomeView(args: {
  greetName: string | null;
  spaceName: string | null;
  isNewUser: boolean;
  stats: GideonWelcomeSpaceStats;
  statusUnavailable: boolean;
  profileId?: string;
}): GideonWelcomeViewModel {
  const { greetName, spaceName, isNewUser, stats, statusUnavailable, profileId } = args;
  const isEmptySpace = !stats.hasAnyData;

  let statusItems: GideonWelcomeStatusItem[] = [];

  if (!statusUnavailable && !isEmptySpace) {
    if (stats.category === "business") {
      statusItems = buildBusinessStatus(stats);
    } else if (isSchoolProfile(stats.profileType)) {
      statusItems = buildSchoolStatus(stats);
    } else {
      statusItems = buildPersonalStatus(stats);
    }
  }

  let actions: GideonWelcomeAction[];
  if (isEmptySpace || isNewUser) {
    actions = buildEmptyActions(profileId);
  } else if (stats.category === "business") {
    actions = buildBusinessActions(stats, profileId, spaceName);
  } else {
    actions = buildGeneralActions(stats, profileId, spaceName);
  }

  return {
    greetName,
    spaceName,
    isNewUser,
    isEmptySpace,
    statusItems,
    actions,
    statusUnavailable,
  };
}
