import { createHash } from "node:crypto";
import type {
  ArtifactIdentity,
  ArtifactSensitivity,
  ArtifactSourceType,
} from "./types";
import { classifyArtifactSensitivity } from "./sensitivity";
import { classifySourceType } from "./classify";

/** Stable content hash for artifact identity / dedupe. */
export function hashArtifactContent(content: string): string {
  return createHash("sha256").update(content.trim()).digest("hex").slice(0, 32);
}

export function createArtifactIdentity(args: {
  artifactId: string;
  spaceId?: string | null;
  sourceType?: ArtifactSourceType;
  sourceId?: string | null;
  threadId?: string | null;
  parentArtifactId?: string | null;
  createdAt?: string;
  content: string;
  sourceName?: string | null;
  mimeType?: string | null;
  documentType?: string | null;
  sensitivity?: ArtifactSensitivity;
}): ArtifactIdentity {
  const sourceType =
    args.sourceType ??
    classifySourceType({
      content: args.content,
      fileName: args.sourceName,
      mimeType: args.mimeType,
      documentType: args.documentType,
    });
  const sensitivity =
    args.sensitivity ??
    classifyArtifactSensitivity({
      sourceType,
      content: args.content,
      fileName: args.sourceName,
      documentType: args.documentType,
    });

  return {
    artifactId: args.artifactId,
    spaceId: args.spaceId ?? null,
    sourceType,
    sourceId: args.sourceId ?? args.artifactId,
    threadId: args.threadId ?? null,
    parentArtifactId: args.parentArtifactId ?? null,
    createdAt: args.createdAt ?? new Date().toISOString(),
    contentHash: hashArtifactContent(args.content || args.artifactId),
    sourceName: args.sourceName ?? null,
    sensitivity,
  };
}

/** Ephemeral artifact for pasted / in-message current input (not yet a vault doc). */
export function createCurrentInputArtifact(args: {
  spaceId?: string | null;
  content: string;
  sourceName?: string | null;
}): ArtifactIdentity {
  const hash = hashArtifactContent(args.content);
  return createArtifactIdentity({
    artifactId: `current-input:${hash}`,
    spaceId: args.spaceId,
    content: args.content,
    sourceName: args.sourceName ?? "Current user input",
    sourceId: null,
  });
}
