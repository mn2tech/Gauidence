import { CONTEXT_PRIORITY } from "./types";
import type { ArtifactIdentity, ArtifactSourceType } from "./types";

/**
 * System note enforcing context priority. Architecture still filters retrieval;
 * this note prevents the model from elevating lower-priority material.
 */
export function contextPrioritySystemNote(args: {
  hasCurrentArtifact: boolean;
  sourceType?: ArtifactSourceType | null;
}): string {
  const typeLine = args.sourceType
    ? `Current artifact source_type=${args.sourceType}.`
    : "";
  if (!args.hasCurrentArtifact) {
    return `CONTEXT PRIORITY:
Priority 0 — Current user input (message text / uploads in this turn)
Priority 1 — Directly linked artifact content
Priority 2 — Same-thread / same-document context
Priority 3 — Relevant knowledge from the current Space
Priority 4 — Cross-space Guardian knowledge (permissions + relevance required)
Priority 5 — General model knowledge
Never let lower-priority material replace or override Priority 0.
NO SOURCE → NO CLAIM: Do not claim to see attachments, images, or documents unless they appear in ATTACHED DOCUMENT, CURRENT ARTIFACT, or named RETRIEVED EXCERPTS that passed evidence validation.`;
  }

  return `CONTEXT PRIORITY (current-artifact mode):
${typeLine}
Priority ${CONTEXT_PRIORITY.CURRENT_INPUT} — CURRENT ARTIFACT / ATTACHED DOCUMENT is the primary source of truth for this turn. Analyze it first.
Priority ${CONTEXT_PRIORITY.LINKED_ARTIFACT} — Attachments and extracted content belonging to that artifact.
Priority ${CONTEXT_PRIORITY.SAME_THREAD} — Same-thread context only.
Priority ${CONTEXT_PRIORITY.SPACE_KNOWLEDGE} — Other Space knowledge only when it materially helps interpret the current artifact (already filtered by retrieval guard).
Priority ${CONTEXT_PRIORITY.CROSS_SPACE} / ${CONTEXT_PRIORITY.GENERAL_MODEL} — Do not use unless the current artifact and validated Space evidence are insufficient and the question clearly needs them.
Do NOT lead with, mention, or mix in unrelated historical files (wedding invitations, ministry flyers, driver's licenses, unrelated images) that were not included in validated context.
NO SOURCE → NO CLAIM: Never say "I can see the attached images", "I reviewed the attachment", or "The document shows…" unless that specific attachment/document is in CURRENT ARTIFACT, ATTACHED DOCUMENT, or validated RETRIEVED EXCERPTS below.`;
}

export function currentArtifactBlock(args: {
  artifact: ArtifactIdentity;
  contentPreview: string;
  semantics?: string | null;
}): string {
  const parts = [
    `artifact_id: ${args.artifact.artifactId}`,
    `source_type: ${args.artifact.sourceType}`,
    `sensitivity: ${args.artifact.sensitivity}`,
    `content_hash: ${args.artifact.contentHash}`,
    args.artifact.sourceName ? `source_name: ${args.artifact.sourceName}` : null,
    args.artifact.spaceId ? `space_id: ${args.artifact.spaceId}` : null,
    args.semantics ? `Semantic extraction:\n${args.semantics}` : null,
    `Content:\n${args.contentPreview}`,
  ].filter(Boolean);
  return parts.join("\n");
}
