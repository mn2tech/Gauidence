import type {
  ArtifactIdentity,
  GroundingDebugSnapshot,
  RetrievedArtifactGroup,
} from "./types";

/**
 * Evidence validation before the LLM call.
 * Current artifact always included; others need relevance; sensitive needs explicit relevance.
 */
export function validateArtifactsForResponse(args: {
  currentArtifact: ArtifactIdentity | null;
  groups: RetrievedArtifactGroup[];
}): {
  included: RetrievedArtifactGroup[];
  excluded: RetrievedArtifactGroup[];
  finalArtifactIds: string[];
} {
  const included: RetrievedArtifactGroup[] = [];
  const excluded: RetrievedArtifactGroup[] = [];

  for (const group of args.groups) {
    const isCurrent =
      args.currentArtifact &&
      group.artifact.artifactId === args.currentArtifact.artifactId;

    if (isCurrent || group.included) {
      included.push(group);
    } else {
      excluded.push(group);
    }
  }

  return {
    included,
    excluded,
    finalArtifactIds: included.map((g) => g.artifact.artifactId),
  };
}

/** Build the Test Lab / admin debug snapshot. */
export function buildGroundingDebugSnapshot(args: {
  currentArtifact: ArtifactIdentity | null;
  groups: RetrievedArtifactGroup[];
  evidenceRulesApplied: string[];
  emailThreadSummary?: string | null;
  emailThread?: GroundingDebugSnapshot["emailThread"];
}): GroundingDebugSnapshot {
  const validated = validateArtifactsForResponse({
    currentArtifact: args.currentArtifact,
    groups: args.groups,
  });

  const lines = validated.included.map((g) => {
    return [
      `artifact_id=${g.artifact.artifactId}`,
      `name=${g.artifact.sourceName ?? "?"}`,
      `type=${g.artifact.sourceType}`,
      `sensitivity=${g.artifact.sensitivity}`,
      `relevance=${g.maxRelevance.toFixed(3)}`,
      `space=${g.artifact.spaceId ?? "?"}`,
      `reason=${g.reasonRetrieved}`,
      `status=included`,
    ].join(" | ");
  });

  const excludedLines = validated.excluded.map((g) => {
    return [
      `artifact_id=${g.artifact.artifactId}`,
      `name=${g.artifact.sourceName ?? "?"}`,
      `type=${g.artifact.sourceType}`,
      `sensitivity=${g.artifact.sensitivity}`,
      `relevance=${g.maxRelevance.toFixed(3)}`,
      `status=excluded`,
      `why=${g.exclusionReason ?? "not_relevant"}`,
    ].join(" | ");
  });

  return {
    currentArtifact: args.currentArtifact,
    currentArtifactId: args.currentArtifact?.artifactId ?? null,
    detectedSourceType: args.currentArtifact?.sourceType ?? null,
    retrievedArtifacts: args.groups,
    finalContextArtifactIds: validated.finalArtifactIds,
    finalContextSummary: [
      args.emailThreadSummary
        ? `Email semantics:\n${args.emailThreadSummary}`
        : null,
      "Included:",
      ...lines,
      excludedLines.length ? "Excluded:" : null,
      ...excludedLines,
    ]
      .filter(Boolean)
      .join("\n"),
    emailThread: args.emailThread ?? null,
    evidenceRulesApplied: args.evidenceRulesApplied,
  };
}

/** Human-readable "Why did Gideon use this context?" block for Test Lab. */
export function formatWhyGideonUsedContext(
  snapshot: GroundingDebugSnapshot
): string {
  const cur = snapshot.currentArtifact;
  const lines = [
    "Why did Gideon use this context?",
    cur
      ? `Current artifact: ${cur.sourceName ?? cur.artifactId} (${cur.sourceType})`
      : "Current artifact: (none — open Space retrieval)",
    `Current artifact ID: ${snapshot.currentArtifactId ?? "(none)"}`,
    `Detected source type: ${snapshot.detectedSourceType ?? "(none)"}`,
    "",
    "Retrieved artifacts:",
  ];

  for (const g of snapshot.retrievedArtifacts) {
    lines.push(
      `- ${g.artifact.sourceName ?? g.artifact.artifactId}`,
      `  artifact_id: ${g.artifact.artifactId}`,
      `  source_type: ${g.artifact.sourceType}`,
      `  space: ${g.artifact.spaceId ?? "?"}`,
      `  relevance_score: ${g.maxRelevance.toFixed(3)}`,
      `  sensitivity: ${g.artifact.sensitivity}`,
      `  reason: ${g.reasonRetrieved}`,
      `  included: ${g.included ? "yes" : "no"}`,
      g.exclusionReason ? `  exclusion: ${g.exclusionReason}` : null
    );
  }

  lines.push(
    "",
    `Final context passed to Gideon: ${snapshot.finalContextArtifactIds.join(", ") || "(none)"}`,
    `Evidence rules: ${snapshot.evidenceRulesApplied.join(", ")}`
  );

  return lines.filter((l) => l !== null).join("\n");
}
