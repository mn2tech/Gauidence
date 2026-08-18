import {
  LEAD_STATUS_LABELS,
  LEAD_STATUSES,
  LEAD_TYPE_LABELS,
  computeLeadSummary,
  leadContactLine,
  leadDisplayName,
  leadTypeOf,
  staleLeads,
  todaysActionBreakdown,
  todaysActionLeads,
  type BusinessLead,
  type LeadActivity,
  type LeadStatus,
  type LeadType,
} from "./types";
import { parseLeadStatus, parseLeadType } from "./validators";

export type LeadsGideonIntent =
  | "pipeline"
  | "lookup"
  | "follow_up"
  | "today"
  | "federal"
  | "match"
  | "stale"
  | "create"
  | "update_status"
  | "unknown";

export type LeadsGideonParseResult = {
  intent: LeadsGideonIntent;
  search?: string;
  status?: LeadStatus;
  leadType?: LeadType;
  matchTerm?: string;
  uncontacted?: boolean;
  companyName?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  notes?: string;
  confirmed?: boolean;
  requiresConfirmation: boolean;
  confirmationMessage?: string;
};

const LEADS_KEYWORDS =
  /\b((my|our|the) leads|sales leads?|lead pipeline|sales pipeline|how many leads|federal partners?|business cards?|teaming|subcontract|today'?s actions?|relationship (with|history))\b/i;

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/;

const CREATE =
  /\b(add|create|save)\s+(a |an |this )?(new )?lead\b|\badd .{0,60} as a(?: new)? lead\b/i;

const UPDATE =
  /\b(mark|set|update|change|move)\b.{0,80}\b(as|to|status)\b.{0,20}\b(new|researched|contacted|follow[- ]?up|interested|proposal|won|lost|identified|qualified|dormant)\b/i;

const FOLLOW_UP =
  /\b(which |what )?leads?\b.{0,40}\b(follow[- ]?up|need (a )?call|to contact|contact today)\b|\bfollow[- ]?up (on |with )?(my |our )?leads?\b|\bbusiness cards? .{0,40}follow/i;

const TODAY =
  /\b(which leads should i contact today|contact today|today'?s actions?|who should i contact today)\b/i;

const FEDERAL =
  /\bfederal partners?\b|\bteaming partners?\b|\bfederal (small )?business/i;

const STALE =
  /\b(haven'?t contacted|not contacted|stale|30 days|becoming stale)\b/i;

const MATCH =
  /\b(strongest for|match (our |nm2tech )?(ai|sas)|sas experience|ai capabilities|treasury)\b/i;

const LOOKUP =
  /\b(tell me about|what(?:'s| is) (the )?(status of |next action with )?|status of|show(?: me)? (the )?).{0,60}\blead\b|\blead (?:for|named|called)\b|\b(last discuss|last talk|what did we last|history with|next action with this)\b/i;

const PIPELINE =
  /\b(how many leads|show (me )?(my |our )?(leads|pipeline)|list (my |our )?leads|lead pipeline|sales pipeline|my leads|our leads|lead summary)\b/i;

function hasExplicitConfirmation(q: string): boolean {
  return /\b(yes|yep|yeah|confirm|go ahead|do it|please)\b/i.test(q);
}

function extractEmail(text: string): string | undefined {
  const m = text.match(EMAIL_RE);
  return m?.[0];
}

function extractPhone(text: string): string | undefined {
  const m = text.match(PHONE_RE);
  return m?.[0];
}

function cleanNamePart(value: string | undefined): string | undefined {
  const cleaned = (value ?? "")
    .replace(/\b(lead|please|named|called|for|the|a|an|partner|company)\b/gi, " ")
    .replace(/["]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || undefined;
}

function parseCreateNames(text: string): {
  companyName?: string;
  contactName?: string;
} {
  const addAs = text.match(/\badd (.+?) as a(?: new)? lead\b/i);
  const forLead = text.match(
    /\b(?:add|create|save) (?:a |an |this )?(?:new )?lead(?: for)?[:\s]+(.+)/i
  );
  const raw = (addAs?.[1] ?? forLead?.[1] ?? "").trim();
  if (!raw) return {};
  const withoutBits = raw
    .replace(EMAIL_RE, " ")
    .replace(PHONE_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
  const at = withoutBits.match(/^(.+?)\s+at\s+(.+)$/i);
  if (at) {
    return {
      contactName: cleanNamePart(at[1]),
      companyName: cleanNamePart(at[2]),
    };
  }
  const parts = withoutBits
    .split(/\s*(?:,|&| and )\s*/i)
    .map((part) => cleanNamePart(part))
    .filter((part): part is string => Boolean(part));
  if (parts.length >= 2) {
    return { companyName: parts[0], contactName: parts[1] };
  }
  if (parts[0]) return { companyName: parts[0] };
  return {};
}

function parseUpdateTarget(text: string): { search?: string; status?: LeadStatus } {
  const m = text.match(
    /\b(?:mark|set|update|change|move)\s+(?:the\s+)?(.+?)\s+(?:lead\s+)?(?:as|to|status(?:\s+to)?)\s+(new|researched|contacted|follow[- ]?up|interested|proposal|won|lost|identified|qualified|dormant)\b/i
  );
  if (!m) {
    const statusOnly = text.match(
      /\b(new|researched|contacted|follow[- ]?up|interested|proposal|won|lost|identified|qualified|dormant)\b/i
    );
    return { status: parseLeadStatus(statusOnly?.[1] ?? "") ?? undefined };
  }
  return {
    search: cleanNamePart(m[1] ?? ""),
    status: parseLeadStatus(m[2] ?? "") ?? undefined,
  };
}

function parseLookupSearch(text: string): string | undefined {
  const named = text.match(/\blead (?:for|named|called)\s+(.+)/i);
  if (named?.[1]) return cleanNamePart(named[1]);
  const about = text.match(
    /\b(?:tell me about|what(?:'s| is) (?:the )?(?:status of |next action with )?|status of|show(?: me)? (?:the )?)\s*(.+?)\s+lead\b/i
  );
  if (about?.[1]) return cleanNamePart(about[1]);
  const withCo = text.match(
    /\b(?:with|about)\s+(.+?)(?:\s+lead)?\??$/i
  );
  if (withCo?.[1] && !/^(this|that|the) company$/i.test(withCo[1])) {
    return cleanNamePart(withCo[1]);
  }
  return undefined;
}

function parseMatchTerm(text: string): string | undefined {
  if (/\btreasury\b/i.test(text)) return "treasury";
  if (/\bsas\b/i.test(text)) return "sas";
  if (/\bai\b/i.test(text)) return "ai";
  const m = text.match(/\b(?:match|for|about)\s+([a-z0-9 /+-]{2,40})/i);
  return cleanNamePart(m?.[1]);
}

export function wantsLeadsQuery(question: string): boolean {
  const parsed = parseLeadsGideonQuery(question);
  if (parsed.intent !== "unknown") return true;
  return LEADS_KEYWORDS.test(question);
}

export function parseLeadsGideonQuery(query: string): LeadsGideonParseResult {
  const q = query.trim();
  const confirmed = hasExplicitConfirmation(q);

  if (/\byes,?\s+(add this lead|create (the |this )?lead)\b/i.test(q)) {
    const names = parseCreateNames(q);
    return {
      intent: "create",
      companyName: names.companyName,
      contactName: names.contactName,
      email: extractEmail(q),
      phone: extractPhone(q),
      confirmed: true,
      requiresConfirmation: false,
    };
  }

  if (/\byes,?\s+mark it\b/i.test(q)) {
    const { search, status } = parseUpdateTarget(q);
    return {
      intent: "update_status",
      search,
      status,
      confirmed: true,
      requiresConfirmation: false,
    };
  }

  if (CREATE.test(q)) {
    const names = parseCreateNames(q);
    const companyName = names.companyName;
    const contactName = names.contactName;
    const email = extractEmail(q);
    const phone = extractPhone(q);
    const label = [companyName, contactName].filter(Boolean).join(" / ") || "this lead";
    return {
      intent: "create",
      companyName,
      contactName,
      email,
      phone,
      confirmed,
      requiresConfirmation: !confirmed,
      confirmationMessage: `Add ${label} as a lead? Reply "yes, add this lead" to confirm.`,
    };
  }

  if (UPDATE.test(q)) {
    const { search, status } = parseUpdateTarget(q);
    const statusLabel = status ? LEAD_STATUS_LABELS[status] : "that status";
    const name = search || "this lead";
    return {
      intent: "update_status",
      search,
      status,
      confirmed,
      requiresConfirmation: !confirmed,
      confirmationMessage: `Mark ${name} as ${statusLabel}? Reply "yes, mark it" to confirm.`,
    };
  }

  if (TODAY.test(q)) {
    return { intent: "today", requiresConfirmation: false };
  }

  if (MATCH.test(q)) {
    return {
      intent: "match",
      matchTerm: parseMatchTerm(q),
      requiresConfirmation: false,
    };
  }

  if (STALE.test(q)) {
    return {
      intent: FEDERAL.test(q) ? "federal" : "stale",
      leadType: FEDERAL.test(q) ? "federal_partner" : undefined,
      uncontacted: true,
      requiresConfirmation: false,
    };
  }

  if (FEDERAL.test(q)) {
    return {
      intent: "federal",
      leadType: parseLeadType("federal_partner") ?? "federal_partner",
      uncontacted: STALE.test(q) || /haven'?t contacted|not contacted/i.test(q),
      requiresConfirmation: false,
    };
  }

  if (FOLLOW_UP.test(q)) {
    return { intent: "follow_up", requiresConfirmation: false };
  }

  if (LOOKUP.test(q)) {
    return {
      intent: "lookup",
      search: parseLookupSearch(q),
      requiresConfirmation: false,
    };
  }

  if (PIPELINE.test(q) || LEADS_KEYWORDS.test(q)) {
    const statusWord = LEAD_STATUSES.find((s) =>
      new RegExp(`\\b${s.replace("_", "[-_ ]?")}\\b`, "i").test(q)
    );
    const type = parseLeadType(
      /\bfederal\b/i.test(q) ? "federal_partner" : /\bcommercial\b/i.test(q) ? "commercial" : ""
    );
    return {
      intent: "pipeline",
      status: statusWord,
      leadType: type ?? undefined,
      requiresConfirmation: false,
    };
  }

  return { intent: "unknown", requiresConfirmation: false };
}

export function formatLeadLine(lead: BusinessLead): string {
  const score =
    typeof lead.lead_score === "number" ? ` · match ${lead.lead_score}` : "";
  const contact = leadContactLine(lead);
  const contactBit = contact ? ` — ${contact}` : "";
  const type = LEAD_TYPE_LABELS[leadTypeOf(lead)];
  return `${leadDisplayName(lead)}${contactBit} · ${type} · ${LEAD_STATUS_LABELS[lead.status]}${score}`;
}

export function formatLeadPipeline(
  leads: BusinessLead[],
  status?: LeadStatus
): string {
  const scoped = status ? leads.filter((l) => l.status === status) : leads;
  const summary = computeLeadSummary(leads);
  const lines = [
    status
      ? `Leads (${LEAD_STATUS_LABELS[status]}): ${scoped.length}`
      : `Leads pipeline: ${summary.total} · Commercial ${summary.commercial} · Federal Partners ${summary.federal}`,
  ];
  if (!status) {
    lines.push(
      `Need follow-up ${summary.needFollowUp} · Meetings ${summary.meetings} · Proposals ${summary.proposals} · Active partners ${summary.activePartners}`
    );
  }
  const recent = scoped.slice(0, 10);
  if (recent.length) {
    lines.push("", ...recent.map((lead) => `• ${formatLeadLine(lead)}`));
  } else {
    lines.push("No matching leads yet.");
  }
  lines.push("", "→ /leads");
  return lines.join("\n");
}

function formatLeadList(title: string, leads: BusinessLead[]): string {
  if (!leads.length) {
    return `${title}\nNone in Guardian for this workspace.\n\n→ /leads`;
  }
  return [
    `${title} (${leads.length}):`,
    ...leads.slice(0, 8).map((lead) => {
      const next = lead.next_action?.trim();
      const when = lead.next_action_date ? ` by ${lead.next_action_date}` : "";
      return next
        ? `• ${formatLeadLine(lead)}\n  Next: ${next}${when}`
        : `• ${formatLeadLine(lead)}\n  Next: No Next Action`;
    }),
    "",
    "→ /leads",
  ].join("\n");
}

export function formatLeadFollowUps(leads: BusinessLead[]): string {
  const today = new Date().toISOString().slice(0, 10);
  const follow = leads.filter((l) => {
    if (["won", "lost", "dormant"].includes(l.status)) return false;
    if (l.next_action_date && l.next_action_date <= today) return true;
    return ["new", "identified", "researched", "research", "contacted", "follow_up", "interested"].includes(
      l.status
    );
  });
  const ranked = [...follow].sort((a, b) => {
    const score = (b.lead_score ?? -1) - (a.lead_score ?? -1);
    if (score !== 0) return score;
    return (a.next_action_date ?? "9999").localeCompare(b.next_action_date ?? "9999");
  });
  return formatLeadList("Leads to follow up", ranked);
}

export function formatTodaysActions(leads: BusinessLead[]): string {
  const today = todaysActionLeads(leads);
  const b = todaysActionBreakdown(leads);
  if (!today.length) {
    return "Nothing is due today. Open /leads and set a next action on active relationships.\n\n→ /leads";
  }
  return [
    `Today's actions (${b.total}):`,
    `Federal Partners — ${b.federal}`,
    `Commercial Leads — ${b.commercial}`,
    `Proposal Follow-Ups — ${b.proposals}`,
    `Meetings — ${b.meetings}`,
    "",
    ...today.slice(0, 10).map((lead) => {
      const why = lead.next_action?.trim() || "No Next Action — set one after you open the lead.";
      return `• ${formatLeadLine(lead)}\n  ${why}${lead.next_action_date ? ` (${lead.next_action_date})` : ""}`;
    }),
    "",
    "→ /leads",
  ].join("\n");
}

export function formatFederalPartners(
  leads: BusinessLead[],
  uncontacted = false
): string {
  let partners = leads.filter((l) => leadTypeOf(l) === "federal_partner");
  if (uncontacted) {
    partners = partners.filter(
      (l) =>
        !l.last_contact_at &&
        ["identified", "research", "researched", "qualified", "contact_ready"].includes(
          l.status
        )
    );
  }
  return formatLeadList(
    uncontacted ? "Federal partners not yet contacted" : "Federal partners",
    partners
  );
}

export function formatMatchLeads(leads: BusinessLead[], term?: string): string {
  const q = (term ?? "").trim().toLowerCase();
  if (!q) {
    return formatLeadList(
      "Highest NM2TECH match scores",
      [...leads]
        .filter((l) => l.lead_score != null)
        .sort((a, b) => (b.lead_score ?? 0) - (a.lead_score ?? 0))
    );
  }
  const matched = leads.filter((lead) => {
    const hay = [
      lead.market_agency,
      lead.federal_agencies_served,
      lead.primary_capabilities,
      lead.technology_areas,
      lead.match_explanation,
      lead.recommended_service,
      lead.opportunity_summary,
      lead.notes,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
  return formatLeadList(
    `Partners matching "${term}" (from recorded fields only)`,
    matched.sort((a, b) => (b.lead_score ?? 0) - (a.lead_score ?? 0))
  );
}

export function formatStaleLeads(leads: BusinessLead[]): string {
  return formatLeadList(
    "Relationships with no contact in 30 days",
    staleLeads(leads, 30)
  );
}

export function formatLeadDetail(
  lead: BusinessLead,
  activities: LeadActivity[] = []
): string {
  const last = activities[0];
  const bits = [
    formatLeadLine(lead),
    lead.email ? `Email: ${lead.email}` : null,
    lead.phone ? `Phone: ${lead.phone}` : null,
    lead.website ? `Website: ${lead.website}` : null,
    lead.market_agency ? `Market / agency: ${lead.market_agency}` : null,
    lead.match_explanation ? `Why they match: ${lead.match_explanation}` : null,
    lead.recommended_approach
      ? `Recommended approach: ${lead.recommended_approach}`
      : null,
    lead.recommended_service
      ? `Recommended: ${lead.recommended_service}`
      : null,
    lead.next_action
      ? `Next: ${lead.next_action}${lead.next_action_date ? ` (${lead.next_action_date})` : ""}`
      : "Next: No Next Action",
    lead.opportunity_summary ? lead.opportunity_summary : null,
    last
      ? `Last logged interaction (${(last.occurred_at ?? last.created_at).slice(0, 10)}): ${last.description ?? last.activity_type}`
      : "No interactions logged in Guardian.",
  ].filter(Boolean);
  bits.push("", `→ /leads`);
  return bits.join("\n");
}

export const LEADS_AGENT_SYSTEM_NOTE = `When the user asks about leads, federal partners, follow-ups, or the relationship pipeline, use Guardian Leads for this business workspace.
Answer from actual lead records and logged interactions only. Do not invent meetings, emails, contracts, certifications, or outreach.
Point them to /leads for card scan, import, research, outreach drafts, and proposals.
Creating or changing a lead requires an explicit yes from the user. Outreach is never sent automatically.`;
