import type {
  OrganizationAiOutput,
  OrganizationSuggestionPayload,
  OrganizationSuggestionRow,
  RecommendedAction,
} from "./types";

function formatDocumentType(type: string | null): string {
  if (!type) return "document";
  return type.replace(/_/g, " ");
}

function buildHeadline(
  ai: OrganizationAiOutput | null,
  row: OrganizationSuggestionRow
): string {
  const typeLabel = formatDocumentType(row.document_type);
  const profile = row.suggested_profile_name?.trim();
  const summary = ai?.summary?.trim();
  if (summary && summary.length < 120) {
    return `Guardian recognized this as ${typeLabel}: ${summary}`;
  }
  if (profile) {
    return `Guardian recognized this as a ${typeLabel} related to ${profile}.`;
  }
  return `Guardian analyzed this ${typeLabel} and has a location suggestion.`;
}

function buildDetected(ai: OrganizationAiOutput | null, row: OrganizationSuggestionRow): string[] {
  const out: string[] = [];
  const entities = row.detected_entities ?? {};
  const people = Array.isArray(entities.people) ? entities.people : [];
  const topics = Array.isArray(entities.topics) ? entities.topics : [];
  const organizations = Array.isArray(entities.organizations)
    ? entities.organizations
    : [];
  const dates = Array.isArray(entities.dates) ? entities.dates : [];

  if (people.length > 0) {
    out.push(`${people.length} ${people.length === 1 ? "person" : "people"} mentioned`);
  }
  if (organizations.length > 0) {
    out.push(`${organizations.length} ${organizations.length === 1 ? "organization" : "organizations"}`);
  }
  if (topics.length > 0) {
    out.push(topics.slice(0, 3).join(", "));
  }
  if (dates.length > 0) {
    out.push(`${dates.length} important ${dates.length === 1 ? "date" : "dates"}`);
  }
  if (ai?.title && !out.length) {
    out.push(ai.title);
  }
  return out.slice(0, 6);
}

export function toOrganizationSuggestionPayload(
  row: OrganizationSuggestionRow,
  ai: OrganizationAiOutput | null,
  options?: { autoApplied?: boolean }
): OrganizationSuggestionPayload {
  const profileName = row.suggested_profile_name;
  const vaultName = row.suggested_vault_name;
  const sameVault =
    profileName &&
    vaultName &&
    profileName.toLowerCase() === vaultName.toLowerCase();
  const profilePath =
    profileName && vaultName && !sameVault
      ? `${profileName} → ${vaultName}`
      : vaultName || profileName;

  return {
    id: row.id,
    documentId: row.document_id,
    headline: buildHeadline(ai, row),
    recommendedAction: row.recommended_action as RecommendedAction,
    profileName: profileName ?? null,
    vaultName: vaultName ?? null,
    profilePath,
    detected: buildDetected(ai, row),
    tags: row.suggested_tags ?? [],
    reason: row.reason ?? "",
    confidence: Number(row.confidence) || 0,
    showConfidence: Number(row.confidence) > 0 && Number(row.confidence) < 0.92,
    duplicateWarning: row.duplicate_warning,
    status: row.status,
    autoApplied: options?.autoApplied ?? false,
    previousProfileId: row.previous_profile_id,
    suggestedProfileId: row.suggested_profile_id,
    suggestedVaultId: row.suggested_vault_id,
  };
}
