import type { DocumentAnalysisContext } from "./document-analysis-context";
import { suggestionKey } from "./normalize";
import type { KnowledgeInput, KnowledgePreview } from "./types";

export type ProactiveSuggestionKind =
  | "deadline"
  | "renewal"
  | "workspace_recommendation"
  | "follow_up";

export type ProactiveSuggestionDraft = {
  kind: ProactiveSuggestionKind;
  title: string;
  body?: string;
  priority: number;
  dueDate?: string;
  profileId?: string;
  sourceType?: string;
  sourceId?: string;
  normalizedKey: string;
  metadata?: Record<string, unknown>;
};

const RENEWAL_DOC_TYPES = new Set([
  "insurance",
  "insurance_policy",
  "passport",
  "drivers_license",
  "license",
  "registration",
  "vehicle_registration",
]);

function daysUntil(isoDate: string): number | null {
  const due = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(due.getTime())) return null;
  const today = new Date();
  const start = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate()
  );
  const end = Date.UTC(
    due.getUTCFullYear(),
    due.getUTCMonth(),
    due.getUTCDate()
  );
  return Math.round((end - start) / (24 * 60 * 60 * 1000));
}

function profileNameSet(names: string[]): Set<string> {
  return new Set(names.map((n) => n.trim().toLowerCase()).filter(Boolean));
}

function deadlinesFromAnalysis(
  input: KnowledgeInput,
  context: DocumentAnalysisContext
): ProactiveSuggestionDraft[] {
  const drafts: ProactiveSuggestionDraft[] = [];

  for (const date of context.importantDates) {
    if (!date.date) continue;
    const days = daysUntil(date.date);
    if (days === null) continue;
    if (!date.isDeadline && days > 60) continue;
    if (days < -7) continue;

    const label = date.label.trim() || date.value.trim() || "Deadline";
    const urgency =
      days <= 7 ? 90 : days <= 30 ? 75 : days <= 60 ? 60 : 45;

    drafts.push({
      kind: "deadline",
      title:
        days <= 0
          ? `${label} may be overdue`
          : days <= 14
            ? `${label} in ${days} day${days === 1 ? "" : "s"}`
            : `${label} coming up`,
      body: `Found in ${input.metadata?.fileName ?? "a document"} — ${date.value}`,
      priority: urgency,
      dueDate: date.date,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      normalizedKey: suggestionKey("deadline", [
        input.profileId,
        date.date,
        label,
      ]),
      metadata: {
        daysUntil: days,
        isDeadline: date.isDeadline,
      },
    });
  }

  return drafts;
}

function renewalFromMetadata(
  input: KnowledgeInput,
  context: DocumentAnalysisContext
): ProactiveSuggestionDraft[] {
  const docType = String(input.metadata?.documentType ?? context.documentType ?? "")
    .trim()
    .toLowerCase();
  if (!docType || !RENEWAL_DOC_TYPES.has(docType)) return [];

  const expiry = context.importantDates.find(
    (d) => d.isDeadline || /expir|renew|due/i.test(d.label)
  );
  if (!expiry?.date) return [];

  const days = daysUntil(expiry.date);
  if (days === null || days > 90 || days < -30) return [];

  const title =
    docType.includes("passport")
      ? "Passport renewal"
      : docType.includes("insurance")
        ? "Insurance renewal"
        : docType.includes("license") || docType.includes("registration")
          ? "License or registration renewal"
          : "Document renewal";

  return [
    {
      kind: "renewal",
      title:
        days <= 30
          ? `${title} — ${days} day${days === 1 ? "" : "s"} left`
          : title,
      body: context.summary.trim() || undefined,
      priority: days <= 30 ? 85 : 65,
      dueDate: expiry.date,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      normalizedKey: suggestionKey("renewal", [
        input.profileId,
        docType,
        expiry.date,
      ]),
      metadata: { documentType: docType, daysUntil: days },
    },
  ];
}

function workspaceRecommendations(
  input: KnowledgeInput,
  preview: KnowledgePreview,
  existingProfiles: Set<string>
): ProactiveSuggestionDraft[] {
  const drafts: ProactiveSuggestionDraft[] = [];

  for (const entity of preview.entities) {
    if (entity.type !== "organization") continue;
    const name = entity.name.trim();
    if (!name || name.length < 3) continue;
    if (existingProfiles.has(name.toLowerCase())) continue;

    drafts.push({
      kind: "workspace_recommendation",
      title: `Create a workspace for ${name}?`,
      body: "Guardian noticed a new business or organization in your documents.",
      priority: 55,
      profileId: input.profileId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      normalizedKey: suggestionKey("workspace", [name]),
      metadata: { organizationName: name },
    });
  }

  return drafts.slice(0, 2);
}

function followUpsFromMemories(
  input: KnowledgeInput,
  preview: KnowledgePreview
): ProactiveSuggestionDraft[] {
  const actionMemories = preview.suggestedMemories.filter(
    (m) => m.category === "action" && m.value.trim()
  );
  if (actionMemories.length === 0) return [];

  const top = actionMemories.sort((a, b) => b.importance - a.importance)[0];
  return [
    {
      kind: "follow_up",
      title: "Suggested follow-up",
      body: top.value.trim(),
      priority: 50,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      normalizedKey: suggestionKey("follow_up", [
        input.sourceId,
        top.key ?? top.value.slice(0, 40),
      ]),
      metadata: { category: top.category },
    },
  ];
}

export function buildProactiveSuggestions(
  input: KnowledgeInput,
  preview: KnowledgePreview,
  options?: { profileNames?: string[] }
): ProactiveSuggestionDraft[] {
  const existingProfiles = profileNameSet(options?.profileNames ?? []);
  const drafts: ProactiveSuggestionDraft[] = [];

  if (input.analysisContext) {
    drafts.push(...deadlinesFromAnalysis(input, input.analysisContext));
    drafts.push(...renewalFromMetadata(input, input.analysisContext));
  }

  drafts.push(
    ...workspaceRecommendations(input, preview, existingProfiles)
  );
  drafts.push(...followUpsFromMemories(input, preview));

  const seen = new Set<string>();
  return drafts.filter((draft) => {
    if (seen.has(draft.normalizedKey)) return false;
    seen.add(draft.normalizedKey);
    return true;
  });
}
