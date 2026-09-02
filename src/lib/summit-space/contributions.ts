import type { SummitEntityRow } from "./types";

export const CONTRIBUTION_TYPES = [
  "photo",
  "takeaway",
  "opportunity",
  "resource",
  "note",
] as const;

export type ContributionType = (typeof CONTRIBUTION_TYPES)[number];

export const CONTRIBUTION_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "published",
] as const;

export type ContributionStatus = (typeof CONTRIBUTION_STATUSES)[number];

export const CONTRIBUTION_TYPE_LABELS: Record<ContributionType, string> = {
  photo: "Photo",
  takeaway: "Takeaway",
  opportunity: "Opportunity",
  resource: "Resource",
  note: "General Note",
};

export const CONTRIBUTION_TYPE_ICONS: Record<ContributionType, string> = {
  photo: "📷",
  takeaway: "💡",
  opportunity: "🎯",
  resource: "🔗",
  note: "📝",
};

export const ALLOWED_CONTRIBUTION_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

export const MAX_CONTRIBUTION_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_CONTRIBUTION_TEXT_LENGTH = 5000;
export const CONTRIBUTION_RATE_LIMIT = 5;
export const CONTRIBUTION_RATE_WINDOW_MS = 60 * 60 * 1000;

export type SummitCommunityContributionRow = {
  id: string;
  summit_slug: string;
  contribution_type: ContributionType;
  status: ContributionStatus;
  content: string;
  session_entity_id: string | null;
  organization_entity_id: string | null;
  speaker_entity_id: string | null;
  source_url: string | null;
  contributor_name: string | null;
  contributor_company: string | null;
  contributor_email: string | null;
  display_name_publicly: boolean;
  permission_confirmed: boolean;
  file_path: string | null;
  file_mime_type: string | null;
  extracted_data: Record<string, unknown>;
  approved_entities: ApprovedEntitySpec[];
  published_entity_ids: string[];
  published_summary: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  published_at: string | null;
  rejection_reason: string | null;
  submission_ip_hash: string | null;
  created_at: string;
  updated_at: string;
};

export type ProposedEntity = {
  entityType: string;
  name: string;
  description?: string | null;
  properties?: Record<string, unknown>;
  relationshipType?: string;
  relatedToName?: string;
  relatedToType?: string;
};

export type CommunityExtractionResult = {
  sessionTitle: string | null;
  organizations: { name: string; description?: string }[];
  speakers: { name: string; title?: string; organization?: string }[];
  agencies: { name: string; description?: string }[];
  opportunities: { name: string; description?: string; organization?: string }[];
  resources: { name: string; description?: string; url?: string }[];
  takeaways: string[];
  notes: string[];
  rawText: string;
  proposedEntities: ProposedEntity[];
};

export type ApprovedEntitySpec = {
  entityType: string;
  name: string;
  description?: string | null;
  properties?: Record<string, unknown>;
  relationshipType?: string;
  relatedToSlug?: string;
  relatedToType?: string;
  create: boolean;
};

export function resolveContributionMimeType(file: File): string | null {
  const fromType = file.type?.trim();
  if (fromType && ALLOWED_CONTRIBUTION_MIME_TYPES.has(fromType)) {
    return fromType;
  }

  const name = file.name.toLowerCase();
  if (name.endsWith(".heic")) return "image/heic";
  if (name.endsWith(".heif")) return "image/heif";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".pdf")) return "application/pdf";
  if (fromType?.startsWith("image/")) return fromType;
  return null;
}

export function contributionFileExtension(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/heic":
      return "heic";
    case "image/heif":
      return "heif";
    case "application/pdf":
      return "pdf";
    default:
      return mime.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
  }
}

export function slugifyEntityName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function sanitizeContributionText(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/<[^>]*>/g, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+\s*=/gi, "")
    .trim()
    .slice(0, MAX_CONTRIBUTION_TEXT_LENGTH);
}

export function sanitizeContributionUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().slice(0, 2048);
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function sanitizeContributorField(
  raw: unknown,
  maxLen = 200
): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = sanitizeContributionText(raw).slice(0, maxLen);
  return cleaned || null;
}

export function isValidContributionEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase().slice(0, 320);
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export type PublicContributionView = {
  id: string;
  contributionType: ContributionType;
  content: string;
  publishedSummary: string | null;
  sourceUrl: string | null;
  session: { slug: string; name: string } | null;
  organization: { slug: string; name: string } | null;
  speaker: { slug: string; name: string } | null;
  contributorName: string | null;
  contributorCompany: string | null;
  sourceType: "community";
  publishedAt: string;
  hasImage: boolean;
  imageUrl: string | null;
};

export function toPublicContributionView(
  row: SummitCommunityContributionRow,
  entities: SummitEntityRow[],
  imageUrl: string | null = null
): PublicContributionView {
  const entityMap = new Map(entities.map((e) => [e.id, e]));

  const session = row.session_entity_id
    ? entityMap.get(row.session_entity_id)
    : null;
  const organization = row.organization_entity_id
    ? entityMap.get(row.organization_entity_id)
    : null;
  const speaker = row.speaker_entity_id
    ? entityMap.get(row.speaker_entity_id)
    : null;

  return {
    id: row.id,
    contributionType: row.contribution_type,
    content: row.published_summary ?? row.content,
    publishedSummary: row.published_summary,
    sourceUrl: row.source_url,
    session: session?.slug ? { slug: session.slug, name: session.name } : null,
    organization: organization?.slug
      ? { slug: organization.slug, name: organization.name }
      : null,
    speaker: speaker?.slug ? { slug: speaker.slug, name: speaker.name } : null,
    contributorName:
      row.display_name_publicly && row.contributor_name
        ? row.contributor_name
        : null,
    contributorCompany:
      row.display_name_publicly && row.contributor_company
        ? row.contributor_company
        : null,
    sourceType: "community",
    publishedAt: row.published_at ?? row.created_at,
    hasImage: Boolean(row.file_path),
    imageUrl,
  };
}

export function stripPrivateContributionFields(
  row: SummitCommunityContributionRow
): Omit<
  SummitCommunityContributionRow,
  "contributor_email" | "submission_ip_hash"
> & { contributor_email?: never; submission_ip_hash?: never } {
  const { contributor_email: _email, submission_ip_hash: _ip, ...safe } = row;
  return safe;
}

export function contributionStatusCounts(
  rows: Pick<SummitCommunityContributionRow, "status">[]
): Record<ContributionStatus, number> {
  const counts: Record<ContributionStatus, number> = {
    pending: 0,
    approved: 0,
    rejected: 0,
    published: 0,
  };
  for (const row of rows) {
    counts[row.status] += 1;
  }
  return counts;
}

export function filterContributionsByType(
  views: PublicContributionView[],
  filter: "all" | ContributionType
): PublicContributionView[] {
  if (filter === "all") return views;
  if (filter === "note") {
    return views.filter((v) => v.contributionType === "note");
  }
  return views.filter((v) => v.contributionType === filter);
}
