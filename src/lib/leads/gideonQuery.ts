import {
  LEAD_STATUS_LABELS,
  LEAD_STATUSES,
  computeLeadSummary,
  leadContactLine,
  leadDisplayName,
  type BusinessLead,
  type LeadStatus,
} from "./types";
import { parseLeadStatus } from "./validators";

export type LeadsGideonIntent =
  | "pipeline"
  | "lookup"
  | "follow_up"
  | "create"
  | "update_status"
  | "unknown";

export type LeadsGideonParseResult = {
  intent: LeadsGideonIntent;
  search?: string;
  status?: LeadStatus;
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
  /\b((my|our|the) leads|sales leads?|lead pipeline|sales pipeline|how many leads)\b/i;

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/;

const CREATE =
  /\b(add|create|save)\s+(a |an |this )?(new )?lead\b|\badd .{0,60} as a(?: new)? lead\b/i;

const UPDATE =
  /\b(mark|set|update|change|move)\b.{0,80}\b(as|to|status)\b.{0,20}\b(new|researched|contacted|follow[- ]?up|interested|proposal|won|lost)\b/i;

const FOLLOW_UP =
  /\b(which |what )?leads?\b.{0,30}\b(follow[- ]?up|need (a )?call|to contact)\b|\bfollow[- ]?up (on |with )?(my |our )?leads?\b/i;

const LOOKUP =
  /\b(tell me about|what(?:'s| is) (the )?(status of )?|status of|show(?: me)? (the )?).{0,60}\blead\b|\blead (?:for|named|called)\b/i;

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
    .replace(/\b(lead|please|named|called|for|the|a|an)\b/gi, " ")
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
    /\b(?:mark|set|update|change|move)\s+(?:the\s+)?(.+?)\s+(?:lead\s+)?(?:as|to|status(?:\s+to)?)\s+(new|researched|contacted|follow[- ]?up|interested|proposal|won|lost)\b/i
  );
  if (!m) {
    const statusOnly = text.match(
      /\b(new|researched|contacted|follow[- ]?up|interested|proposal|won|lost)\b/i
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
    /\b(?:tell me about|what(?:'s| is) (?:the )?(?:status of )?|status of|show(?: me)? (?:the )?)\s*(.+?)\s+lead\b/i
  );
  if (about?.[1]) return cleanNamePart(about[1]);
  return undefined;
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
    return {
      intent: "pipeline",
      status: statusWord,
      requiresConfirmation: false,
    };
  }

  return { intent: "unknown", requiresConfirmation: false };
}

export function formatLeadLine(lead: BusinessLead): string {
  const score =
    typeof lead.lead_score === "number" ? ` · score ${lead.lead_score}` : "";
  const contact = leadContactLine(lead);
  const contactBit = contact ? ` — ${contact}` : "";
  return `${leadDisplayName(lead)}${contactBit} · ${LEAD_STATUS_LABELS[lead.status]}${score}`;
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
      : `Leads pipeline: ${summary.total}`,
  ];
  if (!status) {
    lines.push(
      `New ${summary.new} · Contacted ${summary.contacted} · Interested ${summary.interested} · Proposal ${summary.proposal} · Won ${summary.won}`
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

export function formatLeadFollowUps(leads: BusinessLead[]): string {
  const follow = leads.filter((l) =>
    ["new", "researched", "contacted", "follow_up", "interested"].includes(
      l.status
    )
  );
  if (!follow.length) {
    return "No leads currently need follow-up.\n\n→ /leads";
  }
  const ranked = [...follow].sort((a, b) => {
    const score = (b.lead_score ?? -1) - (a.lead_score ?? -1);
    if (score !== 0) return score;
    return (b.last_activity_at ?? "").localeCompare(a.last_activity_at ?? "");
  });
  return [
    `Leads to follow up (${ranked.length}):`,
    ...ranked.slice(0, 8).map((lead) => {
      const next = lead.next_action?.trim();
      return next
        ? `• ${formatLeadLine(lead)}\n  Next: ${next}`
        : `• ${formatLeadLine(lead)}`;
    }),
    "",
    "→ /leads",
  ].join("\n");
}

export function formatLeadDetail(lead: BusinessLead): string {
  const bits = [
    formatLeadLine(lead),
    lead.email ? `Email: ${lead.email}` : null,
    lead.phone ? `Phone: ${lead.phone}` : null,
    lead.website ? `Website: ${lead.website}` : null,
    lead.recommended_service
      ? `Recommended: ${lead.recommended_service}`
      : null,
    lead.next_action ? `Next: ${lead.next_action}` : null,
    lead.opportunity_summary ? lead.opportunity_summary : null,
  ].filter(Boolean);
  bits.push("", `→ /leads`);
  return bits.join("\n");
}

export const LEADS_AGENT_SYSTEM_NOTE = `When the user asks about leads, the sales pipeline, or prospects, use Guardian Leads for this business workspace.
Do not invent leads. Point them to /leads for card scan, import, outreach drafts, and proposals.
Creating or changing a lead requires an explicit yes from the user.`;
