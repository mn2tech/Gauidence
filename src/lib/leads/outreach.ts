export type LeadOutreachDraft = {
  subject: string;
  body: string;
  createdAt: string;
};

export const LEAD_OUTREACH_SYSTEM = `You write short, personal introduction emails for business outreach.

Return strict JSON only (no markdown fences):
{
  "subject": string,
  "body": string
}

Rules:
- Use the contact name, company, where we met, notes, and opportunity brief provided.
- Sound human and specific — as if the sender recently met or researched this person.
- NEVER use generic agency marketing (e.g. "leading provider", "innovative solutions", "cutting-edge").
- Keep the email body under 120 words unless the context truly needs more.
- Include a natural soft call to action, not a hard sales pitch.
- If no contact name is provided, use a friendly greeting without inventing a name.
- Use plain text in body (no HTML). Paragraph breaks with blank lines are fine.`;

export function buildLeadOutreachUserPrompt(args: {
  companyName?: string | null;
  contactName?: string | null;
  sourceDetail?: string | null;
  source?: string | null;
  notes?: string | null;
  primaryNeed?: string | null;
  recommendedService?: string | null;
  conversationAngle?: string | null;
  reasoning?: string | null;
  suggestedOpening?: string | null;
  senderName?: string | null;
  businessName?: string | null;
  leadType?: string | null;
  matchExplanation?: string | null;
  recommendedApproach?: string | null;
  capabilities?: string | null;
  recentHistory?: string | null;
}): string {
  const parts = [
    args.senderName ? `Sender name: ${args.senderName}` : null,
    args.businessName ? `Sender business: ${args.businessName}` : null,
    `Company: ${args.companyName ?? "(unknown)"}`,
    `Contact: ${args.contactName ?? "(unknown)"}`,
    args.leadType
      ? `Lead type: ${args.leadType === "federal_partner" ? "Federal Partner (teaming/subcontracting, not a hard sell)" : "Commercial"}`
      : null,
    args.source ? `Source: ${args.source}` : null,
    args.sourceDetail ? `Where we met: ${args.sourceDetail}` : null,
    args.notes ? `Notes: ${args.notes}` : null,
    args.capabilities ? `Company capabilities (as recorded): ${args.capabilities}` : null,
    args.primaryNeed ? `Opportunity: ${args.primaryNeed}` : null,
    args.recommendedService
      ? `Recommended service: ${args.recommendedService}`
      : null,
    args.conversationAngle
      ? `Conversation angle: ${args.conversationAngle}`
      : null,
    args.reasoning ? `Why this matters: ${args.reasoning}` : null,
    args.matchExplanation
      ? `NM2TECH match explanation: ${args.matchExplanation}`
      : null,
    args.recommendedApproach
      ? `Recommended approach: ${args.recommendedApproach}`
      : null,
    args.suggestedOpening
      ? `Suggested opening line (optional inspiration): ${args.suggestedOpening}`
      : null,
    args.recentHistory
      ? `Logged relationship history (do not invent extra events):\n${args.recentHistory}`
      : "Logged relationship history: none recorded.",
    "",
    "Write a personalized introduction email the sender can review, edit, approve, and send manually. Do not assume it will be sent automatically.",
  ];
  return parts.filter(Boolean).join("\n");
}

export function parseOutreachDraft(raw: string): LeadOutreachDraft | null {
  const trimmed = raw.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  const jsonText = jsonMatch ? jsonMatch[0] : trimmed;
  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    const subject = String(parsed.subject ?? "").trim();
    const body = String(parsed.body ?? "").trim();
    if (!subject || !body) return null;
    return {
      subject,
      body,
      createdAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
