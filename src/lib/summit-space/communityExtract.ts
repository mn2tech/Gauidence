import "server-only";

import {
  createLlmClient,
  runChatCompletion,
  ANALYSIS_MODEL,
} from "@/lib/analysis/llm";
import type { CommunityExtractionResult, ProposedEntity } from "./contributions";

const COMMUNITY_EXTRACT_SYSTEM = `You extract structured summit intelligence from attendee photos, slides, or notes.

Return JSON only with this shape:
{
  "sessionTitle": string | null,
  "organizations": [{ "name": string, "description": string | null }],
  "speakers": [{ "name": string, "title": string | null, "organization": string | null }],
  "agencies": [{ "name": string, "description": string | null }],
  "opportunities": [{ "name": string, "description": string | null, "organization": string | null }],
  "resources": [{ "name": string, "description": string | null, "url": string | null }],
  "takeaways": [string],
  "notes": [string],
  "rawText": string
}

Rules:
- Extract only text visibly present or clearly stated in the submission.
- Do not invent email addresses, phone numbers, contract vehicles, or opportunities.
- Mark all extracted items as PROPOSED — they require admin review before publication.
- If uncertain, leave fields null or empty.`;

function buildProposedEntities(parsed: {
  sessionTitle?: string | null;
  organizations?: { name: string; description?: string }[];
  speakers?: { name: string; title?: string; organization?: string }[];
  agencies?: { name: string; description?: string }[];
  opportunities?: { name: string; description?: string; organization?: string }[];
  resources?: { name: string; description?: string; url?: string }[];
  takeaways?: string[];
}): ProposedEntity[] {
  const proposed: ProposedEntity[] = [];

  if (parsed.sessionTitle) {
    proposed.push({
      entityType: "session",
      name: parsed.sessionTitle,
    });
  }

  for (const org of parsed.organizations ?? []) {
    proposed.push({
      entityType: "organization",
      name: org.name,
      description: org.description ?? null,
    });
  }

  for (const speaker of parsed.speakers ?? []) {
    proposed.push({
      entityType: "person",
      name: speaker.name,
      description: speaker.title
        ? `${speaker.title}${speaker.organization ? ` at ${speaker.organization}` : ""}`
        : null,
      properties: {
        title: speaker.title ?? null,
        organization: speaker.organization ?? null,
      },
      relationshipType: speaker.organization ? "works_for" : undefined,
      relatedToName: speaker.organization,
      relatedToType: "organization",
    });
    if (parsed.sessionTitle) {
      proposed.push({
        entityType: "person",
        name: speaker.name,
        relationshipType: "spoke_at",
        relatedToName: parsed.sessionTitle,
        relatedToType: "session",
      });
    }
  }

  for (const agency of parsed.agencies ?? []) {
    proposed.push({
      entityType: "agency",
      name: agency.name,
      description: agency.description ?? null,
    });
  }

  for (const opp of parsed.opportunities ?? []) {
    proposed.push({
      entityType: "opportunity",
      name: opp.name,
      description: opp.description ?? null,
      properties: opp.organization
        ? { organization_slug: null, opportunity_type: "Business Development" }
        : {},
      relationshipType: opp.organization ? "related_to" : undefined,
      relatedToName: opp.organization,
      relatedToType: "organization",
    });
  }

  for (const res of parsed.resources ?? []) {
    proposed.push({
      entityType: "resource",
      name: res.name,
      description: res.description ?? null,
      properties: res.url ? { official_url: res.url } : {},
    });
  }

  for (const takeaway of parsed.takeaways ?? []) {
    proposed.push({
      entityType: "action_item",
      name: takeaway,
      properties: { category: "takeaway" },
      relationshipType: parsed.sessionTitle ? "related_to" : undefined,
      relatedToName: parsed.sessionTitle ?? undefined,
      relatedToType: parsed.sessionTitle ? "session" : undefined,
    });
  }

  return proposed;
}

function normalizeExtraction(parsed: Record<string, unknown>): CommunityExtractionResult {
  const sessionTitle =
    typeof parsed.sessionTitle === "string" ? parsed.sessionTitle : null;

  const result: CommunityExtractionResult = {
    sessionTitle,
    organizations: Array.isArray(parsed.organizations)
      ? (parsed.organizations as CommunityExtractionResult["organizations"])
      : [],
    speakers: Array.isArray(parsed.speakers)
      ? (parsed.speakers as CommunityExtractionResult["speakers"])
      : [],
    agencies: Array.isArray(parsed.agencies)
      ? (parsed.agencies as CommunityExtractionResult["agencies"])
      : [],
    opportunities: Array.isArray(parsed.opportunities)
      ? (parsed.opportunities as CommunityExtractionResult["opportunities"])
      : [],
    resources: Array.isArray(parsed.resources)
      ? (parsed.resources as CommunityExtractionResult["resources"])
      : [],
    takeaways: Array.isArray(parsed.takeaways)
      ? (parsed.takeaways as string[])
      : [],
    notes: Array.isArray(parsed.notes) ? (parsed.notes as string[]) : [],
    rawText: typeof parsed.rawText === "string" ? parsed.rawText : "",
    proposedEntities: [],
  };

  result.proposedEntities = buildProposedEntities(result);
  return result;
}

export async function extractCommunityContributionFromText(
  text: string,
  contributionType?: string
): Promise<CommunityExtractionResult> {
  const client = createLlmClient();
  const raw = await runChatCompletion(client, {
    system: COMMUNITY_EXTRACT_SYSTEM,
    model: ANALYSIS_MODEL,
    maxTokens: 1500,
    messages: [
      {
        role: "user",
        content: `Contribution type: ${contributionType ?? "note"}\n\nExtract proposed summit intelligence from this attendee submission:\n\n${text.slice(0, 8000)}`,
      },
    ],
  });

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const result = normalizeExtraction(parsed);
    if (!result.rawText) result.rawText = text.slice(0, 4000);
    return result;
  } catch {
    return {
      sessionTitle: null,
      organizations: [],
      speakers: [],
      agencies: [],
      opportunities: [],
      resources: [],
      takeaways: [],
      notes: [text.slice(0, 500)],
      rawText: text.slice(0, 4000),
      proposedEntities: [],
    };
  }
}

export async function extractCommunityContributionFromImage(
  imageBase64: string,
  mimeType: string,
  contributionType?: string
): Promise<CommunityExtractionResult> {
  const client = createLlmClient();
  const raw = await runChatCompletion(client, {
    system: COMMUNITY_EXTRACT_SYSTEM,
    model: ANALYSIS_MODEL,
    maxTokens: 1500,
    attachedImage: {
      mimeType,
      base64: imageBase64,
      fileName: "community-contribution.jpg",
    },
    messages: [
      {
        role: "user",
        content: `Contribution type: ${contributionType ?? "photo"}\n\nExtract proposed summit intelligence from this image. Return JSON only.`,
      },
    ],
  });

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return normalizeExtraction(parsed);
  } catch {
    return {
      sessionTitle: null,
      organizations: [],
      speakers: [],
      agencies: [],
      opportunities: [],
      resources: [],
      takeaways: [],
      notes: [],
      rawText: "",
      proposedEntities: [],
    };
  }
}

export function buildDefaultApprovedEntities(
  extraction: CommunityExtractionResult
): import("./contributions").ApprovedEntitySpec[] {
  return extraction.proposedEntities.map((p) => ({
    entityType: p.entityType,
    name: p.name,
    description: p.description ?? null,
    properties: p.properties ?? {},
    relationshipType: p.relationshipType,
    relatedToSlug: p.relatedToName
      ? p.relatedToName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .slice(0, 80)
      : undefined,
    relatedToType: p.relatedToType,
    create: true,
  }));
}
